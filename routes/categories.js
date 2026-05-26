const express = require('express');
const router = express.Router();
const Category = require('../models/Category');

router.get('/', async (req, res) => {
  try {
    const cats = await Category.findAll({
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
