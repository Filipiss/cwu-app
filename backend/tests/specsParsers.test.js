const test = require('node:test');
const assert = require('node:assert/strict');
const specs = require('../src/services/specsService');

const GB = 1024 ** 3;

test('VRAM vem do registro (qwMemorySize), não do AdapterRAM limitado a 4 GB', () => {
  const gpus = specs.parseGpus({
    gpus: [{ Name: 'NVIDIA GeForce RTX 4070', AdapterRAM: 4293918720, DriverVersion: '32.0.15.6094' }],
    gpuRegistry: [{ DriverDesc: 'NVIDIA GeForce RTX 4070', VramBytes: 12 * GB }]
  });
  assert.equal(gpus[0].vramGb, 12);
  assert.equal(gpus[0].isDedicated, true);
});

test('adaptador básico da Microsoft é marcado', () => {
  const [g] = specs.parseGpus({ gpus: [{ Name: 'Microsoft Basic Display Adapter' }] });
  assert.equal(g.isMicrosoftBasic, true);
  assert.equal(g.isDedicated, false);
});

test('discos: NVMe, SATA SSD e HDD com tradução da saúde', () => {
  const disks = specs.parseDisks({
    disks: [
      { FriendlyName: 'Samsung SSD 980 PRO 1TB', MediaType: 'SSD', BusType: 'NVMe', Size: 1000 * GB, HealthStatus: 'Healthy' },
      { FriendlyName: 'Kingston A400', MediaType: 'SSD', BusType: 'SATA', Size: 480 * GB, HealthStatus: 'Warning' },
      { FriendlyName: 'WDC WD10EZEX', MediaType: 'HDD', BusType: 'SATA', Size: 1000 * GB, HealthStatus: 'Healthy' }
    ]
  });
  assert.deepEqual(disks.map(d => d.driveType), ['NVMe SSD', 'SATA SSD', 'Disco Rígido (HDD)']);
  assert.deepEqual(disks.map(d => d.health), ['Saudável', 'Atenção', 'Saudável']);
});

test('RAM: soma dos pentes, tipo DDR e canal simples', () => {
  const ram = specs.parseRam({
    os: { TotalVisibleMemorySize: 16 * 1024 * 1024 * 0.98, FreePhysicalMemory: 8 * 1024 * 1024 },
    memory: [{ Capacity: 16 * GB, ConfiguredClockSpeed: 3200, SMBIOSMemoryType: 26 }]
  });
  assert.equal(ram.totalGb, 16);
  assert.equal(ram.type, 'DDR4');
  assert.equal(ram.speedMhz, 3200);
  assert.equal(ram.singleChannel, true);
});

test('datas do ConvertTo-Json (/Date(ms)/) são convertidas', () => {
  assert.equal(specs.parseWmiDate('/Date(1700000000000)/'), new Date(1700000000000).toISOString());
  assert.equal(specs.parseWmiDate({ value: '/Date(0)/' }), new Date(0).toISOString());
  assert.equal(specs.parseWmiDate(null), null);
});

test('sem dados do WMI, a placa-mãe aparece como "Não detectado" (nada inventado)', () => {
  const b = specs.parseBoard(null);
  assert.equal(b.manufacturer, 'Não detectado');
  assert.equal(b.detected, false);
});
