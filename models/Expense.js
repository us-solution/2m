// ===== نموذج Expense - يمثل المصروفات التشغيلية =====
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  // عنوان المصروف
  title: { type: String, required: true, trim: true },
  // فئة المصروف
  category: {
    type: String,
    enum: ['utilities', 'purchase', 'maintenance', 'salary', 'rent', 'marketing', 'other'],
    default: 'other'
  },
  // المبلغ
  amount: { type: Number, required: true, min: 0 },
  // تاريخ المصروف
  expenseDate: { type: Date, default: Date.now },
  // طريقة الدفع
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'wallet', 'bank', 'other'],
    default: 'cash'
  },
  // معرف الوردية المرتبطة
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
  // معرف الفرع
  branchId: { type: String, default: 'main' },
  // ملاحظات
  notes: { type: String, default: '' },
  // من قام بإضافة المصروف
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, collection: 'expenses' });

expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ category: 1, expenseDate: -1 });

module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
