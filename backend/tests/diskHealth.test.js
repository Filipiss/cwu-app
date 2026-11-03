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
