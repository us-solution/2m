const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  type: { type: String, enum: ['low_stock', 'expired', 'over_consumption', 'theft_suspicion'], required: true },
  message: { type: String, required: true },
  currentStock: { type: Number },
  minStock: { type: Number },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'warning' },
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
module.exports = mongoose.model('StockAlert', schema);