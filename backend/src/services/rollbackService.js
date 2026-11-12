// backend/src/services/rollbackService.js
// Voltar para uma versão anterior: lista as releases do GitHub que têm instalador, baixa o
// instalador escolhido e confere o SHA-512 publicado no latest.yml daquela mesma release.
// Quem executa o instalador e fecha o app é o processo do Electron (electron-main.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { compareVersions } = require('./versionService');

const SETUP_NAME = 'CWU-App-Setup.exe';
const GH_HEADERS = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'CWU-App' };

// Só releases publicadas (sem rascunho/pre-release) que tenham instalador e latest.yml (pura, testável)
function pickInstallable(releases, currentVersion, repo) {
  const prefix = `https://github.com/${repo}/releases/download/`;
  return (Array.isArray(releases) ? releases : [])
    .filter(r => r && !r.draft && !r.prerelease)
    .map(r => {
      const assets = Array.isArray(r.assets) ? r.assets : [];
      const setup = assets.find(a => a.name === SETUP_NAME);
      const yml = assets.find(a => a.name === 'latest.yml');
      const version = String(r.tag_name || '').replace(/^v/i, '');
      if (!setup || !yml || !/^\d+\.\d+\.\d+$/.test(version)) return null;
      if (!String(setup.browser_download_url).startsWith(prefix) || !String(yml.browser_download_url).startsWith(prefix)) return null;
      return {
        version,
        date: r.published_at ? r.published_at.slice(0, 10) : null,
        setupUrl: setup.browser_download_url,
        ymlUrl: yml.browser_download_url,
        size: setup.size || null
      };
    })
    .filter(Boolean)
    .filter(r => r.version !== currentVersion)
    .sort((a, b) => compareVersions(b.version, a.version));
}

// O latest.yml do electron-builder traz o SHA-512 (base64) do instalador no nível de cima (pura, testável)
function parseYmlSha512(text) {
  const m = String(text || '').match(/^sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?\s*$/m);
  return m ? m[1] : null;
}

class RollbackService {
  async listVersions() {
    const resp = await fetch(`https://api.github.com/repos/${config.githubRepo}/releases?per_page=30`, { headers: GH_HEADERS });
    if (!resp.ok) throw new Error(`GitHub respondeu ${resp.status}`);
    const all = pickInstallable(await resp.json(), config.appVersion, config.githubRepo);
    return all.map(({ version, date, size }) => ({ version, date, size, older: compareVersions(version, config.appVersion) < 0 }));
  }

  /** Baixa e confere o instalador da versão escolhida. Devolve o caminho do arquivo verificado. */
  async prepare(version, onProgress = () => {}) {
    const resp = await fetch(`https://api.github.com/repos/${config.githubRepo}/releases?per_page=30`, { headers: GH_HEADERS });
    if (!resp.ok) throw new Error(`GitHub respondeu ${resp.status}`);
    const target = pickInstallable(await resp.json(), config.appVersion, config.githubRepo).find(r => r.version === version);
    if (!target) throw new Error('Versão não encontrada entre as releases com instalador.');

    const yml = await fetch(target.ymlUrl, { headers: { 'User-Agent': 'CWU-App' } });
    if (!yml.ok) throw new Error('Não foi possível ler o latest.yml da versão.');
    const expected = parseYmlSha512(await yml.text());
    if (!expected) throw new Error('O latest.yml da versão não tem o código de verificação.');

    const res = await fetch(target.setupUrl, { headers: { 'User-Agent': 'CWU-App' } });
    if (!res.ok || !res.body) throw new Error('Falha ao baixar o instalador.');
    const total = Number(res.headers.get('content-length')) || target.size || 0;
    const file = path.join(os.tmpdir(), `CWU-App-Setup-${version}.exe`);
    const out = fs.createWriteStream(file);
    const hash = crypto.createHash('sha512');
    let received = 0;
    for await (const chunk of res.body) {
      hash.update(chunk);
      out.write(chunk);
      received += chunk.length;
      if (total) onProgress(Math.min(99, Math.round((received / total) * 100)));
    }
    await new Promise((ok, fail) => out.end(err => (err ? fail(err) : ok())));
    if (hash.digest('base64') !== expected) {
      try { fs.unlinkSync(file); } catch (e) {}
      throw new Error('O arquivo baixado não confere com o código de verificação. Nada foi instalado.');
    }
    onProgress(100);
    return file;
  }
}

module.exports = new RollbackService();
module.exports.pickInstallable = pickInstallable;
module.exports.parseYmlSha512 = parseYmlSha512;
