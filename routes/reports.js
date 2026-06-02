const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const Shift = require('../models/Shift');
const User = require('../models/User');
const Expense = require('../models/Expense');
const CashMovement = require('../models/CashMovement');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// ── Report data endpoints ──

// Sales overview (daily/weekly/monthly)
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

    const orders = await Order.find(match).lean();
    const total = orders.reduce((s, o) => s + (o.total_price || 0), 0);
    const paid = orders.filter(o => !['cancelled','refunded'].includes(o.status));
    const revenue = paid.reduce((s, o) => s + (o.total_price || 0), 0);
    const cancelled = orders.filter(o => o.status === 'cancelled');
    const refunded = orders.filter(o => o.status === 'refunded');

    // Daily history for chart (last 7 days)
    const dailyHistory = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const end = new Date(d); end.setDate(end.getDate() + 1);
      const dayOrders = await Order.find({ createdAt: { $gte: d, $lt: end } }).lean();
      const dayPaid = dayOrders.filter(o => !['cancelled','refunded'].includes(o.status));
      const dayRev = dayPaid.reduce((s, o) => s + (o.total_price || 0), 0);
      dailyHistory.push({
        date: d.toISOString().slice(0,10),
        orders: dayOrders.length,
        revenue: dayRev,
        avgValue: dayOrders.length ? (dayRev / dayOrders.length) : 0
      });
    }

    res.json({
      period: period || 'custom',
      totalOrders: orders.length,
      totalRevenue: revenue,
      cancelledOrders: cancelled.length,
      refundedOrders: refunded.length,
      avgOrderValue: orders.length ? (revenue / orders.length) : 0,
      statusBreakdown: {
        pending: orders.filter(o => o.status === 'pending').length,
        ready: orders.filter(o => o.status === 'ready').length,
        served: orders.filter(o => o.status === 'served').length,
        cancelled: cancelled.length + refunded.length
      },
      dailyHistory
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Top items report
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

// Cashier performance
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

    // Also add cash collected from orders with cashierId
    for (const o of orders) {
      if (!o.cashierId) continue;
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

// Payment methods breakdown
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

// Hourly sales breakdown
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
      if (!['cancelled', 'refunded'].includes(o.status)) hourly[h].revenue += o.total_price || 0;
    }
    res.json(Object.values(hourly));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Expense vs Revenue comparison
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

    const paid = orders.filter(o => !['cancelled', 'refunded'].includes(o.status));
    const revenue = paid.reduce((sum, o) => sum + (o.total_price || 0), 0);
    const refunds = orders.filter(o => o.status === 'refunded').reduce((sum, o) => sum + (o.total_price || 0), 0);
    const totalCosts = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const cashIn = cashMovements.filter(m => m.movementType === 'in').reduce((s, m) => s + (m.amount || 0), 0);
    const cashOut = cashMovements.filter(m => m.movementType === 'out').reduce((s, m) => s + (m.amount || 0), 0);
    const netProfit = revenue - totalCosts;
    const daysElapsed = Math.max(1, Math.ceil((e - s) / 86400000));
    const monthlyRunRate = (revenue / daysElapsed) * 30;

    // Cost breakdown by category
    const costByCategory = expenses.reduce((acc, item) => {
      const key = item.category || 'other';
      acc[key] = (acc[key] || 0) + (item.amount || 0);
      return acc;
    }, {});

    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(e); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const dayOrders = orders.filter(o => { const c = new Date(o.createdAt); return c >= d && c < next; });
      const dayPaid = dayOrders.filter(o => !['cancelled', 'refunded'].includes(o.status));
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

// ── PDF Report Generation ──

router.get('/monthly-summary', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const now = new Date();
    const start = req.query.start ? new Date(req.query.start) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = req.query.end ? new Date(req.query.end) : now;

    const [orders, expenses] = await Promise.all([
      Order.find({ createdAt: { $gte: start, $lte: end } }).lean(),
      Expense.find({ expenseDate: { $gte: start, $lte: end } }).lean()
    ]);

    const paidOrders = orders.filter(o => !['cancelled', 'refunded'].includes(o.status));
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

router.get('/accounts', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const now = new Date();
    const start = req.query.start ? new Date(req.query.start) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = req.query.end ? new Date(req.query.end) : now;
    const [orders, movements] = await Promise.all([
      Order.find({ createdAt: { $gte: start, $lte: end } }).lean(),
      CashMovement.find({ movementDate: { $gte: start, $lte: end } }).sort({ movementDate: -1 }).lean()
    ]);
    const paidOrders = orders.filter(o => !['cancelled', 'refunded'].includes(o.status));
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

router.get('/pdf', authenticateToken, requireRole('admin'), async (req, res) => {
  const { period, start, end } = req.query;
  try {
    const match = {};
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    } else {
      const d = new Date();
      if (period === 'month') { d.setDate(1); d.setHours(0,0,0,0); }
      else if (period === 'week') { d.setDate(d.getDate() - 7); d.setHours(0,0,0,0); }
      else { d.setHours(0,0,0,0); }
      match.createdAt = { $gte: d };
    }
    const periodLabel = period || 'custom';

    const orders = await Order.find(match).sort({ createdAt: -1 }).populate('userId', 'name phone').lean();
    const sinceDate = match.createdAt && match.createdAt.$gte ? match.createdAt.$gte : new Date(0);
    const [shifts, expenses, cashMovements] = await Promise.all([
      Shift.find({ closedAt: { $gte: sinceDate } }).lean(),
      Expense.find({ expenseDate: { $gte: sinceDate } }).lean(),
      CashMovement.find({ movementDate: { $gte: sinceDate } }).lean()
    ]);

    const paid = orders.filter(o => !['cancelled','refunded'].includes(o.status));
    const revenue = paid.reduce((s, o) => s + (o.total_price || 0), 0);
    const refundsTotal = orders.filter(o => o.status === 'refunded').reduce((s, o) => s + (o.total_price || 0), 0);
    const totalCosts = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const cashIn = cashMovements.filter(m => m.movementType === 'in').reduce((s, m) => s + (m.amount || 0), 0);
    const cashOut = cashMovements.filter(m => m.movementType === 'out').reduce((s, m) => s + (m.amount || 0), 0);
    const netOperating = revenue - totalCosts;
    const startRef = match.createdAt && match.createdAt.$gte ? match.createdAt.$gte : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const daysElapsed = Math.max(1, Math.ceil((Date.now() - new Date(startRef).getTime()) / 86400000));
    const monthlyRunRate = (revenue / daysElapsed) * 30;

    // Payment method breakdown
    const pmBreakdown = { cash: 0, card: 0, wallet: 0, split: 0 };
    for (const o of paid) {
      const pm = o.paymentMethod;
      if (pm && pmBreakdown[pm] !== undefined) pmBreakdown[pm] += o.total_price || 0;
    }

    // Hourly sales
    const hourly = {};
    for (let h = 0; h < 24; h++) hourly[h] = { h, orders: 0, revenue: 0 };
    for (const o of orders) {
      if (!o.createdAt) continue;
      const h = new Date(o.createdAt).getHours();
      hourly[h].orders += 1;
      if (!['cancelled', 'refunded'].includes(o.status)) hourly[h].revenue += o.total_price || 0;
    }

    // Cost breakdown by category
    const costCategories = {};
    for (const e of expenses) {
      const cat = e.category || 'other';
      costCategories[cat] = (costCategories[cat] || 0) + (e.amount || 0);
    }

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${new Date().toISOString().slice(0,10)}.pdf"`);
    doc.pipe(res);

    const font = 'Helvetica';
    let pageNum = 0;

    // ── PAGE 1: Header + Summary + Payment Methods ──
    pageNum++;
    doc.fontSize(22).font(`${font}-Bold`).text('OZEL Cafe', 40, 40);
    doc.fontSize(10).font(font).fillColor('#666').text(`Report — ${new Date().toISOString().slice(0,10)} (${periodLabel})`, 40, 68);

    // Summary
    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Summary', 40, 100);
    doc.fontSize(11).font(font).fillColor('#333');
    const sY = 120;
    doc.text(`Total Orders: ${orders.length}`, 40, sY);
    doc.text(`Revenue: EGP ${revenue.toFixed(2)}`, 40, sY + 18);
    doc.text(`Refunds: EGP ${refundsTotal.toFixed(2)}`, 40, sY + 36);
    doc.text(`Avg Order: EGP ${orders.length ? (revenue / orders.length).toFixed(2) : '0.00'}`, 250, sY);
    doc.text(`Cancelled: ${orders.filter(o => o.status === 'cancelled').length}`, 250, sY + 18);
    doc.text(`Paid Orders: ${paid.length}`, 250, sY + 36);
    doc.text(`Costs: EGP ${totalCosts.toFixed(2)}`, 40, sY + 54);
    doc.text(`Net Operating: EGP ${netOperating.toFixed(2)}`, 250, sY + 54);
    doc.text(`Monthly Run-rate: EGP ${monthlyRunRate.toFixed(2)}`, 40, sY + 72);
    doc.text(`Cashbox: In EGP ${cashIn.toFixed(2)} / Out EGP ${cashOut.toFixed(2)}`, 250, sY + 72);

    // Payment Methods
    let yPos = sY + 110;
    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Payment Methods', 40, yPos);
    yPos += 22;
    doc.fontSize(9).font(`${font}-Bold`).fillColor('#555');
    doc.text('Method', 40, yPos); doc.text('Amount', 420, yPos, { width: 100, align: 'right' });
    yPos += 4;
    doc.moveTo(40, yPos).lineTo(520, yPos).strokeColor('#ddd').stroke();
    yPos += 8;
    doc.fontSize(9).font(font).fillColor('#333');
    const pmLabels = { cash: 'Cash', card: 'Card', wallet: 'Wallet', split: 'Split' };
    for (const [key, label] of Object.entries(pmLabels)) {
      const amt = pmBreakdown[key] || 0;
      doc.text(label, 40, yPos);
      doc.text(`EGP ${amt.toFixed(2)}`, 420, yPos, { width: 100, align: 'right' });
      yPos += 16;
    }

    // ── PAGE 2: Top Items + Cashier Performance ──
    doc.addPage();
    yPos = 40;
    pageNum++;

    // Top Items
    const itemMap = {};
    for (const o of orders) {
      let items = [];
      try { items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []); } catch {}
      for (const i of items) {
        const name = i.name || 'Unknown';
        if (!itemMap[name]) itemMap[name] = { name, qty: 0, revenue: 0 };
        itemMap[name].qty += i.quantity || 1;
        itemMap[name].revenue += (i.price || 0) * (i.quantity || 1);
      }
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 15);

    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Top Items', 40, yPos);
    yPos += 22;
    doc.fontSize(9).font(`${font}-Bold`).fillColor('#555');
    doc.text('Item', 40, yPos); doc.text('Qty', 350, yPos); doc.text('Revenue', 420, yPos, { width: 100, align: 'right' });
    yPos += 4;
    doc.moveTo(40, yPos).lineTo(520, yPos).strokeColor('#ddd').stroke();
    yPos += 8;
    doc.fontSize(9).font(font).fillColor('#333');
    for (const item of topItems) {
      doc.text(item.name, 40, yPos, { width: 300 });
      doc.text(String(item.qty), 350, yPos);
      doc.text(`EGP ${item.revenue.toFixed(2)}`, 420, yPos, { width: 100, align: 'right' });
      yPos += 16;
    }

    // Cashier Performance
    yPos += 20;
    if (yPos > 700) { doc.addPage(); yPos = 40; pageNum++; }
    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Cashier Performance', 40, yPos);
    yPos += 22;
    doc.fontSize(9).font(`${font}-Bold`).fillColor('#555');
    doc.text('Cashier', 40, yPos); doc.text('Shifts', 140, yPos); doc.text('Orders', 200, yPos);
    doc.text('Revenue', 280, yPos); doc.text('Cash', 370, yPos);
    yPos += 4;
    doc.moveTo(40, yPos).lineTo(520, yPos).strokeColor('#ddd').stroke();
    yPos += 8;
    doc.fontSize(9).font(font).fillColor('#333');
    for (const s of shifts) {
      if (yPos > 740) { doc.addPage(); yPos = 40; pageNum++; }
      doc.text(s.cashierName || 'Unknown', 40, yPos, { width: 95 });
      doc.text(String(s.totalOrders || 0), 140, yPos);
      doc.text(String(s.totalOrders || 0), 200, yPos);
      doc.text(`EGP ${(s.totalRevenue || 0).toFixed(0)}`, 280, yPos, { width: 85, align: 'right' });
      const cashAmt = (s.paymentBreakdown && s.paymentBreakdown.cash) || 0;
      doc.text(`EGP ${cashAmt.toFixed(0)}`, 370, yPos, { width: 85, align: 'right' });
      yPos += 14;
    }

    // ── PAGE 3: Shifts + Hourly Sales + Cost Breakdown ──
    doc.addPage();
    yPos = 40;
    pageNum++;

    // Shifts
    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Shifts', 40, yPos);
    yPos += 22;
    doc.fontSize(9).font(`${font}-Bold`).fillColor('#555');
    doc.text('Cashier', 40, yPos); doc.text('Period', 130, yPos); doc.text('Orders', 280, yPos); doc.text('Revenue', 340, yPos); doc.text('Cash', 430, yPos);
    yPos += 4;
    doc.moveTo(40, yPos).lineTo(520, yPos).strokeColor('#ddd').stroke();
    yPos += 8;
    doc.fontSize(9).font(font).fillColor('#333');
    for (const s of shifts.slice(0, 25)) {
      if (yPos > 740) { doc.addPage(); yPos = 40; pageNum++; }
      const openDate = s.openedAt ? new Date(s.openedAt).toLocaleDateString() : '—';
      const closeDate = s.closedAt ? new Date(s.closedAt).toLocaleDateString() : 'Open';
      doc.text(s.cashierName || 'Unknown', 40, yPos, { width: 85 });
      doc.text(`${openDate} → ${closeDate}`, 130, yPos, { width: 140 });
      doc.text(String(s.totalOrders || 0), 280, yPos);
      doc.text(`EGP ${(s.totalRevenue || 0).toFixed(0)}`, 340, yPos, { width: 75, align: 'right' });
      const cashAmt = (s.paymentBreakdown && s.paymentBreakdown.cash) || 0;
      doc.text(`EGP ${cashAmt.toFixed(0)}`, 430, yPos, { width: 75, align: 'right' });
      yPos += 14;
    }

    // Hourly Sales
    yPos += 20;
    if (yPos > 700) { doc.addPage(); yPos = 40; pageNum++; }
    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Hourly Sales', 40, yPos);
    yPos += 22;
    doc.fontSize(9).font(`${font}-Bold`).fillColor('#555');
    doc.text('Hour', 40, yPos); doc.text('Orders', 100, yPos); doc.text('Revenue', 420, yPos, { width: 100, align: 'right' });
    yPos += 4;
    doc.moveTo(40, yPos).lineTo(520, yPos).strokeColor('#ddd').stroke();
    yPos += 8;
    doc.fontSize(9).font(font).fillColor('#333');
    // Show only hours with activity
    const activeHours = Object.values(hourly).filter(h => h.orders > 0);
    for (const h of activeHours) {
      if (yPos > 740) { doc.addPage(); yPos = 40; pageNum++; }
      const label = `${String(h.h).padStart(2, '0')}:00`;
      doc.text(label, 40, yPos);
      doc.text(String(h.orders), 100, yPos);
      doc.text(`EGP ${h.revenue.toFixed(2)}`, 420, yPos, { width: 100, align: 'right' });
      yPos += 14;
    }

    // Cost Breakdown
    yPos += 20;
    if (yPos > 700) { doc.addPage(); yPos = 40; pageNum++; }
    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Cost Breakdown', 40, yPos);
    yPos += 22;
    doc.fontSize(9).font(`${font}-Bold`).fillColor('#555');
    doc.text('Category', 40, yPos); doc.text('Amount', 420, yPos, { width: 100, align: 'right' });
    yPos += 4;
    doc.moveTo(40, yPos).lineTo(520, yPos).strokeColor('#ddd').stroke();
    yPos += 8;
    doc.fontSize(9).font(font).fillColor('#333');
    const catEntries = Object.entries(costCategories).sort((a, b) => b[1] - a[1]);
    for (const [cat, amt] of catEntries) {
      if (yPos > 740) { doc.addPage(); yPos = 40; pageNum++; }
      doc.text(cat, 40, yPos, { width: 300 });
      doc.text(`EGP ${amt.toFixed(2)}`, 420, yPos, { width: 100, align: 'right' });
      yPos += 14;
    }
    doc.text(`Total: EGP ${totalCosts.toFixed(2)}`, 40, yPos + 6, { width: 480, align: 'right' });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Product Profitability Report ──
router.get('/profitability', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = { status: { $nin: ['cancelled', 'refunded'] } };
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

// ── Ingredient Consumption Report ──
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

// ── Waste Report ──
router.get('/waste', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { start, end } = req.query;
    const match = { type: 'waste' };
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = new Date(start);
      if (end) match.createdAt.$lte = new Date(end);
    }
    const wasteLogs = await InventoryTransaction.find(match).populate('ingredientId', 'name name_ar unit').populate('performedBy', 'username').sort({ createdAt: -1 }).limit(200);
    const totalWasteCost = wasteLogs.reduce((s, w) => s + Math.abs(w.totalCost || 0), 0);
    res.json({ wasteLogs, totalWasteCost, count: wasteLogs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cost Analysis (recipe cost vs selling price) ──
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
    const drinks = await Drink.find({ isAvailable: true }).lean();
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

module.exports = router;
