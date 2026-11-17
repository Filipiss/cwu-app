// backend/src/services/updateDownloader.js
// Download da atualização com pausar, parar e retomar.
//   Pausar: interrompe e guarda o que já foi baixado (retomar continua do mesmo ponto).
//   Parar:  cancela e apaga o arquivo parcial (retomar começa do zero).
// O download continua de onde parou pedindo ao servidor só o restante (cabeçalho Range).
// No fim, o instalador é conferido pelo SHA-512 publicado no latest.yml da mesma release.
// Quem executa o instalador e fecha o app é o processo do Electron (electron-main.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { once } = require('events');
const config = require('../config');
const { compareVersions } = require('./versionService');
const { pickInstallable, parseYmlSha512 } = require('./rollbackService');

const GH_HEADERS = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'CWU-App' };
const SPEED_WINDOW_MS = 3000;

const partFile = (version) => path.join(os.tmpdir(), `CWU-App-Setup-${version}.exe.part`);
const finalFile = (version) => path.join(os.tmpdir(), `CWU-App-Setup-${version}.exe`);

/** Velocidade média (bytes/s) das amostras dos últimos segundos (pura, testável). */
function speedFrom(samples, now, windowMs = SPEED_WINDOW_MS) {
  const recent = samples.filter(s => now - s.at <= windowMs);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = (last.at - first.at) / 1000;
  return dt > 0 ? Math.max(0, Math.round((last.bytes - first.bytes) / dt)) : 0;
}

/** Tamanho total a partir do Content-Range ("bytes 100-199/1000") ou do Content-Length (pura). */
function totalFromHeaders(status, contentRange, contentLength, offset) {
  const m = String(contentRange || '').match(/\/(\d+)\s*$/);
  if (m) return Number(m[1]);
  const len = Number(contentLength) || 0;
  if (!len) return 0;
  return status === 206 ? offset + len : len;
}

/** Quais botões ficam ativos em cada estado (pura, testável). */
function controlsFor(status) {
  return {
    canPause: status === 'downloading',
    canStop: status === 'downloading',
    canResume: status === 'paused' || status === 'stopped'
  };
}

class UpdateDownloader {
  constructor() {
    this.reset();
  }

  reset() {
    this.status = 'idle'; // idle | preparing | downloading | paused | stopped | verifying | ready | error
    this.version = null;
    this.totalBytes = 0;
    this.receivedBytes = 0;
    this.error = null;
    this.file = null;
    this.target = null; // { setupUrl, expectedSha512 }
    this.samples = [];
    this.controller = null;
    this.running = null;
  }

  snapshot() {
    const now = Date.now();
    const bytesPerSecond = this.status === 'downloading' ? speedFrom(this.samples, now) : 0;
    const remaining = Math.max(0, this.totalBytes - this.receivedBytes);
    return {
      status: this.status,
      version: this.version,
      totalBytes: this.totalBytes,
      receivedBytes: this.receivedBytes,
      percent: this.totalBytes ? Math.min(100, Math.floor((this.receivedBytes / this.totalBytes) * 100)) : 0,
      bytesPerSecond,
      etaSeconds: bytesPerSecond > 0 ? Math.ceil(remaining / bytesPerSecond) : null,
      error: this.error,
      ...controlsFor(this.status)
    };
  }

  // Descobre a versão mais nova com instalador e o código de verificação dela
  async resolveTarget(version) {
    const resp = await fetch(`https://api.github.com/repos/${config.githubRepo}/releases?per_page=30`, { headers: GH_HEADERS });
    if (!resp.ok) throw new Error(`GitHub respondeu ${resp.status}`);
    const list = pickInstallable(await resp.json(), config.appVersion, config.githubRepo);
    const target = version
      ? list.find(r => r.version === version)
      : list.find(r => compareVersions(r.version, config.appVersion) > 0);
    if (!target) throw new Error(version ? `A versão ${version} não tem instalador publicado.` : 'Nenhuma versão mais nova com instalador publicado.');
    const yml = await fetch(target.ymlUrl, { headers: { 'User-Agent': 'CWU-App' } });
    if (!yml.ok) throw new Error('Não foi possível ler o latest.yml da versão.');
    const expectedSha512 = parseYmlSha512(await yml.text());
    if (!expectedSha512) throw new Error('O latest.yml da versão não tem o código de verificação.');
    return { version: target.version, setupUrl: target.setupUrl, size: target.size || 0, expectedSha512 };
  }

