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
  const d = evaluateDisk({ model: 'WD Blue', mediaType: 'HDD', busType: 'SATA', health: 'Healthy', wear: null, readErrors: 3 });
  assert.equal(d.type, 'HD');
  assert.equal(d.lifeRemaining, null);
  assert.equal(d.status, 'warn');
});

test('Disco marcado pelo Windows como com falhas fica crítico', () => {
  const d = evaluateDisk({ mediaType: 'SSD', busType: 'SATA', health: 'Unhealthy', wear: 50 });
  assert.equal(d.status, 'bad');
});
