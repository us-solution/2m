// ===== نموذج PointsLog - يمثل سجل حركات نقاط الولاء =====
const mongoose = require('mongoose');

const pointsLogSchema = new mongoose.Schema({
  // معرف المستخدم
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // عدد النقاط (موجب للإضافة، سالب للخصم)
  points: {
    type: Number,
    required: true
  },
  // سبب الحركة
  reason: {
    type: String,
    default: null
  },
  // معرف الطلب المرتبط (إن وجد)
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'points_logs'
});

module.exports = mongoose.models.PointsLog || mongoose.model('PointsLog', pointsLogSchema);
