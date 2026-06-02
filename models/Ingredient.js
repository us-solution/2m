// ===== نموذج Ingredient - يمثل المكونات الخام المستخدمة في التحضير =====
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  // اسم المكون بالإنجليزية
  name: { type: String, required: true },
  // اسم المكون بالعربية
  name_ar: { type: String, default: '' },
  // فئة المكون
  category: { type: String, enum: ['beans', 'milk', 'syrup', 'topping', 'cup', 'other'], default: 'other' },
  // وحدة القياس
  unit: { type: String, required: true, enum: ['g', 'kg', 'ml', 'l', 'pcs', 'cup', 'tsp', 'tbsp', 'oz'] },
  // تكلفة الوحدة
  unitCost: { type: Number, default: 0 },
  // المخزون الحالي
  currentStock: { type: Number, default: 0 },
  // الحد الأدنى للمخزون
  minStock: { type: Number, default: 0 },
  // آخر تحديث للتكلفة
  costLastUpdated: { type: Date },
  // هل المكون نشط؟
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('Ingredient', schema);