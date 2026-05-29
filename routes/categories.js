const express = require('express');
const router = express.Router();
const Category = require('../models/Category');

router.get('/', async (req, res) => {
  try {
    const cats = await Category.find().sort({ sort_order: 1, _id: 1 });
    // Categories rarely change — cache for 10 minutes on client, 1 minute stale-while-revalidate
    res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=60');
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
