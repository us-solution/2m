const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  name_ar: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: null
  },
  sort_order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: false,
  collection: 'categories'
});

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
