const mongoose = require('mongoose');

const cashMovementSchema = new mongoose.Schema({
  movementType: { type: String, enum: ['in', 'out'], required: true },
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true, trim: true },
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
  branchId: { type: String, default: 'main' },
  movementDate: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notes: { type: String, default: '' }
}, { timestamps: true, collection: 'cash_movements' });

cashMovementSchema.index({ movementDate: -1 });
cashMovementSchema.index({ shiftId: 1, movementDate: -1 });

module.exports = mongoose.models.CashMovement || mongoose.model('CashMovement', cashMovementSchema);
