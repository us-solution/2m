// ===== مسار المشروبات - عرض قائمة المشروبات العامة للعملاء وتفاصيل مشروب محدد =====
const express = require('express');
const router = express.Router();
const Drink = require('../models/Drink');
const Category = require('../models/Category');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// جلب قائمة المشروبات المتاحة (مع إمكانية الفلترة حسب الفئة أو المميز)
router.get('/', async (req, res) => {
  const { category, featured } = req.query;
  // فلترة المشروبات المتاحة فقط
  const query = { is_available: 1 };
  
  if (category) {
    query.category_id = category;
  }
  if (featured === '1') {
    query.is_featured = 1;
  }

  try {
    const drinks = await Drink.find(query).populate('category_id');
    
    // تحويل البيانات إلى JSON مخصص
    const serialized = drinks.map(d => ({
      id: d._id,
      category_id: d.category_id ? d.category_id._id : null,
      category_name: d.category_id ? d.category_id.name : '',
      category_name_ar: d.category_id ? d.category_id.name_ar : '',
      category_icon: d.category_id ? d.category_id.icon : '',
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
    }));

    // تخزين مؤقت لمدة 5 دقائق — القائمة نادراً ما تتغير أثناء الخدمة
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب تفاصيل مشروب محدد بالمعرف
router.get('/:id', async (req, res) => {
  try {
    const d = await Drink.findById(req.params.id).populate('category_id');
    if (!d) {
      return res.status(404).json({ error: 'Drink not found' });
    }
    
    res.json({
      id: d._id,
      category_id: d.category_id ? d.category_id._id : null,
      category_name: d.category_id ? d.category_id.name : '',
      category_name_ar: d.category_id ? d.category_id.name_ar : '',
      category_icon: d.category_id ? d.category_id.icon : '',
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
