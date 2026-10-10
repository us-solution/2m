// ===== مسار الطلبات - إنشاء وعرض وتحديث الطلبات، تأكيد QR، والمزامنة مع نظام نقاط البيع =====
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Order = require('../models/Order');
const User = require('../models/User');
const Drink = require('../models/Drink'); // ← مُضاف: ضروري لخصم المخزون
const PointsLog = require('../models/PointsLog');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const jwt = require('jsonwebtoken');
const Pusher = require('pusher');
const crypto = require('crypto');
const SyncEvent = require('../models/SyncEvent');
const retryQueue = require('../retry-queue');
const axios = require('axios');

const JWT_SECRET = process.env.JWT_SECRET || '2m_cafe_secret_2026';
const BRIDGE_SIGNATURE_SECRET = process.env.BRIDGE_SIGNATURE_SECRET || process.env.BRIDGE_API_KEY || 'bridge-signature-secret';
const BRIDGE_TIMEOUT_MS = parseInt(process.env.BRIDGE_TIMEOUT_MS || '5000', 10);

// تهيئة Pusher للإشعارات الفورية للكاشير إذا كانت الإعدادات متوفرة
let pusher = null;
if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET) {
  try {
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER || 'eu',
      useTLS: true
    });
  } catch (e) {
    console.error('[Pusher Init Error]', e.message);
  }
}

// تحليل آمن لعناصر الطلب
function safeParseItems(items) {
  if (Array.isArray(items)) return items;
  try { return JSON.parse(items || '[]'); } catch (_) { return []; }
}

// بناء بيانات الطلب للإرسال (للكاشير والجسر)
function buildOrderPayload(order, user = null) {
  const parsedItems = safeParseItems(order.items);
  return {
    order_id: String(order._id),
    table_number: order.table_number,
    items: parsedItems.map(item => ({
      name: item.name || '',
      name_ar: item.name_ar || '',
      quantity: item.quantity || 1,
      price: Number(item.price) || 0,
      sugar: item.sugar || 'Normal',
      extra: item.extra || 'None',
      notes: item.notes || ''
    })),
    total_price: order.total_price,
    points_earned: order.points_earned,
    notes: order.notes,
    status: order.status,
    qr_token: order.qrCodeToken || null,
    customer_name: user ? user.name : (order.customerPhone ? 'Takeaway' : null),
    customer_phone: user ? (user.phone && user.phone.startsWith('email_') ? null : user.phone) : (order.customerPhone || null),
    created_at: order.createdAt
  };
}

// توقيع البيانات المرسلة للجسر (HMAC-SHA256)
function signBridgeBody(rawBody, timestamp, eventId) {
  const payload = `${timestamp}.${eventId}.${rawBody}`;
  return crypto.createHmac('sha256', BRIDGE_SIGNATURE_SECRET).update(payload).digest('hex');
}

// إنشاء حدث مزامنة للطلب
async function createSyncEvent(order, eventType, payload) {
  const eventId = uuidv4();
  const event = await SyncEvent.create({
    eventId,
    eventType,
    orderId: order._id,
    orderVersion: order.orderVersion || 1,
    payload: {
      meta: {
        eventId,
        eventType,
        orderId: String(order._id),
        orderVersion: order.orderVersion || 1,
        source: 'vercel-api',
        sentAt: new Date().toISOString()
      },
      data: payload
    },
    status: 'pending'
  });
  order.syncMeta = {
    lastEventId: eventId,
    lastEventType: eventType,
    syncStatus: 'pending',
    syncAttempts: (order.syncMeta?.syncAttempts || 0) + 1,
    lastError: null,
    lastSyncedAt: null
  };
  await order.save();
  return event;
}

