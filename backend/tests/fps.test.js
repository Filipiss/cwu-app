const test = require('node:test');
const assert = require('node:assert/strict');
const { computeFps, parseLine } = require('../src/services/fpsService');

const header = 'Application,ProcessID,SwapChainAddress,PresentRuntime,MsBetweenPresents'.split(',');
const cols = { app: header.indexOf('Application'), pid: header.indexOf('ProcessID'), ms: header.indexOf('MsBetweenPresents') };

test('parseLine: lê aplicativo, processo e tempo entre frames', () => {
  assert.deepEqual(parseLine('cs2.exe,4321,0x1,DXGI,4.1667', cols, 10), { app: 'cs2.exe', pid: 4321, ms: 4.1667, at: 10 });
  assert.equal(parseLine('cs2.exe,4321,0x1,DXGI,NA', cols, 10), null);
});

test('computeFps: escolhe o processo que mais apresenta frames e calcula FPS', () => {
  const now = 100000;
  const frames = [];
  for (let i = 0; i < 240; i++) frames.push({ app: 'cs2.exe', pid: 1, ms: 1000 / 240, at: now - i * 4 });
  for (let i = 0; i < 30; i++) frames.push({ app: 'chrome.exe', pid: 2, ms: 33.3, at: now - i * 30 });
  const r = computeFps(frames, now);
  assert.equal(r.app, 'cs2.exe');
  assert.equal(r.fps, 240);
});

test('computeFps: 1% low reflete as quedas', () => {
  const now = 100000;
  const frames = [];
  for (let i = 0; i < 1000; i++) frames.push({ app: 'valorant.exe', pid: 1, ms: i % 100 === 0 ? 20 : 5, at: now - i * 5 });
  const r = computeFps(frames, now);
  assert.equal(r.low1, 50); // pior 1% = frames de 20 ms
});

test('computeFps: sem frames recentes devolve null', () => {
  assert.equal(computeFps([{ app: 'x', pid: 1, ms: 5, at: 0 }], 5000), null);
});

const { isExclusiveMode } = require('../src/services/fpsService');

test('tela cheia exclusiva: só os modos "Legacy" impedem a sobreposição', () => {
  assert.equal(isExclusiveMode('Hardware: Legacy Flip'), true);
  assert.equal(isExclusiveMode('Hardware: Legacy Copy to front buffer'), true);
  assert.equal(isExclusiveMode('Hardware: Independent Flip'), false);
  assert.equal(isExclusiveMode('Hardware Composed: Independent Flip'), false);
  assert.equal(isExclusiveMode('Composed: Flip'), false);
  assert.equal(isExclusiveMode(undefined), false);
});

test('parseLine guarda o modo de apresentação e computeFps marca tela cheia exclusiva', () => {
  const h = 'Application,ProcessID,PresentMode,MsBetweenPresents'.split(',');
  const c = { app: h.indexOf('Application'), pid: h.indexOf('ProcessID'), ms: h.indexOf('MsBetweenPresents'), mode: h.indexOf('PresentMode') };
  assert.equal(parseLine('old.exe,7,Hardware: Legacy Flip,16.6', c, 1).mode, 'Hardware: Legacy Flip');
  const now = 10000;
  const legacy = Array.from({ length: 60 }, (_, i) => ({ app: 'old.exe', pid: 7, ms: 16.6, at: now - i * 10, mode: 'Hardware: Legacy Flip' }));
  assert.equal(computeFps(legacy, now).exclusive, true);
  const fso = legacy.map(f => ({ ...f, mode: 'Hardware: Independent Flip' }));
  assert.equal(computeFps(fso, now).exclusive, false);
});
