// ===== مسار الجسر (Bridge) - مزامنة البيانات بين السيرفر ونظام نقاط البيع المحلي (POS) =====
const express = require('express');
const router = express.Router();
const ReportSnapshot = require('../models/ReportSnapshot');
const SyncEvent = require('../models/SyncEvent');
const Order = require('../models/Order');
const crypto = require('crypto');
const retryQueue = require('../retry-queue');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const { v4: uuidv4 } = require('uuid');

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
  res.json({ success: true, ...await retryQueue.getStatus() });
});

// جلب تقارير الكاشير المحلي من خادم Node/SQLite
router.get('/cashier-report', authenticateToken, requireRole('admin'), async (req, res) => {
  const CASHIER_API_URL = process.env.CASHIER_API_URL;
  const CASHIER_API_KEY = process.env.CASHIER_API_KEY;
  if (!CASHIER_API_URL || !CASHIER_API_KEY) {
    return res.json({ success: false, error: 'cashier_api_not_configured', offline: true });
  }
  try {
    const resp = await fetch(`${CASHIER_API_URL}/api/reports/summary`, {
      method: 'GET',
      headers: { 'x-bridge-key': CASHIER_API_KEY },
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return res.json({ success: false, error: `http_${resp.status}`, details: txt.slice(0, 200), offline: true });
    }
    const data = await resp.json();
    const totals = data.totals || {};
    const today = data.today || {};
    const mapped = {
      todaysSales: today.revenue || 0,
      monthlySales: totals.revenue || 0,
      activeShifts: 1,
      openOrders: 0,
      lowStockCount: data.lowStock || 0,
      totalExpenses: 0,
      netProfit: (totals.revenue || 0) - (totals.discounts || 0),
      salesChartData: [],
      bestSellingProducts: []
    };
    res.json({ success: true, data: mapped, offline: false });
  } catch (e) {
    res.json({ success: false, error: e.message, offline: true });
  }
});

// ── نقاط الاتصال الجديدة لربط تطبيق الكاشير المكتبي بالسايت ──

// 1. جلب العملاء السحابيين من MongoDB
router.get('/customers', verifyBridgeKey, async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' }).sort({ createdAt: -1 });
    const serialized = customers.map(u => ({
      id: u._id,
      name: u.name,
      phone: u.phone && u.phone.startsWith('email_') ? '' : (u.phone || ''),
      email: u.email,
      role: u.role,
      points: u.points,
      total_spent: parseFloat(u.total_spent || 0),
      date_joined: u.createdAt ? u.createdAt.toISOString() : new Date().toISOString(),
      customerStatus: u.customerStatus || 'standard'
    }));
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. تعديل بيانات عميل سحابي أو إعادة تعيين كلمة مرور
router.patch('/customers/:id', verifyBridgeKey, async (req, res) => {
  const { name, phone, email, points, customerStatus, password } = req.body;
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });

    if (name !== undefined) u.name = name;
    if (phone !== undefined) u.phone = phone;
    if (email !== undefined) u.email = email;
    if (points !== undefined) u.points = parseInt(points);
    if (customerStatus !== undefined) u.customerStatus = customerStatus;
    if (password) {
      u.password = await bcrypt.hash(password, 10);
    }

    await u.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. جلب المشروبات السحابية من MongoDB
router.get('/drinks', verifyBridgeKey, async (req, res) => {
  try {
    const drinks = await Drink.find().populate('category_id');
    const serialized = drinks.map(d => ({
      id: d._id,
      category_id: d.category_id ? d.category_id._id : null,
      category_name: d.category_id ? d.category_id.name : '',
      name: d.name,
      name_ar: d.name_ar,
      price: parseFloat(d.price || 0),
      is_available: d.is_available,
      menuItemIdInCashier: d.menuItemIdInCashier
    }));
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. تعديل أسعار المشروبات السحابية أو إتاحتها
router.patch('/drinks/:id', verifyBridgeKey, async (req, res) => {
  const { price, is_available } = req.body;
  try {
    const d = await Drink.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Drink not found' });

    if (price !== undefined) d.price = parseFloat(price);
    if (is_available !== undefined) d.is_available = Number(is_available);

    await d.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. جلب الطلبات أونلاين المعلقة التي تنتظر تأكيد الكاشير
router.get('/orders/online-pending', verifyBridgeKey, async (req, res) => {
  try {
    const orders = await Order.find({ 
      status: 'pending'
    }).populate('userId');
    
    const serialized = orders.map(o => {
      let customerStatus = 'standard';
      let discountPercent = 0;
      if (o.userId) {
        customerStatus = o.userId.customerStatus || 'standard';
        if (customerStatus === 'gold') discountPercent = 10;
        else if (customerStatus === 'student') discountPercent = 15;
        else if (customerStatus === 'ozel_family') discountPercent = 20;
      }
      return {
        id: o._id,
        table_number: o.table_number,
        items: o.items,
        total_price: o.total_price,
        notes: o.notes,
        customerPhone: o.customerPhone,
        customerName: o.userId ? o.userId.name : (o.customerPhone ? 'عميل أونلاين' : 'زائر'),
        customerStatus,
        discountPercent,
        createdAt: o.createdAt
      };
    });
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. جلب أكثر 3 أصناف يطلبها العميل بالترتيب مع التكرار
router.get('/customers/:phone/top-items', verifyBridgeKey, async (req, res) => {
  const { phone } = req.params;
  try {
    const user = await User.findOne({ phone });
    const matchQuery = {
      $or: [
        { customerPhone: phone },
        ...(user ? [{ userId: user._id }] : [])
      ],
      status: { $ne: 'cancelled' }
    };
    const topItems = await Order.aggregate([
      { $match: matchQuery },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', count: { $sum: '$items.quantity' } } },
      { $sort: { count: -1 } },
      { $limit: 3 }
    ]);
    res.json(topItems.map(item => ({ name: item._id, count: item.count })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. استقبال الفاتورة المحلية للمزامنة وتحديث نقاط العميل سحابياً
router.post('/sync-invoice', verifyBridgeKey, async (req, res) => {
  const { invoice_number, customer_phone, customer_name, total, items, created_at, payment_method, status } = req.body;
  console.log('[Bridge] Sync invoice request received:', invoice_number);
  try {
    // التحقق من تكرار حفظ هذه الفاتورة
    const existingOrder = await Order.findOne({ 'syncMeta.lastEventId': invoice_number });
    if (existingOrder) {
      console.log('[Bridge] Invoice already synced:', invoice_number);
      return res.status(409).json({ error: 'Invoice already synced' });
    }

    let user = null;
    let pointsEarned = 0;

    if (customer_phone) {
      user = await User.findOne({ phone: customer_phone });
      if (user) {
        // احتساب نقاط الولاء (كل 10 جنيهات تعادل 1 نقطة)
        pointsEarned = Math.floor(total / 10);
        user.points = (user.points || 0) + pointsEarned;
        user.total_spent = (user.total_spent || 0) + total;
        await user.save();

        // تسجيل لوج النقاط
        const PointsLog = require('../models/PointsLog');
        await PointsLog.create({
          userId: user._id,
          points: pointsEarned,
          type: 'earn',
          notes: `نقاط مكتسبة من فاتورة الكاشير المزامنة #${invoice_number}`
        });
      }
    }

    // حفظ الفاتورة كـ Order في MongoDB
    await Order.create({
      userId: user ? user._id : null,
      table_number: 'سفري/محلي',
      items: items.map(i => ({
        name: i.product_name,
        quantity: i.quantity,
        price: i.price,
        sugar: 'Normal',
        extras: []
      })),
      total_price: total,
      points_earned: pointsEarned,
      status: status || 'paid',
      notes: `تمت المزامنة من الكاشير محلياً. طريقة الدفع: ${payment_method || 'cash'}`,
      customerPhone: customer_phone || null,
      posSynced: true,
      qrCodeToken: `pos-sync-${invoice_number}-${uuidv4()}`,
      paymentMethod: paymentMethodMap(payment_method),
      syncMeta: {
        lastEventId: invoice_number,
        lastEventType: 'invoice.sync',
        lastSyncedAt: new Date(),
        syncStatus: 'acked'
      }
    });

    res.json({ success: true, points_earned: pointsEarned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// دالة مساعدة لربط طرق الدفع
function paymentMethodMap(method) {
  if (method === 'card') return 'card';
  if (method === 'wallet') return 'wallet';
  return 'cash';
}

// 8. تحديث حالة طلب سحابي من الكاشير المحلي (قبول أو إلغاء الأوردر)
router.patch('/orders/:id/status', verifyBridgeKey, async (req, res) => {
  const { status } = req.body || {};
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.status = status;
    if (status === 'confirmed') {
      order.isQrConfirmed = true;
    }
    order.orderVersion = (order.orderVersion || 1) + 1;
    await order.save();
    
    // إقرار حدث المزامنة المرتبط بالطلب في المونجو دي بي
    const SyncEvent = require('../models/SyncEvent');
    await SyncEvent.updateMany(
      { orderId: order._id },
      { $set: { status: 'acked', acknowledgedAt: new Date(), failureReason: null } }
    );
    
    res.json({ success: true, orderId: String(order._id), status: order.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
