const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true },
  name_ar: { type: String, default: '' },
  category: { type: String, enum: ['beans', 'milk', 'syrup', 'topping', 'cup', 'other'], default: 'other' },
  unit: { type: String, required: true, enum: ['g', 'kg', 'ml', 'l', 'pcs', 'cup', 'tsp', 'tbsp', 'oz'] },
  unitCost: { type: Number, default: 0 },
  currentStock: { type: Number, default: 0 },
  minStock: { type: Number, default: 0 },
  costLastUpdated: { type: Date },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('Ingredient', schema);