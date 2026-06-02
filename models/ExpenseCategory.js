// ===== نموذج ExpenseCategory - يمثل تصنيفات المصروفات =====
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  // اسم التصنيف بالإنجليزية
  name: { type: String, required: true },
  // اسم التصنيف بالعربية
  name_ar: { type: String, default: '' },
  // نوع التصنيف
  type: { type: String, enum: ['purchase', 'salary', 'rent', 'utilities', 'maintenance', 'marketing', 'other'], default: 'other' },
  // هل التصنيف نشط؟
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('ExpenseCategory', schema);