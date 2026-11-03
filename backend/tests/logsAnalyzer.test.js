const test = require('node:test');
const assert = require('node:assert/strict');
const logs = require('../src/services/logsService');
const { BSOD_ENCYCLOPEDIA } = require('../src/database/seedData');

test('Kernel-Power 41 é classificado como desligamento inesperado', () => {
  const ev = logs.analyzeEvent({ Id: 41, ProviderName: 'Microsoft-Windows-Kernel-Power', Message: 'O sistema foi reiniciado...' }, BSOD_ENCYCLOPEDIA);
  assert.equal(ev.severity, 'Alta');
  assert.equal(ev.isBsodOrKernelPower, true);
});

test('BugCheck 1001 reconhece o código da tela azul pela enciclopédia', () => {
  const code = BSOD_ENCYCLOPEDIA[0].code;
  const ev = logs.analyzeEvent({ Id: 1001, ProviderName: 'Microsoft-Windows-WER-SystemErrorReporting', Message: `O computador foi reinicializado. Código: ${code}` }, BSOD_ENCYCLOPEDIA);
  assert.match(ev.title, /Tela Azul/);
});

test('crash de aplicativo extrai o nome do .exe', () => {
  const ev = logs.analyzeEvent({ Id: 1000, ProviderName: 'Application Error', Message: 'Nome do aplicativo com falha: game.exe, versão: 1.0' }, BSOD_ENCYCLOPEDIA);
  assert.match(ev.title, /game\.exe/);
});

test('WHEA é tratado como erro de hardware', () => {
  const ev = logs.analyzeEvent({ Id: 18, ProviderName: 'Microsoft-Windows-WHEA-Logger', Message: '' }, BSOD_ENCYCLOPEDIA);
  assert.match(ev.title, /WHEA/);
});
