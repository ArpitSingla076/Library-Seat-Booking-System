const express = require('express');
const { protect } = require('../middleware/auth');
const { getSettings, publicSettings } = require('../services/settingsService');

const router = express.Router();

// GET /api/settings - rules the UI needs (limits, fines, QR requirement)
router.get('/', protect, async (_req, res, next) => {
  try {
    res.json({ success: true, settings: publicSettings(await getSettings()) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
