// backend/src/services/fpsService.js
// FPS do jogo em primeiro plano, via PresentMon (Intel, open source, MIT).
// O PresentMon lê os eventos de apresentação de frames que o próprio Windows registra (ETW):
// não injeta nada no jogo nem instala driver. O Windows exige administrador para ler esses eventos.
// O processo só roda enquanto alguém consulta (a sobreposição) e para sozinho depois de 5 s sem uso.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const elevation = require('./elevationService');

const IDLE_STOP_MS = 5000;
const FPS_WINDOW_MS = 1000;   // FPS = frames do último segundo
const LOW_WINDOW_MS = 10000;  // 1% low = pior 1% dos frames dos últimos 10 s
const SESSION = 'CWU_FPS';
// Processos que apresentam frames mas não são o "jogo": o compositor do Windows e o próprio app
const EXCLUDE = ['dwm.exe', 'CWU-App.exe', 'CWU App.exe', 'electron.exe', 'explorer.exe', 'PresentMon.exe'];

// Procura o PresentMon (qualquer nome PresentMon*.exe) na pasta bin
function findPresentMon() {
  const dirs = [
    process.resourcesPath ? path.join(process.resourcesPath, 'bin') : null,
    path.resolve(__dirname, '../../bin')
  ].filter(Boolean);
  for (const dir of dirs) {
    try {
      const exe = fs.readdirSync(dir).find(f => /^presentmon.*\.exe$/i.test(f));
      if (exe) return path.join(dir, exe);
    } catch (e) { /* pasta não existe */ }
  }
  return null;
}

// Junta os frames por processo e calcula FPS e 1% low do que mais apresenta frames (pura, testável)
function computeFps(frames, now) {
  const recent = frames.filter(f => now - f.at <= FPS_WINDOW_MS);
  if (!recent.length) return null;
  const counts = new Map();
  recent.forEach(f => counts.set(f.pid, (counts.get(f.pid) || 0) + 1));
  const [pid] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const mine = recent.filter(f => f.pid === pid);
  const avgMs = mine.reduce((s, f) => s + f.ms, 0) / mine.length;
  const window = frames.filter(f => f.pid === pid && now - f.at <= LOW_WINDOW_MS).map(f => f.ms).sort((a, b) => b - a);
  const worst = window.slice(0, Math.max(1, Math.ceil(window.length * 0.01)));
  const worstAvg = worst.reduce((s, v) => s + v, 0) / worst.length;
  return {
    app: mine[mine.length - 1].app,
    fps: avgMs > 0 ? Math.round(1000 / avgMs) : null,
    low1: window.length >= 100 && worstAvg > 0 ? Math.round(1000 / worstAvg) : null
  };
}

// Converte uma linha do CSV do PresentMon usando os índices do cabeçalho (pura, testável)
function parseLine(line, cols, at) {
  const p = line.split(',');
  const ms = parseFloat(p[cols.ms]);
  const pid = Number(p[cols.pid]);
  if (!Number.isFinite(ms) || ms <= 0 || ms > 1000 || !pid) return null;
  return { app: p[cols.app], pid, ms, at };
}

class FpsService {
  constructor() {
    this.child = null;
    this.frames = [];
    this.cols = null;
    this.buffer = '';
    this.lastPoll = 0;
    this.timer = null;
    this.error = null;
  }

  async snapshot() {
    if (process.platform !== 'win32') return { available: false, reason: 'platform' };
    const exe = findPresentMon();
    if (!exe) return { available: false, reason: 'missing' };
    const { isAdmin } = await elevation.status();
    if (!isAdmin) return { available: false, reason: 'admin' };
    this.lastPoll = Date.now();
    this.ensureRunning(exe);
    if (this.error) return { available: false, reason: 'error', message: this.error };
    const now = Date.now();
    this.frames = this.frames.filter(f => now - f.at <= LOW_WINDOW_MS);
    return { available: true, ...(computeFps(this.frames, now) || { fps: null, low1: null, app: null }) };
  }

  ensureRunning(exe) {
    if (this.child) return;
    this.cols = null;
    this.buffer = '';
    this.frames = [];
    this.error = null;
    const args = ['--output_stdout', '--no_console_stats', '--stop_existing_session', '--session_name', SESSION];
    EXCLUDE.forEach(name => args.push('--exclude', name));
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    let stderr = '';
    child.stdout.on('data', (chunk) => this.onData(chunk));
    child.stderr.on('data', (c) => { stderr = (stderr + c).slice(-500); });
    child.on('error', (e) => { this.error = e.message; if (this.child === child) this.child = null; });
    child.on('exit', (code) => {
      if (this.child === child) this.child = null;
      if (code && Date.now() - this.lastPoll < IDLE_STOP_MS) this.error = `PresentMon encerrou (código ${code}). ${stderr.trim()}`;
    });
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (Date.now() - this.lastPoll > IDLE_STOP_MS) this.stop(); }, 2000);
  }

  onData(chunk) {
    this.buffer += chunk.toString('utf8');
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop();
    const at = Date.now();
    for (const line of lines) {
      if (!line) continue;
      if (!this.cols) {
        const h = line.split(',');
        const idx = (n) => h.indexOf(n);
        if (idx('Application') >= 0 && idx('MsBetweenPresents') >= 0) {
          this.cols = { app: idx('Application'), pid: idx('ProcessID'), ms: idx('MsBetweenPresents') };
        }
        continue;
      }
      const f = parseLine(line, this.cols, at);
      if (f) this.frames.push(f);
    }
    if (this.frames.length > 20000) this.frames = this.frames.slice(-10000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.child) {
      try { this.child.kill(); } catch (e) {}
      this.child = null;
    }
  }
}

const instance = new FpsService();
process.on('exit', () => instance.stop());
module.exports = instance;
module.exports.computeFps = computeFps;
module.exports.parseLine = parseLine;
module.exports.findPresentMon = findPresentMon;
