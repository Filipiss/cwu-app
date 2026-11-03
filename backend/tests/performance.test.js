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
