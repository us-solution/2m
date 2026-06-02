const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  type: { type: String, enum: ['purchase', 'consumption', 'adjustment', 'waste', 'return'], required: true },
  quantity: { type: Number, required: true },
  unitCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  reference: { type: String, default: '' },
  note: { type: String, default: '' },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  relatedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }
}, { timestamps: true });
schema.index({ ingredientId: 1, createdAt: -1 });
module.exports = mongoose.model('InventoryTransaction', schema);