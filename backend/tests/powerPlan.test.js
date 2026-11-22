const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const pp = require('../src/services/powerPlanService');

const LIST = [
  'Esquemas de Energia Existentes (* Ativos)',
  'GUID do Esquema de Energia: 381b4222-f694-41f0-9685-ff5bb260df2e  (Equilibrado) *',
  'GUID do Esquema de Energia: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (Alto desempenho)',
  'GUID do Esquema de Energia: a1841308-3541-4fab-bc81-f71556f20b4a  (Economia de energia)'
].join(' ');
const ONLY_BALANCED = 'GUID do Esquema de Energia: 381b4222-f694-41f0-9685-ff5bb260df2e  (Equilibrado) *';

test('PC comum: usa o plano Alto desempenho do Windows', () => {
  const st = pp.interpret({ active: 'Power Scheme GUID: 381B4222-F694-41F0-9685-FF5BB260DF2E  (Balanced)', list: LIST, modernStandby: false, powerModeSupported: true, powerMode: pp.MODE_BALANCED });
  assert.equal(st.method, 'plan');
  assert.equal(st.activeGuid, pp.BALANCED);
  assert.equal(st.performanceActive, false);
  assert.equal(pp.blockReason(st), null);
  assert.equal(pp.interpret({ active: pp.HIGH, list: LIST }).performanceActive, true);
});

test('Modern Standby: usa o Modo de energia "Melhor desempenho", sem trocar de plano', () => {
  const st = pp.interpret({ active: pp.BALANCED, list: ONLY_BALANCED, modernStandby: true, powerModeSupported: true, powerMode: pp.MODE_BALANCED });
  assert.equal(st.method, 'mode');
  assert.equal(st.performanceActive, false);
  assert.equal(pp.blockReason(st), null);
  const on = pp.interpret({ active: pp.BALANCED, list: ONLY_BALANCED, modernStandby: true, powerModeSupported: true, powerMode: pp.MODE_BEST_PERFORMANCE.toUpperCase() });
  assert.equal(on.performanceActive, true, 'GUID em maiúsculas também vale');
});

test('Modern Standby sem o Modo de energia disponível: não mexe em nada', () => {
  const st = pp.interpret({ active: pp.BALANCED, list: ONLY_BALANCED, modernStandby: true, powerModeSupported: false });
  assert.equal(st.method, null);
  assert.match(pp.blockReason(st), /Modern Standby/);
});

test('PC comum sem o plano Alto desempenho: não cria e avisa', () => {
  const st = pp.interpret({ active: pp.BALANCED, list: ONLY_BALANCED, modernStandby: false, powerModeSupported: true });
  assert.equal(st.method, null);
  assert.match(pp.blockReason(st), /não está disponível/);
});

test('reverter volta para o plano ou o Modo de energia anterior, com valores seguros', () => {
  const plans = pp.listGuids(LIST);
  assert.equal(pp.restoreTarget('a1841308-3541-4fab-bc81-f71556f20b4a', plans), 'a1841308-3541-4fab-bc81-f71556f20b4a');
  assert.equal(pp.restoreTarget('11111111-2222-3333-4444-555555555555', plans), pp.BALANCED, 'plano anterior não existe mais');
  assert.equal(pp.restoreTarget(pp.HIGH, plans), pp.BALANCED);
  assert.equal(pp.restoreTarget('x; rm -rf', plans), pp.BALANCED);
  assert.equal(pp.restoreModeTarget('961cc777-2547-4f9d-8174-7d86181b8a7a'), '961cc777-2547-4f9d-8174-7d86181b8a7a', 'Melhor eficiência de energia');
  assert.equal(pp.restoreModeTarget(pp.MODE_BEST_PERFORMANCE), pp.MODE_BALANCED);
  assert.equal(pp.restoreModeTarget("'); Remove-Item"), pp.MODE_BALANCED, 'valor estranho não vai para o script');
});

test('nenhum código do app cria ou duplica planos de energia', () => {
  const dir = path.join(__dirname, '..', 'src');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const file of walk(dir).filter(f => f.endsWith('.js'))) {
    assert.ok(!/duplicatescheme/i.test(fs.readFileSync(file, 'utf8')), `${path.basename(file)} não pode usar powercfg -duplicatescheme`);
  }
});
