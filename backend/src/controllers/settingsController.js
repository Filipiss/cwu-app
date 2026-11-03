// backend/src/controllers/settingsController.js
const db = require('../database/db');

class SettingsController {
  getSettings(req, res) {
    try {
      const data = db.getSettings();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  updateSettings(req, res) {
    try {
      const newSettings = req.body || {};
      const updated = db.updateSettings(newSettings);
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  getScanHistory(req, res) {
    try {
      const data = db.getScanHistory();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new SettingsController();
