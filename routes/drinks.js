const express = require('express');
const router = express.Router();
const Drink = require('../models/Drink');
const Category = require('../models/Category');

// In-memory cache to guarantee sub-millisecond responses on repeated menu requests
let _drinksCache = null;
let _drinksCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function invalidateDrinksCache() {
  _drinksCache = null;
  _drinksCacheTime = 0;
}

// جلب قائمة المشروبات المتاحة (مع إمكانية الفلترة حسب الفئة أو المميز)
router.get('/', async (req, res) => {
  const { category, featured } = req.query;

  // Use cache for the default full menu request
  if (!category && !featured && _drinksCache && (Date.now() - _drinksCacheTime < CACHE_TTL_MS)) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    return res.json(_drinksCache);
  }

  const query = { is_available: 1 };
  if (category) query.category_id = category;
  if (featured === '1') query.is_featured = 1;

  try {
    const [categories, drinks] = await Promise.all([
      Category.find({}).lean(),
      Drink.find(query).lean()
    ]);

    const catMap = new Map();
    categories.forEach(c => catMap.set(String(c._id), c));

    const serialized = drinks.map(d => {
      const cat = d.category_id ? catMap.get(String(d.category_id)) : null;
      return {
        id: d._id,
        category_id: cat ? cat._id : null,
        category_name: cat ? cat.name : '',
        category_name_ar: cat ? cat.name_ar : '',
        category_icon: cat ? cat.icon : '',
        name: d.name,
        name_ar: d.name_ar,
        tagline: d.tagline,
        description: d.description,
        ingredients: d.ingredients,
        preparation: d.preparation,
        price: parseFloat(d.price),
        calories: d.calories,
        serving_size: d.serving_size,
        temperature: d.temperature,
        image_emoji: d.image_emoji,
        is_featured: d.is_featured,
        is_available: d.is_available,
        availableExtras: d.availableExtras || []
      };
    });

    if (!category && !featured) {
      _drinksCache = serialized;
      _drinksCacheTime = Date.now();
    }

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب تفاصيل مشروب محدد بالمعرف
router.get('/:id', async (req, res) => {
  try {
    const d = await Drink.findById(req.params.id).lean();
    if (!d) {
      return res.status(404).json({ error: 'Drink not found' });
    }

    let cat = null;
    if (d.category_id) {
      cat = await Category.findById(d.category_id).lean();
    }

    res.json({
      id: d._id,
      category_id: cat ? cat._id : null,
      category_name: cat ? cat.name : '',
      category_name_ar: cat ? cat.name_ar : '',
      category_icon: cat ? cat.icon : '',
      name: d.name,
      name_ar: d.name_ar,
      tagline: d.tagline,
      description: d.description,
      ingredients: d.ingredients,
      preparation: d.preparation,
      price: parseFloat(d.price),
      calories: d.calories,
      serving_size: d.serving_size,
      temperature: d.temperature,
      image_emoji: d.image_emoji,
      is_featured: d.is_featured,
      is_available: d.is_available,
      availableExtras: d.availableExtras || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.invalidateDrinksCache = invalidateDrinksCache;
