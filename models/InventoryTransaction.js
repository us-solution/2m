// ===== نموذج InventoryTransaction - يمثل حركات المخزون (إضافة/صرف/تعديل) =====
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  // معرف المكون
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  // نوع المعاملة (شراء، استهلاك، تعديل، هدر، إرجاع)
  type: { type: String, enum: ['purchase', 'consumption', 'adjustment', 'waste', 'return'], required: true },
  // الكمية
  quantity: { type: Number, required: true },
  // تكلفة الوحدة
  unitCost: { type: Number, default: 0 },
  // التكلفة الإجمالية
  totalCost: { type: Number, default: 0 },
  // مرجع المعاملة (مثلاً رقم فاتورة)
  reference: { type: String, default: '' },
  // ملاحظة
  note: { type: String, default: '' },
  // من قام بالمعاملة
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // معرف الطلب المرتبط (إن وجد)
  relatedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }
}, { timestamps: true });
schema.index({ ingredientId: 1, createdAt: -1 });
module.exports = mongoose.model('InventoryTransaction', schema);