// backend/src/controllers/driverController.js
const driverService = require('../services/driverService');
const db = require('../database/db');

class DriverController {
  async scan(req, res) {
    try {
      const data = await driverService.scanDrivers();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getOutdated(req, res) {
    try {
      const data = await driverService.getOutdatedDrivers();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  async getEssentialSoftwares(req, res) {
    try {
      const data = db.getEssentialSoftwares();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new DriverController();
