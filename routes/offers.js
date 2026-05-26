const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Offer = require('../models/Offer');
const Drink = require('../models/Drink');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// Public Active Offers List
router.get('/', async (req, res) => {
  const now = new Date();
  try {
    const offers = await Offer.findAll({
      where: {
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gt]: now } }
        ]
      },
      include: [{ model: Drink, as: 'drink', where: { is_available: 1 } }]
    });

    const serialized = offers.map(o => ({
      id: o.id,
      drink_id: o.drinkId,
      discount_percent: o.discount_percent,
      expires_at: o.expires_at ? o.expires_at.toISOString() : null,
      created_at: o.created_at.toISOString(),
      name: o.drink.name,
      name_ar: o.drink.name_ar,
      price: parseFloat(o.drink.price),
      image_emoji: o.drink.image_emoji
    }));

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
