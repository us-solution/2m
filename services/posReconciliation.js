// ===== وحدة المزامنة والتوفيق اللحظي بين نظام الكاشير (POS) والموقع (Website) =====
// الطريق الأساسي للبيانات هو وكيل المزامنة داخل الكاشير الذي يرفع الفواتير
// والمصروفات والورديات للموقع. هذه الوحدة طريق إضافي: تسحب آخر الفواتير من
// الكاشير مباشرة عندما يكون عنوانه متاحاً للموقع (نفس الشبكة أو نفق آمن).
const Order = require('../models/Order');
const Shift = require('../models/Shift');
const PosDevice = require('../models/PosDevice');
const SyncEvent = require('../models/SyncEvent');
const { v4: uuidv4 } = require('uuid');
const { cairoLocalToDate, sqliteUtcToDate } = require('./cairoTime');

function paymentMethodMap(method) {
  if (!method) return 'cash';
  const m = String(method).toLowerCase().trim();
  if (m === 'cash' || m === 'نقدي' || m === 'نقد') return 'cash';
  if (m === 'visa' || m === 'card' || m === 'بطاقة' || m === 'فيزا') return 'card';
  if (m === 'wallet' || m === 'محفظة' || m === 'vodafone' || m === 'instapay') return 'wallet';
  if (m === 'split' || m === 'مقسم') return 'split';
  return 'cash';
}

// حالة فاتورة الكاشير → حالة الطلب على الموقع
function orderStatusOf(posStatus) {
  const s = String(posStatus || 'completed').toLowerCase();
  if (s === 'cancelled') return 'cancelled';
  if (s === 'refunded') return 'refunded';
  return 'paid';
}

function getCashierConnection() {
  const url = String(process.env.CASHIER_API_URL || process.env.BRIDGE_WEBHOOK_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.CASHIER_API_KEY || process.env.BRIDGE_API_KEY || '').trim();
  if (!url || !key) return { reason: 'not_configured' };
  // على خوادم Vercel لا يوجد كاشير على localhost — لا داعي لانتظار مهلة في كل طلب
  if (process.env.VERCEL && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url)) return { reason: 'cashier_not_reachable_from_cloud' };
  return { url, key };
}

