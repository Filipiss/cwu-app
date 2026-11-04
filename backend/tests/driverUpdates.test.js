const test = require('node:test');
const assert = require('node:assert');
const { applyUpdateInfo, hwKey, nvidiaVersionFromWindows } = require('../src/services/driverUpdates');

test('converte a versão do Windows para a numeração da NVIDIA', () => {
  assert.equal(nvidiaVersionFromWindows('32.0.15.6094'), '560.94');
  assert.equal(nvidiaVersionFromWindows('31.0.15.5222'), '552.22');
});

test('chave de hardware casa Gerenciador de Dispositivos e Windows Update', () => {
  assert.equal(hwKey('PCI\\VEN_10EC&DEV_8168&SUBSYS_86771043&REV_15\\01000000684CE00000'), 'VEN_10EC&DEV_8168');
  assert.equal(hwKey('pci\\ven_10ec&dev_8168'), 'VEN_10EC&DEV_8168');
});

const gpu = { name: 'NVIDIA GeForce RTX 3080', manufacturer: 'NVIDIA', category: 'Placa de Vídeo', currentVersion: '32.0.15.6094', status: 'updated', statusText: 'ok' };
const nic = { name: 'Realtek PCIe GbE', manufacturer: 'Realtek', category: 'Rede / Wi-Fi', currentVersion: '10.38', hardwareId: 'PCI\\VEN_10EC&DEV_8168&SUBSYS_1', status: 'updated', statusText: 'ok' };

test('NVIDIA com versão nova publicada fica desatualizada, com o link do driver', () => {
  const [d] = applyUpdateInfo([gpu], { nvidia: { ok: true, version: '581.57', url: 'https://us.download.nvidia.com/x.exe' } });
  assert.equal(d.status, 'outdated');
  assert.equal(d.directDownload, 'https://us.download.nvidia.com/x.exe');
});

test('NVIDIA na versão mais recente fica atualizada', () => {
  const [d] = applyUpdateInfo([gpu], { nvidia: { ok: true, version: '560.94' } });
  assert.equal(d.status, 'updated');
});

test('driver com atualização pendente no Windows Update fica desatualizado', () => {
  const [d] = applyUpdateInfo([nic], { wu: { ok: true, updates: [{ hardwareId: 'PCI\\VEN_10EC&DEV_8168&SUBSYS_1', date: '2025-03-01' }] } });
  assert.equal(d.status, 'outdated');
});

test('sem conseguir consultar nada, não afirma que está atualizado', () => {
  const [d] = applyUpdateInfo([nic], {});
  assert.equal(d.status, 'unknown');
});
