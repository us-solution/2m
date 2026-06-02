const mongoose = require('mongoose');
const countItemSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  expectedQty: { type: Number, required: true },
  actualQty: { type: Number, required: true },
  diff: { type: Number, default: 0 },
  diffCost: { type: Number, default: 0 }
}, { _id: false });
const schema = new mongoose.Schema({
  countDate: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  items: [countItemSchema],
  totalDiffCost: { type: Number, default: 0 },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
module.exports = mongoose.model('InventoryCount', schema);