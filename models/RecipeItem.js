const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true },
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  quantity: { type: Number, required: true }
}, { timestamps: true });
module.exports = mongoose.model('RecipeItem', schema);