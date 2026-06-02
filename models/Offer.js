// ===== نموذج Offer - يمثل العروض والتخفيضات على المشروبات =====
const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  // معرف المشروب المعروض
  drinkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Drink',
    required: true
  },
  // نسبة الخصم المئوية
  discount_percent: {
    type: Number,
    required: true
  },
  // تاريخ انتهاء العرض
  expires_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'offers'
});

module.exports = mongoose.models.Offer || mongoose.model('Offer', offerSchema);
