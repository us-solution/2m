const express = require('express');
const router = express.Router();
const Drink = require('../models/Drink');
const Category = require('../models/Category');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// Public list of available drinks
router.get('/', async (req, res) => {
  const { category, featured } = req.query;
  const whereClause = { is_available: 1 };
  
  if (category) {
    whereClause.categoryId = category;
  }
  if (featured === '1') {
    whereClause.is_featured = 1;
  }

  try {
    const drinks = await Drink.findAll({
      where: whereClause,
      include: [{ model: Category, as: 'category' }]
    });
    
    // Map to include fields similar to Django serializers
    const serialized = drinks.map(d => ({
      id: d.id,
      category_id: d.categoryId,
      category_name: d.category ? d.category.name : '',
      category_name_ar: d.category ? d.category.name_ar : '',
      category_icon: d.category ? d.category.icon : '',
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
    
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public single drink details
router.get('/:id', async (req, res) => {
  try {
    const d = await Drink.findByPk(req.params.id, {
      include: [{ model: Category, as: 'category' }]
    });
    if (!d) {
      return res.status(404).json({ error: 'Drink not found' });
    }
    
    res.json({
      id: d.id,
      category_id: d.categoryId,
      category_name: d.category ? d.category.name : '',
      category_name_ar: d.category ? d.category.name_ar : '',
      category_icon: d.category ? d.category.icon : '',
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
