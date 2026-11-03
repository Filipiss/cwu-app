// backend/src/controllers/boostController.js
const boostService = require('../services/boostService');

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
      const data = await boostService.runBoostOptimization(actionId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new BoostController();
