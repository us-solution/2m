// ===== نموذج VlogPost - يمثل الصور المرفوعة من العملاء في ألبوم المكان =====
const mongoose = require('mongoose');

const vlogPostSchema = new mongoose.Schema({
  // معرف العميل الذي قام برفع الصورة
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // اسم العميل لتسهيل العرض المباشر دون الحاجة لعملية populate
  userName: {
    type: String,
    required: true
  },
  // النص الوصفي المرافق للصورة
  caption: {
    type: String,
    default: ''
  },
  // الصورة بنظام Base64 (مضغوطة بصيغة JPEG من الواجهة الأمامية)
  image: {
    type: String,
    required: true
  },
  // مصفوفة بمعرفات المستخدمين الذين سجلوا إعجابهم بالصورة
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // إجمالي عدد الإعجابات لتسهيل الفرز والترتيب
  likesCount: {
    type: Number,
    default: 0,
    index: true
  },
  // هل تم تحديد هذه الصورة كفائزة بالمسابقة بواسطة الأدمن
  isWinner: {
    type: Boolean,
    default: false,
    index: true
  },
  // الجائزة المقدمة (مثال: أوردر مجاني بقيمة معينة أو مشروب محدد)
  winnerPrize: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  collection: 'vlog_posts'
});

module.exports = mongoose.models.VlogPost || mongoose.model('VlogPost', vlogPostSchema);
