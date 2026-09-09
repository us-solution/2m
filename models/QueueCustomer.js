const mongoose = require('mongoose');

const queueCustomerSchema = new mongoose.Schema({
  customerData: {
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
  },
  nextAttemptAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'queue_customers'
});

module.exports = mongoose.models.QueueCustomer || mongoose.model('QueueCustomer', queueCustomerSchema);
