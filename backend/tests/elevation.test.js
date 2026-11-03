const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRelaunchTarget, buildInnerScript } = require('../src/services/elevationService');

test('modo servidor: reabre o node com server.js na pasta do backend (caminho com espaços)', () => {
  const t = buildRelaunchTarget({ isElectron: false, execPath: 'C:\\Program Files\\nodejs\\node.exe', argv: [], serverPath: 'D:\\Projetos\\Projetos Pessoais\\CWU app\\backend\\server.js' });
  assert.deepEqual(t, { exe: 'C:\\Program Files\\nodejs\\node.exe', args: ['server.js'], cwd: 'D:\\Projetos\\Projetos Pessoais\\CWU app\\backend' });
});

test('Electron em desenvolvimento: mesmo executável e argumentos', () => {
  const t = buildRelaunchTarget({ isElectron: true, execPath: 'C:\\x\\electron.exe', argv: ['C:\\x\\electron.exe', '.'], cwd: 'D:\\app\\backend' });
  assert.deepEqual(t, { exe: 'C:\\x\\electron.exe', args: ['.'], cwd: 'D:\\app\\backend' });
});

test('Electron portátil: reabre o .exe original, não a cópia temporária', () => {
  const t = buildRelaunchTarget({ isElectron: true, portableExe: 'D:\\Downloads\\CWU App.exe', execPath: 'C:\\Temp\\x\\CWU App.exe', argv: [] });
  assert.equal(t.exe, 'D:\\Downloads\\CWU App.exe');
  assert.equal(t.cwd, 'D:\\Downloads');
});

test('script interno recebe os dados em base64 (sem injeção) e põe aspas nos argumentos', () => {
  const script = buildInnerScript({ exe: "C:\\a'; Remove-Item C:\\ -Recurse #", args: ['x y'], cwd: 'C:\\' });
  assert.ok(!script.includes('Remove-Item'), 'conteúdo não aparece literal no script');
  assert.match(script, /\[char\]34/);
  assert.match(script, /Start-Sleep -Seconds 2/);
});
