// ===== مسار الورديات - فتح وإغلاق ومراجعة ورديات الكاشير =====
const express = require('express');
const router = express.Router();
const Shift = require('../models/Shift');
const Order = require('../models/Order');
const CashMovement = require('../models/CashMovement');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const { blockPosMutation } = require('../middlewares/posReadOnlyGuard');

// فتح وردية جديدة للكاشير — محظور من موقع الويب، الورديات تُفتح حصراً على جهاز الكاشير
router.post('/open', authenticateToken, blockPosMutation('فتح وردية كاشير'));

// إغلاق الوردية — محظور من موقع الويب، الورديات تُغلق حصراً على جهاز الكاشير
router.post('/close/:id', authenticateToken, blockPosMutation('إغلاق وردية كاشير'));

// جلب الوردية النشطة الحالية للكاشير
router.get('/active', authenticateToken, requireRole('cashier'), async (req, res) => {
  try {
    const shift = await Shift.findOne({ cashierId: req.user._id, status: 'open' });
    res.json({ shift });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب قائمة الورديات (الأدمن يرى الكل، الكاشير يرى وردياته فقط)
router.get('/', authenticateToken, requireRole('cashier'), async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { cashierId: req.user._id };
    const shifts = await Shift.find(filter).sort({ openedAt: -1 }).limit(50).lean();
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب وردية محددة مع تفاصيل الطلبات المرتبطة بها
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

// حذف وردية — محظور تماماً من موقع الويب للحفاظ على النزاهة المحاسبية لنظام الكاشير
router.delete('/:id', authenticateToken, blockPosMutation('حذف وردية كاشير'));

module.exports = router;
