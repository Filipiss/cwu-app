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

test('lê os planos e o ativo do powercfg, em qualquer idioma', () => {
  const st = pp.interpret({ active: 'Power Scheme GUID: 381B4222-F694-41F0-9685-FF5BB260DF2E  (Balanced)', list: LIST, modernStandby: false });
  assert.equal(st.activeGuid, pp.BALANCED);
  assert.equal(st.hasHigh, true);
  assert.equal(st.highActive, false);
  assert.equal(st.plans.length, 3);
});

test('Alto desempenho bloqueado em Modern Standby e quando o Windows não tem o plano', () => {
  const ms = pp.interpret({ active: pp.BALANCED, list: LIST, modernStandby: true });
  assert.match(pp.blockReason(ms), /Modern Standby/);
  const semHigh = pp.interpret({ active: pp.BALANCED, list: LIST.replace(/8c5e7fda[^)]*\)/, ''), modernStandby: false });
  assert.equal(semHigh.hasHigh, false);
  assert.match(pp.blockReason(semHigh), /não está disponível/);
  const ok = pp.interpret({ active: pp.BALANCED, list: LIST, modernStandby: false });
  assert.equal(pp.blockReason(ok), null);
});

test('reverter volta para o plano anterior, ou para o Equilibrado se ele sumiu', () => {
  const plans = pp.listGuids(LIST);
  assert.equal(pp.restoreTarget('a1841308-3541-4fab-bc81-f71556f20b4a', plans), 'a1841308-3541-4fab-bc81-f71556f20b4a');
  assert.equal(pp.restoreTarget('11111111-2222-3333-4444-555555555555', plans), pp.BALANCED, 'plano anterior não existe mais');
  assert.equal(pp.restoreTarget(pp.HIGH, plans), pp.BALANCED, 'nunca "volta" para o próprio Alto desempenho');
  assert.equal(pp.restoreTarget('x; rm -rf', plans), pp.BALANCED, 'valor estranho não vai para o comando');
});

test('nenhum código do app cria ou duplica planos de energia', () => {
  const dir = path.join(__dirname, '..', 'src');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const file of walk(dir).filter(f => f.endsWith('.js'))) {
    assert.ok(!/duplicatescheme/i.test(fs.readFileSync(file, 'utf8')), `${path.basename(file)} não pode usar powercfg -duplicatescheme`);
  }
});
