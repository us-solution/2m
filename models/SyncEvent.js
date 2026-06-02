// ===== نموذج SyncEvent - يمثل أحداث مزامنة البيانات بين الأجهزة =====
const mongoose = require('mongoose');

const syncEventSchema = new mongoose.Schema({
  // معرف الحدث الفريد
  eventId: { type: String, required: true, unique: true, index: true },
  // نوع الحدث
  eventType: { type: String, required: true },
  // معرف الطلب المرتبط
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  // إصدار الطلب وقت المزامنة
  orderVersion: { type: Number, default: 1 },
  // بيانات الحمولة
  payload: { type: Object, required: true },
  // حالة المزامنة
  status: {
    type: String,
    enum: ['pending', 'acked', 'failed'],
    default: 'pending'
  },
  // عدد محاولات المزامنة
  attempts: { type: Number, default: 0 },
  // وقت تأكيد المزامنة
  acknowledgedAt: { type: Date, default: null },
  // سبب الفشل إن وجد
  failureReason: { type: String, default: null }
}, {
  timestamps: true,
  collection: 'sync_events'
});

module.exports = mongoose.models.SyncEvent || mongoose.model('SyncEvent', syncEventSchema);
