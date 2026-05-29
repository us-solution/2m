const express = require('express');
const router = express.Router();
const Drink = require('../models/Drink');
const Category = require('../models/Category');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// Public list of available drinks
router.get('/', async (req, res) => {
  const { category, featured } = req.query;
  const query = { is_available: 1 };
  
  if (category) {
    query.categoryId = category;
  }
  if (featured === '1') {
    query.is_featured = 1;
  }

  try {
    const drinks = await Drink.find(query).populate('categoryId');
    
    // Map to include fields similar to Django serializers
    const serialized = drinks.map(d => ({
      id: d._id,
      category_id: d.categoryId ? d.categoryId._id : null,
      category_name: d.categoryId ? d.categoryId.name : '',
      category_name_ar: d.categoryId ? d.categoryId.name_ar : '',
      category_icon: d.categoryId ? d.categoryId.icon : '',
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
      is_available: d.is_available
    }));
    
    // Cache menu for 5 minutes — menu rarely changes during service
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public single drink details
router.get('/:id', async (req, res) => {
  try {
    const d = await Drink.findById(req.params.id).populate('categoryId');
    if (!d) {
      return res.status(404).json({ error: 'Drink not found' });
    }
    
    res.json({
      id: d._id,
      category_id: d.categoryId ? d.categoryId._id : null,
      category_name: d.categoryId ? d.categoryId.name : '',
      category_name_ar: d.categoryId ? d.categoryId.name_ar : '',
      category_icon: d.categoryId ? d.categoryId.icon : '',
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
      is_available: d.is_available
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
