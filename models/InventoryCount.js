// ===== نموذج InventoryCount - يمثل عمليات جرد المخزون =====
const mongoose = require('mongoose');
// نموذج فرعي لعنصر الجرد الفردي
const countItemSchema = new mongoose.Schema({
  // معرف المكون
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  // الكمية المتوقعة (نظرياً)
  expectedQty: { type: Number, required: true },
  // الكمية الفعلية (واقعياً)
  actualQty: { type: Number, required: true },
  // الفرق بين المتوقع والفعلي
  diff: { type: Number, default: 0 },
  // تكلفة الفرق
  diffCost: { type: Number, default: 0 }
}, { _id: false });
const schema = new mongoose.Schema({
  // تاريخ الجرد
  countDate: { type: Date, default: Date.now },
  // ملاحظات الجرد
  note: { type: String, default: '' },
  // قائمة عناصر الجرد
  items: [countItemSchema],
  // إجمالي تكلفة الفروقات
  totalDiffCost: { type: Number, default: 0 },
  // من قام بالجرد
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
module.exports = mongoose.model('InventoryCount', schema);