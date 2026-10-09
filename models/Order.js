// ===== نموذج Order - يمثل طلبات العملاء =====
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // معرف المستخدم (إذا كان مسجلاً)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // رقم الطاولة
  table_number: {
    type: String,
    required: true
  },
  // العناصر المطلوبة (مصفوفة من الأصناف)
  items: [{
    name: { type: String, required: true },
    menuItemIdInCashier: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    price: { type: Number, default: 0 },
    sugar: { type: String, default: 'Normal' },
    extras: { type: [String], default: [] },
    notes: { type: String, default: '' }
  }],
  // السعر الإجمالي
  total_price: {
    type: Number,
    required: true
  },
  // النقاط المكتسبة من هذا الطلب
  points_earned: {
    type: Number,
    default: 0
  },
  // حالة الطلب (قيد الانتظار، جاهز، تم التقديم، ملغي، مؤكد)
  status: {
    type: String,
    default: 'pending'
  },
  // ملاحظات الطلب
  notes: {
    type: String,
    default: ''
  },
  // معرف الكاشير الذي تعامل مع الطلب
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // رمز QR الخاص بالطلب
  qrCodeToken: {
    type: String,
    sparse: true,
    index: true,
    default: undefined
  },
  // هل تم تأكيد الطلب عبر QR؟
  isQrConfirmed: {
    type: Boolean,
    default: false
  },
  // رقم هاتف العميل
  customerPhone: {
    type: String,
    default: null
  },
  // هل تمت المزامنة مع نظام POS؟
  posSynced: {
    type: Boolean,
    default: false
  },
  // معرف ثابت من العميل/الجسر لمنع إنشاء نفس الطلب مرتين عند إعادة المحاولة
  externalOrderId: {
    type: String,
    sparse: true,
    index: true,
    default: undefined
  },
  posOrderId: {
    type: String,
    default: null
  },
  printJobId: {
    type: String,
    default: null
  },
  printStatus: {
    type: String,
    enum: ['pending', 'printing', 'printed', 'failed', null],
    default: 'pending'
  },
  // معرف الوردية المرتبطة
  shiftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    default: null
  },
  // طريقة الدفع (نقدي، بطاقة، محفظة، مقسم)
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'wallet', 'split', null],
    default: null
  },
  // إصدار الطلب (للمزامنة)
  orderVersion: {
    type: Number,
    default: 1
  },
  // بيانات المزامنة
  syncMeta: {
    lastEventId: { type: String, default: null },
    lastEventType: { type: String, default: null },
    lastSyncedAt: { type: Date, default: null },
    syncAttempts: { type: Number, default: 0 },
    syncStatus: {
      type: String,
      enum: ['pending', 'acked', 'failed'],
      default: 'pending'
    },
    lastError: { type: String, default: null }
  }
}, {
  timestamps: true,
  collection: 'orders'
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
