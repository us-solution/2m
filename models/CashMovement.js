// ===== نموذج CashMovement - يمثل حركات الخزينة النقدية (إيداع/سحب) =====
const mongoose = require('mongoose');

const cashMovementSchema = new mongoose.Schema({
  // نوع الحركة (داخل/خارج)
  movementType: { type: String, enum: ['in', 'out'], required: true },
  // المبلغ
  amount: { type: Number, required: true, min: 0 },
  // سبب الحركة
  reason: { type: String, required: true, trim: true },
  // معرف الوردية المرتبطة
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
  // معرف الفرع
  branchId: { type: String, default: 'main' },
  // تاريخ الحركة
  movementDate: { type: Date, default: Date.now },
  // من قام بالحركة
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // ملاحظات
  notes: { type: String, default: '' }
}, { timestamps: true, collection: 'cash_movements' });

cashMovementSchema.index({ movementDate: -1 });
cashMovementSchema.index({ shiftId: 1, movementDate: -1 });

module.exports = mongoose.models.CashMovement || mongoose.model('CashMovement', cashMovementSchema);
