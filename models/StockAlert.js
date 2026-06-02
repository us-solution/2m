// ===== نموذج StockAlert - يمثل تنبيهات المخزون =====
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  // معرف المكون المرتبط
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  // نوع التنبيه (مخزون منخفض، منتهي صلاحية، استهلاك زائد، اشتباه بسرقة)
  type: { type: String, enum: ['low_stock', 'expired', 'over_consumption', 'theft_suspicion'], required: true },
  // نص الرسالة
  message: { type: String, required: true },
  // المخزون الحالي عند إصدار التنبيه
  currentStock: { type: Number },
  // الحد الأدنى للمخزون
  minStock: { type: Number },
  // مستوى الخطورة (معلوماتي، تحذيري، خطير)
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
  // هل تم حل التنبيه؟
  resolved: { type: Boolean, default: false },
  // تاريخ الحل
  resolvedAt: { type: Date },
  // من قام بحل التنبيه
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
module.exports = mongoose.model('StockAlert', schema);