// إيصال الحدث إلى الجسر المحلي
async function deliverToBridge(event) {
  const BRIDGE_URL = process.env.BRIDGE_WEBHOOK_URL || process.env.CASHIER_API_URL;
  const BRIDGE_KEY = process.env.BRIDGE_API_KEY || process.env.CASHIER_API_KEY;
  if (!BRIDGE_URL || !BRIDGE_KEY) return { skipped: true, reason: 'bridge_not_configured' };

  const rawBody = JSON.stringify(event.payload);
  const timestamp = Date.now().toString();
  const signature = signBridgeBody(rawBody, timestamp, event.eventId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
  try {
    const resp = await fetch(`${BRIDGE_URL}/api/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bridge-key': BRIDGE_KEY,
        'x-bridge-event-id': event.eventId,
        'x-bridge-timestamp': timestamp,
        'x-bridge-signature': signature
      },
      body: rawBody,
      signal: controller.signal
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, reason: `bridge_http_${resp.status}`, details: txt.slice(0, 120) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'bridge_network_error', details: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

// deliverToCashierAPI has been removed as the SQLite Express server local POS queries Vercel directly.

// الحصول على المستخدم إذا كان رمز المصادقة موجوداً (اختياري)
const getOptionalUser = async (req) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return await User.findById(decoded.id);
  } catch (e) {
    return null;
  }
};

// إنشاء طلب جديد (مع مصادقة اختيارية)
router.post('/', async (req, res) => {
  const { table_number, items, total_price, notes, customer_phone, useFreeOrder } = req.body;
  const externalOrderId = String(req.body.idempotency_key || req.body.client_order_id || req.body.order_id || '').trim() || null;

  if (table_number === undefined || !items || total_price === undefined) {
    return res.status(400).json({ error: 'Missing fields: table_number, items, and total_price are required' });
  }

  // رمز فريد لتأكيد الطلب عبر QR
  const qrCodeToken = uuidv4();

  try {
    if (externalOrderId) {
      const existing = await Order.findOne({ externalOrderId });
      if (existing) {
        return res.json({
          success: true,
          duplicate: true,
          order_id: existing._id,
          points_earned: existing.points_earned,
          sync: { status: existing.syncMeta?.syncStatus || 'pending' }
        });
      }
    }

    const user = await getOptionalUser(req);
    let priceNum = parseFloat(total_price) || 0;
    let points_earned = Math.floor(priceNum);
    let isFreeOrderApplied = false;

    if (useFreeOrder && user && user.freeOrdersCount > 0) {
      isFreeOrderApplied = true;
      priceNum = 0;
      points_earned = 0;
    }

    const parsedItems = safeParseItems(items).map(item => ({
      name: item.name || '',
      menuItemIdInCashier: item.menuItemIdInCashier || '',
      quantity: item.quantity || 1,
      price: isFreeOrderApplied ? 0 : (item.price || 0),
      sugar: item.sugar || 'Normal',
      extras: Array.isArray(item.extras) ? item.extras : [],
      notes: item.notes || ''
    }));

    // ──────────────────────────────────────────────
    // التحقق من مخزون الكاشير المحلي لحظياً (SQLite)
    // ──────────────────────────────────────────────
    const CASHIER_API_URL = process.env.CASHIER_API_URL;
    const CASHIER_API_KEY = process.env.CASHIER_API_KEY;
    const isLocalhostUrl = CASHIER_API_URL && (CASHIER_API_URL.includes('localhost') || CASHIER_API_URL.includes('127.0.0.1'));
    if (CASHIER_API_URL && CASHIER_API_KEY && parsedItems.length > 0 && !(process.env.VERCEL && isLocalhostUrl)) {
      try {
        const stockRes = await axios.post(`${CASHIER_API_URL}/api/products/check-stock`, {
          items: parsedItems.map(i => ({ name: i.name, quantity: i.quantity }))
        }, {
          headers: { 'x-bridge-key': CASHIER_API_KEY },
          timeout: 4000 // مهلة قصيرة لمنع تعطيل العميل إذا كان الكاشير أوفلاين
        });

        if (stockRes.data && stockRes.data.available === false && Array.isArray(stockRes.data.insufficient)) {
          // نحظر الطلب فقط للمنتجات التي تأكد نقص مخزونها الفعلي (insufficient) وليس الأصناف المحضرة (not_found)
          const strictlyOut = stockRes.data.insufficient.filter(i => i.reason === 'insufficient');
          if (strictlyOut.length > 0) {
            const outOfStockNames = strictlyOut.map(i => i.name).join('، ');
            return res.status(400).json({
              error: `المنتجات التالية نفدت أو لا تتوفر بالكمية المطلوبة: ${outOfStockNames}`,
              insufficient: strictlyOut
            });
          }
        }
      } catch (err) {
        console.warn('[StockCheck] فشل الاتصال بالكاشير للتحقق من المخزون (سيتم تمرير الطلب):', err.message);
        // في حالة الفشل نمرر الطلب تلقائياً لعدم خسارة العميل
      }
    }

    const finalNotes = isFreeOrderApplied 
      ? `[أوردر هدية مسابقة الفلوج] ${notes || ''}`
      : (notes || '');

    const order = await Order.create({
      userId: user ? user._id : null,
      table_number: String(table_number),
      items: parsedItems,
      total_price: priceNum,
      points_earned: points_earned,
      notes: finalNotes,
      status: 'pending',
      qrCodeToken,
      isQrConfirmed: false,
      customerPhone: customer_phone || null,
      externalOrderId
    });

    // إضافة النقاط للعميل إذا كان مسجلاً أو خصم الكوبون الهدية
    if (user) {
      if (isFreeOrderApplied) {
        user.freeOrdersCount = Math.max(0, user.freeOrdersCount - 1);
      } else {
        user.points += points_earned;
        user.total_spent = parseFloat(user.total_spent) + priceNum;
      }
      await user.save();

      if (points_earned > 0) {
        await PointsLog.create({
          userId: user._id,
          points: points_earned,
          reason: `Order #${order._id}`,
          orderId: order._id
        });
      }
    }



    // إعلام الكاشير بالطلب الجديد عبر Pusher (إذا كان مهيأ)
    const cashierPayload = buildOrderPayload(order, user);
    if (pusher) {
      try {
        await pusher.trigger('cashier-orders', 'new-order', cashierPayload);
      } catch (pusherErr) {
        console.error('[Pusher Trigger Error]', pusherErr.message);
      }
    }

    // مزامنة الطلب مع نظام نقاط البيع (إن وجد)
    const syncEvent = await createSyncEvent(order, 'order.created', cashierPayload);
    
    // إرسال الأوردر للجسر بشكل غير متزامن (في الخلفية) لمنع تأخير استجابة العميل أو التسبب في مهلة اتصال
    deliverToBridge(syncEvent).then(async (bridgeResult) => {
      try {
        if (bridgeResult.ok || bridgeResult.skipped) {
          syncEvent.status = bridgeResult.ok ? 'acked' : 'pending';
          syncEvent.acknowledgedAt = bridgeResult.ok ? new Date() : null;
          syncEvent.failureReason = bridgeResult.skipped ? bridgeResult.reason : null;
          await syncEvent.save();
          if (bridgeResult.ok) {
            await Order.updateOne(
              { _id: order._id },
              { $set: { 'syncMeta.syncStatus': 'acked', 'syncMeta.lastSyncedAt': new Date(), 'syncMeta.lastError': null } }
            );
          }
        } else {
          syncEvent.status = 'failed';
          syncEvent.failureReason = `${bridgeResult.reason || 'failed'}: ${bridgeResult.details || ''}`;
          await syncEvent.save();
          await Order.updateOne(
            { _id: order._id },
            { $set: { 'syncMeta.syncStatus': 'failed', 'syncMeta.lastError': syncEvent.failureReason } }
          );
        }
      } catch (saveErr) {
        console.error('[Bridge Sync Background Save Error]', saveErr.message);
      }
    }).catch((bridgeErr) => {
      console.error('[Bridge Background Delivery Error]', bridgeErr.message);
    });

    // deliverToCashierAPI is disabled as it is handled by the local POS pulling pending orders.

    res.json({
      success: true,
      order_id: order._id,
      points_earned: points_earned,
      sync: {
        eventId: syncEvent.eventId,
        status: syncEvent.status
      }
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      console.error('[Order] Error after response sent:', err.message);
    }
  }
});

