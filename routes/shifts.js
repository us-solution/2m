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

    // حساب الرصيد المتوقع = الرصيد الافتتاحي + المدفوعات النقدية - المبالغ المستردة
    const cashPayments = await Order.aggregate([
      { $match: { shiftId: shift._id, paymentMethod: 'cash', status: { $nin: ['cancelled', 'refunded'] } } },
      { $group: { _id: null, total: { $sum: '$total_price' } } }
    ]);
    const cashIn = (cashPayments[0] && cashPayments[0].total) || 0;

    // ← مُصلَّح: حساب المدفوعات بالبطاقة والمحفظة بشكل منفصل (لا تُضاف للخزينة النقدية)
    const cardPayments = await Order.aggregate([
      { $match: { shiftId: shift._id, paymentMethod: 'card', status: { $nin: ['cancelled', 'refunded'] } } },
      { $group: { _id: null, total: { $sum: '$total_price' } } }
    ]);
    const cardIn = (cardPayments[0] && cardPayments[0].total) || 0;

    const walletPayments = await Order.aggregate([
      { $match: { shiftId: shift._id, paymentMethod: 'wallet', status: { $nin: ['cancelled', 'refunded'] } } },
      { $group: { _id: null, total: { $sum: '$total_price' } } }
    ]);
    const walletIn = (walletPayments[0] && walletPayments[0].total) || 0;

    const refunds = await Order.aggregate([
      { $match: { shiftId: shift._id, status: 'refunded' } },
      { $group: { _id: null, total: { $sum: '$total_price' } } }
    ]);
    const refundTotal = (refunds[0] && refunds[0].total) || 0;

    // حركات الخزينة الإضافية
    const cashMovements = await CashMovement.aggregate([
      { $match: { shiftId: shift._id } },
      {
        $group: {
          _id: '$movementType',
          total: { $sum: '$amount' }
        }
      }
    ]);
    const extraCashIn = cashMovements.find(m => m._id === 'in')?.total || 0;
    const extraCashOut = cashMovements.find(m => m._id === 'out')?.total || 0;

    // الرصيد المتوقع في الخزينة = افتتاحي + نقدي + حركات إضافية - مردودات نقدية
    // ملاحظة: card و wallet لا تُضاف للخزينة الفعلية لكن تُظهر في الإحصائيات
    const expected = shift.openingBalance + cashIn + extraCashIn - extraCashOut - refundTotal;
    const actual = parseFloat(closingBalance) || 0;
    const variance = actual - expected;

    // إحصائيات الطلبات في الوردية
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

    // توزيع طرق الدفع
    const paymentBreakdown = await Order.aggregate([
      { $match: { shiftId: shift._id, status: { $nin: ['cancelled', 'refunded'] }, paymentMethod: { $ne: null } } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$total_price' } } }
    ]);
    const breakdown = { cash: 0, card: 0, wallet: 0, split: 0 };
    paymentBreakdown.forEach(p => { if (p._id) breakdown[p._id] = p.total; });

    // تحديث الوردية
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
