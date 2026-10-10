// ===== مسار المالية - إدارة المصروفات وحركات الخزينة وفئات المصروفات =====
const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const CashMovement = require('../models/CashMovement');
const ExpenseCategory = require('../models/ExpenseCategory');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// دالة مساعدة لبناء فلتر التاريخ
function buildDateFilter(start, end, fieldName) {
  if (!start && !end) return {};
  const filter = {};
  filter[fieldName] = {};
  if (start) filter[fieldName].$gte = new Date(start);
  if (end) filter[fieldName].$lte = new Date(end);
  return filter;
}

// جلب قائمة المصروفات (مع إمكانية الفلترة حسب التاريخ والفئة)
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

const { blockPosMutation } = require('../middlewares/posReadOnlyGuard');

// إضافة مصروف جديد — محظور من موقع الويب، المصروفات التشغيلية تُسجل حصراً على جهاز الكاشير
router.post('/expenses', authenticateToken, blockPosMutation('إضافة مصروف تشغيلي'));

// جلب حركات الخزينة (إيداع/سحب نقدي)
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

// إضافة حركة خزينة جديدة — محظور من موقع الويب، حركات الخزينة تتم حصراً على جهاز الكاشير
router.post('/cash-movements', authenticateToken, blockPosMutation('إضافة حركة خزينة'));

// حذف مصروف — محظور من موقع الويب
router.delete('/expenses/:id', authenticateToken, blockPosMutation('حذف مصروف'));

// حذف حركة خزينة — محظور من موقع الويب
router.delete('/cash-movements/:id', authenticateToken, blockPosMutation('حذف حركة خزينة'));

// ===== فئات المصروفات =====

// جلب فئات المصروفات
router.get('/expense-categories', authenticateToken, async (req, res) => {
  try {
    const cats = await ExpenseCategory.find().sort({ name: 1 });
    res.json(cats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// إنشاء فئة مصروفات جديدة
router.post('/expense-categories', requireRole('admin'), async (req, res) => {
  try {
    const { name, name_ar, type } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    const cat = await ExpenseCategory.create({ name, name_ar: name_ar || '', type: type || 'other' });
    res.status(201).json(cat);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// تعديل فئة مصروفات
router.put('/expense-categories/:id', requireRole('admin'), async (req, res) => {
  try {
    const cat = await ExpenseCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cat) return res.status(404).json({ error: 'غير موجود' });
    res.json(cat);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// حذف فئة مصروفات
router.delete('/expense-categories/:id', requireRole('admin'), async (req, res) => {
  try {
    await ExpenseCategory.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
