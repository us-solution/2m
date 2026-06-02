const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true },
  name_ar: { type: String, default: '' },
  type: { type: String, enum: ['purchase', 'salary', 'rent', 'utilities', 'maintenance', 'marketing', 'other'], default: 'other' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('ExpenseCategory', schema);