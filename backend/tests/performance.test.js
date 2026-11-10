const test = require('node:test');
const assert = require('node:assert/strict');
const tweaks = require('../src/services/tweaksService');
const startup = require('../src/services/startupService');
const { MonitorService } = require('../src/services/monitorService');

test('RAM abaixo da velocidade nominal sugere ativar XMP/EXPO', () => {
  const r = tweaks.analyzeRam([
    { capacityGb: 8, ratedMhz: 3200, configuredMhz: 2133, smbiosType: 26, partNumber: 'X' },
    { capacityGb: 8, ratedMhz: 3200, configuredMhz: 2133, smbiosType: 26, partNumber: 'X' }
  ], 4);
  assert.ok(r.issues.some(i => i.level === 'warning' && /XMP/.test(i.text)));
  assert.ok(!r.issues.some(i => /canal simples/.test(i.text)), 'dois pentes = dual channel');
});

test('um pente só e pentes de tamanhos diferentes geram aviso', () => {
  const single = tweaks.analyzeRam([{ capacityGb: 16, ratedMhz: 3200, configuredMhz: 3200, smbiosType: 26 }], 2);
  assert.ok(single.issues.some(i => /canal simples/.test(i.text)));
  const mixed = tweaks.analyzeRam([
    { capacityGb: 16, configuredMhz: 3200, ratedMhz: 3200, smbiosType: 26 },
    { capacityGb: 8, configuredMhz: 3200, ratedMhz: 3200, smbiosType: 26 }
  ], 2);
  assert.ok(mixed.issues.some(i => /tamanhos diferentes/.test(i.text)));
});

test('ajustes: valores do registro viram ligado/desligado/padrão', () => {
  const s = tweaks.interpretStatus({ gameMode: undefined, hags: undefined, dxSettings: '', historical: undefined });
  assert.equal(s.game_mode, true, 'Modo de Jogo sem valor = ligado');
  assert.equal(s.hags, null, 'HAGS sem valor = padrão do sistema');
  assert.equal(s.windowed_opt, false);
  assert.equal(s.game_dvr, false);
  assert.equal(tweaks.interpretStatus({ gameMode: 0, hags: 1 }).game_mode, false);
});

test('alterar a otimização em janela preserva as outras chaves do DirectX', () => {
  const map = tweaks.parseDxSettings('VRROptimizeEnable=0;AutoHDREnable=1;SwapEffectUpgradeEnable=0;');
  map.SwapEffectUpgradeEnable = '1';
  assert.equal(tweaks.serializeDxSettings(map), 'VRROptimizeEnable=0;AutoHDREnable=1;SwapEffectUpgradeEnable=1;');
});

test('inicialização: bit 0 do StartupApproved indica desativado', () => {
  assert.deepEqual([null, 2, 6, 3, 7].map(startup.isEnabledFlag), [true, true, true, false, false]);
  assert.equal(startup.exeFromCommand('"C:\\Program Files\\Steam\\steam.exe" -silent'), 'steam.exe');
});

test('ajuste ou parâmetro inválido é recusado antes de tocar no registro', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  for (const body of [{ id: 'constructor', enabled: true }, { id: 'hags', enabled: 'sim' }, { id: 'x' }]) {
    const r = await tweaks.set(body);
    assert.equal(r.message, 'Ajuste inválido.');
  }
  const r = await startup.toggle({ id: 123, enabled: true });
  assert.equal(r.success, false);
});

