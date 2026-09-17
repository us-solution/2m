// ===== مسار الجسر (Bridge) - مزامنة البيانات بين السيرفر ونظام نقاط البيع المحلي (POS) =====
const express = require('express');
const router = express.Router();
const ReportSnapshot = require('../models/ReportSnapshot');
const SyncEvent = require('../models/SyncEvent');
const Order = require('../models/Order');
const User = require('../models/User');
const Drink = require('../models/Drink');
const Category = require('../models/Category');
const SystemLicense = require('../models/SystemLicense');
const PosDevice = require('../models/PosDevice');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const retryQueue = require('../retry-queue');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const { v4: uuidv4 } = require('uuid');

const EXPECTED_BRIDGE_KEY = process.env.BRIDGE_API_KEY || 'ozel_cafe_bridge_secret_2026_xyz';

// التحقق من مفتاح API للجسر
function verifyBridgeKey(req, res, next) {
  const key = req.headers['x-bridge-key'];
  if (!key || key !== EXPECTED_BRIDGE_KEY) {
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

  const sigBuf = Buffer.from(signature, 'utf-8');
  const expBuf = Buffer.from(expected, 'utf-8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(403).json({ error: 'Invalid bridge signature' });
  }
  next();
}

// خريطة طرق الدفع لتحويل مسميات الكاشير إلى قيم الـ enum في Order model
function paymentMethodMap(method) {
  if (!method) return 'cash';
  const m = String(method).toLowerCase().trim();
  if (m === 'cash' || m === 'نقدي' || m === 'نقد') return 'cash';
  if (m === 'visa' || m === 'card' || m === 'بطاقة' || m === 'فيزا') return 'card';
  if (m === 'wallet' || m === 'محفظة' || m === 'vodafone' || m === 'instapay') return 'wallet';
  if (m === 'split' || m === 'مقسم') return 'split';
  return 'cash';
}

// إعادة ضبط وتصفير بيانات المزامنة (Reset and Rebind)
router.post('/reset-and-rebind', verifyBridgeKey, async (req, res) => {
  const { confirm, device_id, new_bridge_key } = req.body || {};
  if (!confirm) {
    return res.status(400).json({ error: 'Confirmation required (confirm: true)' });
  }

  try {
    console.log(`[Bridge] Reset & Rebind requested by device: ${device_id || 'unknown'}`);

    // 1. حذف جميع الطلبات التي تمت مزامنتها من الكاشير
    const deletedOrders = await Order.deleteMany({ posSynced: true });

    // 2. حذف أحداث المزامنة
    const deletedEvents = await SyncEvent.deleteMany({});

    // 3. حذف لقطات التقارير المزامنة
    const deletedReports = await ReportSnapshot.deleteMany({});

    // 4. تسجيل حدث إعادة الضبط
    const resetEventId = uuidv4();
    await SyncEvent.create({
      eventId: resetEventId,
      eventType: 'SYSTEM_RESET',
      payload: {
        resetAt: new Date().toISOString(),
        device_id: device_id || 'unknown',
        new_bridge_key_provided: Boolean(new_bridge_key),
        deletedOrdersCount: deletedOrders.deletedCount,
        deletedEventsCount: deletedEvents.deletedCount,
        deletedReportsCount: deletedReports.deletedCount
      },
      status: 'acked',
      acknowledgedAt: new Date()
    });

    console.log(`[Bridge] Reset complete: ${deletedOrders.deletedCount} orders, ${deletedEvents.deletedCount} events cleared.`);

    res.json({
      success: true,
      message: 'Server data cleared and ready for new sync',
      deletedOrders: deletedOrders.deletedCount,
      deletedEvents: deletedEvents.deletedCount,
      resetEventId
    });
  } catch (err) {
    console.error('[Bridge] reset-and-rebind error:', err);
    res.status(500).json({ error: err.message });
  }
});

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

// Synchronize local invoice to cloud — UNIFIED endpoint with Idempotency + Order creation + Loyalty Points
router.post('/invoices/sync', verifyBridgeKey, async (req, res) => {
  const { invoice_number, idempotency_key, total, payment_method, items, customer_phone, customer_name, customer_id, created_at, status } = req.body || {};

  // Require at least one deduplication key
  if (!idempotency_key && !invoice_number) {
    return res.status(400).json({ error: 'idempotency_key or invoice_number is required' });
  }

  try {
    // Dual idempotency check: check BOTH idempotency_key and invoice_number to prevent any duplicate
    if (idempotency_key) {
      const existingByKey = await SyncEvent.findOne({ 'payload.idempotency_key': idempotency_key });
      if (existingByKey) {
        return res.json({ success: true, message: 'Already synced (Idempotent — by key)', eventId: existingByKey.eventId });
      }
    }
    if (invoice_number) {
      const existingByInvoice = await SyncEvent.findOne({ 'payload.invoice_number': invoice_number });
      if (existingByInvoice) {
        return res.json({ success: true, message: 'Already synced (Idempotent — by invoice_number)', eventId: existingByInvoice.eventId });
      }
      // Also check Order collection as a safety net
      const existingOrder = await Order.findOne({ 'syncMeta.lastEventId': invoice_number });
      if (existingOrder) {
        return res.json({ success: true, message: 'Already synced (Order exists)', eventId: invoice_number });
      }
    }

    // -- Loyalty Points Calculation --
    let user = null;
    let pointsEarned = 0;
    const invoiceTotal = Number(total) || 0;

    if (customer_phone && customer_phone !== '0000000000') {
      user = await User.findOne({ phone: customer_phone });
      if (user && invoiceTotal > 0) {
        pointsEarned = Math.floor(invoiceTotal / 10);
        user.points = (user.points || 0) + pointsEarned;
        user.total_spent = (user.total_spent || 0) + invoiceTotal;
        await user.save();

        // Log points
        const PointsLog = require('../models/PointsLog');
        await PointsLog.create({
          userId: user._id,
          points: pointsEarned,
          type: 'earn',
          notes: `نقاط مكتسبة من فاتورة الكاشير المزامنة #${invoice_number || idempotency_key}`
        });
      }
    }

    // -- Create Order in MongoDB --
    const orderItems = Array.isArray(items) ? items.map(i => ({
      name: i.product_name || i.name || 'منتج',
      quantity: i.quantity || 1,
      price: i.price || 0,
      sugar: 'Normal',
      extras: []
    })) : [];

    const eventId = uuidv4();

    await Order.create({
      userId: user ? user._id : null,
      table_number: 'سفري/محلي',
      items: orderItems,
      total_price: invoiceTotal,
      points_earned: pointsEarned,
      status: status || 'paid',
      notes: `تمت المزامنة من الكاشير. طريقة الدفع: ${payment_method || 'cash'}`,
      customerPhone: customer_phone || null,
      posSynced: true,
      qrCodeToken: `pos-sync-${invoice_number || idempotency_key}-${eventId}`,
      paymentMethod: paymentMethodMap(payment_method),
      syncMeta: {
        lastEventId: invoice_number || idempotency_key,
        lastEventType: 'invoice.sync',
        lastSyncedAt: new Date(),
        syncStatus: 'acked'
      }
    });

    // -- Record SyncEvent --
    await SyncEvent.create({
      eventId,
      eventType: 'INVOICE_SYNCED',
      payload: req.body,
      status: 'acked',
      acknowledgedAt: new Date()
    });

    res.json({ success: true, message: 'Invoice synced successfully', eventId, points_earned: pointsEarned });
  } catch (err) {
    console.error('[Bridge] invoices/sync error:', err.message);
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
  if (bridgeKey && bridgeKey === EXPECTED_BRIDGE_KEY) return next();
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

// 1. جلب كافة العملاء والمستخدمين المسجلين من MongoDB للسيرفر المحلي للكاشير مع دعم التصفح (Pagination)
router.get('/customers', verifyBridgeKey, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || 0;

    const filter = {
      email: { $nin: ['admin@ozel.cafe', 'cashier@ozel.cafe'] },
      phone: { $nin: ['0000000000', '01000000000', '01000000001'] }
    };

    let query = User.find(filter).sort({ createdAt: -1 });
    if (page > 0 && limit > 0) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const customers = await query;

    const serialized = customers.map(u => {
      let resolvedPhone = u.phone && !u.phone.startsWith('email_') ? u.phone.trim() : '';
      let resolvedEmail = (u.email || '').trim();

      // معالجة الحالات التي يتم فيها إدخال رقم الهاتف في حقل البريد
      if (!resolvedPhone && resolvedEmail && /^\+?[0-9]{10,14}$/.test(resolvedEmail)) {
        resolvedPhone = resolvedEmail;
        resolvedEmail = '';
      }

      return {
        id: String(u._id),
        name: u.name || 'عميل مسجل',
        phone: resolvedPhone,
        email: resolvedEmail,
        role: u.role || 'customer',
        points: parseInt(u.points || 0),
        total_spent: parseFloat(u.total_spent || 0),
        address: u.address || '',
        notes: u.notes || '',
        date_joined: u.createdAt ? u.createdAt.toISOString() : new Date().toISOString(),
        customerStatus: u.customerStatus || 'standard'
      };
    });
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. تعديل بيانات عميل سحابي أو إعادة تعيين كلمة مرور
router.patch('/customers/:id', verifyBridgeKey, async (req, res) => {
  const { name, phone, email, points, customerStatus, password, address, notes } = req.body;
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });

    if (name !== undefined) u.name = name;
    if (phone !== undefined) u.phone = phone;
    if (email !== undefined) u.email = email;
    if (points !== undefined) u.points = parseInt(points);
    if (customerStatus !== undefined) u.customerStatus = customerStatus;
    if (address !== undefined) u.address = address;
    if (notes !== undefined) u.notes = notes;
    if (password) {
      u.password = await bcrypt.hash(password, 10);
    }

    await u.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2.2. جلب تفاصيل عميل سحابي واحد
router.get('/customers/:id', verifyBridgeKey, async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: u._id,
      name: u.name,
      phone: u.phone && u.phone.startsWith('email_') ? '' : (u.phone || ''),
      email: u.email,
      role: u.role,
      points: u.points,
      total_spent: parseFloat(u.total_spent || 0),
      address: u.address || '',
      notes: u.notes || '',
      date_joined: u.createdAt ? u.createdAt.toISOString() : new Date().toISOString(),
      customerStatus: u.customerStatus || 'standard'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.3. إنشاء عميل سحابي جديد من الكاشير
router.post('/customers', verifyBridgeKey, async (req, res) => {
  const { name, phone, email, points, customerStatus, password, address, notes } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  try {
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.json({ success: true, id: existingPhone._id, user: existingPhone, alreadyExists: true });
      }
    }
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.json({ success: true, id: existingEmail._id, user: existingEmail, alreadyExists: true });
      }
    }

    const pass = password || phone || '123456';
    const hashedPassword = await bcrypt.hash(pass, 10);
    const u = await User.create({
      name,
      phone: phone || `email_${Date.now()}`,
      email: email || null,
      password: hashedPassword,
      role: 'customer',
      points: parseInt(points || 0),
      subscriptionTier: 'none',
      customerStatus: customerStatus || 'standard',
      address: address || '',
      notes: notes || ''
    });

    res.json({ success: true, id: u._id, user: u });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2.4. حذف عميل سحابي
router.delete('/customers/:id', verifyBridgeKey, async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    await u.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── نقاط إدارة وربط أجهزة نقاط البيع (POS Devices: Master / Slave) ──

// 2.4.1. تسجيل جهاز كاشير أو إرسال نبض الحياة (Register / Heartbeat)
router.post('/devices/register', verifyBridgeKey, async (req, res) => {
  const { device_id, device_name, is_master, ip_address, local_port, version } = req.body || {};
  if (!device_id) {
    return res.status(400).json({ error: 'device_id is required' });
  }

  try {
    let device = await PosDevice.findOne({ deviceId: device_id });

    if (device) {
      device.lastSeen = new Date();
      device.status = 'online';
      if (ip_address) device.ipAddress = ip_address;
      if (local_port) device.localPort = Number(local_port);
      if (version) device.systemVersion = version;
      if (device_name && device.deviceName === 'جهاز كاشير') device.deviceName = device_name;
      if (typeof is_master === 'boolean' && !device.notes?.includes('LOCKED_ROLE')) {
        device.isMaster = is_master;
      }
      await device.save();
    } else {
      const count = await PosDevice.countDocuments();
      const shouldBeMaster = count === 0 ? true : Boolean(is_master);

      device = await PosDevice.create({
        deviceId: device_id,
        deviceName: device_name || `كاشير ${count + 1}`,
        isMaster: shouldBeMaster,
        ipAddress: ip_address || '',
        localPort: Number(local_port) || 5050,
        systemVersion: version || 'OZEL CAFE POS v2.1.0',
        status: 'online',
        lastSeen: new Date()
      });
    }

    res.json({
      success: true,
      device: {
        id: device._id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        isMaster: device.isMaster,
        role: device.isMaster ? 'master' : 'slave',
        status: device.status,
        lastSeen: device.lastSeen
      }
    });
  } catch (err) {
    console.error('[Bridge Devices Register Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2.4.2. جلب جميع أجهزة الكاشير المسجلة
router.get('/devices', verifyBridgeKey, async (req, res) => {
  try {
    const devices = await PosDevice.find().sort({ isMaster: -1, lastSeen: -1 });
    const now = Date.now();
    const threshold = 3 * 60 * 1000;

    const serialized = devices.map(d => ({
      id: d._id,
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      isMaster: Boolean(d.isMaster),
      role: d.isMaster ? 'master' : 'slave',
      ipAddress: d.ipAddress,
      localPort: d.localPort,
      systemVersion: d.systemVersion,
      status: (now - new Date(d.lastSeen).getTime() < threshold) ? 'online' : 'offline',
      lastSeen: d.lastSeen,
      notes: d.notes || ''
    }));

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.4.3. تحديث دور الجهاز (تعيين كجهاز رئيسي أو فرعي) أو اسمه
router.patch('/devices/:deviceId', verifyBridgeKey, async (req, res) => {
  const { deviceId } = req.params;
  const { is_master, isMaster, device_name, deviceName, notes } = req.body || {};

  try {
    const device = await PosDevice.findOne({ deviceId });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const newMasterVal = is_master !== undefined ? is_master : isMaster;
    if (newMasterVal !== undefined) {
      device.isMaster = Boolean(newMasterVal);
      if (device.isMaster) {
        await PosDevice.updateMany(
          { deviceId: { $ne: deviceId }, isMaster: true },
          { $set: { isMaster: false } }
        );
      }
    }

    const newName = device_name || deviceName;
    if (newName) device.deviceName = newName;
    if (notes !== undefined) device.notes = notes;

    await device.save();
    res.json({
      success: true,
      message: `تم تحديث الجهاز بنجاح — الدور: ${device.isMaster ? 'رئيسي (Master)' : 'فرعي (Slave)'}`,
      device
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.4.4. حذف جهاز كاشير مسجل
router.delete('/devices/:deviceId', verifyBridgeKey, async (req, res) => {
  try {
    const device = await PosDevice.findOneAndDelete({ deviceId: req.params.deviceId });
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({ success: true, message: 'Device removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.5. جلب الأقسام السحابية من MongoDB
router.get('/categories', verifyBridgeKey, async (req, res) => {
  try {
    const categories = await Category.find().sort({ sort_order: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.6. إنشاء قسم جديد من الكاشير
router.post('/categories', verifyBridgeKey, async (req, res) => {
  const { name, name_ar, color, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const c = await Category.create({
      name,
      name_ar: name_ar || name,
      color: color || '#3b82f6',
      sort_order: parseInt(sort_order || 0)
    });
    res.json({ success: true, id: c._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2.7. تعديل قسم من الكاشير
router.patch('/categories/:id', verifyBridgeKey, async (req, res) => {
  const { name, name_ar, color, sort_order } = req.body;
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Category not found' });
    if (name !== undefined) c.name = name;
    if (name_ar !== undefined) c.name_ar = name_ar;
    if (color !== undefined) c.color = color;
    if (sort_order !== undefined) c.sort_order = parseInt(sort_order);
    await c.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2.8. حذف قسم من الكاشير
router.delete('/categories/:id', verifyBridgeKey, async (req, res) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Category not found' });
    await c.deleteOne();
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

// 4. تعديل مشروب من الكاشير
router.patch('/drinks/:id', verifyBridgeKey, async (req, res) => {
  const { price, is_available, name, name_ar, category_id } = req.body;
  try {
    const d = await Drink.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Drink not found' });

    if (price !== undefined) d.price = parseFloat(price);
    if (is_available !== undefined) d.is_available = Number(is_available);
    if (name !== undefined) d.name = name;
    if (name_ar !== undefined) d.name_ar = name_ar;
    if (category_id !== undefined) d.category_id = category_id || null;

    await d.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4.1. إنشاء مشروب جديد من الكاشير
router.post('/drinks', verifyBridgeKey, async (req, res) => {
  const { category_id, name, name_ar, price, is_available } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price are required' });
  try {
    const d = await Drink.create({
      category_id: category_id || null,
      name,
      name_ar: name_ar || name,
      price: parseFloat(price),
      is_available: is_available !== undefined ? Number(is_available) : 1,
      image_emoji: 'imgs/espresso.png',
      tagline: 'An unforgettable experience',
      description: 'A premium drink crafted with the finest ingredients'
    });
    res.json({ success: true, id: d._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4.2. حذف مشروب من الكاشير
router.delete('/drinks/:id', verifyBridgeKey, async (req, res) => {
  try {
    const d = await Drink.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Drink not found' });
    await d.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. جلب الطلبات أونلاين النشطة وتتبع حالتها للكاشير
router.get('/orders/online-pending', verifyBridgeKey, async (req, res) => {
  try {
    const orders = await Order.find({ 
      status: { $in: ['pending', 'confirmed'] }
    }).sort({ createdAt: -1 }).populate('userId');
    
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
        status: o.status || 'pending',
        createdAt: o.createdAt
      };
    });
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. جلب إحصائيات العميل (أكثر 3 مشاريب طلباً، آخر أوردر، الاسم ورقم الهاتف)
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
    const lastOrder = await Order.findOne(matchQuery).sort({ createdAt: -1 });

    const formattedLastOrder = lastOrder ? {
      id: lastOrder._id,
      orderId: lastOrder.orderId || lastOrder._id,
      createdAt: lastOrder.createdAt,
      total: lastOrder.totalAmount || lastOrder.total || 0,
      status: lastOrder.status,
      items: (lastOrder.items || []).map(i => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        sugar: i.sugar,
        extras: i.extras,
        notes: i.notes
      }))
    } : null;

    const resultTopItems = topItems.map(item => ({ name: item._id, count: item.count }));

    res.json({
      name: user ? user.name : (lastOrder ? lastOrder.customerName : 'عميل أونلاين'),
      phone: phone,
      topItems: resultTopItems,
      lastOrder: formattedLastOrder
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 7. LEGACY: Redirect old sync-invoice calls to the unified /invoices/sync endpoint
router.post('/sync-invoice', verifyBridgeKey, async (req, res) => {
  // Forward to the unified handler
  const { invoice_number, customer_phone, customer_name, total, items, created_at, payment_method, status } = req.body;
  console.log('[Bridge] Legacy sync-invoice redirecting to unified /invoices/sync for:', invoice_number);

  try {
    // Check if already synced (dual check)
    const existingOrder = await Order.findOne({ 'syncMeta.lastEventId': invoice_number });
    if (existingOrder) {
      console.log('[Bridge] Invoice already synced (legacy check):', invoice_number);
      return res.json({ success: true, message: 'Already synced', points_earned: 0 });
    }
    const existingEvent = await SyncEvent.findOne({ 'payload.invoice_number': invoice_number });
    if (existingEvent) {
      return res.json({ success: true, message: 'Already synced (event exists)', points_earned: 0 });
    }

    let user = null;
    let pointsEarned = 0;

    if (customer_phone) {
      user = await User.findOne({ phone: customer_phone });
      if (user) {
        pointsEarned = Math.floor(total / 10);
        user.points = (user.points || 0) + pointsEarned;
        user.total_spent = (user.total_spent || 0) + total;
        await user.save();

        const PointsLog = require('../models/PointsLog');
        await PointsLog.create({
          userId: user._id,
          points: pointsEarned,
          type: 'earn',
          notes: `نقاط مكتسبة من فاتورة الكاشير المزامنة #${invoice_number}`
        });
      }
    }

    const eventId = uuidv4();
    await Order.create({
      userId: user ? user._id : null,
      table_number: 'سفري/محلي',
      items: (items || []).map(i => ({
        name: i.product_name || i.name,
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
      qrCodeToken: `pos-sync-${invoice_number}-${eventId}`,
      paymentMethod: paymentMethodMap(payment_method),
      syncMeta: {
        lastEventId: invoice_number,
        lastEventType: 'invoice.sync',
        lastSyncedAt: new Date(),
        syncStatus: 'acked'
      }
    });

    await SyncEvent.create({
      eventId,
      eventType: 'INVOICE_SYNCED',
      payload: req.body,
      status: 'acked',
      acknowledgedAt: new Date()
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

// 9. Server Reset & Rebind — Clear all synced data when switching to a new POS instance
router.post('/reset-and-rebind', verifyBridgeKey, async (req, res) => {
  const { confirm, new_bridge_key, device_id } = req.body || {};

  if (!confirm) {
    return res.status(400).json({ error: 'يجب تأكيد عملية التصفير بإرسال confirm: true' });
  }

  try {
    // 1. Delete all POS-synced orders
    const deletedOrders = await Order.deleteMany({ posSynced: true });
    console.log(`[Bridge Reset] Deleted ${deletedOrders.deletedCount} POS-synced orders.`);

    // 2. Delete all sync events
    const deletedEvents = await SyncEvent.deleteMany({});
    console.log(`[Bridge Reset] Deleted ${deletedEvents.deletedCount} sync events.`);

    // 3. Delete all report snapshots
    const deletedSnapshots = await ReportSnapshot.deleteMany({});
    console.log(`[Bridge Reset] Deleted ${deletedSnapshots.deletedCount} report snapshots.`);

    // 4. Record the reset event
    await SyncEvent.create({
      eventId: uuidv4(),
      eventType: 'SYSTEM_RESET',
      payload: {
        reset_by_device: device_id || 'unknown',
        new_bridge_key: new_bridge_key ? '***' : null,
        reset_at: new Date().toISOString()
      },
      status: 'acked',
      acknowledgedAt: new Date()
    });

    res.json({
      success: true,
      message: 'تم تصفير بيانات السيرفر بنجاح. جاهز لاستقبال بيانات النظام الجديد.',
      deleted: {
        orders: deletedOrders.deletedCount,
        sync_events: deletedEvents.deletedCount,
        report_snapshots: deletedSnapshots.deletedCount
      }
    });
  } catch (err) {
    console.error('[Bridge Reset] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
