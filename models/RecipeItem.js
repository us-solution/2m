// ===== نموذج RecipeItem - يمثل المكونات الفردية داخل الوصفة =====
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  // معرف الوصفة
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true },
  // معرف المكون
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  // الكمية المطلوبة
  quantity: { type: Number, required: true }
}, { timestamps: true });
module.exports = mongoose.model('RecipeItem', schema);