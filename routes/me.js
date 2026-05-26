const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const PointsLog = require('../models/PointsLog');
const { authenticateToken } = require('../middlewares/auth');

// Customer's Personal Order History (GET /api/me/orders)
router.get('/orders', authenticateToken, async (req, res) => {
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

// Customer's Points Log (GET /api/me/points)
router.get('/points', authenticateToken, async (req, res) => {
  try {
    const logs = await PointsLog.find({ userId: req.user._id }).sort({ created_at: -1 });

    res.json({
      points: req.user.points,
      total_spent: parseFloat(req.user.total_spent),
      log: logs.map(l => ({
        id: l._id,
        user_id: l.userId,
        points: l.points,
        reason: l.reason,
        order_id: l.orderId,
        created_at: l.created_at.toISOString()
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
