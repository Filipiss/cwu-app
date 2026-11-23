// backend/src/services/voiceService.js
// Comandos por voz com o reconhecedor de fala do próprio Windows (Windows.Media.SpeechRecognition),
// sem internet: o áudio não sai do PC. O reconhecedor usa uma gramática SRGS gerada a partir das
// palavras-chave de voiceIntents.js, com coringas (GARBAGE) entre elas: o usuário pode falar do jeito
// dele, desde que comece com a palavra de ativação ("Ei app") e use as palavras-chave do comando.
// A escuta só fica ligada quando o usuário liga (atalho Alt + H, configurável).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const db = require('../database/db');
const intents = require('./voiceIntents');

const LANGUAGE = 'pt-BR';

/** Comando a partir do que o reconhecedor devolveu: a etiqueta da gramática ou, sem ela, o texto (pura). */
function resolveCommand({ tag, text }) {
  return intents.fromTag(tag) || intents.parseIntent(text);
}

// Script do reconhecedor: escuta em loop e avisa por linha "@@VOICE@@{json}". O texto vai em base64
// (para não depender da codificação do console) junto com a etiqueta do comando definida na gramática.
function recognizerScript(grammarPath) {
  const p = Buffer.from(grammarPath, 'utf8').toString('base64');
  return `
$ErrorActionPreference = 'Stop'
function Out-Voice($o) { [Console]::Out.WriteLine('@@VOICE@@' + ($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
  function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
  $null = [Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType = WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
  $null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
  $grammarPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${p}'))
  try { $rec = New-Object Windows.Media.SpeechRecognition.SpeechRecognizer (New-Object Windows.Globalization.Language '${LANGUAGE}') }
  catch { Out-Voice @{ type = 'error'; code = 'language'; message = $_.Exception.Message }; exit 2 }
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($grammarPath)) ([Windows.Storage.StorageFile])
  $constraint = [Windows.Media.SpeechRecognition.SpeechRecognitionGrammarFileConstraint]::new($file, 'cwu')
  [System.Collections.Generic.ICollection[Windows.Media.SpeechRecognition.ISpeechRecognitionConstraint]].GetMethod('Add').Invoke($rec.Constraints, @($constraint))
  $comp = Await ($rec.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
  if ([string]$comp.Status -ne 'Success') { Out-Voice @{ type = 'error'; code = 'language'; message = [string]$comp.Status }; exit 2 }
  $rec.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(30)
  $rec.Timeouts.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(700)
  Out-Voice @{ type = 'ready' }
  while ($true) {
    $r = Await ($rec.RecognizeAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])
    $conf = [string]$r.Confidence
    if ([string]$r.Status -eq 'Success' -and $r.Text -and ($conf -eq 'High' -or $conf -eq 'Medium')) {
      $tag = ''
      try { $props = $r.SemanticInterpretation.Properties; if ($props.ContainsKey('cmd')) { $tag = [string]($props['cmd'] | Select-Object -First 1) } } catch {}
      Out-Voice @{ type = 'heard'; text = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($r.Text)); tag = $tag; confidence = $conf }
    }
  }
} catch {
  $m = $_.Exception.ToString()
  $code = if ($m -match 'Access is denied|acesso negado|0x80070005|UnauthorizedAccess') { 'microphone' } else { 'failed' }
  Out-Voice @{ type = 'error'; code = $code; message = $_.Exception.Message }
  exit 1
}

`; // a linha em branco no fim faz o PowerShell (lendo pelo stdin) executar o bloco try
}

const ERRORS = {
  microphone: 'O Windows bloqueou o microfone para o CWU App. Libere em Configurações › Privacidade e segurança › Microfone › "Permitir que aplicativos da área de trabalho acessem o microfone".',
  language: 'O reconhecimento de fala em português não está instalado neste Windows. Instale em Configurações › Hora e idioma › Idioma e região › Português (Brasil) › Opções › Reconhecimento de fala.',
  failed: 'O reconhecimento de voz do Windows parou de funcionar. Verifique se há um microfone conectado e ligue de novo.'
};

