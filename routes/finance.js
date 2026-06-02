const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const CashMovement = require('../models/CashMovement');
const { authenticateToken, requireRole } = require('../middlewares/auth');

function buildDateFilter(start, end, fieldName) {
  if (!start && !end) return {};
  const filter = {};
  filter[fieldName] = {};
  if (start) filter[fieldName].$gte = new Date(start);
  if (end) filter[fieldName].$lte = new Date(end);
  return filter;
}

router.get('/expenses', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { start, end, category, limit = 100 } = req.query;
    const query = { ...buildDateFilter(start, end, 'expenseDate') };
    if (category) query.category = category;
    const rows = await Expense.find(query).sort({ expenseDate: -1 }).limit(parseInt(limit, 10)).lean();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/expenses', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { title, category, amount, expenseDate, paymentMethod, shiftId, notes } = req.body;
    if (!title || amount === undefined) return res.status(400).json({ error: 'title and amount are required' });
    const created = await Expense.create({
      title,
      category: category || 'other',
      amount: parseFloat(amount) || 0,
      expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      paymentMethod: paymentMethod || 'cash',
      shiftId: shiftId || null,
      notes: notes || '',
      createdBy: req.user._id
    });
    res.json({ success: true, expense: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/cash-movements', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { start, end, shiftId, limit = 100 } = req.query;
    const query = { ...buildDateFilter(start, end, 'movementDate') };
    if (shiftId) query.shiftId = shiftId;
    const rows = await CashMovement.find(query).sort({ movementDate: -1 }).limit(parseInt(limit, 10)).lean();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cash-movements', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { movementType, amount, reason, shiftId, movementDate, notes } = req.body;
    if (!movementType || amount === undefined || !reason) {
      return res.status(400).json({ error: 'movementType, amount and reason are required' });
    }
    const created = await CashMovement.create({
      movementType,
      amount: parseFloat(amount) || 0,
      reason,
      shiftId: shiftId || null,
      movementDate: movementDate ? new Date(movementDate) : new Date(),
      notes: notes || '',
      createdBy: req.user._id
    });
    res.json({ success: true, movement: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin delete expense
router.delete('/expenses/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const item = await Expense.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Expense not found' });
    await item.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin delete cash movement
router.delete('/cash-movements/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const item = await CashMovement.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Cash movement not found' });
    await item.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
