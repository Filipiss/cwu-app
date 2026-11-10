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
