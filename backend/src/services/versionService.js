// backend/src/services/versionService.js
// Versão instalada (package.json), histórico (CHANGELOG.md) e checagem de
// atualização pela última release publicada no GitHub.
const fs = require('fs');
const path = require('path');
const config = require('../config');

// O CHANGELOG.md fica na raiz do repositório; no app empacotado, em resources/
const CHANGELOG_CANDIDATES = [
  path.resolve(__dirname, '../../../CHANGELOG.md'),
  path.join(process.resourcesPath || '', 'CHANGELOG.md')
];

/**
 * Lê o formato Keep a Changelog:
 *   ## [1.1.0] - 2026-11-03
 *   ### Adicionado
 *   - item
 */
function parseChangelog(markdown) {
  const entries = [];
  let entry = null;
  let section = null;
  for (const rawLine of String(markdown || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    const version = line.match(/^##\s+\[?v?(\d+\.\d+\.\d+)\]?(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/);
    if (version) {
      entry = { version: version[1], date: version[2] || null, sections: [] };
      entries.push(entry);
      section = null;
      continue;
    }
    if (!entry) continue;
    const heading = line.match(/^###\s+(.+)/);
    if (heading) {
      section = { title: heading[1].trim(), items: [] };
      entry.sections.push(section);
      continue;
    }
    const item = line.match(/^[-*]\s+(.+)/);
    if (item) {
      if (!section) { section = { title: 'Mudanças', items: [] }; entry.sections.push(section); }
      section.items.push(item[1].trim());
    }
  }
  return entries;
}

// "2026-11-03" → "03/11/2026"
const formatDate = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : null);

function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

class VersionService {
  readChangelog() {
    const file = CHANGELOG_CANDIDATES.find(p => p && fs.existsSync(p));
    if (!file) return [];
    try { return parseChangelog(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
  }

  getVersionInfo() {
    const changelog = this.readChangelog().map(e => ({
      ...e,
      dateLabel: formatDate(e.date),
      isCurrent: e.version === config.appVersion
    }));
    const current = changelog.find(e => e.isCurrent);
    return {
      appName: config.appName,
      currentVersion: config.appVersion,
      releaseDate: current ? current.dateLabel : null,
      repo: config.githubRepo,
      releasesUrl: `https://github.com/${config.githubRepo}/releases`,
      changelog
    };
  }

  async checkOnlineUpdate() {
    const info = this.getVersionInfo();
    const checkedAt = new Date().toISOString();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`https://api.github.com/repos/${config.githubRepo}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'CWU-App' },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (resp.status === 404) {
        return { ...info, checkedAt, status: 'no-release', updateAvailable: false, message: `Nenhuma versão publicada ainda em github.com/${config.githubRepo}.` };
      }
      if (!resp.ok) throw new Error(`GitHub respondeu ${resp.status}`);

      const release = await resp.json();
      const latest = String(release.tag_name || '').replace(/^v/i, '');
      const updateAvailable = compareVersions(latest, info.currentVersion) > 0;
      return {
        ...info,
        checkedAt,
        status: updateAvailable ? 'update-available' : 'up-to-date',
        latestVersion: latest,
        updateAvailable,
        downloadUrl: release.html_url || info.releasesUrl,
        releaseName: release.name || `v${latest}`,
        releaseDate: release.published_at ? new Date(release.published_at).toLocaleDateString('pt-BR') : null,
        releaseNotes: String(release.body || '').slice(0, 4000),
        message: updateAvailable
          ? `Nova versão ${latest} disponível.`
          : `Você está na versão mais recente (v${info.currentVersion}).`
      };
    } catch (err) {
      return { ...info, checkedAt, status: 'offline', updateAvailable: false, message: 'Não foi possível verificar: sem internet ou GitHub indisponível.' };
    }
  }
}

module.exports = new VersionService();
module.exports.compareVersions = compareVersions;
module.exports.parseChangelog = parseChangelog;
