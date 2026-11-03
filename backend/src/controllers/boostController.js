// backend/src/controllers/boostController.js
const boostService = require('../services/boostService');

// Somente ações conhecidas podem ser executadas pela API
const ALLOWED_ACTIONS = new Set([
  'purge_standby', 'ram_clean', 'full_boost', 'temp_cleanup',
  'power_plan', 'power_balanced',
  'nvidia_ultra', 'amd_antilag',
  'telemetry_services', 'telemetry_restore',
  'open_temp_folder', 'open_taskmgr', 'open_power_settings',
  'open_telemetry_settings', 'open_nvidia_settings', 'open_amd_settings'
]);

class BoostController {
  async getStatus(req, res) {
    try {
      const data = await boostService.getBoostStatus();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async runOptimization(req, res) {
    try {
      const { actionId } = req.body || {};
      if (!ALLOWED_ACTIONS.has(actionId)) {
        return res.status(400).json({ success: false, error: 'Ação de otimização desconhecida' });
      }
      const data = await boostService.runBoostOptimization(actionId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new BoostController();
