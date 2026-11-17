const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { UpdateDownloader, speedFrom, totalFromHeaders, controlsFor, partFile } = require('../src/services/updateDownloader');

test('botões: pausar e parar só baixando; retomar só pausado ou parado', () => {
  assert.deepEqual(controlsFor('downloading'), { canPause: true, canStop: true, canResume: false });
  assert.deepEqual(controlsFor('paused'), { canPause: false, canStop: false, canResume: true });
  assert.deepEqual(controlsFor('stopped'), { canPause: false, canStop: false, canResume: true });
  for (const s of ['idle', 'preparing', 'verifying', 'ready', 'error']) {
    assert.deepEqual(controlsFor(s), { canPause: false, canStop: false, canResume: false }, s);
  }
});

test('velocidade: média das amostras dos últimos segundos', () => {
  const now = 10000;
  const samples = [{ at: 5000, bytes: 0 }, { at: 8000, bytes: 1000 }, { at: 10000, bytes: 5000 }];
  assert.equal(speedFrom(samples, now), 2000, '(5000 - 1000) / 2 s; a amostra antiga fica de fora');
  assert.equal(speedFrom([{ at: now, bytes: 10 }], now), 0, 'uma amostra só não dá velocidade');
});

test('tamanho total: Content-Range ao retomar, Content-Length no download inteiro', () => {
  assert.equal(totalFromHeaders(206, 'bytes 500-999/1000', '500', 500), 1000);
  assert.equal(totalFromHeaders(206, null, '500', 500), 1000);
  assert.equal(totalFromHeaders(200, null, '1000', 0), 1000);
  assert.equal(totalFromHeaders(200, null, null, 0), 0);
});

// Servidor local que entrega o arquivo devagar e aceita Range (como o GitHub)
function slowServer(data, { chunk = 64 * 1024, delayMs = 15 } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const m = String(req.headers.range || '').match(/bytes=(\d+)-/);
      const start = m ? Number(m[1]) : 0;
      if (start >= data.length) { res.writeHead(416); return res.end(); }
      res.writeHead(m ? 206 : 200, {
        'Content-Length': data.length - start,
        ...(m ? { 'Content-Range': `bytes ${start}-${data.length - 1}/${data.length}` } : {})
      });
      let pos = start;
      const timer = setInterval(() => {
        if (res.destroyed) return clearInterval(timer);
        const end = Math.min(pos + chunk, data.length);
        res.write(data.subarray(pos, end));
        pos = end;
        if (pos >= data.length) { clearInterval(timer); res.end(); }
      }, delayMs);
      req.on('close', () => clearInterval(timer));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await wait(20); }
  throw new Error('tempo esgotado');
}

function prepared(url, data, version) {
  const d = new UpdateDownloader();
  d.version = version;
  d.target = { version, setupUrl: url, size: data.length, expectedSha512: crypto.createHash('sha512').update(data).digest('base64') };
  d.totalBytes = data.length;
  for (const f of [partFile(version), partFile(version).replace(/\.part$/, '')]) { try { fs.unlinkSync(f); } catch (e) {} }
  return d;
}

test('pausar guarda o parcial e retomar continua do mesmo ponto até conferir o arquivo', async () => {
  const data = crypto.randomBytes(2 * 1024 * 1024);
  const server = await slowServer(data);
  const url = `http://127.0.0.1:${server.address().port}/setup.exe`;
  const d = prepared(url, data, '99.0.1');
  try {
    await d.start('99.0.1');
    await until(() => d.receivedBytes > 300 * 1024);
    const snap = d.pause();
    assert.equal(snap.status, 'paused');
    assert.equal(snap.canResume, true);
    await d.running;
    const kept = fs.statSync(partFile('99.0.1')).size;
    assert.ok(kept > 0 && kept < data.length, 'o parcial fica no disco');
    assert.equal(d.receivedBytes, kept);

    await d.resume();
    await until(() => d.status === 'ready');
    assert.equal(d.receivedBytes, data.length);
    assert.ok(fs.readFileSync(d.file).equals(data), 'o arquivo final é idêntico ao original');
    assert.equal(await d.readyFile(), d.file, 'confere de novo antes de instalar');
  } finally {
    server.close();
    try { fs.unlinkSync(d.file); } catch (e) {}
  }
});

test('parar apaga o parcial e retomar começa do zero', async () => {
  const data = crypto.randomBytes(2 * 1024 * 1024);
  const server = await slowServer(data);
  const url = `http://127.0.0.1:${server.address().port}/setup.exe`;
  const d = prepared(url, data, '99.0.2');
  try {
    await d.start('99.0.2');
    await until(() => d.receivedBytes > 300 * 1024);
    assert.equal(d.stop().status, 'stopped');
    await d.running;
    assert.equal(fs.existsSync(partFile('99.0.2')), false, 'o parcial foi apagado');
    assert.equal(d.receivedBytes, 0);
    assert.equal(d.snapshot().canResume, true);
    assert.equal(d.pause().status, 'stopped', 'pausar não faz nada fora do download');

    await d.resume();
    await until(() => d.status === 'ready');
    assert.ok(fs.readFileSync(d.file).equals(data));
  } finally {
    server.close();
    try { fs.unlinkSync(d.file); } catch (e) {}
  }
});

test('arquivo que não confere com o SHA-512 é apagado e nada fica pronto para instalar', async () => {
  const data = crypto.randomBytes(256 * 1024);
  const server = await slowServer(data, { delayMs: 1 });
  const url = `http://127.0.0.1:${server.address().port}/setup.exe`;
  const d = prepared(url, data, '99.0.3');
  d.target.expectedSha512 = crypto.createHash('sha512').update('outro arquivo').digest('base64');
  try {
    await d.start('99.0.3');
    await until(() => d.status === 'error');
    assert.match(d.error, /não confere/);
    assert.equal(fs.existsSync(partFile('99.0.3')), false);
    assert.equal(await d.readyFile(), null);
  } finally {
    server.close();
  }
});
