const express = require('express');
const router = express.Router();
const ReportSnapshot = require('../models/ReportSnapshot');

function verifyBridgeKey(req, res, next) {
  const key = req.headers['x-bridge-key'];
  if (key !== process.env.BRIDGE_API_KEY) {
    return res.status(403).json({ error: 'Invalid bridge key' });
  }
  next();
}

// POST /api/bridge/report - Bridge pushes POS report data to MongoDB
router.post('/report', verifyBridgeKey, async (req, res) => {
  const { type, data, snapshotDate } = req.body;
  if (!type || data === undefined) {
    return res.status(400).json({ error: 'type and data required' });
  }
  try {
    const date = snapshotDate || new Date().toISOString().split('T')[0];
    await ReportSnapshot.findOneAndUpdate(
      { type, snapshotDate: date },
      { data, createdAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, type, date });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