class VoiceService extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.status = 'off';   // off | starting | listening | error
    this.error = null;
    this.last = null;      // { phrase, command, reply, ok, at }
    this.buffer = '';
    this.uiSeq = 0;
    this.uiQueue = [];     // ações de tela para o app (navegar, analisar, tema…)
  }

  snapshot() {
    return { supported: process.platform === 'win32', status: this.status, error: this.error, last: this.last, wake: 'Ei app', uiSeq: this.uiSeq };
  }

  setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    this.emit('state', this.snapshot());
  }

  /** Ação para a janela do app executar (a tela consulta /api/voice/ui). */
  pushUi(action) {
    this.uiSeq += 1;
    this.uiQueue.push({ seq: this.uiSeq, at: Date.now(), ...action });
    this.uiQueue = this.uiQueue.filter(a => Date.now() - a.at < 60000).slice(-20);
    return this.uiSeq;
  }

  uiSince(seq) {
    return this.uiQueue.filter(a => a.seq > (Number(seq) || 0) && Date.now() - a.at < 60000);
  }

  grammarFile() {
    const file = path.join(os.tmpdir(), `cwu-voice-${process.pid}.grxml`);
    fs.writeFileSync(file, intents.buildGrammar(LANGUAGE), 'utf8');
    return file;
  }

  start() {
    if (process.platform !== 'win32') return this.snapshot();
    if (this.child) return this.snapshot();
    this.setStatus('starting');
    let grammar;
    try { grammar = this.grammarFile(); } catch (e) { this.setStatus('error', ERRORS.failed); return this.snapshot(); }
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.buffer = '';
    child.stdout.on('data', (chunk) => this.onData(chunk));
    child.stderr.on('data', () => {});
    child.on('error', () => { if (this.child === child) { this.child = null; this.setStatus('error', ERRORS.failed); } });
    child.on('exit', () => {
      try { fs.unlinkSync(grammar); } catch (e) {}
      if (this.child !== child) return;
      this.child = null;
      if (this.status !== 'error') this.setStatus('off');
    });
    child.stdin.end(recognizerScript(grammar));
    return this.snapshot();
  }

  stop() {
    const child = this.child;
    this.child = null;
    if (child) { try { child.kill(); } catch (e) {} }
    this.setStatus('off');
    return this.snapshot();
  }

  toggle() {
    return this.child ? this.stop() : this.start();
  }

  onData(chunk) {
    this.buffer += chunk.toString('utf8');
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop();
    for (const line of parts) {
      const at = line.indexOf('@@VOICE@@');
      if (at < 0) continue;
      let msg;
      try { msg = JSON.parse(line.slice(at + 9)); } catch (e) { continue; }
      if (msg.type === 'ready') this.setStatus('listening');
      else if (msg.type === 'error') this.setStatus('error', ERRORS[msg.code] || ERRORS.failed);
      else if (msg.type === 'heard') {
        let text = '';
        try { text = Buffer.from(String(msg.text || ''), 'base64').toString('utf8'); } catch (e) {}
        this.onHeard({ text, tag: msg.tag });
      }
    }
  }

  async onHeard({ text, tag }) {
    const cmd = resolveCommand({ text, tag });
    if (!cmd) return;
    const phrase = String(text || '').replace(/\.\.\./g, '…').trim();
    let result;
    try { result = await require('./voiceCommands').run(cmd, this); }
    catch (e) { result = { ok: false, reply: 'Não consegui executar o comando.' }; }
    this.last = { phrase, command: cmd.id, reply: result.reply, ok: result.ok, at: new Date().toISOString() };
    this.emit('state', this.snapshot());
    db.events.emit('voice-feedback', { text: result.reply, ok: result.ok });
  }
}

const instance = new VoiceService();
process.on('exit', () => { if (instance.child) { try { instance.child.kill(); } catch (e) {} } });
module.exports = instance;
module.exports.VoiceService = VoiceService;
module.exports.recognizerScript = recognizerScript;
module.exports.resolveCommand = resolveCommand;
module.exports.parseCommand = intents.parseIntent;
