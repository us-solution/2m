const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  table_number: {
    type: String,
    required: true
  },
  items: {
    type: String, // JSON stringified array of items
    required: true
  },
  total_price: {
    type: Number,
    required: true
  },
  points_earned: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    default: 'pending' // pending, ready, served, cancelled, confirmed
  },
  notes: {
    type: String,
    default: ''
  },
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  qrCodeToken: {
    type: String,
    unique: true,
    sparse: true,
    default: null
  },
  isQrConfirmed: {
    type: Boolean,
    default: false
  },
  customerPhone: {
    type: String,
    default: null
  },
  posSynced: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'orders'
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
