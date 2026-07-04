// ===== نموذج User - يمثل بيانات المستخدمين والعملاء =====
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // اسم المستخدم
  name: { type: String, required: true },
  // رقم الهاتف (فريد)
  phone: { type: String, unique: true, required: true },
  // البريد الإلكتروني (فريد اختياري)
  email: { type: String, unique: true, sparse: true, default: null },
  // كلمة المرور المشفرة
  password: { type: String, required: true },
  // صلاحية المستخدم (customer, admin, cashier)
  role: { type: String, default: 'customer' },
  // نقاط الولاء
  points: { type: Number, default: 0 },
  // إجمالي الإنفاق
  total_spent: { type: Number, default: 0.00 },
  // مستوى الاشتراك
  subscriptionTier: { type: String, default: 'none' },
  // حالة العميل (قياسي، ذهبي، طالب، عائلة أوزيل)
  customerStatus: { type: String, enum: ['standard', 'gold', 'student', 'ozel_family'], default: 'standard' },
  // عدد الأوردرات الهدية المتاحة للعميل
  freeOrdersCount: { type: Number, default: 0 },
  // العنوان
  address: { type: String, default: '' },
  // ملاحظات
  notes: { type: String, default: '' }
}, { timestamps: true, collection: 'users' });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);