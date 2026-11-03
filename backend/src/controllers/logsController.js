// backend/src/controllers/logsController.js
const logsService = require('../services/logsService');

class LogsController {
  async getLogs(req, res) {
    try {
      const data = await logsService.getSystemErrorLogs();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getUpdateLogs(req, res) {
    try {
      const data = logsService.getUpdateLogs();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async revertUpdate(req, res) {
    try {
      const { id } = req.body || {};
      const result = await logsService.revertUpdate(id);
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async recordUpdate(req, res) {
    try {
      const result = logsService.recordUpdate(req.body || {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async clearUpdateLogs(req, res) {
    try {
      const result = logsService.clearUpdateLogs();
      res.json(result);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new LogsController();
