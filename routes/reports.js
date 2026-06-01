const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Order = require('../models/Order');
const Shift = require('../models/Shift');
const User = require('../models/User');
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
  const { days } = req.query;
  try {
    const since = new Date(); since.setDate(since.getDate() - (parseInt(days) || 30));
    const shifts = await Shift.find({ closedAt: { $gte: since } }).lean();
    const byCashier = {};
    for (const s of shifts) {
      if (!byCashier[s.cashierId]) byCashier[s.cashierId] = { cashierId: s.cashierId, cashierName: s.cashierName, shifts: 0, totalRevenue: 0, totalOrders: 0 };
      byCashier[s.cashierId].shifts += 1;
      byCashier[s.cashierId].totalRevenue += s.totalRevenue || 0;
      byCashier[s.cashierId].totalOrders += s.totalOrders || 0;
    }
    res.json(Object.values(byCashier));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PDF Report Generation ──

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

    const orders = await Order.find(match).sort({ createdAt: -1 }).populate('userId', 'name phone').lean();
    const shifts = await Shift.find({ closedAt: { $gte: match.createdAt.$gte || new Date(0) } }).lean();

    const paid = orders.filter(o => !['cancelled','refunded'].includes(o.status));
    const revenue = paid.reduce((s, o) => s + (o.total_price || 0), 0);
    const refundsTotal = orders.filter(o => o.status === 'refunded').reduce((s, o) => s + (o.total_price || 0), 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${new Date().toISOString().slice(0,10)}.pdf"`);
    doc.pipe(res);

    // Header
    const font = 'Helvetica';
    doc.fontSize(22).font(`${font}-Bold`).text('OZEL Cafe', 40, 40);
    doc.fontSize(10).font(font).fillColor('#666').text(`Report — ${new Date().toISOString().slice(0,10)}`, 40, 68);

    // Summary
    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Summary', 40, 100);
    doc.fontSize(11).font(font).fillColor('#333');
    const summaryY = 120;
    doc.text(`Total Orders: ${orders.length}`, 40, summaryY);
    doc.text(`Revenue: EGP ${revenue.toFixed(2)}`, 40, summaryY + 18);
    doc.text(`Refunds: EGP ${refundsTotal.toFixed(2)}`, 40, summaryY + 36);
    doc.text(`Avg Order: EGP ${orders.length ? (revenue / orders.length).toFixed(2) : '0.00'}`, 250, summaryY);
    doc.text(`Cancelled: ${orders.filter(o => o.status === 'cancelled').length}`, 250, summaryY + 18);
    doc.text(`Paid Orders: ${paid.length}`, 250, summaryY + 36);

    // Items table
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

    let yPos = summaryY + 80;
    if (yPos + topItems.length * 20 + 60 > 700) { doc.addPage(); yPos = 40; }

    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Top Items', 40, yPos);
    yPos += 24;
    doc.fontSize(9).font(`${font}-Bold`).fillColor('#555');
    doc.text('Item', 40, yPos); doc.text('Qty', 350, yPos); doc.text('Revenue', 420, yPos, { width: 130, align: 'right' });
    yPos += 4;
    doc.moveTo(40, yPos).lineTo(520, yPos).strokeColor('#ddd').stroke();
    yPos += 8;
    doc.fontSize(9).font(font).fillColor('#333');
    for (const item of topItems) {
      if (yPos > 740) { doc.addPage(); yPos = 40; }
      doc.text(item.name, 40, yPos, { width: 300 });
      doc.text(String(item.qty), 350, yPos);
      doc.text(`EGP ${item.revenue.toFixed(2)}`, 420, yPos, { width: 100, align: 'right' });
      yPos += 18;
    }

    // Shifts section
    yPos += 20;
    if (yPos + shifts.length * 24 + 40 > 740) { doc.addPage(); yPos = 40; }
    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Shifts', 40, yPos);
    yPos += 24;
    for (const s of shifts) {
      if (yPos > 740) { doc.addPage(); yPos = 40; }
      const openDate = s.openedAt ? new Date(s.openedAt).toLocaleDateString() : '—';
      const closeDate = s.closedAt ? new Date(s.closedAt).toLocaleDateString() : 'Open';
      doc.fontSize(9).font(font).fillColor('#333');
      doc.text(`${s.cashierName || 'Unknown'} | ${openDate} → ${closeDate}`, 40, yPos);
      doc.text(`Orders: ${s.totalOrders || 0} | Revenue: EGP ${(s.totalRevenue || 0).toFixed(2)}`, 180, yPos, { width: 300 });
      yPos += 20;
    }

    // Recent orders
    yPos += 20;
    if (yPos + 20 > 740) { doc.addPage(); yPos = 40; }
    doc.fillColor('#111').fontSize(14).font(`${font}-Bold`).text('Recent Orders', 40, yPos);
    yPos += 20;
    const recent = orders.slice(0, 30);
    for (const o of recent) {
      if (yPos > 740) { doc.addPage(); yPos = 40; }
      const name = o.userId ? o.userId.name || '' : '';
      const table = o.table_number || '';
      const date = o.createdAt ? new Date(o.createdAt).toLocaleString() : '';
      doc.fontSize(8).font(font).fillColor('#333');
      doc.text(`#${o._id.toString().slice(-6)} | ${table} | ${name} | ${o.status} | EGP ${(o.total_price || 0).toFixed(2)} | ${date}`, 40, yPos, { width: 480 });
      yPos += 14;
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
