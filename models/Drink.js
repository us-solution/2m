const mongoose = require('mongoose');

const drinkSchema = new mongoose.Schema({
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  name_ar: {
    type: String,
    default: null
  },
  tagline: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: null
  },
  ingredients: {
    type: String,
    default: null
  },
  preparation: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    required: true
  },
  calories: {
    type: Number,
    default: null
  },
  serving_size: {
    type: String,
    default: null
  },
  temperature: {
    type: String,
    default: 'hot'
  },
  image_emoji: {
    type: String,
    default: 'imgs/espresso.png'
  },
  is_featured: {
    type: Number,
    default: 0
  },
  is_available: {
    type: Number,
    default: 1
  }
}, {
  timestamps: false,
  collection: 'drinks'
});

module.exports = mongoose.models.Drink || mongoose.model('Drink', drinkSchema);
