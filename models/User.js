const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    unique: true,
    required: true
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    default: null
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'customer' // customer, cashier, admin
  },
  points: {
    type: Number,
    default: 0
  },
  total_spent: {
    type: Number,
    default: 0.00
  },
  subscriptionTier: {
    type: String,
    default: 'none' // none, bronze, silver, gold, student
  },
  cardTitle: {
    type: String,
    default: ''
  },
  discountPercent: {
    type: Number,
    default: 0
  },
  cardColor: {
    type: String,
    default: '#541a1a'
  }
}, {
  timestamps: true,
  collection: 'users'
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
