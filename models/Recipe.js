const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  name: { type: String, required: true },
  drinkId: { type: mongoose.Schema.Types.ObjectId, ref: 'Drink', default: null },
  yield: { type: Number, default: 1 },
  totalCost: { type: Number, default: 0 },
  costLastCalculated: { type: Date },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('Recipe', schema);