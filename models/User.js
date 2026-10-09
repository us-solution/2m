// ===== نموذج User - يمثل بيانات المستخدمين والعملاء =====
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // دعم معرفات المستخدمين سواء كانت نصية أو ObjectId
  _id: { type: mongoose.Schema.Types.Mixed, default: () => new mongoose.Types.ObjectId() },
  // اسم المستخدم
  name: { type: String, required: true },
  // رقم الهاتف (فريد)
  phone: { type: String, unique: true, required: true },
  // البريد الإلكتروني (فريد اختياري)
  email: { type: String, unique: true, sparse: true, default: null },
  // كلمة المرور المشفرة
  password: { type: String, required: true },
  // صلاحية المستخدم (customer, admin, cashier, partner)
  role: { type: String, default: 'customer' },
  // نقاط الولاء
  points: { type: Number, default: 0 },
  // إجمالي الإنفاق
  total_spent: { type: Number, default: 0.00 },
  // مستوى الاشتراك
  subscriptionTier: { type: String, default: 'none' },
  // حالة العميل (قياسي، ذهبي، طالب، عائلة 2M، VIP)
  customerStatus: { type: String, enum: ['standard', 'gold', 'student', 'ozel_family', '2m_family', 'vip'], default: 'standard' },
  // عدد الأوردرات الهدية المتاحة للعميل
  freeOrdersCount: { type: Number, default: 0 },
  // هل هو شريك في المكان
  isPartner: { type: Boolean, default: false },
  // اللوجو الخاص بالشريك (Base64 أو رابط)
  partnerLogo: { type: String, default: '' },
  // نبذة كاملة عن الشريك
  partnerBio: { type: String, default: '' },
  // الصورة الأساسية للشريك للعرض بالصفحة الرئيسية
  partnerMainImage: { type: String, default: '' },
  // البريف الخاص بالشريك للعرض بالصفحة الرئيسية (حتى 140 حرف)
  partnerBrief: { type: String, maxlength: 140, default: '' },
  // معرض صور الشريك
  partnerGallery: [{ type: String }],
  // صور الشريك قيد المراجعة والموافقة من الإدارة
  pendingPartnerLogo: { type: String, default: '' },
  pendingPartnerMainImage: { type: String, default: '' },
  pendingPartnerGallery: [{ type: String }],
  // مصفوفة الصور المفضلة
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'VlogPost' }],
  // العنوان
  address: { type: String, default: '' },
  // ملاحظات
  notes: { type: String, default: '' }
}, { timestamps: true, collection: 'users' });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);