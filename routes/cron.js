const express = require('express');
const router = express.Router();
const retryQueue = require('../retry-queue');

// مناداة هذا المسار عبر Vercel Cron Job (vercel.json) أو يدوياً
// cron: */1 * * * *  (كل دقيقة)
router.get('/retry', async (req, res) => {
  try {
    await retryQueue.processQueue();
    const status = await retryQueue.getStatus();
    res.json({ success: true, processed: true, pending: status.pending, dead: status.dead });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
