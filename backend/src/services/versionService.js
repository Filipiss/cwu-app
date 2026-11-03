// backend/src/services/versionService.js
const config = require('../config');

class VersionService {
  getVersionInfo() {
    return {
      appName: config.appName,
      currentVersion: config.appVersion,
      channel: 'Stable',
      releaseDate: '19/10/2026',
      latestVersion: '1.0.0',
      isLatest: true,
      downloadUrl: 'https://github.com/cwu-app/cwu-app/releases',
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
    // Retorna status atualizado
    const info = this.getVersionInfo();
    return {
      ...info,
      checkedAt: new Date().toISOString(),
      updateAvailable: false,
      message: 'Você já está utilizando a versão mais recente do CWU App!'
    };
  }
}

module.exports = new VersionService();
