const test = require('node:test');
const assert = require('node:assert');
const { evaluateDisk } = require('../src/services/diskHealthService');

test('NVMe com 8% de desgaste tem 92% de vida útil e está bom', () => {
  const d = evaluateDisk({ model: 'Kingston NV2', mediaType: 'SSD', busType: 'NVMe', sizeBytes: 1e12, health: 'Healthy', wear: 8, temperature: 41, powerOnHours: 3200 });
  assert.equal(d.type, 'NVMe');
  assert.equal(d.lifeRemaining, 92);
  assert.equal(d.status, 'good');
  assert.equal(d.sizeGb, 1000);
});

test('HD não informa desgaste e erros sem correção geram alerta', () => {
  const d = evaluateDisk({ model: 'WD Blue', mediaType: 'HDD', busType: 'SATA', spindle: 7200, health: 'Healthy', wear: null, readErrors: 3 });
  assert.equal(d.type, 'HD');
  assert.equal(d.lifeRemaining, null);
  assert.equal(d.status, 'warn');
});

test('Disco marcado pelo Windows como com falhas fica crítico', () => {
  const d = evaluateDisk({ mediaType: 'SSD', busType: 'SATA', health: 'Unhealthy', wear: 50 });
  assert.equal(d.status, 'bad');
});

test('SSD a 53 °C é normal, mesmo se o Windows o informar como HDD', () => {
  const d = evaluateDisk({ mediaType: 'HDD', busType: 'SATA', health: 'Healthy', wear: 5, temperature: 53 });
  assert.equal(d.type, 'SSD');
  assert.equal(d.status, 'good');
});

test('SSD sem desgaste informado e com RPM 0 não é tratado como HD', () => {
  const d = evaluateDisk({ mediaType: 'HDD', busType: 'SATA', spindle: 0, health: 'Healthy', temperature: 53 });
  assert.equal(d.type, 'SSD');
  assert.equal(d.status, 'good');
});

const { evaluateVolume } = require('../src/services/diskHealthService');
const GB = 1024 ** 3;

test('unidade do Windows com 5% livres fica crítica, com aviso de lentidão', () => {
  const v = evaluateVolume({ letter: 'C', sizeBytes: 222.6 * GB, freeBytes: 11.6 * GB, system: true });
  assert.equal(v.status, 'bad');
  assert.equal(v.freeGb, 11.6);
  assert.equal(v.freePct, 5.2);
  assert.match(v.notes[0], /Unidade do Windows quase cheia/);
});

test('espaço livre: entre 10% e 15% é atenção, acima de 15% está ok', () => {
  assert.equal(evaluateVolume({ letter: 'd', sizeBytes: 1000 * GB, freeBytes: 120 * GB }).status, 'warn');
  const ok = evaluateVolume({ letter: 'd', sizeBytes: 1000 * GB, freeBytes: 400 * GB });
  assert.equal(ok.status, 'good');
  assert.equal(ok.letter, 'D');
  assert.equal(ok.notes.length, 0);
});

test('espaço livre: valores ausentes não quebram a avaliação', () => {
  const v = evaluateVolume({ letter: 'E', sizeBytes: 0, freeBytes: null });
  assert.equal(v.freePct, null);
  assert.equal(v.status, 'good');
});
