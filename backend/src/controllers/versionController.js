// backend/src/controllers/versionController.js
const versionService = require('../services/versionService');

class VersionController {
  getInfo(req, res) {
    try {
      const data = versionService.getVersionInfo();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async checkUpdate(req, res) {
    try {
      const data = await versionService.checkOnlineUpdate();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new VersionController();
