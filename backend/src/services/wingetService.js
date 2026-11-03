// backend/src/services/wingetService.js
// Instalação em lote de softwares pelo winget (gerenciador oficial da Microsoft).
// Roda um pacote por vez numa fila em segundo plano; a interface consulta o progresso.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../database/db');
const WINGET_MAP = require('../database/wingetCatalog');

const PACKAGE_TIMEOUT_MS = 20 * 60 * 1000;

// Códigos de saída do winget (HRESULT) mais comuns
const EXIT_CODES = {
  0x8A15002B: { state: 'skipped', text: 'Já instalado na versão mais recente' },
  0x8A150061: { state: 'skipped', text: 'Já instalado' },
  0x8A150014: { state: 'failed', text: 'Pacote não encontrado no winget' },
  0x8A150109: { state: 'done', text: 'Instalado (reinicie o PC para concluir)' },
  0x8A15010D: { state: 'failed', text: 'Outra instalação em andamento no Windows' },
  0x8A150101: { state: 'failed', text: 'Instalador não pôde ser baixado' },
  0x8A150102: { state: 'failed', text: 'Instalador cancelado pelo usuário' }
};

// Traduz o código de saída do winget em estado + texto para a interface
function interpretExitCode(code, error) {
  if (code === 0) return { state: 'done', text: 'Instalado' };
  const known = EXIT_CODES[code >>> 0];
  if (known) return { ...known };
  if (error) return { state: 'failed', text: `Erro: ${error}` };
  return { state: 'failed', text: `Falhou (código 0x${(code >>> 0).toString(16).toUpperCase()})` };
}

function normalizePackage(p) {
  return typeof p === 'string' ? { id: p, source: 'winget' } : { source: 'winget', ...p };
}

function runWinget(args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn('winget', args, { windowsHide: true });
    } catch (err) {
      return resolve({ code: -1, out: '', error: err.message });
    }
    const timer = setTimeout(() => { try { child.kill(); } catch (e) {} }, timeoutMs);
    child.stdout.on('data', c => { out += c.toString('utf8'); });
    child.stderr.on('data', c => { out += c.toString('utf8'); });
    child.on('error', err => { clearTimeout(timer); resolve({ code: -1, out, error: err.message }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code: code === null ? -1 : code >>> 0, out }); });
  });
}

class WingetService {
  constructor() {
    this.job = null;
    this.installedCache = null;
  }

  async getStatus() {
    if (process.platform !== 'win32') {
      return { available: false, message: 'O winget só existe no Windows.' };
    }
    const res = await runWinget(['--version'], 15000);
    if (res.code !== 0) {
      return {
        available: false,
        message: 'winget não encontrado. Instale o "Instalador de Aplicativo" pela Microsoft Store e tente de novo.',
        storeUrl: 'ms-windows-store://pdp/?productid=9NBLGGH4NNS1'
      };
    }
    return {
      available: true,
      version: res.out.trim(),
      supported: Object.keys(WINGET_MAP).filter(k => WINGET_MAP[k]),
      installed: await this.getInstalledCatalogIds()
    };
  }

  // `winget export` gera JSON com os pacotes instalados reconhecidos (independe do idioma do Windows)
  async getInstalledCatalogIds(force = false) {
    if (this.installedCache && !force && Date.now() - this.installedCache.at < 5 * 60 * 1000) {
      return this.installedCache.ids;
    }
    const file = path.join(os.tmpdir(), `cwu-winget-export-${process.pid}.json`);
    await runWinget(['export', '-o', file, '--accept-source-agreements', '--disable-interactivity'], 90000);
    const installedIds = new Set();
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const src of data.Sources || []) {
        for (const pkg of src.Packages || []) installedIds.add(String(pkg.PackageIdentifier).toLowerCase());
      }
      fs.unlinkSync(file);
    } catch (e) { /* export falhou: tratamos como lista vazia */ }

    const ids = Object.entries(WINGET_MAP)
      .filter(([, pkgs]) => pkgs && pkgs.map(normalizePackage).every(p => installedIds.has(p.id.toLowerCase())))
      .map(([catalogId]) => catalogId);
    this.installedCache = { at: Date.now(), ids };
    return ids;
  }

  startInstall(catalogIds) {
    if (process.platform !== 'win32') {
      return { success: false, message: 'Disponível apenas no Windows.' };
    }
    if (this.job && this.job.running) {
      return { success: false, message: 'Já existe uma instalação em andamento.' };
    }
    const catalog = db.getEssentialSoftwares();
    const valid = [...new Set(Array.isArray(catalogIds) ? catalogIds : [])]
      .filter(id => typeof id === 'string' && WINGET_MAP[id])
      .slice(0, 60);
    if (valid.length === 0) {
      return { success: false, message: 'Nenhum software válido selecionado.' };
    }

    const items = [];
    for (const catalogId of valid) {
      const sw = catalog.find(s => s.id === catalogId);
      for (const pkg of WINGET_MAP[catalogId].map(normalizePackage)) {
        items.push({ catalogId, name: sw ? sw.name : catalogId, packageId: pkg.id, source: pkg.source, state: 'queued', text: 'Na fila' });
      }
    }

    this.job = { id: Date.now().toString(36), running: true, startedAt: new Date().toISOString(), finishedAt: null, items };
    this.processQueue(this.job);
    return { success: true, job: this.publicJob() };
  }

  async processQueue(job) {
    for (const item of job.items) {
      if (job.cancelled) {
        item.state = 'cancelled';
        item.text = 'Cancelado';
        continue;
      }
      item.state = 'installing';
      item.text = 'Baixando e instalando…';
      item.startedAt = Date.now();

      const res = await runWinget([
        'install', '--id', item.packageId, '--exact', '--source', item.source,
        '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'
      ], PACKAGE_TIMEOUT_MS);

      Object.assign(item, interpretExitCode(res.code, res.error));
      item.seconds = Math.round((Date.now() - item.startedAt) / 1000);
      // Últimas linhas da saída ajudam a diagnosticar falhas
      if (item.state === 'failed') item.log = res.out.split(/\r?\n/).filter(l => l.trim()).slice(-4).join('\n');

      if (item.state === 'done') {
        db.addUpdateLog({
          type: 'software',
          title: item.name,
          category: 'Instalação via winget',
          details: `Pacote ${item.packageId} instalado pelo winget.`,
          revertAction: 'revert_software'
        });
      }
    }
    job.running = false;
    job.finishedAt = new Date().toISOString();
    this.installedCache = null;
  }

  cancel() {
    if (!this.job || !this.job.running) return { success: false, message: 'Nenhuma instalação em andamento.' };
    this.job.cancelled = true;
    return { success: true, message: 'Os pacotes restantes foram cancelados (o atual termina antes).' };
  }

  publicJob() {
    if (!this.job) return null;
    const { id, running, startedAt, finishedAt, items, cancelled } = this.job;
    const count = (s) => items.filter(i => i.state === s).length;
    return {
      id, running, startedAt, finishedAt, cancelled: Boolean(cancelled),
      total: items.length,
      done: count('done'), skipped: count('skipped'), failed: count('failed'),
      items: items.map(({ startedAt: _s, ...rest }) => rest)
    };
  }
}

module.exports = new WingetService();
module.exports.WINGET_MAP = WINGET_MAP;
module.exports.interpretExitCode = interpretExitCode;
