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

const intents = require('../src/services/voiceIntents');
const commands = require('../src/services/voiceCommands');
const P = (t) => intents.parseIntent(t);

test('voz: frases livres com as mesmas palavras-chave viram o mesmo comando', () => {
  const topRight = { id: 'overlay_position', arg: 'top-right' };
  for (const t of [
    'ei app, sobreposição no canto superior direito',
    'ei app mudar a sobreposição para a direita em cima',
    'ei app alinhe a sobreposição à direita superior',
    'ei app joga essa sobreposição lá pra cima na direita',
    'ei app coloca na direita em cima a sobreposição'
  ]) assert.deepEqual(P(t), topRight, t);
  assert.deepEqual(P('ei app sobreposição embaixo no meio'), { id: 'overlay_position', arg: 'bottom-center' });
  assert.deepEqual(P('ei app manda a sobreposição pro canto inferior esquerdo'), { id: 'overlay_position', arg: 'bottom-left' });
});

test('voz: ligar e desligar não se confundem ("desligar" contém "ligar")', () => {
  assert.deepEqual(P('Ei app, ligue a sobreposição!'), { id: 'overlay_on', arg: null });
  assert.deepEqual(P('ei app desliga essa sobreposição'), { id: 'overlay_off', arg: null });
  assert.deepEqual(P('ei app ativa o alto desempenho'), { id: 'power_high', arg: null });
  assert.deepEqual(P('ei app desativa o alto desempenho'), { id: 'power_restore', arg: null });
});

test('voz: o comando mais específico ganha', () => {
  assert.deepEqual(P('ei app tira a temperatura da cpu da sobreposição'), { id: 'overlay_item_off', arg: 'overlayCpuTemp' });
  assert.deepEqual(P('ei app mostra o fps na sobreposição'), { id: 'overlay_item_on', arg: 'overlayFps' });
  assert.deepEqual(P('ei app qual a temperatura da cpu'), { id: 'info_cpu_temp', arg: null });
  assert.deepEqual(P('ei app abrir o boost'), { id: 'navigate', arg: 'boost' });
  assert.deepEqual(P('ei app executa o boost'), { id: 'boost', arg: null });
  assert.deepEqual(P('ei app boost'), { id: 'boost', arg: null });
});

test('voz: cobre as funções do app', () => {
  const cases = {
    'ei app execute game booster': 'boost',
    'ei app limpa a memória ram': 'memory_clean',
    'ei app apaga os arquivos temporários': 'temp_clean',
    'ei app analisa o disco': 'disk_analyze',
    'ei app faz a limpeza do disco': 'disk_clean',
    'ei app deixa a sobreposição maior': 'overlay_bigger',
    'ei app diminui a sobreposição': 'overlay_smaller',
    'ei app sobreposição mais transparente': 'overlay_more_transparent',
    'ei app deixa a sobreposição mais opaca': 'overlay_less_transparent',
    'ei app coloca a sobreposição na horizontal': 'overlay_layout',
    'ei app quero posicionar a sobreposição': 'overlay_edit',
    'ei app restaura o plano de energia': 'power_restore',
    'ei app desliga a telemetria': 'telemetry_off',
    'ei app liga o modo de jogo': 'tweak_on',
    'ei app desativa a aceleração do mouse': 'mouse_accel_off',
    'ei app coloca o monitor na taxa máxima': 'monitor_max',
    'ei app desliga a game bar': 'gamebar_off',
    'ei app desativa a suspensão seletiva': 'usb_suspend_off',
    'ei app cria um ponto de restauração': 'restore_point',
    'ei app verifica os drivers': 'drivers_scan',
    'ei app procura atualizações': 'updates_check',
    'ei app exporta o relatório': 'report_export',
    'ei app muda o tema para azul': 'theme',
    'ei app troca o idioma para inglês': 'language',
    'ei app vai para os logs': 'navigate',
    'ei app minimiza o app': 'hide_app',
    'ei app quanto de memória está em uso': 'info_ram',
    'ei app qual o fps': 'info_fps',
    'ei app quanto espaço livre tem no disco': 'info_disk_free',
    'ei app pare de ouvir': 'voice_off',
    'ei app ajuda': 'help'
  };
  for (const [t, id] of Object.entries(cases)) assert.equal(P(t)?.id, id, t);
});

