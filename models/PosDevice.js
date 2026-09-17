const mongoose = require('mongoose');

const posDeviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  deviceName: {
    type: String,
    default: 'جهاز كاشير'
  },
  isMaster: {
    type: Boolean,
    default: false
  },
  ipAddress: {
    type: String,
    default: ''
  },
  localPort: {
    type: Number,
    default: 5050
  },
  status: {
    type: String,
    enum: ['online', 'offline'],
    default: 'online'
  },
  systemVersion: {
    type: String,
    default: 'OZEL CAFE POS v2.1.0'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.PosDevice || mongoose.model('PosDevice', posDeviceSchema);
