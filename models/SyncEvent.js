const mongoose = require('mongoose');

const syncEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  orderVersion: { type: Number, default: 1 },
  payload: { type: Object, required: true },
  status: {
    type: String,
    enum: ['pending', 'acked', 'failed'],
    default: 'pending'
  },
  attempts: { type: Number, default: 0 },
  acknowledgedAt: { type: Date, default: null },
  failureReason: { type: String, default: null }
}, {
  timestamps: true,
  collection: 'sync_events'
});

module.exports = mongoose.models.SyncEvent || mongoose.model('SyncEvent', syncEventSchema);
