const mongoose = require('mongoose');

const queueOrderSchema = new mongoose.Schema({
  orderData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 10
  },
  lastAttempt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'dead_letter'],
    default: 'pending'
  },
  failReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'queue_orders'
});

module.exports = mongoose.models.QueueOrder || mongoose.model('QueueOrder', queueOrderSchema);
