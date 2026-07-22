const mongoose = require('mongoose');

const SystemLicenseSchema = new mongoose.Schema({
  key: { 
    type: String, 
    required: true, 
    unique: true, 
    default: 'cashier_system_license' 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  lockReason: { 
    type: String, 
    default: 'تم إيقاف وتجميد ترخيص السيستم مؤقتاً من قبل الإدارة' 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('SystemLicense', SystemLicenseSchema);
