const express = require('express');
const router = express.Router();
const ReportSnapshot = require('../models/ReportSnapshot');
const SyncEvent = require('../models/SyncEvent');
const Order = require('../models/Order');
const crypto = require('crypto');
const { authenticateToken, requireRole } = require('../middlewares/auth');

function verifyBridgeKey(req, res, next) {
  const key = req.headers['x-bridge-key'];
  if (key !== process.env.BRIDGE_API_KEY) {
    return res.status(403).json({ error: 'Invalid bridge key' });
  }
  next();
}

function verifyBridgeSignature(req, res, next) {
  const secret = process.env.BRIDGE_SIGNATURE_SECRET || process.env.BRIDGE_API_KEY;
  if (!secret) return next();

  const eventId = req.headers['x-bridge-event-id'];
  const timestamp = req.headers['x-bridge-timestamp'];
  const signature = req.headers['x-bridge-signature'];
  if (!eventId || !timestamp || !signature) {
    return res.status(400).json({ error: 'Missing bridge signature headers' });
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
    return res.status(400).json({ error: 'Stale bridge request timestamp' });
  }
  const rawBody = JSON.stringify(req.body || {});
  const payload = `${timestamp}.${eventId}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Invalid bridge signature' });
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

router.post('/ack', verifyBridgeKey, async (req, res) => {
  const { eventId, status, reason } = req.body || {};
  if (!eventId) return res.status(400).json({ error: 'eventId required' });
  try {
    const event = await SyncEvent.findOne({ eventId });
    if (!event) return res.status(404).json({ error: 'Sync event not found' });
    event.status = status === 'failed' ? 'failed' : 'acked';
    event.acknowledgedAt = new Date();
    event.failureReason = status === 'failed' ? (reason || 'bridge_failed') : null;
    await event.save();

    if (event.orderId) {
      await Order.updateOne(
        { _id: event.orderId },
        {
          $set: {
            'syncMeta.syncStatus': event.status,
            'syncMeta.lastSyncedAt': event.status === 'acked' ? new Date() : null,
            'syncMeta.lastError': event.failureReason
          }
        }
      );
    }
    res.json({ success: true, eventId, status: event.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/inbound-status', verifyBridgeKey, verifyBridgeSignature, async (req, res) => {
  const { meta, data } = req.body || {};
  if (!meta?.eventId || !meta?.orderId || !data?.status) {
    return res.status(400).json({ error: 'meta.eventId, meta.orderId and data.status are required' });
  }
  try {
    const order = await Order.findById(meta.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if ((meta.orderVersion || 1) < (order.orderVersion || 1)) {
      return res.status(409).json({ error: 'Stale order version', currentVersion: order.orderVersion || 1 });
    }

    order.status = data.status;
    order.orderVersion = meta.orderVersion || order.orderVersion || 1;
    order.syncMeta = {
      ...(order.syncMeta || {}),
      lastEventId: meta.eventId,
      lastEventType: meta.eventType || 'order.status_changed',
      syncStatus: 'acked',
      lastSyncedAt: new Date(),
      lastError: null
    };
    await order.save();

    await SyncEvent.findOneAndUpdate(
      { eventId: meta.eventId },
      {
        eventId: meta.eventId,
        eventType: meta.eventType || 'order.status_changed',
        orderId: order._id,
        orderVersion: meta.orderVersion || 1,
        payload: req.body,
        status: 'acked',
        acknowledgedAt: new Date(),
        failureReason: null
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, orderId: String(order._id), status: order.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function authAdminOrBridge(req, res, next) {
  const bridgeKey = req.headers['x-bridge-key'];
  if (bridgeKey && bridgeKey === process.env.BRIDGE_API_KEY) return next();
  authenticateToken(req, res, () => {
    if (!req.user) return res.status(403).json({ error: 'Unauthorized' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

router.get('/status', authAdminOrBridge, async (req, res) => {
  try {
    const [pendingEvents, failedEvents, ackedEvents, pendingOrders, failedOrders, recentlySynced] = await Promise.all([
      SyncEvent.countDocuments({ status: 'pending' }),
      SyncEvent.countDocuments({ status: 'failed' }),
      SyncEvent.countDocuments({ status: 'acked' }),
      Order.countDocuments({ 'syncMeta.syncStatus': 'pending' }),
      Order.countDocuments({ 'syncMeta.syncStatus': 'failed' }),
      Order.findOne({ 'syncMeta.lastSyncedAt': { $ne: null } }).sort({ 'syncMeta.lastSyncedAt': -1 }).select('syncMeta.lastSyncedAt').lean()
    ]);
    res.json({
      success: true,
      events: { pending: pendingEvents, failed: failedEvents, acked: ackedEvents },
      orders: { pending: pendingOrders, failed: failedOrders },
      lastSuccessfulSyncAt: recentlySynced?.syncMeta?.lastSyncedAt || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
