// backend/src/services/voiceService.js
// Comandos por voz com o reconhecedor de fala do próprio Windows (Windows.Media.SpeechRecognition),
// no modo de comandos: ele só reconhece as frases da lista abaixo, funciona sem internet e o áudio
// não sai do PC. Toda frase começa com a palavra de ativação ("Ei app").
// A escuta só fica ligada quando o usuário liga (atalho Alt + H, configurável).
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const db = require('../database/db');

const WAKE = 'ei app';
const LANGUAGE = 'pt-BR';

// Verbo no infinitivo e no imperativo ("ligar" / "ligue"): o usuário pode falar dos dois jeitos
const both = (inf, imp, rest) => [`${inf} ${rest}`, `${imp} ${rest}`];

const POSITIONS = {
  'top-left': { label: 'canto superior esquerdo', words: [['superior', 'esquerdo'], ['esquerda', 'superior'], ['em cima', 'à esquerda']] },
  'top-center': { label: 'topo, no centro', words: [['superior', 'central'], ['centro', 'superior'], ['em cima', 'no centro']] },
  'top-right': { label: 'canto superior direito', words: [['superior', 'direito'], ['direita', 'superior'], ['em cima', 'à direita']] },
  'bottom-left': { label: 'canto inferior esquerdo', words: [['inferior', 'esquerdo'], ['esquerda', 'inferior'], ['embaixo', 'à esquerda']] },
  'bottom-center': { label: 'rodapé, no centro', words: [['inferior', 'central'], ['centro', 'inferior'], ['embaixo', 'no centro']] },
  'bottom-right': { label: 'canto inferior direito', words: [['inferior', 'direito'], ['direita', 'inferior'], ['embaixo', 'à direita']] }
};

function positionPhrases(pos) {
  const out = [];
  for (const [a, b] of POSITIONS[pos].words) {
    const where = /^(superior|inferior)$/.test(a) ? `no canto ${a} ${b}` : (/^(esquerda|direita|centro)$/.test(a) ? `à ${a} ${b}`.replace('à centro', 'no centro') : `${a} ${b}`);
    out.push(`sobreposição ${where}`);
    out.push(...both('alinhar', 'alinhe', `a sobreposição ${where}`));
    out.push(...both('mover', 'mova', `a sobreposição ${where}`));
    out.push(...both('colocar', 'coloque', `a sobreposição ${where}`));
  }
  return out;
}

