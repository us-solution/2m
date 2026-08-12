// ===== نموذج CustomizationOption - يمثل خيارات تخصيص المشروبات (السكر والإضافات) =====
const mongoose = require('mongoose');

const customizationSchema = new mongoose.Schema({
  // معرف ثابت لهذه الوثيقة (دائماً "default")
  configId: { type: String, default: 'default', unique: true },
  // ===== مستويات السكر =====
  sugarLevels: [{
    key: { type: String, required: true },        // المعرف (مثل: Normal, Medium, Less, No Sugar)
    nameEn: { type: String, required: true },      // الاسم بالإنجليزية
    nameAr: { type: String, required: true },      // الاسم بالعربية
    sortOrder: { type: Number, default: 0 }        // ترتيب العرض
  }],
  // ===== خيارات الإضافات =====
  extras: [{
    key: { type: String, required: true },          // المعرف (مثل: None, Extra Shot, Caramel Syrup, ...)
    nameEn: { type: String, required: true },       // الاسم بالإنجليزية
    nameAr: { type: String, required: true },       // الاسم بالعربية
    price: { type: Number, default: 0 },            // السعر الإضافي
    sortOrder: { type: Number, default: 0 }         // ترتيب العرض
  }],
  logo1: { type: String, default: '' },
  logo2: { type: String, default: '' },
  heroBg: { type: String, default: '' }
}, { timestamps: true, collection: 'customizationoptions' });

module.exports = mongoose.models.CustomizationOption || mongoose.model('CustomizationOption', customizationSchema);