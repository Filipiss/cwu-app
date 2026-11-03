// backend/src/config/index.js
const path = require('path');

module.exports = {
  port: process.env.PORT || 4321,
  appName: 'CWU App',
  appVersion: '1.0.0',
  isWindows: process.platform === 'win32',
  dbPath: path.resolve(__dirname, '../../data/cwu_local.db'),
  updateFeedUrl: 'https://api.github.com/repos/cwu-app/cwu-app/releases/latest',
  defaultTheme: 'futuristic',
  defaultLanguage: 'pt-BR'
};
