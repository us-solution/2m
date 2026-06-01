const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
  cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cashierName: { type: String, default: '' },
  branchId: { type: String, default: 'main' },
  status: { type: String, enum: ['open', 'closed', 'cancelled'], default: 'open' },

  openingBalance: { type: Number, default: 0 },
  closingBalance: { type: Number, default: 0 },
  expectedBalance: { type: Number, default: 0 },
  variance: { type: Number, default: 0 },

  openedAt: { type: Date, default: Date.now },
  closedAt: { type: Date },
  notes: { type: String, default: '' },

  totalOrders: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  totalRefunds: { type: Number, default: 0 },
  paymentBreakdown: {
    cash: { type: Number, default: 0 },
    card: { type: Number, default: 0 },
    wallet: { type: Number, default: 0 },
    split: { type: Number, default: 0 }
  }
}, { timestamps: true });

shiftSchema.index({ cashierId: 1, status: 1 });
shiftSchema.index({ openedAt: -1 });

module.exports = mongoose.models.Shift || mongoose.model('Shift', shiftSchema);
