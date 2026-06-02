// ===== مسار الفئات - عرض قائمة الفئات المتاحة للعملاء (عام) =====
const express = require('express');
const router = express.Router();
const Category = require('../models/Category');

// جلب جميع الفئات مرتبة (مع التخزين المؤقت للمتصفح)
router.get('/', async (req, res) => {
  try {
    const cats = await Category.find().sort({ sort_order: 1, _id: 1 });
    // الفئات نادراً ما تتغير — تخزين مؤقت لمدة 10 دقائق مع السماح بالتحديث الخلفي
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=60');
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
