const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeProcesses, levenshtein } = require('../src/services/securityService');

const env = {
  windir: 'C:\\Windows',
  temp: 'C:\\Users\\f\\AppData\\Local\\Temp',
  userProfile: 'C:\\Users\\f',
  appData: 'C:\\Users\\f\\AppData\\Roaming',
  localAppData: 'C:\\Users\\f\\AppData\\Local'
};
const ms = { status: 'Valid', signer: 'Microsoft Windows' };
const byName = (list, name) => list.find(p => p.name === name);

test('processos legítimos do Windows e de editoras conhecidas não são marcados', () => {
  const r = analyzeProcesses([
    { pid: 600, ppid: 500, name: 'services.exe', path: 'C:\\Windows\\System32\\services.exe', signature: ms },
    { pid: 700, ppid: 600, name: 'svchost.exe', path: 'C:\\Windows\\System32\\svchost.exe', signature: ms },
    { pid: 800, ppid: 1, name: 'explorer.exe', path: 'C:\\Windows\\explorer.exe', signature: ms },
    { pid: 900, ppid: 1, name: 'chrome.exe', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', signature: { status: 'Valid', signer: 'Google LLC' }, connections: 30 }
  ], env);
  for (const p of r) assert.equal(p.level, 'ok', p.name);
});

test('svchost fora do System32 é risco alto e explica o disfarce', () => {
  const [p] = analyzeProcesses([{ pid: 1, ppid: 0, name: 'svchost.exe', path: 'C:\\Users\\f\\AppData\\Local\\Temp\\svchost.exe', signature: { status: 'NotSigned' } }], env);
  assert.equal(p.level, 'high');
  assert.ok(p.behaviors.some(b => /Gerenciador de Tarefas/.test(b)));
});

test('svchost no lugar certo mas aberto pelo pai errado é sinalizado', () => {
  const r = analyzeProcesses([
    { pid: 10, ppid: 1, name: 'cmd.exe', path: 'C:\\Windows\\System32\\cmd.exe', signature: ms },
    { pid: 11, ppid: 10, name: 'svchost.exe', path: 'C:\\Windows\\System32\\svchost.exe', signature: ms }
  ], env);
  assert.ok(byName(r, 'svchost.exe').reasons.some(t => /deveria ser aberto pelo services/.test(t)));
});

test('nomes disfarçados (letras trocadas e leetspeak) são detectados', () => {
  assert.equal(levenshtein('scvhost', 'svchost'), 1);
  const r = analyzeProcesses([
    { pid: 1, ppid: 0, name: 'scvhost.exe', path: 'C:\\Games\\scvhost.exe', signature: { status: 'NotSigned' } },
    { pid: 2, ppid: 0, name: 'expl0rer.exe', path: 'C:\\Games\\expl0rer.exe', signature: { status: 'NotSigned' } }
  ], env);
  for (const p of r) assert.ok(p.reasons.some(t => /parecido/.test(t)), p.name);
});

test('extensão dupla e minerador escondido viram risco alto', () => {
  const r = analyzeProcesses([
    { pid: 1, ppid: 0, name: 'fatura.pdf.exe', path: 'C:\\Users\\f\\Downloads\\fatura.pdf.exe', signature: { status: 'NotSigned' } },
    { pid: 2, ppid: 0, name: 'winupd.exe', path: 'C:\\Users\\f\\AppData\\Roaming\\winupd.exe', signature: { status: 'NotSigned' }, cpu: 85, hasWindow: false, inStartup: true }
  ], env);
  assert.equal(byName(r, 'fatura.pdf.exe').level, 'high');
  const miner = byName(r, 'winupd.exe');
  assert.equal(miner.level, 'high');
  assert.ok(miner.behaviors.some(b => /criptomoeda/.test(b)));
  assert.ok(miner.behaviors.some(b => /junto com o Windows/.test(b)));
});

test('programa assinado em pasta de usuário (ex.: Discord) não passa de risco baixo', () => {
  const [p] = analyzeProcesses([{ pid: 1, ppid: 0, name: 'Discord.exe', path: 'C:\\Users\\f\\AppData\\Local\\Discord\\app-1.0\\Discord.exe', signature: { status: 'Valid', signer: 'Discord Inc.' }, connections: 5 }], env);
  assert.ok(['ok', 'low'].includes(p.level));
});
