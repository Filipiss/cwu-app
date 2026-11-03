// backend/src/routes/api.js
const specsController = require('../controllers/specsController');
const driverController = require('../controllers/driverController');
const logsController = require('../controllers/logsController');
const boostController = require('../controllers/boostController');
const settingsController = require('../controllers/settingsController');
const versionController = require('../controllers/versionController');
const wingetController = require('../controllers/wingetController');
const restorePointService = require('../services/restorePointService');
const reportService = require('../services/reportService');

/**
 * Tabela de rotas da API
 */
const routes = [
  // System Specs
  { method: 'GET', path: '/api/specs', handler: (req, res) => specsController.getSpecs(req, res) },

  // Driver Scanner & Catalogs
  { method: 'GET', path: '/api/drivers/scan', handler: (req, res) => driverController.scan(req, res) },
  { method: 'GET', path: '/api/drivers/outdated', handler: (req, res) => driverController.getOutdated(req, res) },
  { method: 'GET', path: '/api/software/essential', handler: (req, res) => driverController.getEssentialSoftwares(req, res) },

  // Logs & Histórico de Atualizações
  { method: 'GET', path: '/api/logs', handler: (req, res) => logsController.getLogs(req, res) },
  { method: 'GET', path: '/api/logs/updates', handler: (req, res) => logsController.getUpdateLogs(req, res) },
  { method: 'POST', path: '/api/logs/revert', handler: (req, res) => logsController.revertUpdate(req, res) },
  { method: 'POST', path: '/api/logs/record', handler: (req, res) => logsController.recordUpdate(req, res) },
  { method: 'POST', path: '/api/logs/clear', handler: (req, res) => logsController.clearUpdateLogs(req, res) },

  // Boost Gamer Demo
  { method: 'GET', path: '/api/boost/status', handler: (req, res) => boostController.getStatus(req, res) },
  { method: 'POST', path: '/api/boost/optimize', handler: (req, res) => boostController.runOptimization(req, res) },

  // Settings & History
  { method: 'GET', path: '/api/settings', handler: (req, res) => settingsController.getSettings(req, res) },
  { method: 'POST', path: '/api/settings', handler: (req, res) => settingsController.updateSettings(req, res) },
  { method: 'GET', path: '/api/history', handler: (req, res) => settingsController.getScanHistory(req, res) },

  // Instalação em lote (winget)
  { method: 'GET', path: '/api/winget/status', handler: wingetController.status },
  { method: 'POST', path: '/api/winget/install', handler: wingetController.install },
  { method: 'GET', path: '/api/winget/job', handler: wingetController.job },
  { method: 'POST', path: '/api/winget/cancel', handler: wingetController.cancel },

  // Ponto de restauração manual
  { method: 'POST', path: '/api/system/restore-point', handler: async (req, res) => res.json({ success: true, data: await restorePointService.create('ponto manual') }) },

  // Relatório HTML para download
  { method: 'GET', path: '/api/report', handler: async (req, res) => {
    const html = await reportService.buildHtml();
    const stamp = new Date().toISOString().slice(0, 10);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="relatorio-cwu-${stamp}.html"`
    });
    res.end(html);
  } },

  // Versioning
  { method: 'GET', path: '/api/version', handler: (req, res) => versionController.getInfo(req, res) },
  { method: 'GET', path: '/api/version/check', handler: (req, res) => versionController.checkUpdate(req, res) }
];

module.exports = routes;
