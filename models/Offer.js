const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  drinkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Drink',
    required: true
  },
  discount_percent: {
    type: Number,
    required: true
  },
  expires_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false },
  collection: 'offers'
});

module.exports = mongoose.models.Offer || mongoose.model('Offer', offerSchema);
