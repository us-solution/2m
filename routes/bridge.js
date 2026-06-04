// ===== مسار الجسر (Bridge) - مزامنة البيانات بين السيرفر ونظام نقاط البيع المحلي (POS) =====
const express = require('express');
const router = express.Router();
const ReportSnapshot = require('../models/ReportSnapshot');
const SyncEvent = require('../models/SyncEvent');
const Order = require('../models/Order');
const crypto = require('crypto');
const retryQueue = require('../retry-queue');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// التحقق من مفتاح API للجسر
function verifyBridgeKey(req, res, next) {
  const key = req.headers['x-bridge-key'];
  if (key !== process.env.BRIDGE_API_KEY) {
    return res.status(403).json({ error: 'Invalid bridge key' });
  }
  next();
}

// التحقق من التوقيع الرقمي للجسر (HMAC-SHA256)
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
  // التحقق من عدم انتهاء صلاحية الطلب (أكثر من 5 دقائق)
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

// استقبال بيانات التقرير من نظام نقاط البيع وحفظها في MongoDB
router.post('/report', verifyBridgeKey, async (req, res) => {
  const { type, data, snapshotDate } = req.body;
  if (!type || data === undefined) {
    return res.status(400).json({ error: 'type and data required' });
  }
  try {
    // حفظ أو تحديث التقرير حسب التاريخ والنوع
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

// استقبال إقرار (ACK) من الجسر بعد معالجة حدث المزامنة
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

    // تحديث حالة المزامنة للطلب المرتبط
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

// استقبال تحديث حالة الطلب من نظام نقاط البيع (مع التوقيع الرقمي)
router.post('/inbound-status', verifyBridgeKey, verifyBridgeSignature, async (req, res) => {
  const { meta, data } = req.body || {};
  if (!meta?.eventId || !meta?.orderId || !data?.status) {
    return res.status(400).json({ error: 'meta.eventId, meta.orderId and data.status are required' });
  }
  try {
    const order = await Order.findById(meta.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    // التحقق من عدم وجود تعارض في الإصدار
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

    // تسجيل حدث المزامنة
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

// السماح بالدخول للأدمن أو الجسر (أحدهما يكفي)
async function authAdminOrBridge(req, res, next) {
  const bridgeKey = req.headers['x-bridge-key'];
  if (bridgeKey && bridgeKey === process.env.BRIDGE_API_KEY) return next();
  authenticateToken(req, res, () => {
    if (!req.user) return res.status(403).json({ error: 'Unauthorized' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

// جلب حالة المزامنة (الأحداث المعلقة والفاشلة والناجحة)
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

// جلب حالة طابور إعادة المحاولة (الأوردرات المعلقة)
router.get('/retry-queue', authenticateToken, requireRole('admin'), async (req, res) => {
  res.json({ success: true, ...retryQueue.getStatus() });
});

// جلب تقارير الكاشير المحلي من .NET API
router.get('/cashier-report', authenticateToken, requireRole('admin'), async (req, res) => {
  const CASHIER_API_URL = process.env.CASHIER_API_URL;
  const CASHIER_API_KEY = process.env.CASHIER_API_KEY;
  if (!CASHIER_API_URL || !CASHIER_API_KEY) {
    return res.json({ success: false, error: 'cashier_api_not_configured', offline: true });
  }
  try {
    const resp = await fetch(`${CASHIER_API_URL}/api/reports`, {
      method: 'GET',
      headers: { 'X-API-KEY': CASHIER_API_KEY },
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return res.json({ success: false, error: `http_${resp.status}`, details: txt.slice(0, 200), offline: true });
    }
    const data = await resp.json();
    res.json({ success: true, data, offline: false });
  } catch (e) {
    res.json({ success: false, error: e.message, offline: true });
  }
});

module.exports = router;
