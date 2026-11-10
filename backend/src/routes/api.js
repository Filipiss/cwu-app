// backend/src/routes/api.js
const specsController = require('../controllers/specsController');
const diskHealthService = require('../services/diskHealthService');
const driverController = require('../controllers/driverController');
const logsController = require('../controllers/logsController');
const boostController = require('../controllers/boostController');
const settingsController = require('../controllers/settingsController');
const versionController = require('../controllers/versionController');
const wingetController = require('../controllers/wingetController');
const restorePointService = require('../services/restorePointService');
const reportService = require('../services/reportService');
const processService = require('../services/processService');
const monitorService = require('../services/monitorService');
const startupService = require('../services/startupService');
const tweaksService = require('../services/tweaksService');
const securityService = require('../services/securityService');
const competitiveService = require('../services/competitiveService');
const elevationService = require('../services/elevationService');

/**
 * Tabela de rotas da API
 */
const routes = [
  // System Specs
  { method: 'GET', path: '/api/specs', handler: (req, res) => specsController.getSpecs(req, res) },
  { method: 'GET', path: '/api/specs/disks', handler: async (req, res) => res.json({ success: true, data: await diskHealthService.getDiskHealth() }) },

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
  { method: 'POST', path: '/api/system/restore-point', handler: async (req, res) => res.json({ success: true, data: await restorePointService.create('CWU App') }) },

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

  // Prioridade de processos
  { method: 'GET', path: '/api/processes', handler: async (req, res) => res.json({ success: true, data: await processService.list() }) },
  { method: 'POST', path: '/api/processes/priority', handler: async (req, res) => res.json({ success: true, data: await processService.setPriority(req.body || {}) }) },
  { method: 'POST', path: '/api/processes/priority/remove', handler: async (req, res) => res.json({ success: true, data: await processService.removePersistent((req.body || {}).exe) }) },

  // Performance: monitor, inicialização, ajustes do Windows e diagnóstico de RAM
  // Sobreposição: o Electron escuta este evento e mostra/esconde a janela (mesmo que Alt+I)
  // A sobreposição informa o próprio tamanho (depende de layout, escala e linhas) e pede para salvar a posição livre
  { method: 'POST', path: '/api/overlay/size', handler: (req, res) => {
    const w = Number(req.body && req.body.width); const h = Number(req.body && req.body.height);
    if (w > 0 && w < 4000 && h > 0 && h < 4000) require('../database/db').events.emit('overlay-size', { width: w, height: h });
    res.json({ success: true });
  } },
  { method: 'POST', path: '/api/overlay/edit', handler: (req, res) => { require('../database/db').events.emit('overlay-edit'); res.json({ success: true }); } },
  { method: 'POST', path: '/api/overlay/save-position', handler: (req, res) => { require('../database/db').events.emit('overlay-save-position'); res.json({ success: true }); } },
  { method: 'POST', path: '/api/overlay/cancel-edit', handler: (req, res) => { require('../database/db').events.emit('overlay-cancel-edit'); res.json({ success: true }); } },
  { method: 'POST', path: '/api/overlay/toggle', handler: (req, res) => { require('../database/db').events.emit('overlay-toggle'); res.json({ success: true }); } },
  { method: 'GET', path: '/api/fps', handler: async (req, res) => res.json({ success: true, data: await require('../services/fpsService').snapshot() }) },
  { method: 'GET', path: '/api/monitor', handler: (req, res) => res.json({ success: true, data: monitorService.snapshot() }) },
  { method: 'GET', path: '/api/startup', handler: async (req, res) => res.json({ success: true, data: await startupService.list() }) },
  { method: 'POST', path: '/api/startup/toggle', handler: async (req, res) => res.json({ success: true, data: await startupService.toggle(req.body || {}) }) },
  { method: 'GET', path: '/api/tweaks', handler: async (req, res) => res.json({ success: true, data: await tweaksService.getStatus() }) },
  { method: 'POST', path: '/api/tweaks/set', handler: async (req, res) => res.json({ success: true, data: await tweaksService.set(req.body || {}) }) },
  { method: 'GET', path: '/api/ram-diagnostic', handler: async (req, res) => res.json({ success: true, data: await tweaksService.ramDiagnostic() }) },

  // Segurança: triagem de processos suspeitos
  { method: 'GET', path: '/api/security/scan', handler: async (req, res) => res.json({ success: true, data: await securityService.scanProcesses() }) },

  // Competitivo: latência, mira e conexão
  { method: 'GET', path: '/api/competitive', handler: async (req, res) => res.json({ success: true, data: await competitiveService.getStatus() }) },
  { method: 'GET', path: '/api/competitive/network', handler: async (req, res) => res.json({ success: true, data: await competitiveService.networkTest() }) },
  { method: 'POST', path: '/api/competitive/display', handler: async (req, res) => res.json({ success: true, data: await competitiveService.setRefreshRate(req.body || {}) }) },
  { method: 'POST', path: '/api/competitive/mouse-accel', handler: async (req, res) => res.json({ success: true, data: await competitiveService.setMouseAcceleration(req.body || {}) }) },
  { method: 'POST', path: '/api/competitive/mouse-speed', handler: async (req, res) => res.json({ success: true, data: await competitiveService.setMouseSpeed(req.body || {}) }) },
  { method: 'POST', path: '/api/competitive/gamebar', handler: async (req, res) => res.json({ success: true, data: await competitiveService.setGameBarOverlay(req.body || {}) }) },
  { method: 'POST', path: '/api/competitive/ultimate', handler: async (req, res) => res.json({ success: true, data: await competitiveService.setUltimatePlan(req.body || {}) }) },
  { method: 'POST', path: '/api/competitive/usb-suspend', handler: async (req, res) => res.json({ success: true, data: await competitiveService.setUsbSelectiveSuspend(req.body || {}) }) },
  { method: 'POST', path: '/api/competitive/adapter', handler: async (req, res) => res.json({ success: true, data: await competitiveService.setAdapterPowerSaving(req.body || {}) }) },

  // Permissão de administrador
  { method: 'GET', path: '/api/system/elevation', handler: async (req, res) => res.json({ success: true, data: await elevationService.status() }) },
  { method: 'POST', path: '/api/system/relaunch-admin', handler: async (req, res) => res.json({ success: true, data: await elevationService.relaunchAsAdmin() }) },

  // Versioning
  { method: 'GET', path: '/api/version', handler: (req, res) => versionController.getInfo(req, res) },
  { method: 'GET', path: '/api/version/check', handler: (req, res) => versionController.checkUpdate(req, res) }
];

module.exports = routes;
