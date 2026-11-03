// backend/src/services/versionService.js
const config = require('../config');

class VersionService {
  getVersionInfo() {
    return {
      appName: config.appName,
      currentVersion: config.appVersion,
      channel: 'Stable',
      releaseDate: '19/10/2026',
      latestVersion: null,
      isLatest: null,
      downloadUrl: `https://github.com/${config.githubRepo}/releases`,
      changelog: [
        {
          version: '1.0.0',
          date: '19/10/2026',
          highlights: [
            'Lançamento inicial do CWU App',
            'Motor de diagnóstico System Specs com pontuação 0 a 10 e nota geral do PC',
            'Varredura inteligente de drivers PnP com identificação de drivers genéricos da Microsoft',
            'Atalhos diretos para páginas oficiais de download (NVIDIA, AMD, Intel, Realtek)',
            'Analisador preditivo do Visualizador de Eventos com explicação humanizada de BSODs e Kernel-Power (Event ID 41)',
            'Aba demonstrativa Boost Gamer com liberação de RAM e otimizações',
            'Suporte a múltiplos temas: Futurista (Cyberpunk Neon), Clássico e Clean Light',
            'Banco de dados 100% local e sem necessidade de conexão externa'
          ]
        }
      ]
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
        return { ...info, checkedAt, updateAvailable: false, checkFailed: true, message: 'Nenhuma versão publicada no GitHub ainda.' };
      }
      if (!resp.ok) throw new Error(`GitHub respondeu ${resp.status}`);

      const release = await resp.json();
      const latest = String(release.tag_name || '').replace(/^v/i, '');
      const updateAvailable = compareVersions(latest, info.currentVersion) > 0;
      return {
        ...info,
        checkedAt,
        latestVersion: latest,
        isLatest: !updateAvailable,
        updateAvailable,
        downloadUrl: release.html_url || info.downloadUrl,
        releaseNotes: release.body || '',
        message: updateAvailable
          ? `Nova versão ${latest} disponível!`
          : 'Você já está utilizando a versão mais recente do CWU App!'
      };
    } catch (err) {
      return {
        ...info,
        checkedAt,
        updateAvailable: false,
        checkFailed: true,
        message: 'Não foi possível verificar atualizações (sem internet ou GitHub indisponível).'
      };
    }
  }
}

// Compara versões semânticas simples: "1.2.0" vs "1.10.0"
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

module.exports = new VersionService();
module.exports.compareVersions = compareVersions;