const COMMANDS = [
  { id: 'boost', phrases: [...both('executar', 'execute', 'o boost'), ...both('executar', 'execute', 'boost'), ...both('executar', 'execute', 'game booster'), ...both('ativar', 'ative', 'o boost'), 'boost', 'game booster'] },
  { id: 'overlay_on', phrases: [...both('ligar', 'ligue', 'a sobreposição'), ...both('mostrar', 'mostre', 'a sobreposição'), ...both('mostrar', 'mostre', 'o fps'), ...both('ativar', 'ative', 'a sobreposição')] },
  { id: 'overlay_off', phrases: [...both('desligar', 'desligue', 'a sobreposição'), ...both('esconder', 'esconda', 'a sobreposição'), ...both('esconder', 'esconda', 'o fps'), ...both('desativar', 'desative', 'a sobreposição')] },
  ...Object.keys(POSITIONS).map(pos => ({ id: 'overlay_position', arg: pos, phrases: positionPhrases(pos) })),
  { id: 'power_high', phrases: [...both('ativar', 'ative', 'o alto desempenho'), ...both('ativar', 'ative', 'alto desempenho'), ...both('ligar', 'ligue', 'o alto desempenho'), 'modo desempenho'] },
  { id: 'power_restore', phrases: [...both('restaurar', 'restaure', 'o plano de energia'), ...both('desativar', 'desative', 'o alto desempenho'), ...both('voltar', 'volte', 'o plano de energia')] },
  { id: 'open_app', phrases: [...both('abrir', 'abra', 'o app'), ...both('mostrar', 'mostre', 'o app')] },
  { id: 'voice_off', phrases: ['parar de ouvir', 'pare de ouvir', ...both('desligar', 'desligue', 'os comandos de voz'), ...both('desligar', 'desligue', 'o comando de voz')] }
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Todas as frases que o reconhecedor aceita, já com a palavra de ativação (pura, testável). */
function buildPhrases() {
  const list = [];
  for (const c of COMMANDS) for (const p of c.phrases) list.push(`${WAKE} ${p}`);
  return [...new Set(list)];
}

const LOOKUP = new Map();
for (const c of COMMANDS) for (const p of c.phrases) LOOKUP.set(norm(`${WAKE} ${p}`), { id: c.id, arg: c.arg || null });

/** Frase reconhecida → comando, ou null. Sem a palavra de ativação, não vale (pura, testável). */
function parseCommand(text) {
  return LOOKUP.get(norm(text)) || null;
}

// Script do reconhecedor: escuta em loop e avisa por linha "@@VOICE@@{json}".
// Devolve o índice da frase (e não o texto) para não depender da codificação do console.
function recognizerScript(phrases) {
  const payload = Buffer.from(JSON.stringify(phrases), 'utf8').toString('base64');
  return `
$ErrorActionPreference = 'Stop'
function Out-Voice($o) { [Console]::Out.WriteLine('@@VOICE@@' + ($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
  function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
  $null = [Windows.Media.SpeechRecognition.SpeechRecognizer, Windows.Media.SpeechRecognition, ContentType = WindowsRuntime]
  $null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
  $phrases = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json
  $index = @{}
  $list = New-Object 'System.Collections.Generic.List[string]'
  for ($i = 0; $i -lt $phrases.Count; $i++) { $list.Add($phrases[$i]); $index[$phrases[$i].ToLowerInvariant()] = $i }
  try { $rec = New-Object Windows.Media.SpeechRecognition.SpeechRecognizer (New-Object Windows.Globalization.Language '${LANGUAGE}') }
  catch { Out-Voice @{ type = 'error'; code = 'language'; message = $_.Exception.Message }; exit 2 }
  $constraint = [Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint]::new($list, 'cwu')
  [System.Collections.Generic.ICollection[Windows.Media.SpeechRecognition.ISpeechRecognitionConstraint]].GetMethod('Add').Invoke($rec.Constraints, @($constraint))
  $comp = Await ($rec.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
  if ([string]$comp.Status -ne 'Success') { Out-Voice @{ type = 'error'; code = 'language'; message = [string]$comp.Status }; exit 2 }
  $rec.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(30)
  $rec.Timeouts.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(600)
  Out-Voice @{ type = 'ready' }
  while ($true) {
    $r = Await ($rec.RecognizeAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])
    $conf = [string]$r.Confidence
    if ([string]$r.Status -eq 'Success' -and $r.Text -and ($conf -eq 'High' -or $conf -eq 'Medium')) {
      $i = $index[$r.Text.ToLowerInvariant()]
      if ($i -ne $null) { Out-Voice @{ type = 'heard'; i = $i; confidence = $conf } }
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
    this.last = null;      // { phrase, command, reply, at }
    this.phrases = buildPhrases();
    this.buffer = '';
  }

  snapshot() {
    return { supported: process.platform === 'win32', status: this.status, error: this.error, last: this.last, wake: 'Ei app' };
  }

  setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    this.emit('state', this.snapshot());
  }

  start() {
    if (process.platform !== 'win32') return this.snapshot();
    if (this.child) return this.snapshot();
    this.setStatus('starting');
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.buffer = '';
    child.stdout.on('data', (chunk) => this.onData(chunk));
    child.stderr.on('data', () => {});
    child.on('error', () => { if (this.child === child) { this.child = null; this.setStatus('error', ERRORS.failed); } });
    child.on('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      if (this.status !== 'error') this.setStatus('off');
    });
    child.stdin.end(recognizerScript(this.phrases));
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
      else if (msg.type === 'heard') this.onHeard(this.phrases[msg.i]);
    }
  }

  async onHeard(phrase) {
    const cmd = parseCommand(phrase);
    if (!cmd) return;
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
module.exports.COMMANDS = COMMANDS;
module.exports.POSITIONS = POSITIONS;
module.exports.buildPhrases = buildPhrases;
module.exports.parseCommand = parseCommand;
module.exports.recognizerScript = recognizerScript;
module.exports.WAKE = WAKE;
