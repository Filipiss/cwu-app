// backend/src/config/index.js
const path = require('path');

module.exports = {
  port: process.env.PORT || 4321,
  appName: 'CWU App',
  // Versão lida do package.json (fonte única da verdade)
  appVersion: require('../../package.json').version,
  // Repositório GitHub usado para checar novas versões (owner/repo)
  githubRepo: process.env.CWU_GITHUB_REPO || 'Filipiss/cwu-app',
  isWindows: process.platform === 'win32',
  dbPath: path.resolve(__dirname, '../../data/cwu_local.db'),
  defaultTheme: 'futuristic',
  defaultLanguage: 'pt-BR'
};
