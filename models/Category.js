// ===== نموذج Category - يمثل تصنيفات المشروبات =====
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  // اسم التصنيف بالإنجليزية
  name: {
    type: String,
    required: true
  },
  // اسم التصنيف بالعربية
  name_ar: {
    type: String,
    required: true
  },
  // أيقونة التصنيف
  icon: {
    type: String,
    default: null
  },
  // وصف التصنيف
  description: {
    type: String,
    default: null
  },
  // ترتيب العرض
  sort_order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: false,
  collection: 'categories'
});

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
