const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretExitCode, WINGET_MAP } = require('../src/services/wingetService');
const { ESSENTIAL_SOFTWARES } = require('../src/database/seedData');
const { compareVersions } = require('../src/services/versionService');

test('códigos do winget viram estados legíveis (formato com e sem sinal)', () => {
  assert.equal(interpretExitCode(0).state, 'done');
  assert.equal(interpretExitCode(0x8A150061).state, 'skipped');
  assert.equal(interpretExitCode(-1978335135).state, 'skipped');
  assert.equal(interpretExitCode(0x8A150014).text, 'Pacote não encontrado no winget');
  assert.match(interpretExitCode(5).text, /0x5/);
});

test('todo software do catálogo tem entrada no mapa do winget', () => {
  for (const sw of ESSENTIAL_SOFTWARES) assert.ok(sw.id in WINGET_MAP, sw.id);
});

test('comparação de versões semânticas', () => {
  assert.ok(compareVersions('1.10.0', '1.2.0') > 0);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.ok(compareVersions('0.9.9', '1.0.0') < 0);
});
