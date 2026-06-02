// ===== مسار العروض - عرض العروض النشطة المتاحة (غير منتهية الصلاحية) =====
const express = require('express');
const router = express.Router();
const Offer = require('../models/Offer');
const Drink = require('../models/Drink');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// جلب العروض النشطة (غير المنتهية والتي لا يزال المشروب متاحاً فيها)
router.get('/', async (req, res) => {
  const now = new Date();
  try {
    const offers = await Offer.find({
      $or: [
        { expires_at: null },
        { expires_at: { $gt: now } }
      ]
    }).populate({
      path: 'drinkId',
      match: { is_available: 1 }
    });

    // استبعاد العروض التي لم يعد المشروب متاحاً فيها
    const validOffers = offers.filter(o => o.drinkId != null);

    const serialized = validOffers.map(o => ({
      id: o._id,
      drink_id: o.drinkId._id,
      discount_percent: o.discount_percent,
      expires_at: o.expires_at ? o.expires_at.toISOString() : null,
      created_at: o.created_at.toISOString(),
      name: o.drinkId.name,
      name_ar: o.drinkId.name_ar,
      price: parseFloat(o.drinkId.price),
      image_emoji: o.drinkId.image_emoji
    }));

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
