// backend/src/controllers/wingetController.js
const wingetService = require('../services/wingetService');

const wrap = (fn) => async (req, res) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  status: wrap(() => wingetService.getStatus()),
  install: wrap((req) => wingetService.startInstall((req.body || {}).ids)),
  job: wrap(() => wingetService.publicJob()),
  cancel: wrap(() => wingetService.cancel())
};
