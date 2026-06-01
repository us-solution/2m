const express = require('express');
const router = express.Router();
const Shift = require('../models/Shift');
const Order = require('../models/Order');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// Open a new shift
router.post('/open', authenticateToken, requireRole('cashier'), async (req, res) => {
  const { openingBalance, notes } = req.body;
  try {
    const active = await Shift.findOne({ cashierId: req.user._id, status: 'open' });
    if (active) {
      return res.status(400).json({ error: 'You already have an open shift' });
    }
    const shift = await Shift.create({
      cashierId: req.user._id,
      cashierName: req.user.name || 'Cashier',
      openingBalance: parseFloat(openingBalance) || 0,
      notes: notes || '',
      status: 'open'
    });
    res.json({ success: true, shift });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Close shift
router.post('/close/:id', authenticateToken, requireRole('cashier'), async (req, res) => {
  const { closingBalance, notes } = req.body;
  try {
    const shift = await Shift.findOne({ _id: req.params.id, cashierId: req.user._id, status: 'open' });
    if (!shift) return res.status(404).json({ error: 'Open shift not found' });

    // Calculate expected balance = opening + cash payments - refunds
    const cashPayments = await Order.aggregate([
      { $match: { shiftId: shift._id, paymentMethod: 'cash', status: { $nin: ['cancelled', 'refunded'] } } },
      { $group: { _id: null, total: { $sum: '$total_price' } } }
    ]);
    const cashIn = (cashPayments[0] && cashPayments[0].total) || 0;

    const refunds = await Order.aggregate([
      { $match: { shiftId: shift._id, status: 'refunded' } },
      { $group: { _id: null, total: { $sum: '$total_price' } } }
    ]);
    const refundTotal = (refunds[0] && refunds[0].total) || 0;

    const expected = shift.openingBalance + cashIn - refundTotal;
    const actual = parseFloat(closingBalance) || 0;
    const variance = actual - expected;

    // Get totals
    const orderStats = await Order.aggregate([
      { $match: { shiftId: shift._id } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: {
            $sum: { $cond: [{ $in: ['$status', ['cancelled', 'refunded']] }, 0, '$total_price'] }
          },
          refunds: {
            $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, '$total_price', 0] }
          }
        }
      }
    ]);
    const stats = orderStats[0] || { count: 0, revenue: 0, refunds: 0 };

    // Payment breakdown
    const paymentBreakdown = await Order.aggregate([
      { $match: { shiftId: shift._id, status: { $nin: ['cancelled', 'refunded'] }, paymentMethod: { $ne: null } } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$total_price' } } }
    ]);
    const breakdown = { cash: 0, card: 0, wallet: 0, split: 0 };
    paymentBreakdown.forEach(p => { if (p._id) breakdown[p._id] = p.total; });

    shift.closingBalance = actual;
    shift.expectedBalance = expected;
    shift.variance = variance;
    shift.closedAt = new Date();
    shift.notes = notes || shift.notes;
    shift.status = 'closed';
    shift.totalOrders = stats.count;
    shift.totalRevenue = stats.revenue;
    shift.totalRefunds = stats.refunds;
    shift.paymentBreakdown = breakdown;
    await shift.save();

    res.json({ success: true, shift });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get my active shift
router.get('/active', authenticateToken, requireRole('cashier'), async (req, res) => {
  try {
    const shift = await Shift.findOne({ cashierId: req.user._id, status: 'open' });
    res.json({ shift });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List shifts (admin sees all, cashier sees own)
router.get('/', authenticateToken, requireRole('cashier'), async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { cashierId: req.user._id };
    const shifts = await Shift.find(filter).sort({ openedAt: -1 }).limit(50).lean();
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single shift with order details
router.get('/:id', authenticateToken, requireRole('cashier'), async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id).lean();
    if (!shift) return res.status(404).json({ error: 'Shift not found' });
    const orders = await Order.find({ shiftId: req.params.id }).sort({ createdAt: -1 }).limit(200).populate('userId', 'name phone').lean();
    res.json({ shift, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
