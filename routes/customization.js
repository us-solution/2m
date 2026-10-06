// ===== مسار خيارات التخصيص - إدارة مستويات السكر والإضافات =====
const express = require('express');
const router = express.Router();
const CustomizationOption = require('../models/CustomizationOption');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// ===== القيم الافتراضية =====
const defaultSugarLevels = [
  { key: 'Normal', nameEn: 'Normal Sugar', nameAr: 'سكر طبيعي', sortOrder: 0 },
  { key: 'Medium', nameEn: 'Medium Sugar', nameAr: 'سكر وسط', sortOrder: 1 },
  { key: 'Less', nameEn: 'Less Sugar', nameAr: 'سكر خفيف', sortOrder: 2 },
  { key: 'No Sugar', nameEn: 'No Sugar', nameAr: 'بدون سكر', sortOrder: 3 }
];

const defaultExtras = [
  { key: 'None', nameEn: 'No Extras', nameAr: 'بدون إضافات', price: 0, sortOrder: 0 },
  { key: 'Extra Shot', nameEn: 'Extra Espresso Shot', nameAr: 'جرعة إضافية', price: 25, sortOrder: 1 },
  { key: 'Caramel Syrup', nameEn: 'Caramel Syrup', nameAr: 'سيرب كراميل', price: 15, sortOrder: 2 },
  { key: 'Vanilla Syrup', nameEn: 'Vanilla Syrup', nameAr: 'سيرب فانيليا', price: 15, sortOrder: 3 },
  { key: 'Ice Cream', nameEn: 'Ice Cream', nameAr: 'آيس كريم', price: 20, sortOrder: 4 },
  { key: 'Marshmallow', nameEn: 'Marshmallows', nameAr: 'مارشميلو', price: 10, sortOrder: 5 },
  { key: 'Nuts', nameEn: 'Nuts Mix', nameAr: 'مكسرات', price: 15, sortOrder: 6 }
];

// ===== الحصول على خيارات التخصيص (عام - لا يحتاج مصادقة) =====
router.get('/', async (req, res) => {
  try {
    let config = await CustomizationOption.findOne({ configId: 'default' });
    if (!config) {
      // إنشاء القيم الافتراضية إذا لم تكن موجودة
      config = await CustomizationOption.create({
        configId: 'default',
        sugarLevels: defaultSugarLevels,
        extras: defaultExtras
      });
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== تحديث خيارات التخصيص (مدير فقط) =====
router.put('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { sugarLevels, extras } = req.body;
    let config = await CustomizationOption.findOne({ configId: 'default' });
    if (!config) {
      config = new CustomizationOption({ configId: 'default' });
    }
    if (sugarLevels) config.sugarLevels = sugarLevels;
    if (extras) config.extras = extras;
    
    
    await config.save();
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;