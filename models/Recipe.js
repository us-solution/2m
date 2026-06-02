// ===== نموذج Recipe - يمثل وصفات تحضير المشروبات =====
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  // اسم الوصفة
  name: { type: String, required: true },
  // معرف المشروب المرتبط
  drinkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Drink', default: null },
  // عدد الوحدات المنتجة
  yield: { type: Number, default: 1 },
  // التكلفة الإجمالية
  totalCost: { type: Number, default: 0 },
  // آخر مرة تم حساب التكلفة
  costLastCalculated: { type: Date },
  // هل الوصفة نشطة؟
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('Recipe', schema);