  /** Começa (ou retoma) o download. Sem versão, baixa a mais nova. */
  async start(version) {
    if (['preparing', 'downloading', 'verifying'].includes(this.status)) return this.snapshot();
    if (this.status === 'ready' && (!version || version === this.version)) return this.snapshot();
    if (version && !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Versão inválida.');

    // Retomar a mesma versão reaproveita o que já sabemos; outra versão começa do zero
    if (!this.target || (version && version !== this.version)) {
      this.status = 'preparing';
      this.error = null;
      try {
        this.target = await this.resolveTarget(version);
      } catch (err) {
        this.status = 'error';
        this.error = err.message;
        return this.snapshot();
      }
      this.version = this.target.version;
      this.totalBytes = this.target.size;
    }

    // Parcial de um download anterior (inclusive de outra execução do app): continua dele
    const part = partFile(this.version);
    try { this.receivedBytes = fs.statSync(part).size; } catch (e) { this.receivedBytes = 0; }
    this.status = 'downloading';
    this.error = null;
    this.samples = [{ at: Date.now(), bytes: this.receivedBytes }];
    this.running = this.run(part).catch(() => {});
    return this.snapshot();
  }

  async run(part) {
    const controller = new AbortController();
    this.controller = controller;
    let out = null;
    try {
      const offset = this.receivedBytes;
      const headers = { 'User-Agent': 'CWU-App' };
      if (offset > 0) headers.Range = `bytes=${offset}-`;
      const res = await fetch(this.target.setupUrl, { headers, signal: controller.signal });

      if (res.status === 416 && offset > 0) {
        // O parcial já está completo: só falta conferir
        await this.verify(part);
        return;
      }
      if (!res.ok || !res.body) throw new Error(`Falha ao baixar o instalador (HTTP ${res.status}).`);

      // 206 = continua de onde parou; 200 = o servidor mandou o arquivo inteiro, então recomeça
      const resumed = res.status === 206 && offset > 0;
      if (!resumed) this.receivedBytes = 0;
      this.totalBytes = totalFromHeaders(res.status, res.headers.get('content-range'), res.headers.get('content-length'), resumed ? offset : 0) || this.totalBytes;

      out = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' });
      for await (const chunk of res.body) {
        if (!out.write(chunk)) await once(out, 'drain');
        this.receivedBytes += chunk.length;
        const now = Date.now();
        this.samples.push({ at: now, bytes: this.receivedBytes });
        if (this.samples.length > 400) this.samples = this.samples.filter(s => now - s.at <= SPEED_WINDOW_MS);
      }
      await new Promise((ok, fail) => out.end(err => (err ? fail(err) : ok())));
      out = null;
      await this.verify(part);
    } catch (err) {
      if (out) await new Promise(ok => out.end(ok));
      if (controller.signal.aborted) {
        // Pausado: guarda o parcial. Parado: apaga e zera.
        if (this.status === 'stopped') {
          try { fs.unlinkSync(part); } catch (e) {}
          this.receivedBytes = 0;
        }
        return;
      }
      this.status = 'error';
      this.error = String(err && err.message || err).slice(0, 300);
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  async verify(part) {
    this.status = 'verifying';
    const hash = crypto.createHash('sha512');
    for await (const chunk of fs.createReadStream(part)) hash.update(chunk);
    if (hash.digest('base64') !== this.target.expectedSha512) {
      try { fs.unlinkSync(part); } catch (e) {}
      this.receivedBytes = 0;
      this.status = 'error';
      this.error = 'O arquivo baixado não confere com o código de verificação e foi apagado. Nada foi instalado. Tente baixar de novo.';
      return;
    }
    const file = finalFile(this.version);
    try { fs.unlinkSync(file); } catch (e) {}
    fs.renameSync(part, file);
    this.file = file;
    this.receivedBytes = this.totalBytes || this.receivedBytes;
    this.status = 'ready';
  }

  pause() {
    if (this.status !== 'downloading') return this.snapshot();
    this.status = 'paused';
    if (this.controller) this.controller.abort();
    return this.snapshot();
  }

  stop() {
    if (this.status !== 'downloading') return this.snapshot();
    this.status = 'stopped';
    if (this.controller) this.controller.abort();
    else { try { fs.unlinkSync(partFile(this.version)); } catch (e) {} this.receivedBytes = 0; }
    return this.snapshot();
  }

  resume() {
    if (this.status !== 'paused' && this.status !== 'stopped') return this.snapshot();
    return this.start(this.version);
  }

  /** Caminho do instalador pronto, conferido de novo na hora de instalar. */
  async readyFile() {
    if (this.status !== 'ready' || !this.file) return null;
    const hash = crypto.createHash('sha512');
    try {
      for await (const chunk of fs.createReadStream(this.file)) hash.update(chunk);
    } catch (e) {
      this.reset();
      return null;
    }
    if (hash.digest('base64') !== this.target.expectedSha512) {
      try { fs.unlinkSync(this.file); } catch (e) {}
      this.reset();
      return null;
    }
    return this.file;
  }
}

module.exports = new UpdateDownloader();
module.exports.UpdateDownloader = UpdateDownloader;
module.exports.speedFrom = speedFrom;
module.exports.totalFromHeaders = totalFromHeaders;
module.exports.controlsFor = controlsFor;
module.exports.partFile = partFile;
