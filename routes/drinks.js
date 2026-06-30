const express = require('express');
const router = express.Router();
const Drink = require('../models/Drink');
const Category = require('../models/Category');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const axios = require('axios');
const CASHIER_API_URL = process.env.CASHIER_API_URL;
const CASHIER_API_KEY = process.env.CASHIER_API_KEY;

// جلب قائمة المشروبات المتاحة (مع إمكانية الفلترة حسب الفئة أو المميز ودمج المخزون الحي من الكاشير)
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
    // جلب المنتجات والمخزون لحظياً من الكاشير المحلي
    let posProducts = [];
    if (CASHIER_API_URL && CASHIER_API_KEY) {
      try {
        const posRes = await axios.get(`${CASHIER_API_URL}/api/products?active=1`, {
          headers: { 'x-bridge-key': CASHIER_API_KEY },
          timeout: 2000 // مهلة ثانيتين للمحافظة على سرعة الموقع
        });
        if (Array.isArray(posRes.data)) {
          posProducts = posRes.data;
        }
      } catch (err) {
        console.warn('[DrinksStock] فشل جلب المخزون الحي من الكاشير المحلي:', err.message);
      }
    }

    const drinks = await Drink.find(query).populate('category_id');
    
    // تحويل البيانات إلى JSON مخصص ودمج حالة المخزون
    const serialized = drinks.map(d => {
      let isAvailable = d.is_available;

      if (posProducts.length > 0) {
        // البحث عن المنتج المقابل بالكاشير المحلي بالمعرف أو الاسم
        const matched = posProducts.find(p => 
          String(p.id) === d.menuItemIdInCashier || 
          p.name === d.name || 
          p.name === d.name_ar
        );
        if (matched && matched.quantity <= 0) {
          isAvailable = 0; // غير متاح لانتهاء المخزون بالكاشير
        }
      }

      return {
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
        is_available: isAvailable,
        availableExtras: d.availableExtras || []
      };
    });

    // تخزين مؤقت لمدة دقيقة مع دعم stale-while-revalidate لسرعة الاستجابة
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
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
