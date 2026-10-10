// ===== مسار التقارير - تقارير المبيعات والأصناف الأكثر مبيعاً وأداء الكاشير والتكاليف والأرباح =====
const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const Shift = require('../models/Shift');
const User = require('../models/User');
const Expense = require('../models/Expense');
const CashMovement = require('../models/CashMovement');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// ===== نقاط نهاية بيانات التقارير =====

// نظرة عامة على المبيعات (يومي/أسبوعي/شهري)
router.get('/sales', authenticateToken, requireRole('admin'), async (req, res) => {
  const { period, start, end } = req.query;
  try {
    const match = {};
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    }
    if (period === 'today') {
      const d = new Date(); d.setHours(0,0,0,0);
      match.createdAt = { $gte: d };
    } else if (period === 'month') {
      const d = new Date(); d.setDate(1); d.setHours(0,0,0,0);
      match.createdAt = { $gte: d };
    }

    const FINALIZED_STATUSES = ['paid', 'completed'];
    const orders = await Order.find(match).lean();
    const total = orders.reduce((s, o) => s + (o.total_price || 0), 0);
    const paid = orders.filter(o => FINALIZED_STATUSES.includes(o.status));
    const revenue = paid.reduce((s, o) => s + (o.total_price || 0), 0);
    const cancelled = orders.filter(o => ['cancelled', 'rejected'].includes(o.status));
    const refunded = orders.filter(o => o.status === 'refunded');

    // التاريخ اليومي للرسم البياني (آخر 7 أيام)
    const dailyHistory = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const end = new Date(d); end.setDate(end.getDate() + 1);
      const dayOrders = await Order.find({ createdAt: { $gte: d, $lt: end } }).lean();
      const dayPaid = dayOrders.filter(o => FINALIZED_STATUSES.includes(o.status));
      const dayRev = dayPaid.reduce((s, o) => s + (o.total_price || 0), 0);
      dailyHistory.push({
        date: d.toISOString().slice(0,10),
        orders: dayPaid.length,
        revenue: dayRev,
        avgValue: dayPaid.length ? (dayRev / dayPaid.length) : 0
      });
    }

    res.json({
      period: period || 'custom',
      totalOrders: orders.length,
      finalizedOrders: paid.length,
      totalRevenue: revenue,
      cancelledOrders: cancelled.length,
      refundedOrders: refunded.length,
      avgOrderValue: paid.length ? (revenue / paid.length) : 0,
      statusBreakdown: {
        pending: orders.filter(o => o.status === 'pending').length,
        ready: orders.filter(o => o.status === 'ready').length,
        served: orders.filter(o => o.status === 'served').length,
        finalized: paid.length,
        cancelled: cancelled.length + refunded.length
      },
      dailyHistory
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تقرير الأصناف الأكثر مبيعاً
router.get('/top-items', authenticateToken, requireRole('admin'), async (req, res) => {
  const { days, start, end } = req.query;
  try {
    const match = {};
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    } else {
      const d = new Date(); d.setDate(d.getDate() - (parseInt(days) || 7));
      match.createdAt = { $gte: d };
    }

    match.status = { $in: ['paid', 'completed'] };
    const orders = await Order.find(match).lean();
    const itemMap = {};
    for (const o of orders) {
      let items = [];
      try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch {}
      for (const i of items) {
        const name = i.name || 'Unknown';
        if (!itemMap[name]) itemMap[name] = { name, name_ar: i.name_ar || '', qty: 0, revenue: 0, count: 0 };
        itemMap[name].qty += i.quantity || 1;
        itemMap[name].revenue += (i.price || 0) * (i.quantity || 1);
        itemMap[name].count += 1;
      }
    }
    const items = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// أداء الكاشير (عدد الورديات والإيرادات والمبيعات)
router.get('/cashiers', authenticateToken, requireRole('admin'), async (req, res) => {
  const { days, start, end } = req.query;
  try {
    const since = start ? new Date(start) : new Date(); 
    if (!start) since.setDate(since.getDate() - (parseInt(days) || 30));
    const until = end ? new Date(end) : new Date();
    const dateFilter = { closedAt: { $gte: since, $lte: until } };
    const orderFilter = { createdAt: { $gte: since, $lte: until } };

    const [shifts, orders] = await Promise.all([
      Shift.find(dateFilter).lean(),
      Order.find(orderFilter).lean()
    ]);

    // تجميع الإحصائيات لكل كاشير
    const byCashier = {};
    for (const s of shifts) {
      if (!byCashier[s.cashierId]) byCashier[s.cashierId] = { cashierId: s.cashierId, cashierName: s.cashierName, shifts: 0, totalRevenue: 0, totalOrders: 0, cashCollected: 0, cardCollected: 0, walletCollected: 0, splitCollected: 0, totalRefunds: 0 };
      byCashier[s.cashierId].shifts += 1;
      byCashier[s.cashierId].totalRevenue += s.totalRevenue || 0;
      byCashier[s.cashierId].totalOrders += s.totalOrders || 0;
      byCashier[s.cashierId].totalRefunds += s.totalRefunds || 0;
      byCashier[s.cashierId].cashCollected += (s.paymentBreakdown && s.paymentBreakdown.cash) || 0;
      byCashier[s.cashierId].cardCollected += (s.paymentBreakdown && s.paymentBreakdown.card) || 0;
      byCashier[s.cashierId].walletCollected += (s.paymentBreakdown && s.paymentBreakdown.wallet) || 0;
      byCashier[s.cashierId].splitCollected += (s.paymentBreakdown && s.paymentBreakdown.split) || 0;
    }

    // إضافة المبيعات من الطلبات المرتبطة بالكاشير (فقط المدفوعة والمكتملة)
    for (const o of orders) {
      if (!o.cashierId || !['paid', 'completed'].includes(o.status)) continue;
      const cid = o.cashierId.toString();
      if (!byCashier[cid]) byCashier[cid] = { cashierId: cid, cashierName: 'كاشير', shifts: 0, totalRevenue: 0, totalOrders: 0, cashCollected: 0, cardCollected: 0, walletCollected: 0, splitCollected: 0, totalRefunds: 0 };
      if (o.paymentMethod === 'cash') byCashier[cid].cashCollected += o.total_price || 0;
      else if (o.paymentMethod === 'card') byCashier[cid].cardCollected += o.total_price || 0;
      else if (o.paymentMethod === 'wallet') byCashier[cid].walletCollected += o.total_price || 0;
      else if (o.paymentMethod === 'split') byCashier[cid].splitCollected += o.total_price || 0;
    }

    res.json(Object.values(byCashier));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// توزيع طرق الدفع (فقط للطلبات المكتملة والمدفوعة)
router.get('/payment-methods', authenticateToken, requireRole('admin'), async (req, res) => {
  const { start, end } = req.query;
  try {
    const match = {};
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    } else {
      const d = new Date(); d.setDate(1); d.setHours(0,0,0,0);
      match.createdAt = { $gte: d };
    }
    match.paymentMethod = { $ne: null, $exists: true };
    match.status = { $in: ['paid', 'completed'] };

    const orders = await Order.find(match).lean();
    const breakdown = { cash: { count: 0, total: 0 }, card: { count: 0, total: 0 }, wallet: { count: 0, total: 0 }, split: { count: 0, total: 0 }, unspecified: { count: 0, total: 0 } };
    for (const o of orders) {
      const pm = o.paymentMethod || 'unspecified';
      if (!breakdown[pm]) breakdown[pm] = { count: 0, total: 0 };
      breakdown[pm].count += 1;
      breakdown[pm].total += o.total_price || 0;
    }
    res.json({ period: { start: match.createdAt?.$gte, end: match.createdAt?.$lte }, breakdown });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// توزيع المبيعات حسب الساعة
router.get('/hourly-sales', authenticateToken, requireRole('admin'), async (req, res) => {
  const { start, end } = req.query;
  try {
    const match = {};
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    } else {
      const d = new Date(); d.setHours(0,0,0,0);
      match.createdAt = { $gte: d };
    }

    const orders = await Order.find(match).lean();
    const hourly = {};
    for (let h = 0; h < 24; h++) hourly[h] = { hour: h, orders: 0, revenue: 0 };
    for (const o of orders) {
      if (!o.createdAt) continue;
      const h = new Date(o.createdAt).getHours();
      hourly[h].orders += 1;
      if (['paid', 'completed'].includes(o.status)) hourly[h].revenue += o.total_price || 0;
    }
    res.json(Object.values(hourly));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// مقارنة المصروفات مقابل الإيرادات
router.get('/expense-vs-revenue', authenticateToken, requireRole('admin'), async (req, res) => {
  const { start, end } = req.query;
  try {
    const now = new Date();
    const s = start ? new Date(start) : new Date(now.getFullYear(), now.getMonth(), 1);
    const e = end ? new Date(end) : now;

    const [orders, expenses, cashMovements] = await Promise.all([
      Order.find({ createdAt: { $gte: s, $lte: e } }).lean(),
      Expense.find({ expenseDate: { $gte: s, $lte: e } }).lean(),
      CashMovement.find({ movementDate: { $gte: s, $lte: e } }).lean()
    ]);

    const paid = orders.filter(o => ['paid', 'completed'].includes(o.status));
    const revenue = paid.reduce((sum, o) => sum + (o.total_price || 0), 0);
    const refunds = orders.filter(o => o.status === 'refunded').reduce((sum, o) => sum + (o.total_price || 0), 0);
    const totalCosts = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const cashIn = cashMovements.filter(m => m.movementType === 'in').reduce((s, m) => s + (m.amount || 0), 0);
    const cashOut = cashMovements.filter(m => m.movementType === 'out').reduce((s, m) => s + (m.amount || 0), 0);
    const netProfit = revenue - totalCosts;
    const daysElapsed = Math.max(1, Math.ceil((e - s) / 86400000));
    const monthlyRunRate = (revenue / daysElapsed) * 30;

    // توزيع التكاليف حسب الفئة
    const costByCategory = expenses.reduce((acc, item) => {
      const key = item.category || 'other';
      acc[key] = (acc[key] || 0) + (item.amount || 0);
      return acc;
    }, {});

    // البيانات اليومية لآخر 30 يوماً
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(e); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const dayOrders = orders.filter(o => { const c = new Date(o.createdAt); return c >= d && c < next; });
      const dayPaid = dayOrders.filter(o => ['paid', 'completed'].includes(o.status));
      const dayExpenses = expenses.filter(ex => { const c = new Date(ex.expenseDate); return c >= d && c < next; });
      days.push({
        date: d.toISOString().slice(0, 10),
        revenue: dayPaid.reduce((sum, o) => sum + (o.total_price || 0), 0),
        costs: dayExpenses.reduce((sum, ex) => sum + (ex.amount || 0), 0),
        orders: dayOrders.length
      });
    }

    res.json({
      period: { start: s, end: e },
      revenue,
      refunds,
      totalCosts,
      costByCategory,
      cashIn,
      cashOut,
      netCashMovement: cashIn - cashOut,
      netProfit,
      monthlyRunRate,
      daily: days
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== إنشاء تقارير PDF =====

// الملخص الشهري (JSON)
router.get('/monthly-summary', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const now = new Date();
    const start = req.query.start ? new Date(req.query.start) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = req.query.end ? new Date(req.query.end) : now;

    const [orders, expenses] = await Promise.all([
      Order.find({ createdAt: { $gte: start, $lte: end } }).lean(),
      Expense.find({ expenseDate: { $gte: start, $lte: end } }).lean()
    ]);

    const paidOrders = orders.filter(o => ['paid', 'completed'].includes(o.status));
    const revenue = paidOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);
    const totalCosts = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netOperatingProfit = revenue - totalCosts;
    const daysElapsed = Math.max(1, Math.ceil((end - start) / 86400000));
    const monthlyRunRate = (revenue / daysElapsed) * 30;

    res.json({
      period: { start: start.toISOString(), end: end.toISOString() },
      ordersCount: orders.length,
      paidOrders: paidOrders.length,
      revenue,
      totalCosts,
      netOperatingProfit,
      monthlyRunRate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تقرير التكاليف
router.get('/costs', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const now = new Date();
    const start = req.query.start ? new Date(req.query.start) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = req.query.end ? new Date(req.query.end) : now;
    const expenses = await Expense.find({ expenseDate: { $gte: start, $lte: end } }).sort({ expenseDate: -1 }).lean();
    const grouped = expenses.reduce((acc, item) => {
      const key = item.category || 'other';
      acc[key] = (acc[key] || 0) + (item.amount || 0);
      return acc;
    }, {});
    res.json({ period: { start, end }, total: expenses.reduce((s, e) => s + (e.amount || 0), 0), breakdown: grouped, items: expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تقرير الحسابات (الإيرادات وحركات الخزينة)
router.get('/accounts', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const now = new Date();
    const start = req.query.start ? new Date(req.query.start) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = req.query.end ? new Date(req.query.end) : now;
    const [orders, movements] = await Promise.all([
      Order.find({ createdAt: { $gte: start, $lte: end } }).lean(),
      CashMovement.find({ movementDate: { $gte: start, $lte: end } }).sort({ movementDate: -1 }).lean()
    ]);
    const paidOrders = orders.filter(o => ['paid', 'completed'].includes(o.status));
    const refunds = orders.filter(o => o.status === 'refunded');
    const inflow = movements.filter(m => m.movementType === 'in').reduce((s, m) => s + (m.amount || 0), 0);
    const outflow = movements.filter(m => m.movementType === 'out').reduce((s, m) => s + (m.amount || 0), 0);

    res.json({
      period: { start, end },
      salesRevenue: paidOrders.reduce((s, o) => s + (o.total_price || 0), 0),
      refunds: refunds.reduce((s, o) => s + (o.total_price || 0), 0),
      cashIn: inflow,
      cashOut: outflow,
      netCashMovement: inflow - outflow,
      movementItems: movements
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إنشاء تقرير PDF كامل مع جميع التفاصيل ودعم اللغة العربية
router.get('/pdf', authenticateToken, requireRole('admin'), async (req, res) => {
  const { period, start, end } = req.query;
  try {
    const fs = require('fs');
    const path = require('path');

    // توقيت القاهرة للأنشطة التجارية
    const now = new Date();
    const cairoOffsetMs = 2 * 60 * 60 * 1000;
    const cairoNow = new Date(now.getTime() + cairoOffsetMs);
    const cairoYear = cairoNow.getUTCFullYear();
    const cairoMonth = cairoNow.getUTCMonth();
    const cairoDate = cairoNow.getUTCDate();

    const getCairoDayStart = (y, m, d) => new Date(Date.UTC(y, m, d, 0, 0, 0) - cairoOffsetMs);
    const getCairoDayEnd = (y, m, d) => new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - cairoOffsetMs);

    let startDate, endDate, periodLabel;

    if (start || end) {
      startDate = start ? new Date(start) : new Date(0);
      endDate = end ? new Date(end) : getCairoDayEnd(cairoYear, cairoMonth, cairoDate);
      if (endDate.getHours() === 0 && endDate.getMinutes() === 0) endDate.setHours(23, 59, 59, 999);
      periodLabel = `مخصص (${start || ''} إلى ${end || ''})`;
    } else if (period === 'yesterday') {
      startDate = getCairoDayStart(cairoYear, cairoMonth, cairoDate - 1);
      endDate = getCairoDayEnd(cairoYear, cairoMonth, cairoDate - 1);
      periodLabel = 'أمس';
    } else if (period === 'week') {
      startDate = getCairoDayStart(cairoYear, cairoMonth, cairoDate - 6);
      endDate = getCairoDayEnd(cairoYear, cairoMonth, cairoDate);
      periodLabel = 'آخر 7 أيام';
    } else if (period === 'last_week') {
      startDate = getCairoDayStart(cairoYear, cairoMonth, cairoDate - 13);
      endDate = getCairoDayEnd(cairoYear, cairoMonth, cairoDate - 7);
      periodLabel = 'الأسبوع الماضي';
    } else if (period === 'month') {
      startDate = getCairoDayStart(cairoYear, cairoMonth, 1);
      endDate = getCairoDayEnd(cairoYear, cairoMonth, cairoDate);
      periodLabel = 'هذا الشهر';
    } else if (period === 'last_month') {
      startDate = getCairoDayStart(cairoYear, cairoMonth - 1, 1);
      const lastDayOfPrevMonth = new Date(Date.UTC(cairoYear, cairoMonth, 0)).getUTCDate();
      endDate = getCairoDayEnd(cairoYear, cairoMonth - 1, lastDayOfPrevMonth);
      periodLabel = 'الشهر الماضي';
    } else if (period === 'all') {
      startDate = new Date(0);
      endDate = getCairoDayEnd(cairoYear, cairoMonth, cairoDate);
      periodLabel = 'جميع الفترات';
    } else {
      // Default: today
      startDate = getCairoDayStart(cairoYear, cairoMonth, cairoDate);
      endDate = getCairoDayEnd(cairoYear, cairoMonth, cairoDate);
      periodLabel = 'اليوم';
    }

    const match = { createdAt: { $gte: startDate, $lte: endDate } };

    const orders = await Order.find(match).sort({ createdAt: -1 }).populate('userId', 'name phone').lean();
    const [shifts, expenses, cashMovements] = await Promise.all([
      Shift.find({ $or: [
        { closedAt: { $gte: startDate, $lte: endDate } },
        { status: 'open', openedAt: { $gte: startDate, $lte: endDate } }
      ] }).lean(),
      Expense.find({ expenseDate: { $gte: startDate, $lte: endDate } }).lean(),
      CashMovement.find({ movementDate: { $gte: startDate, $lte: endDate } }).lean()
    ]);

    const paid = orders.filter(o => ['paid', 'completed'].includes(o.status));
    const revenue = paid.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const refundsTotal = orders.filter(o => o.status === 'refunded').reduce((s, o) => s + (Number(o.total_price) || 0), 0);
    const totalCosts = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const cashIn = cashMovements.filter(m => m.movementType === 'in').reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const cashOut = cashMovements.filter(m => m.movementType === 'out').reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const netOperating = revenue - totalCosts;

    // توزيع طرق الدفع
    const pmBreakdown = { cash: 0, card: 0, wallet: 0, split: 0 };
    for (const o of paid) {
      const pm = (o.paymentMethod || 'cash').toLowerCase();
      if (pm === 'card' || pm === 'visa') pmBreakdown.card += Number(o.total_price) || 0;
      else if (pm === 'wallet') pmBreakdown.wallet += Number(o.total_price) || 0;
      else if (pm === 'split') pmBreakdown.split += Number(o.total_price) || 0;
      else pmBreakdown.cash += Number(o.total_price) || 0;
    }

    // توزيع التكاليف حسب الفئة
    const costCategories = {};
    for (const e of expenses) {
      const cat = e.category || 'عام';
      costCategories[cat] = (costCategories[cat] || 0) + (Number(e.amount) || 0);
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="2M-Cafe-Report-${new Date().toISOString().slice(0,10)}.pdf"`);
    doc.pipe(res);

    // تسجيل الخطوط العربية المتوفرة محلياً
    const tajawalPath = path.join(__dirname, '../fonts/Tajawal-Regular.ttf');
    const tajawalBoldPath = path.join(__dirname, '../fonts/Tajawal-Bold.ttf');
    const hasTajawal = fs.existsSync(tajawalPath) && fs.existsSync(tajawalBoldPath);

    if (hasTajawal) {
      doc.registerFont('Tajawal', tajawalPath);
      doc.registerFont('Tajawal-Bold', tajawalBoldPath);
    }

    const fontRegular = hasTajawal ? 'Tajawal' : 'Helvetica';
    const fontBold = hasTajawal ? 'Tajawal-Bold' : 'Helvetica-Bold';

    // الصفحة 1: رأس التقرير + الملخص المالي + طرق الدفع
    const logoPath = path.join(__dirname, '../frontend/imgs/2m-logo.png');
    if (fs.existsSync(logoPath)) {
      try { doc.image(logoPath, 470, 35, { width: 65 }); } catch (_) {}
    }

    doc.fontSize(22).font(fontBold).fillColor('#1a1a1a').text('2M CAFE — TWO MILLION CAFE', 40, 40);
    doc.fontSize(12).font(fontRegular).fillColor('#c29f43').text(`تقرير المبيعات والعمليات التشغيلية (نظام الكاشير)`, 40, 68);
    doc.fontSize(9).font(fontRegular).fillColor('#666').text(`الفترة: ${periodLabel} | تاريخ الاستخراج: ${new Date().toLocaleString('ar-EG')} بتوقيت القاهرة`, 40, 86);

    doc.moveTo(40, 105).lineTo(540, 105).strokeColor('#e2e8f0').stroke();

    // الملخص المالي
    doc.fillColor('#1a1a1a').fontSize(14).font(fontBold).text('الملخص المالي والتشغيلي (Financial Summary)', 40, 118);
    doc.fontSize(10).font(fontRegular).fillColor('#333');
    const sY = 140;

    doc.text(`إجمالي المبيعات: ${revenue.toLocaleString('ar-EG')} ج.م`, 40, sY);
    doc.text(`إجمالي عدد الفواتير: ${orders.length}`, 40, sY + 20);
    doc.text(`الطلبات المدفوعة: ${paid.length}`, 40, sY + 40);
    doc.text(`المصروفات التشغيلية: ${totalCosts.toLocaleString('ar-EG')} ج.م`, 40, sY + 60);

    const avgVal = orders.length ? (revenue / orders.length) : 0;
    doc.text(`متوسط قيمة الفاتورة: ${avgVal.toFixed(2)} ج.م`, 300, sY);
    doc.text(`الطلبات الملغاة: ${orders.filter(o => o.status === 'cancelled').length}`, 300, sY + 20);
    doc.text(`المبالغ المستردة: ${refundsTotal.toLocaleString('ar-EG')} ج.م`, 300, sY + 40);
    doc.font(fontBold).fillColor('#16a34a').text(`صافي أرباح التشغيل: ${netOperating.toLocaleString('ar-EG')} ج.م`, 300, sY + 60);

    // تفصيل طرق الدفع
    let yPos = sY + 95;
    doc.fillColor('#1a1a1a').fontSize(13).font(fontBold).text('توزيع طرق الدفع (Payment Breakdown)', 40, yPos);
    yPos += 20;

    doc.fontSize(9).font(fontBold).fillColor('#475569');
    doc.text('طريقة الدفع', 40, yPos);
    doc.text('المبلغ الإجمالي', 420, yPos, { width: 100, align: 'right' });
    yPos += 14;
    doc.moveTo(40, yPos).lineTo(540, yPos).strokeColor('#cbd5e1').stroke();
    yPos += 8;

    doc.fontSize(9).font(fontRegular).fillColor('#1e293b');
    const pmLabels = [
      { key: 'cash', ar: 'نقدي (كاش)' },
      { key: 'card', ar: 'بطاقة إلكترونية / فيزا' },
      { key: 'wallet', ar: 'محفظة ذكية (فودافون كاش / انستاباي)' },
      { key: 'split', ar: 'دفع مجزأ' }
    ];

    for (const item of pmLabels) {
      const amt = pmBreakdown[item.key] || 0;
      doc.text(item.ar, 40, yPos);
      doc.text(`${amt.toLocaleString('ar-EG')} ج.م`, 420, yPos, { width: 100, align: 'right' });
      yPos += 18;
    }

    // تفصيل الورديات
    yPos += 15;
    doc.fillColor('#1a1a1a').fontSize(13).font(fontBold).text('تقارير الورديات والكاشير (Shift Reports)', 40, yPos);
    yPos += 20;

    doc.fontSize(9).font(fontBold).fillColor('#475569');
    doc.text('اسم الكاشير', 40, yPos);
    doc.text('الحالة', 160, yPos);
    doc.text('الطلبات', 240, yPos);
    doc.text('الإيراد الإجمالي', 340, yPos);
    doc.text('الرصيد الافتتاحي', 440, yPos, { width: 80, align: 'right' });
    yPos += 14;
    doc.moveTo(40, yPos).lineTo(540, yPos).strokeColor('#cbd5e1').stroke();
    yPos += 8;

    doc.fontSize(9).font(fontRegular).fillColor('#1e293b');
    if (shifts.length === 0) {
      doc.text('لا توجد ورديات مسجلة خلال هذه الفترة', 40, yPos);
      yPos += 18;
    } else {
      for (const s of shifts.slice(0, 15)) {
        if (yPos > 740) { doc.addPage(); yPos = 40; }
        doc.text(s.cashierName || 'كاشير', 40, yPos, { width: 110 });
        doc.text(s.status === 'open' ? 'نشطة (مفتوحة)' : 'مقفلة', 160, yPos);
        doc.text(String(s.totalOrders || 0), 240, yPos);
        doc.text(`${(s.totalRevenue || 0).toLocaleString('ar-EG')} ج.م`, 340, yPos);
        doc.text(`${(s.openingBalance || 0).toLocaleString('ar-EG')} ج.م`, 440, yPos, { width: 80, align: 'right' });
        yPos += 18;
      }
    }

    // الصفحة 2: الأصناف الأكثر مبيعاً وقائمة المصروفات
    doc.addPage();
    yPos = 40;

    // الأصناف الأكثر مبيعاً
    const itemMap = {};
    for (const o of orders) {
      let items = [];
      try { items = Array.isArray(o.items) ? o.items : JSON.parse(o.items || '[]'); } catch (_) {}
      for (const i of items) {
        const name = i.name || i.name_ar || 'صنف غير مسمى';
        if (!itemMap[name]) itemMap[name] = { name, qty: 0, revenue: 0 };
        const q = Number(i.quantity) || 1;
        const p = Number(i.price) || 0;
        itemMap[name].qty += q;
        itemMap[name].revenue += p * q;
      }
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 15);

    doc.fillColor('#1a1a1a').fontSize(14).font(fontBold).text('الأصناف الأكثر طلباً ومبيعاً (Top Sold Items)', 40, yPos);
    yPos += 20;

    doc.fontSize(9).font(fontBold).fillColor('#475569');
    doc.text('الصنف', 40, yPos);
    doc.text('الكمية', 340, yPos);
    doc.text('إجمالي القيمة', 420, yPos, { width: 100, align: 'right' });
    yPos += 14;
    doc.moveTo(40, yPos).lineTo(540, yPos).strokeColor('#cbd5e1').stroke();
    yPos += 8;

    doc.fontSize(9).font(fontRegular).fillColor('#1e293b');
    if (topItems.length === 0) {
      doc.text('لا توجد مبيعات أصناف مسجلة في هذه الفترة', 40, yPos);
      yPos += 18;
    } else {
      for (const item of topItems) {
        doc.text(item.name, 40, yPos, { width: 280 });
        doc.text(String(item.qty), 340, yPos);
        doc.text(`${item.revenue.toLocaleString('ar-EG')} ج.م`, 420, yPos, { width: 100, align: 'right' });
        yPos += 18;
      }
    }

    // تفصيل المصروفات والتكاليف
    yPos += 25;
    if (yPos > 680) { doc.addPage(); yPos = 40; }

    doc.fillColor('#1a1a1a').fontSize(14).font(fontBold).text('تفاصيل المصروفات التشغيلية (Expenses Breakdown)', 40, yPos);
    yPos += 20;

    doc.fontSize(9).font(fontBold).fillColor('#475569');
    doc.text('بيان المصروف', 40, yPos);
    doc.text('التصنيف', 240, yPos);
    doc.text('التاريخ', 340, yPos);
    doc.text('المبلغ', 440, yPos, { width: 80, align: 'right' });
    yPos += 14;
    doc.moveTo(40, yPos).lineTo(540, yPos).strokeColor('#cbd5e1').stroke();
    yPos += 8;

    doc.fontSize(9).font(fontRegular).fillColor('#1e293b');
    if (expenses.length === 0) {
      doc.text('لا توجد مصروفات مسجلة خلال هذه الفترة', 40, yPos);
      yPos += 18;
    } else {
      for (const exp of expenses.slice(0, 20)) {
        if (yPos > 740) { doc.addPage(); yPos = 40; }
        doc.text(exp.title || 'مصروف', 40, yPos, { width: 190 });
        doc.text(exp.category || 'عام', 240, yPos);
        doc.text(exp.expenseDate ? new Date(exp.expenseDate).toLocaleDateString('ar-EG') : '—', 340, yPos);
        doc.text(`${(exp.amount || 0).toLocaleString('ar-EG')} ج.م`, 440, yPos, { width: 80, align: 'right' });
        yPos += 18;
      }
    }

    // تذييل الصفحة الأخير
    doc.fontSize(8).font(fontRegular).fillColor('#94a3b8').text('تم استخراج هذا التقرير تلقائياً من نظام 2M CAFE السحابي — جميع السجلات والبيانات موثقة من نظام نقاط البيع (POS).', 40, 770, { align: 'center', width: 500 });

    doc.end();
  } catch (err) {
    console.error('[PDF Export Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'فشل استخراج تقرير PDF: ' + err.message });
    }
  }
});

// ===== تقرير ربحية المنتجات =====
router.get('/profitability', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = { status: { $in: ['paid', 'completed'] } };
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    }
    const orders = await Order.find(match).populate('items.drinkId').lean();
    const Recipe = require('../models/Recipe');
    const RecipeItem = require('../models/RecipeItem');
    const Ingredient = require('../models/Ingredient');
    const recipes = await Recipe.find({ isActive: true }).lean();
    const recipeItems = await RecipeItem.find({ recipeId: { $in: recipes.map(r => r._id) } }).populate('ingredientId', 'unitCost').lean();
    const costMap = {};
    recipeItems.forEach(ri => {
      if (!costMap[ri.recipeId]) costMap[ri.recipeId] = 0;
      if (ri.ingredientId) costMap[ri.recipeId] += (ri.quantity || 0) * (ri.ingredientId.unitCost || 0);
    });
    const recipeDrinkMap = {};
    recipes.forEach(r => { recipeDrinkMap[String(r.drinkId)] = { recipeId: r._id, cost: costMap[r._id] || 0, yield: r.yield || 1 }; });
    const drinkSales = {};
    orders.forEach(o => {
      (o.items || []).forEach(item => {
        if (!item.drinkId) return;
        const id = String(item.drinkId._id || item.drinkId);
        if (!drinkSales[id]) drinkSales[id] = { drinkId: id, name: item.drinkId.name_ar || item.drinkId.name, name_en: item.drinkId.name, qty: 0, revenue: 0, cost: 0 };
        drinkSales[id].qty += item.qty || 1;
        drinkSales[id].revenue += (item.qty || 1) * (item.price || 0);
        const rd = recipeDrinkMap[id];
        if (rd) drinkSales[id].cost += ((item.qty || 1) * rd.cost / rd.yield);
      });
    });
    const result = Object.values(drinkSales).map(d => ({
      ...d, profit: d.revenue - d.cost, margin: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue * 100).toFixed(1) : 0
    })).sort((a, b) => b.profit - a.profit);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== تقرير استهلاك الخامات =====
router.get('/consumption', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = {};
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    }
    match.type = { $in: ['consumption', 'waste'] };
    const transactions = await InventoryTransaction.find(match).populate('ingredientId', 'name name_ar unit').sort({ createdAt: -1 }).limit(500);
    const grouped = {};
    transactions.forEach(tx => {
      if (!tx.ingredientId) return;
      const id = String(tx.ingredientId._id);
      if (!grouped[id]) grouped[id] = { ingredient: tx.ingredientId, totalConsumed: 0, totalWasted: 0, totalCost: 0 };
      if (tx.type === 'waste') grouped[id].totalWasted += Math.abs(tx.quantity);
      else grouped[id].totalConsumed += Math.abs(tx.quantity);
      grouped[id].totalCost += Math.abs(tx.totalCost || 0);
    });
    res.json(Object.values(grouped).sort((a, b) => b.totalCost - a.totalCost));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== تقرير الهدر =====
router.get('/waste', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = { type: 'waste' };
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    }
    const wasteLogs = await InventoryTransaction.find(match).populate('ingredientId', 'name name_ar unit').populate('performedBy', 'name').sort({ createdAt: -1 }).limit(200);
    const totalWasteCost = wasteLogs.reduce((s, w) => s + Math.abs(w.totalCost || 0), 0);
    res.json({ wasteLogs, totalWasteCost, count: wasteLogs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== تحليل التكاليف (تكلفة الوصفة مقابل سعر البيع) =====
router.get('/cost-analysis', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const Recipe = require('../models/Recipe');
    const RecipeItem = require('../models/RecipeItem');
    const Drink = require('../models/Drink');
    const recipes = await Recipe.find({ isActive: true, drinkId: { $ne: null } }).lean();
    const items = await RecipeItem.find({ recipeId: { $in: recipes.map(r => r._id) } }).populate('ingredientId', 'name name_ar unit unitCost').lean();
    const itemMap = {};
    items.forEach(i => {
      if (!itemMap[i.recipeId]) itemMap[i.recipeId] = [];
      itemMap[i.recipeId].push(i);
    });
    const drinks = await Drink.find({ is_available: 1 }).lean();
    const drinkPriceMap = {};
    drinks.forEach(d => { drinkPriceMap[d._id] = d.price; });
    const result = recipes.map(r => {
      const recipeItems = itemMap[r._id] || [];
      let totalCost = 0;
      recipeItems.forEach(ri => { if (ri.ingredientId) totalCost += ri.quantity * ri.ingredientId.unitCost; });
      const unitCost = r.yield > 0 ? totalCost / r.yield : totalCost;
      const sellPrice = drinkPriceMap[r.drinkId] || 0;
      return {
        recipeId: r._id,
        recipeName: r.name,
        drinkId: r.drinkId,
        yield: r.yield || 1,
        totalCost,
        unitCost,
        sellPrice,
        profit: sellPrice - unitCost,
        margin: sellPrice > 0 ? ((sellPrice - unitCost) / sellPrice * 100).toFixed(1) : 0,
        items: recipeItems
      };
    }).sort((a, b) => a.margin - b.margin);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== مركز التقارير والـ PDF الشامل (12 تقرير متوافق مع نظام POS) =====
const reportEngine = require('../services/reportEngine');

// 1. جلب بيانات التقرير بتنسيق JSON للعرض في لوحة التحكم
router.get('/engine/data', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const reportType = req.query.reportType || req.query.type || 'sales';
    const reportData = await reportEngine.getReportData(reportType, req.query);
    res.json({ success: true, ...reportData, data: reportData });
  } catch (err) {
    console.error('[Report Engine Data Error]:', err);
    res.status(500).json({ error: 'فشل تحميل بيانات التقرير: ' + err.message });
  }
});

// 2. تصدير وتنزيل ملف PDF موثق مع دعم كامل للغة العربية وتصميم A4 احترافي
router.get('/engine/pdf', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const reportType = req.query.reportType || req.query.type || 'sales';
    const reportData = await reportEngine.getReportData(reportType, req.query);

    const doc = reportEngine.generateReportPdfStream(reportData);
    const filename = `2M-Report-${reportType}-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error('[Report Engine PDF Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'فشل استخراج ملف PDF: ' + err.message });
    }
  }
});

module.exports = router;
