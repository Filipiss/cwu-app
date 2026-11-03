const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/services/competitiveService');

test('powercfg: lê os índices CA/CC mesmo com a saída em português', () => {
  const out = 'GUID da Configuração de Energia: 48e6b7a6-...  Índice de Configuração Possível: 000 ... Índice de Configuração de Energia CA Atual: 0x00000001 Índice de Configuração de Energia CC Atual: 0x00000000';
  assert.deepEqual(c.parsePowercfgIndexes(out), { ac: 1, dc: 0 });
  assert.equal(c.parsePowercfgIndexes('sem dados'), null);
});

test('extrai o GUID do plano criado pelo powercfg', () => {
  assert.equal(c.parseGuid('GUID do Esquema de Energia: 9F3A1B2C-1234-4ABC-8DEF-001122334455  (Desempenho Máximo)'), '9f3a1b2c-1234-4abc-8def-001122334455');
  assert.equal(c.parseGuid('nada'), null);
});

test('ping: média, jitter e perda', () => {
  const s = c.pingStats([10, 12, null, 11, 30]);
  assert.equal(s.loss, 20);
  assert.equal(s.min, 10);
  assert.equal(s.max, 30);
  assert.equal(s.jitter, 7.3);
  assert.equal(c.pingStats([null, null]).avg, null);
});

test('classificação da conexão prioriza perda, depois jitter, depois ping', () => {
  assert.equal(c.rateConnection({ avg: 20, jitter: 1, loss: 5 }).level, 'bad');
  assert.equal(c.rateConnection({ avg: 20, jitter: 30, loss: 0 }).level, 'warn');
  assert.equal(c.rateConnection({ avg: 120, jitter: 2, loss: 0 }).level, 'warn');
  assert.equal(c.rateConnection({ avg: 20, jitter: 2, loss: 0 }).level, 'ok');
});

test('monitor abaixo da taxa máxima é detectado', () => {
  assert.equal(c.analyzeDisplay({ current: 60, rates: [60, 120, 144] }).belowMax, true);
  assert.equal(c.analyzeDisplay({ current: 144, rates: [60, 144] }).belowMax, false);
  // 59,94 Hz arredondado para 59 não conta como "abaixo" de 60
  assert.equal(c.analyzeDisplay({ current: 59, rates: [59, 60] }).belowMax, false);
});

test('overlays são reconhecidos pelo nome do processo', () => {
  const ids = c.overlayMatch(['Discord', 'RTSS', 'explorer', 'Steam']).map(o => o.id);
  assert.deepEqual(ids.sort(), ['discord', 'rtss', 'steam']);
});

test('ações com parâmetro inválido são recusadas antes de tocar no sistema', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  assert.equal((await c.setMouseAcceleration({ enabled: 'sim' })).success, false);
  assert.equal((await c.setMouseSpeed({ speed: 99 })).success, false);
  assert.equal((await c.setUltimatePlan({})).success, false);
  assert.equal((await c.setAdapterPowerSaving({ setting: 'rm -rf', enabled: true })).success, false);
});