test('voz: sem "Ei app" ou fora do que o app faz, nada acontece', () => {
  assert.equal(P('ligue a sobreposição'), null);
  assert.equal(P('ei app faça um bolo de cenoura'), null);
  assert.equal(P(''), null);
});

test('voz: toda intenção tem execução e a gramática gerada tem todas as palavras', () => {
  const ids = new Set(intents.INTENTS.map(i => i.id));
  const src = require('fs').readFileSync(require.resolve('../src/services/voiceCommands'), 'utf8');
  for (const id of ids) assert.ok(src.includes(`case '${id}'`), `voiceCommands não executa "${id}"`);
  const g = intents.buildGrammar();
  assert.match(g, /<ruleref special="GARBAGE"\/>/);
  assert.match(g, /xml:lang="pt-BR"/);
  assert.equal((g.match(/<tag>out\.cmd="/g) || []).length, intents.INTENTS.reduce((n, i) => n + i.seqs.length, 0));
  for (const it of intents.INTENTS) assert.deepEqual(intents.fromTag(`${it.id}|${it.arg || ''}`), { id: it.id, arg: it.arg });
});

test('voz: etiqueta da gramática tem prioridade; sem ela, o texto é interpretado', () => {
  assert.deepEqual(voice.resolveCommand({ tag: 'overlay_position|top-right', text: 'qualquer coisa' }), { id: 'overlay_position', arg: 'top-right' });
  assert.deepEqual(voice.resolveCommand({ tag: '', text: 'ei app ... sobreposição ... esquerda ... baixo' }), { id: 'overlay_position', arg: 'bottom-left' });
  assert.equal(voice.resolveCommand({ tag: 'inexistente|x', text: 'nada' }), null);
});

test('voz: o script do reconhecedor carrega a gramática e termina com linha em branco', () => {
  const script = voice.recognizerScript("C:\\Temp\\cwu 'teste'.grxml");
  assert.ok(!script.includes("'teste'"), 'caminho vai em base64');
  assert.match(script, /SpeechRecognitionGrammarFileConstraint/);
  assert.match(script, /pt-BR/);
  assert.ok(/\}\r?\n\r?\n$/.test(script), 'sem a linha em branco o PowerShell (stdin) não executa o bloco try');
});

test('voz: "Ei app, ligue a sobreposição" mostra a sobreposição e responde', async () => {
  const seen = [];
  const onSet = (v) => seen.push(v);
  const onFeedback = (f) => seen.push(f.text);
  db.events.on('overlay-set', onSet);
  db.events.on('voice-feedback', onFeedback);
  try {
    await voice.onHeard({ text: 'ei app liga a sobreposição', tag: '' });
    assert.deepEqual(seen, [true, 'Sobreposição ligada.']);
    assert.equal(voice.snapshot().last.command, 'overlay_on');
  } finally {
    db.events.off('overlay-set', onSet);
    db.events.off('voice-feedback', onFeedback);
  }
});

test('voz: ações de tela entram na fila só uma vez', async () => {
  const before = voice.uiSeq;
  await commands.run({ id: 'navigate', arg: 'disks' }, voice);
  const acts = voice.uiSince(before);
  assert.equal(acts.length, 1);
  assert.deepEqual([acts[0].type, acts[0].tab, acts[0].group, acts[0].view], ['navigate', 'perf', 'perf', 'disks']);
  assert.equal(voice.uiSince(voice.uiSeq).length, 0);
});

test('voz: tamanho e transparência da sobreposição ficam nos limites', async () => {
  const saved = { overlayScale: db.getSettings().overlayScale, overlayOpacity: db.getSettings().overlayOpacity };
  try {
    db.updateSettings({ overlayScale: 190, overlayOpacity: 25 });
    await commands.run({ id: 'overlay_bigger' }, voice);
    assert.equal(db.getSettings().overlayScale, 200);
    await commands.run({ id: 'overlay_more_transparent' }, voice);
    assert.equal(db.getSettings().overlayOpacity, 20);
  } finally {
    db.updateSettings(saved);
  }
});