async function fetchJson(url, key, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json', 'x-bridge-key': key }, signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * محاولة الاتصال بنظام الكاشير ومزامنة الفواتير والوردية المفتوحة لحظياً
 * @param {Object} options خيارات المزامنة
 * @returns {Promise<Object>} نتيجة المزامنة
 */
async function reconcileWithLivePos(options = {}) {
  const connection = getCashierConnection();
  if (!connection.url) return { isLive: false, reason: connection.reason };
  const { url: cashierUrl, key } = connection;
  const timeoutMs = options.timeoutMs || 3500;

  try {
    // 1. آخر الفواتير من الكاشير
    let invoicesRes;
    try {
      invoicesRes = await fetchJson(`${cashierUrl}/api/invoices?limit=100`, key, timeoutMs);
    } catch (e) {
      return { isLive: false, reason: 'unreachable', error: e.message };
    }
    if (!invoicesRes.ok) return { isLive: false, reason: 'auth_or_status_failed', status: invoicesRes.status };

    const invoicesData = invoicesRes.data;
    const invoicesList = Array.isArray(invoicesData.invoices) ? invoicesData.invoices : (Array.isArray(invoicesData) ? invoicesData : []);

    // 2. الوردية المفتوحة حالياً
    let activeShiftDoc = null;
    try {
      const shiftRes = await fetchJson(`${cashierUrl}/api/shifts/active`, key, 2500);
      if (shiftRes.ok && shiftRes.data.active && shiftRes.data.shift) {
        const s = shiftRes.data.shift;
        const posShiftId = Number(s.id);
        activeShiftDoc = await Shift.findOneAndUpdate(
          { posShiftId },
          {
            posShiftId,
            cashierName: s.user_name || 'كاشير الوردية',
            // أوقات الورديات في الكاشير بتوقيت القاهرة المحلي
            openedAt: cairoLocalToDate(s.start_time) || new Date(),
            closedAt: cairoLocalToDate(s.end_time),
            openingBalance: Number(s.initial_cash) || 0,
            closingBalance: Number(s.actual_cash) || 0,
            expectedBalance: Number(s.expected_cash) || 0,
            variance: Number(s.variance) || 0,
            totalOrders: Number(s.orders_count) || 0,
            totalRevenue: Number(s.gross_sales || s.net_sales) || 0,
            paymentBreakdown: {
              cash: Number(s.total_sales_cash) || 0,
              card: Number(s.total_sales_visa) || 0,
              wallet: Number(s.total_sales_wallet) || 0
            },
            status: s.status === 'closed' ? 'closed' : 'open'
          },
          { upsert: true, new: true }
        );
      }
    } catch (shiftErr) {
      console.warn('[Reconcile] Could not fetch active shift from POS:', shiftErr.message);
    }

    // 3. الفواتير الناقصة على الموقع + الفواتير التي ألغيت على الكاشير بعد رفعها
    let syncedOrdersCount = 0;
    let statusUpdates = 0;
    for (const inv of invoicesList) {
      const idempotencyKey = inv.idempotency_key;
      const invoiceNumber = inv.invoice_number;
      const shiftId = inv.shift_id ? Number(inv.shift_id) : null;
      const status = orderStatusOf(inv.status);

      let existing = null;
      if (idempotencyKey) existing = await Order.findOne({ externalOrderId: idempotencyKey });
      if (!existing && invoiceNumber && shiftId) existing = await Order.findOne({ 'syncMeta.lastEventId': invoiceNumber, posShiftId: shiftId });

      if (existing) {
        if (existing.status !== status && status !== 'paid') {
          existing.status = status;
          existing.syncMeta = { ...(existing.syncMeta || {}), lastEventType: `invoice.${status}`, lastSyncedAt: new Date(), syncStatus: 'acked' };
          await existing.save();
          statusUpdates += 1;
        }
        continue;
      }

      const rawItems = Array.isArray(inv.items) ? inv.items : [];
      const items = rawItems.map(i => ({
        name: i.product_name || i.name || 'منتج',
        quantity: Number(i.quantity) || 1,
        price: Number(i.price) || 0,
        sugar: 'Normal',
        extras: []
      }));
      const linkedShift = shiftId ? await Shift.findOne({ posShiftId: shiftId }) : null;
      const eventId = uuidv4();
      let tableNo = null;
      try {
        tableNo = inv.notes && String(inv.notes).startsWith('{') ? JSON.parse(inv.notes).tableNo : null;
      } catch (_) {
        tableNo = null;
      }

      await Order.create({
        userId: null,
        table_number: tableNo || 'سفري/محلي',
        items,
        total_price: Number(inv.total) || 0,
        points_earned: 0,
        status,
        notes: `مزامنة مباشرة من كاشير POS. فاتورة: ${invoiceNumber}`,
        customerPhone: null,
        posSynced: true,
        externalOrderId: idempotencyKey || `${invoiceNumber}_${shiftId || Date.now()}`,
        posShiftId: shiftId,
        shiftId: linkedShift ? linkedShift._id : null,
        qrCodeToken: `live-sync-${invoiceNumber}-${eventId}`,
        paymentMethod: paymentMethodMap(inv.payment_method),
        // فواتير الكاشير محفوظة بتوقيت UTC
        createdAt: sqliteUtcToDate(inv.created_at) || new Date(),
        syncMeta: {
          lastEventId: invoiceNumber,
          lastEventType: 'invoice.live_reconcile',
          lastSyncedAt: new Date(),
          syncStatus: 'acked'
        }
      });

      await SyncEvent.create({
        eventId,
        eventType: 'INVOICE_SYNCED',
        payload: { invoice_number: invoiceNumber, idempotency_key: idempotencyKey, total: Number(inv.total) || 0, shift_id: shiftId },
        status: 'acked',
        acknowledgedAt: new Date()
      }).catch((e) => console.warn('[Reconcile] Could not record the sync event:', e.message));

      syncedOrdersCount += 1;
    }

    // 4. جهاز الكاشير متصل الآن
    await PosDevice.findOneAndUpdate(
      { deviceName: '2M' },
      { deviceName: '2M', isMaster: true, status: 'online', lastSeen: new Date() },
      { upsert: true }
    ).catch((e) => console.warn('[Reconcile] Could not update the POS device status:', e.message));

    return { isLive: true, syncedOrdersCount, statusUpdates, totalPosInvoices: invoicesList.length, activeShift: activeShiftDoc };
  } catch (err) {
    console.error('[Reconcile Error]:', err.message);
    return { isLive: false, error: err.message };
  }
}

module.exports = {
  reconcileWithLivePos,
  paymentMethodMap,
  orderStatusOf
};
