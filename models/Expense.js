const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['utilities', 'purchase', 'maintenance', 'salary', 'rent', 'marketing', 'other'],
    default: 'other'
  },
  amount: { type: Number, required: true, min: 0 },
  expenseDate: { type: Date, default: Date.now },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'wallet', 'bank', 'other'],
    default: 'cash'
  },
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
  branchId: { type: String, default: 'main' },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, collection: 'expenses' });

expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ category: 1, expenseDate: -1 });

module.exports = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
