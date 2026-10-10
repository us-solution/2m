// ===== نموذج Shift - يمثل ورديات عمل الكاشير =====
const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  // معرف الكاشير (يدعم ObjectId أو معرف نصي/رقمي من الـ POS)
  cashierId: { type: mongoose.Schema.Types.Mixed, default: null },
  // معرف الوردية في نظام POS المحلي
  posShiftId: { type: Number, index: true, sparse: true },
  // اسم الكاشير
  cashierName: { type: String, default: '' },
  // معرف الفرع
  branchId: { type: String, default: 'main' },
  // حالة الوردية (مفتوحة، مغلقة، ملغية)
  status: { type: String, enum: ['open', 'closed', 'cancelled'], default: 'open' },

  // رصيد الافتتاح
  openingBalance: { type: Number, default: 0 },
  // رصيد الإغلاق
  closingBalance: { type: Number, default: 0 },
  // الرصيد المتوقع
  expectedBalance: { type: Number, default: 0 },
  // الفرق بين المتوقع والفعلي
  variance: { type: Number, default: 0 },

  // وقت الافتتاح
  openedAt: { type: Date, default: Date.now },
  // وقت الإغلاق
  closedAt: { type: Date },
  // ملاحظات الوردية
  notes: { type: String, default: '' },

  // إجمالي عدد الطلبات
  totalOrders: { type: Number, default: 0 },
  // إجمالي الإيرادات
  totalRevenue: { type: Number, default: 0 },
  // إجمالي المبالغ المستردة
  totalRefunds: { type: Number, default: 0 },
  // تفصيل طرق الدفع
  paymentBreakdown: {
    cash: { type: Number, default: 0 },
    card: { type: Number, default: 0 },
    wallet: { type: Number, default: 0 },
    split: { type: Number, default: 0 }
  }
}, { timestamps: true });

shiftSchema.index({ cashierId: 1, status: 1 });
shiftSchema.index({ openedAt: -1 });

module.exports = mongoose.models.Shift || mongoose.model('Shift', shiftSchema);