// جلب قائمة الطلبات (للكاشير والأدمن، مع فلتر بالحالة)
// مُحسَّن: يعرض فقط آخر 48 ساعة + حد أقصى 200 طلب لتفادي البطء
router.get('/', authenticateToken, requireRole('cashier'), async (req, res) => {
  const { status, all } = req.query;
  const query = {};

  if (status) {
    query.status = status;
  }

  // افتراضياً: آخر 48 ساعة فقط (ما لم يُطلب all=true من الأدمن)
  if (all !== 'true' || req.user.role !== 'admin') {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    query.createdAt = { $gte: cutoff };
  }

  try {
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(200) // حد أقصى لمنع تحميل آلاف الطلبات
      .populate('userId', 'name phone email');

    const serialized = orders.map(o => ({
      id: o._id,
      user_id: o.userId ? o.userId._id : null,
      customer_name: o.userId ? o.userId.name : (o.customerPhone ? 'Takeaway' : null),
      customer_phone: o.userId ? (o.userId.phone && o.userId.phone.startsWith('email_') ? '' : (o.userId.phone || '')) : (o.customerPhone || null),
      table_number: o.table_number,
      items: o.items || '[]',
      total_price: parseFloat(o.total_price) || 0,
      points_earned: o.points_earned || 0,
      status: o.status || 'pending',
      notes: o.notes || '',
      cashier_id: o.cashierId,
      order_version: o.orderVersion || 1, // ← مُضاف: للتحقق من تعارض التعديل
      created_at: o.createdAt ? o.createdAt.toISOString() : new Date().toISOString(),
      updated_at: o.updatedAt ? o.updatedAt.toISOString() : new Date().toISOString(),
      isQrConfirmed: o.isQrConfirmed || false
    }));

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تتبع حالة الطلب للعميل (عام متاح لزوار وطاولات المقهى بدون مصادقة)
router.get('/track/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).select('status table_number total_price createdAt isQrConfirmed syncMeta');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({
      success: true,
      order_id: order._id,
      status: order.status,
      table_number: order.table_number,
      total_price: order.total_price,
      isQrConfirmed: order.isQrConfirmed,
      sync_status: order.syncMeta?.syncStatus || 'pending',
      created_at: order.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// جلب تاريخ طلبات العميل المسجل
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    const serialized = orders.map(o => ({
      id: o._id,
      user_id: o.userId,
      table_number: o.table_number,
      items: o.items,
      total_price: parseFloat(o.total_price),
      points_earned: o.points_earned,
      status: o.status,
      notes: o.notes,
      created_at: o.createdAt.toISOString(),
      updated_at: o.updatedAt.toISOString(),
      isQrConfirmed: o.isQrConfirmed
    }));

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث حالة الطلب (الكاشير) مع خصم المخزون تلقائياً عند التقديم
router.patch('/:id/status', authenticateToken, requireRole('cashier'), async (req, res) => {
  const { status, paymentMethod, shiftId, expectedVersion } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Missing status' });
  }

  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // التحقق من عدم وجود تعارض في الإصدار
    if (expectedVersion && Number(expectedVersion) !== Number(order.orderVersion || 1)) {
      return res.status(409).json({ error: 'Version conflict', currentVersion: order.orderVersion || 1 });
    }

    const normalizedStatus = (status === 'confirmed' || status === 'accepted') ? 'accepted' :
                             (status === 'rejected' || status === 'cancelled') ? 'cancelled' : status;
    order.status = normalizedStatus;
    if (normalizedStatus === 'accepted' || status === 'confirmed') order.isQrConfirmed = true;
    order.cashierId = req.user._id;
    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (shiftId) order.shiftId = shiftId;
    order.orderVersion = (order.orderVersion || 1) + 1;
    await order.save();

    // خصم المخزون تلقائياً عند تقديم الطلب (حسب الوصفة)
    if (status === 'served' && order.items && order.items.length > 0) {
      setImmediate(async () => {
        try {
          const Recipe = require('../models/Recipe');
          const RecipeItem = require('../models/RecipeItem');
          const Ingredient = require('../models/Ingredient');
          const InventoryTransaction = require('../models/InventoryTransaction');
          const StockAlert = require('../models/StockAlert');
          for (const item of order.items) {
            if (!item.name) continue;
            // Drink مستورد في الأعلى بشكل صحيح
            const drink = await Drink.findOne({ name: item.name }).lean();
            if (!drink) continue;
            const recipe = await Recipe.findOne({ drinkId: drink._id, isActive: true });
            if (!recipe) continue;
            const recipeItems = await RecipeItem.find({ recipeId: recipe._id }).populate('ingredientId');
            for (const ri of recipeItems) {
              if (!ri.ingredientId) continue;
              const qtyToDeduct = (ri.quantity || 0) * (item.quantity || 1) / (recipe.yield || 1);
              const ingredient = ri.ingredientId;
              ingredient.currentStock -= qtyToDeduct;
              await ingredient.save();
              await InventoryTransaction.create({
                ingredientId: ingredient._id,
                type: 'consumption',
                quantity: -qtyToDeduct,
                unitCost: ingredient.unitCost,
                totalCost: qtyToDeduct * ingredient.unitCost,
                note: `خصم تلقائي - طلب #${order.table_number || order._id}`,
                performedBy: req.user._id,
                relatedOrderId: order._id
              });
              // إنشاء تنبيه إذا انخفض المخزون عن الحد الأدنى
              if (ingredient.minStock > 0 && ingredient.currentStock <= ingredient.minStock) {
                const exists = await StockAlert.findOne({ ingredientId: ingredient._id, type: 'low_stock', resolved: false });
                if (!exists) {
                  await StockAlert.create({
                    ingredientId: ingredient._id,
                    type: 'low_stock',
                    message: `نقص في خامة ${ingredient.name_ar || ingredient.name}: المخزون ${ingredient.currentStock.toFixed(1)} ${ingredient.unit}`,
                    currentStock: ingredient.currentStock,
                    minStock: ingredient.minStock,
                    severity: ingredient.currentStock <= ingredient.minStock * 0.5 ? 'critical' : 'warning'
                  });
                }
              }
            }
          }
        } catch (invErr) {
          console.error('[Inventory Auto-Deduct Error]', invErr.message);
        }
      });
    }

    // مزامنة تغيير الحالة مع الجسر
    const orderPayload = buildOrderPayload(order, null);
    const syncEvent = await createSyncEvent(order, 'order.status_changed', {
      ...orderPayload,
      updated_by: String(req.user._id),
      status
    });
    const bridgeResult = await deliverToBridge(syncEvent);
    if (bridgeResult.ok) {
      syncEvent.status = 'acked';
      syncEvent.acknowledgedAt = new Date();
      await syncEvent.save();
      await Order.updateOne(
        { _id: order._id },
        { $set: { 'syncMeta.syncStatus': 'acked', 'syncMeta.lastSyncedAt': new Date(), 'syncMeta.lastError': null } }
      );
    } else if (!bridgeResult.skipped) {
      syncEvent.status = 'failed';
      syncEvent.failureReason = `${bridgeResult.reason || 'failed'}: ${bridgeResult.details || ''}`;
      await syncEvent.save();
      await Order.updateOne(
        { _id: order._id },
        { $set: { 'syncMeta.syncStatus': 'failed', 'syncMeta.lastError': syncEvent.failureReason } }
      );
    }

    res.json({ success: true, orderVersion: order.orderVersion, syncEventId: syncEvent.eventId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



const EXPECTED_BRIDGE_KEY = process.env.BRIDGE_API_KEY || '';

// جلب الطلبات التي لم تتم مزامنتها بعد مع نقاط البيع
router.get('/unsynced', async (req, res) => {
  const bridgeKey = req.headers['x-bridge-key'];
  if (!bridgeKey || !EXPECTED_BRIDGE_KEY || bridgeKey !== EXPECTED_BRIDGE_KEY) {
    return res.status(403).json({ error: 'Invalid bridge key' });
  }
  try {
    const orders = await Order.find({ $or: [{ posSynced: { $ne: true } }, { 'syncMeta.syncStatus': { $ne: 'acked' } }] })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('userId', 'name phone email');
    const envelopes = [];
    for (const order of orders) {
      const payload = buildOrderPayload(order, order.userId || null);
      const existing = await SyncEvent.findOne({ orderId: order._id, status: { $ne: 'acked' } }).sort({ createdAt: -1 }).lean();
      envelopes.push(existing?.payload || {
        meta: {
          eventId: order.syncMeta?.lastEventId || uuidv4(),
          eventType: 'order.created',
          orderId: String(order._id),
          orderVersion: order.orderVersion || 1,
          source: 'vercel-api',
          sentAt: new Date().toISOString()
        },
        data: payload
      });
    }
    res.json(envelopes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تعليم الطلبات كمزامنة مع نقاط البيع
router.post('/mark-synced', async (req, res) => {
  const bridgeKey = req.headers['x-bridge-key'];
  if (!bridgeKey || bridgeKey !== EXPECTED_BRIDGE_KEY) {
    return res.status(403).json({ error: 'Invalid bridge key' });
  }
  const { ids, eventIds } = req.body;
  if ((!Array.isArray(ids) || ids.length === 0) && (!Array.isArray(eventIds) || eventIds.length === 0)) {
    return res.status(400).json({ error: 'ids or eventIds array required' });
  }
  try {
    const targetIds = Array.isArray(ids) ? ids : [];
    if (Array.isArray(eventIds) && eventIds.length) {
      const linked = await SyncEvent.find({ eventId: { $in: eventIds } }).select('orderId').lean();
      linked.forEach(e => e.orderId && targetIds.push(String(e.orderId)));
      await SyncEvent.updateMany(
        { eventId: { $in: eventIds } },
        { $set: { status: 'acked', acknowledgedAt: new Date(), failureReason: null } }
      );
    }
    const result = await Order.updateMany(
      { _id: { $in: [...new Set(targetIds)] } },
      { $set: { posSynced: true } }
    );
    await Order.updateMany(
      { _id: { $in: [...new Set(targetIds)] } },
      {
        $set: {
          'syncMeta.syncStatus': 'acked',
          'syncMeta.lastSyncedAt': new Date(),
          'syncMeta.lastError': null
        }
      }
    );
    res.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount, eventAcks: (eventIds || []).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف طلب (بواسطة الأدمن فقط — مع حماية الفواتير المتزامنة من الكاشير)
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.posSynced || order.externalOrderId || order.posOrderId) {
      return res.status(403).json({
        error: 'READ_ONLY_POS_RECORD',
        message: 'لا يمكن حذف هذا الطلب من الموقع لأنه مسجل ومتزامن مع نظام الكاشير (POS). السجلات المالية محمية للقراءة فقط.'
      });
    }
    await order.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