test('monitor lê amostras entre marcadores, mesmo quebradas em vários pedaços', () => {
  const m = new MonitorService();
  m.onData(Buffer.from('AVISO: ruído do PowerShell\r\n@@CWU@@{"t":1,"cpu":12.6,"cpuTemp":-273.2,"diskBusy":180,"gpuUsage":40,"top":[]}@@END@@\r\n@@CWU@@{"t":2,'));
  assert.equal(m.history.length, 1);
  assert.equal(m.latest.cpu, 13);
  assert.equal(m.latest.cpuTemp, null, 'temperatura ACPI inválida é descartada');
  assert.equal(m.latest.disk, 100);
  // Continuação chegando com quebra de linha do console no meio do JSON
  m.onData(Buffer.from('"cpu":5\r\n0,"top":[]}@@END@@'));
  assert.equal(m.history.length, 2);
  assert.equal(m.latest.cpu, 50);
});

// Sensor ACPI travado (comum em placas AMD Ryzen)
const { isStuckSensor } = require('../src/services/monitorService');
test('isStuckSensor: valor fixo com carga variando = travado', () => {
  const s = Array.from({ length: 40 }, (_, i) => ({ temp: 27.8, cpu: i % 2 ? 5 : 60 }));
  assert.equal(isStuckSensor(s), true);
});
test('isStuckSensor: valor fixo com CPU ociosa não é conclusivo', () => {
  const s = Array.from({ length: 40 }, () => ({ temp: 45, cpu: 3 }));
  assert.equal(isStuckSensor(s), false);
});
test('isStuckSensor: valor variando é real', () => {
  const s = Array.from({ length: 40 }, (_, i) => ({ temp: 40 + (i % 5), cpu: i % 2 ? 5 : 60 }));
  assert.equal(isStuckSensor(s), false);
});
test('push: usa temperatura da GPU via D3DKMT quando não há nvidia-smi', () => {
  const m = new MonitorService();
  m.push({ cpu: 10, gpuUsage: 30, gpuSensor: { temp: 61.5, name: 'AMD Radeon RX 7800 XT' } });
  assert.equal(m.latest.gpuTemp, 61.5);
  assert.equal(m.latest.gpuName, 'AMD Radeon RX 7800 XT');
});
test('push: descarta temperatura de CPU implausível (17 °C travado)', () => {
  const m = new MonitorService();
  m.push({ cpu: 10, cpuTemp: 17 });
  assert.equal(m.latest.cpuTemp, null);
  m.push({ cpu: 10, cpuTemp: 48.5 });
  assert.equal(m.latest.cpuTemp, 48.5);
});

// Sobreposição: linhas e posição na tela
const { overlayRows, overlayBounds } = require('../src/utils/overlayLayout');
test('overlayRows: só mostra as linhas escolhidas', () => {
  assert.deepEqual(overlayRows({ overlayCpu: true, overlayRam: false, overlayGpuTemp: true, overlayPower: false }), ['cpu', 'gpu']);
  assert.deepEqual(overlayRows({ overlayFps: true, overlayRam: true }), ['fps', 'ram']);
  assert.deepEqual(overlayRows({}), []);
});
test('overlayBounds: cantos, centro e posição livre dentro da área útil', () => {
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const size = { width: 190, height: 108 };
  assert.deepEqual(overlayBounds({ overlayPosition: 'top-right' }, area, size), { x: 1920 - 190 - 12, y: 12, width: 190, height: 108 });
  assert.deepEqual(overlayBounds({ overlayPosition: 'bottom-left' }, area, size), { x: 12, y: 1040 - 108 - 12, width: 190, height: 108 });
  assert.equal(overlayBounds({ overlayPosition: 'top-center' }, area, size).x, 865);
  assert.deepEqual(overlayBounds({ overlayPosition: 'invalida' }, area, size), overlayBounds({ overlayPosition: 'top-right' }, area, size));
  assert.deepEqual(overlayBounds({ overlayPosition: 'custom', overlayX: 300, overlayY: 200 }, area, size), { x: 300, y: 200, width: 190, height: 108 });
  // fora da tela: volta para dentro
  assert.deepEqual(overlayBounds({ overlayPosition: 'custom', overlayX: 5000, overlayY: -50 }, area, size), { x: 1920 - 190, y: 0, width: 190, height: 108 });
});

