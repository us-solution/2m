// ===== نموذج Drink - يمثل المشروبات في قائمة الطعام =====
const mongoose = require('mongoose');

const drinkSchema = new mongoose.Schema({
  // معرف التصنيف الذي ينتمي إليه المشروب
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  // اسم المشروب بالإنجليزية
  name: {
    type: String,
    required: true
  },
  // اسم المشروب بالعربية
  name_ar: {
    type: String,
    default: null
  },
  // شعار قصير للمشروب
  tagline: {
    type: String,
    default: null
  },
  // وصف المشروب
  description: {
    type: String,
    default: null
  },
  // المكونات (نص وصفي)
  ingredients: {
    type: String,
    default: null
  },
  // طريقة التحضير
  preparation: {
    type: String,
    default: ''
  },
  // السعر
  price: {
    type: Number,
    required: true
  },
  // السعرات الحرارية
  calories: {
    type: Number,
    default: null
  },
  // حجم التقديم
  serving_size: {
    type: String,
    default: null
  },
  // درجة الحرارة (ساخن/بارد)
  temperature: {
    type: String,
    default: 'hot'
  },
  // صورة المشروب
  image_emoji: {
    type: String,
    default: 'imgs/espresso.png'
  },
  // هل هو مميز؟
  is_featured: {
    type: Number,
    default: 0
  },
  // هل هو متاح؟
  is_available: {
    type: Number,
    default: 1
  },
  // قائمة الإضافات المتاحة لهذا المشروب (مصفوفة من مفاتيح الإضافات، فارغة = الكل متاح)
  availableExtras: {
    type: [String],
    default: []
  },
  // معرف المشروب في نظام الكاشير المحلي (.NET PostgreSQL Guid)
  menuItemIdInCashier: {
    type: String,
    default: ''
  }
}, {
  timestamps: false,
  collection: 'drinks'
});

module.exports = mongoose.models.Drink || mongoose.model('Drink', drinkSchema);
