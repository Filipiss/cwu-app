const test = require('node:test');
const assert = require('node:assert/strict');
const cleanup = require('../src/services/cleanupService');

const GB = 1024 ** 3;
const MB = 1024 ** 2;

test('limpeza: só ids conhecidos passam, sem repetição', () => {
  assert.deepEqual(cleanup.validateIds(['user_temp', 'user_temp', 'constructor', 'C:\\Windows', 5, 'recycle_bin']), ['user_temp', 'recycle_bin']);
  assert.deepEqual(cleanup.validateIds('user_temp'), []);
  assert.deepEqual(cleanup.validateIds(undefined), []);
});

test('hibernação: sem inicialização rápida, oferece desligar; com ela e arquivo completo, oferece reduzir', () => {
  assert.equal(cleanup.hibernationAction({ bytes: { hibernation: 12.7 * GB }, hiberboot: 0, hiberFileType: 2 }), 'off');
  assert.equal(cleanup.hibernationAction({ bytes: { hibernation: 12.7 * GB }, hiberboot: 1, hiberFileType: 2 }), 'reduce');
  assert.equal(cleanup.hibernationAction({ bytes: { hibernation: 6 * GB }, hiberboot: 1, hiberFileType: 1 }), null, 'já reduzido');
  assert.equal(cleanup.hibernationAction({ bytes: { hibernation: 0 }, hiberboot: 0 }), null, 'hibernação desligada');
});

test('lista: maiores primeiro, itens pequenos somem e os de risco vêm desmarcados', () => {
  const r = cleanup.buildItems({
    isAdmin: true, hiberboot: 0, hiberFileType: 2, windowsOld: false,
    bytes: { nvidia_shader: 15.6 * GB, crash_dumps: 1.2 * GB, user_temp: 0.5 * GB, recycle_bin: 0.18 * GB, hibernation: 12.7 * GB, d3d_shader: 100, windows_old: 0 }
  });
  const ids = r.items.map(i => i.id);
  assert.deepEqual(ids, ['nvidia_shader', 'hibernation', 'crash_dumps', 'user_temp', 'recycle_bin']);
  assert.equal(r.items.find(i => i.id === 'nvidia_shader').checked, true);
  assert.equal(r.items.find(i => i.id === 'recycle_bin').checked, false);
  assert.equal(r.items.find(i => i.id === 'recycle_bin').irreversible, true);
  const hib = r.items.find(i => i.id === 'hibernation');
  assert.equal(hib.checked, false);
  assert.match(hib.title, /sem uso/);
});

test('lista: sem administrador, pastas do sistema aparecem bloqueadas e no fim', () => {
  const r = cleanup.buildItems({ isAdmin: false, hiberboot: 0, bytes: { user_temp: 500 * MB, wu_cache: 0, hibernation: 12 * GB } });
  const wu = r.items.find(i => i.id === 'wu_cache');
  assert.equal(wu.blocked, true);
  assert.equal(wu.checked, false);
  assert.equal(wu.bytes, null, 'sem administrador o tamanho não é confiável');
  assert.equal(r.items[0].id, 'user_temp');
  assert.ok(r.items.slice(1).every(i => i.blocked));
  assert.equal(r.totalBytes, 500 * MB, 'o total só soma o que dá para limpar agora');
});

test('reduzir a hibernação mostra cerca de metade do arquivo como ganho', () => {
  const r = cleanup.buildItems({ isAdmin: true, hiberboot: 1, hiberFileType: 2, bytes: { hibernation: 12 * GB } });
  assert.equal(r.items[0].bytes, 6 * GB);
});

test('o script de medição cobre todas as categorias e não tem caminhos fora da lista', () => {
  const s = cleanup.analyzeScript();
  for (const id of Object.keys(cleanup.CATEGORIES)) assert.ok(s.includes(`  ${id} = `), id);
  assert.ok(!/Remove-Item/.test(s), 'medir nunca apaga');
});
