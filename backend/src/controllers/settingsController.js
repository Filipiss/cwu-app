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
      // Aceita apenas pares chave/valor simples (evita gravar objetos arbitrários no banco local)
      const input = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body : {};
      const newSettings = {};
      for (const [key, value] of Object.entries(input).slice(0, 40)) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
        if (['string', 'boolean', 'number'].includes(typeof value)) {
          newSettings[key] = typeof value === 'string' ? value.slice(0, 200) : value;
        }
      }
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
