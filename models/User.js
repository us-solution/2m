const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, unique: true, required: true },
  email: { type: String, unique: true, sparse: true, default: null },
  password: { type: String, required: true },
  role: { type: String, default: 'customer' },
  points: { type: Number, default: 0 },
  total_spent: { type: Number, default: 0.00 },
  subscriptionTier: { type: String, default: 'none' },
  customerStatus: { type: String, enum: ['standard', 'gold', 'student', 'ozel_family'], default: 'standard' }
}, { timestamps: true, collection: 'users' });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);