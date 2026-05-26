const mongoose = require('mongoose');

const pointsLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  points: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    default: null
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'points_logs'
});

module.exports = mongoose.models.PointsLog || mongoose.model('PointsLog', pointsLogSchema);
