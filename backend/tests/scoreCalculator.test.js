const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSystemScores } = require('../src/utils/scoreCalculator');

const base = {
  cpu: { name: 'AMD Ryzen 7 7800X3D 8-Core Processor', cores: 8, threads: 16, detected: true },
  gpu: { name: 'NVIDIA GeForce RTX 4070', vramGb: 12, detected: true },
  ram: { totalGb: 32, singleChannel: false, detected: true },
  storage: { isSsd: true, isNvme: true, driveType: 'NVMe SSD', health: 'Saudável', detected: true }
};

test('PC gamer moderno recebe nota alta', () => {
  const r = calculateSystemScores(base);
  assert.ok(r.overall >= 8.5, `nota ${r.overall}`);
  assert.equal(r.partial, false);
});

test('componente não detectado sai da média em vez de virar nota inventada', () => {
  const r = calculateSystemScores({ ...base, gpu: { detected: false } });
  assert.equal(r.components.gpu.detected, false);
  assert.equal(r.components.gpu.score, 0);
  assert.equal(r.partial, true);
  assert.ok(r.overall >= 8.5, 'média redistribuída entre os detectados');
});

test('driver genérico da Microsoft derruba a nota da GPU', () => {
  const r = calculateSystemScores({ ...base, gpu: { name: 'Microsoft Basic Display Adapter', isMicrosoftBasic: true, detected: true } });
  assert.equal(r.components.gpu.score, 1.0);
});

test('RTX 50 e RX 9000 são reconhecidas', () => {
  for (const name of ['NVIDIA GeForce RTX 5090', 'AMD Radeon RX 9070 XT']) {
    const r = calculateSystemScores({ ...base, gpu: { name, detected: true } });
    assert.ok(r.components.gpu.score >= 9.5, `${name}: ${r.components.gpu.score}`);
  }
});

test('um único pente de RAM (canal simples) é penalizado', () => {
  const dual = calculateSystemScores(base).components.ram.score;
  const single = calculateSystemScores({ ...base, ram: { ...base.ram, singleChannel: true } }).components.ram.score;
  assert.ok(single < dual);
});

test('disco com falhas limita a nota de armazenamento', () => {
  const r = calculateSystemScores({ ...base, storage: { ...base.storage, health: 'Com falhas' } });
  assert.ok(r.components.storage.score <= 3.0);
});

test('HDD tem nota menor que NVMe', () => {
  const hdd = calculateSystemScores({ ...base, storage: { isSsd: false, isNvme: false, driveType: 'HDD', detected: true } });
  assert.ok(hdd.components.storage.score < 5);
});
