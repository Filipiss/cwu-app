const test = require('node:test');
const assert = require('node:assert/strict');
const hotkeys = require('../src/utils/hotkeys');
const voice = require('../src/services/voiceService');
const db = require('../src/database/db');

test('atalhos: normaliza e exige um modificador de verdade', () => {
  assert.equal(hotkeys.normalize('alt+h'), 'Alt+H');
  assert.equal(hotkeys.normalize('Shift + Ctrl + f5'), 'Ctrl+Shift+F5', 'ordem padrão dos modificadores');
  assert.equal(hotkeys.normalize('Win+K'), 'Super+K');
  assert.equal(hotkeys.normalize('H'), null, 'sem modificador');
  assert.equal(hotkeys.normalize('Shift+A'), null, 'só Shift atrapalharia a digitação');
  assert.equal(hotkeys.normalize('Alt+Alt+H'), null);
  assert.equal(hotkeys.normalize('Ctrl+H+J'), null, 'duas teclas principais');
  assert.equal(hotkeys.normalize('Ctrl+Escape'), null, 'tecla não aceita');
});

test('atalhos: só grava quando o Windows aceita e não repete atalho de outra função', () => {
  const saved = { ...db.getSettings() };
  const accepted = [];
  hotkeys.setImpl({ apply: (id, acc) => { if (acc === 'Ctrl+Alt+X') return false; accepted.push([id, acc]); return true; } });
  try {
    let r = hotkeys.set('voice', 'Ctrl+Alt+V');
    assert.equal(r.success, true);
    assert.equal(hotkeys.current('voice'), 'Ctrl+Alt+V');
    r = hotkeys.set('voice', 'Ctrl+Alt+X');
    assert.equal(r.success, false, 'em uso por outro programa');
    assert.match(r.message, /em uso/);
    assert.equal(hotkeys.current('voice'), 'Ctrl+Alt+V', 'mantém o anterior');
    r = hotkeys.set('voice', hotkeys.current('overlay'));
    assert.equal(r.success, false, 'já é o atalho da sobreposição');
    assert.equal(hotkeys.set('constructor', 'Alt+K').success, false);
    r = hotkeys.reset('voice');
    assert.equal(r.success, true);
    assert.equal(hotkeys.current('voice'), 'Alt+H');
  } finally {
    hotkeys.setImpl(null);
    db.updateSettings({ hotkeyVoice: saved.hotkeyVoice, hotkeyOverlay: saved.hotkeyOverlay });
  }
});

test('voz: só aceita frases com "Ei app" e entende infinitivo e imperativo', () => {
  assert.deepEqual(voice.parseCommand('ei app execute game booster'), { id: 'boost', arg: null });
  assert.deepEqual(voice.parseCommand('Ei app, ligue a sobreposição!'), { id: 'overlay_on', arg: null });
  assert.deepEqual(voice.parseCommand('ei app desligar a sobreposição'), { id: 'overlay_off', arg: null });
  assert.deepEqual(voice.parseCommand('ei app alinhe a sobreposição à direita superior'), { id: 'overlay_position', arg: 'top-right' });
  assert.deepEqual(voice.parseCommand('ei app sobreposição no canto inferior esquerdo'), { id: 'overlay_position', arg: 'bottom-left' });
  assert.deepEqual(voice.parseCommand('ei app pare de ouvir'), { id: 'voice_off', arg: null });
  assert.equal(voice.parseCommand('ligue a sobreposição'), null, 'sem a palavra de ativação');
  assert.equal(voice.parseCommand('ei app formatar o computador'), null, 'fora da lista');
});

test('voz: toda frase da lista começa com a palavra de ativação e não há duplicadas', () => {
  const phrases = voice.buildPhrases();
  assert.ok(phrases.length > 50);
  assert.ok(phrases.every(p => p.startsWith('ei app ')));
  assert.equal(new Set(phrases).size, phrases.length);
  for (const pos of Object.keys(voice.POSITIONS)) {
    assert.ok(phrases.some(p => voice.parseCommand(p)?.arg === pos), pos);
  }
});

test('voz: o script do reconhecedor leva as frases em base64 (sem aspas soltas no PowerShell)', () => {
  const script = voice.recognizerScript(["ei app teste com 'aspas'"]);
  assert.ok(!script.includes("'aspas'"));
  assert.match(script, /SpeechRecognitionListConstraint/);
  assert.match(script, /pt-BR/);
  assert.ok(/\}\r?\n\r?\n$/.test(script), 'termina com linha em branco: sem ela o PowerShell (stdin) não executa o bloco try');
});

test('voz: "Ei app, ligue a sobreposição" pede para mostrar a sobreposição e responde', async () => {
  const seen = [];
  const onSet = (v) => seen.push(v);
  const onFeedback = (f) => seen.push(f.text);
  db.events.on('overlay-set', onSet);
  db.events.on('voice-feedback', onFeedback);
  try {
    await voice.onHeard('ei app ligue a sobreposição');
    assert.deepEqual(seen, [true, 'Sobreposição ligada.']);
    assert.equal(voice.snapshot().last.command, 'overlay_on');
  } finally {
    db.events.off('overlay-set', onSet);
    db.events.off('voice-feedback', onFeedback);
  }
});
