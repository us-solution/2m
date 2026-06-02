// ===== مسار الوصفات - إدارة وصفات المشروبات وحساب تكاليف المكونات =====
const express = require('express');
const router = express.Router();
const Recipe = require('../models/Recipe');
const RecipeItem = require('../models/RecipeItem');
const Ingredient = require('../models/Ingredient');
const Drink = require('../models/Drink');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// جلب جميع الوصفات النشطة مع المكونات وتكلفة كل وصفة
router.get('/', authenticateToken, async (req, res) => {
  try {
    const recipes = await Recipe.find({ isActive: true }).sort({ name: 1 }).lean();
    const drinks = await Drink.find({ isAvailable: true }).select('name name_ar price').lean();
    const drinkMap = {};
    drinks.forEach(d => { drinkMap[d._id] = d; });
    const items = await RecipeItem.find({ recipeId: { $in: recipes.map(r => r._id) } }).populate('ingredientId', 'name name_ar unit unitCost').lean();
    const itemMap = {};
    items.forEach(i => {
      if (!itemMap[i.recipeId]) itemMap[i.recipeId] = [];
      itemMap[i.recipeId].push(i);
    });
    // حساب التكلفة الإجمالية لكل وصفة
    const enriched = recipes.map(r => {
      const recipeItems = itemMap[r._id] || [];
      let totalCost = 0;
      recipeItems.forEach(ri => {
        if (ri.ingredientId) totalCost += (ri.quantity || 0) * (ri.ingredientId.unitCost || 0);
      });
      return {
        ...r,
        drink: drinkMap[r.drinkId] || null,
        items: recipeItems,
        totalCost,
        unitCost: r.yield > 0 ? totalCost / r.yield : totalCost
      };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// جلب وصفة محددة بالمعرف مع المكونات
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id).lean();
    if (!recipe) return res.status(404).json({ error: 'غير موجودة' });
    const items = await RecipeItem.find({ recipeId: recipe._id }).populate('ingredientId', 'name name_ar unit unitCost').lean();
    let totalCost = 0;
    items.forEach(i => { if (i.ingredientId) totalCost += i.quantity * i.ingredientId.unitCost; });
    recipe.items = items;
    recipe.totalCost = totalCost;
    recipe.unitCost = recipe.yield > 0 ? totalCost / recipe.yield : totalCost;
    if (recipe.drinkId) recipe.drink = await Drink.findById(recipe.drinkId).select('name name_ar price');
    res.json(recipe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// إنشاء وصفة جديدة
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, drinkId, yield: yieldQty } = req.body;
    const recipe = await Recipe.create({ name, drinkId: drinkId || null, yield: yieldQty || 1 });
    res.status(201).json(recipe);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// تعديل وصفة
router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    const recipe = await Recipe.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!recipe) return res.status(404).json({ error: 'غير موجودة' });
    res.json(recipe);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// حذف وصفة (مع حذف مكوناتها المرتبطة)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    await RecipeItem.deleteMany({ recipeId: req.params.id });
    await Recipe.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ===== مكونات الوصفة =====

// جلب مكونات وصفة محددة
router.get('/:id/items', authenticateToken, async (req, res) => {
  try {
    const items = await RecipeItem.find({ recipeId: req.params.id }).populate('ingredientId', 'name name_ar unit unitCost');
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// إضافة مكون لوصفة (أو تحديث كميته إذا كان موجوداً)
router.post('/:id/items', requireRole('admin'), async (req, res) => {
  try {
    const { ingredientId, quantity } = req.body;
    if (!ingredientId || quantity === undefined) return res.status(400).json({ error: 'ingredientId و quantity مطلوبان' });
    const existing = await RecipeItem.findOne({ recipeId: req.params.id, ingredientId });
    if (existing) {
      existing.quantity = quantity;
      await existing.save();
      return res.json(existing);
    }
    const item = await RecipeItem.create({ recipeId: req.params.id, ingredientId, quantity });
    await item.populate('ingredientId', 'name name_ar unit unitCost');
    res.status(201).json(item);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// حذف مكون من وصفة
router.delete('/:recipeId/items/:itemId', requireRole('admin'), async (req, res) => {
  try {
    await RecipeItem.findByIdAndDelete(req.params.itemId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// إعادة حساب تكاليف جميع الوصفات النشطة
router.post('/calculate-costs', requireRole('admin'), async (req, res) => {
  try {
    const recipes = await Recipe.find({ isActive: true });
    let updated = 0;
    for (const recipe of recipes) {
      const items = await RecipeItem.find({ recipeId: recipe._id }).populate('ingredientId', 'unitCost');
      let totalCost = 0;
      items.forEach(i => { if (i.ingredientId) totalCost += i.quantity * i.ingredientId.unitCost; });
      recipe.totalCost = totalCost;
      recipe.costLastCalculated = new Date();
      await recipe.save();
      updated++;
    }
    res.json({ success: true, updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
