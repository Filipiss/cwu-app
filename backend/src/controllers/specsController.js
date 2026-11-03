// backend/src/controllers/specsController.js
const specsService = require('../services/specsService');

class SpecsController {
  async getSpecs(req, res) {
    try {
      const data = await specsService.getSystemSpecs();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new SpecsController();
