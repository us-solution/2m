const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Drink = require('../models/Drink');
const Offer = require('../models/Offer');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// Admin Stats
router.get('/stats', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Total orders count
    const total_orders = await Order.countDocuments();

    // Today's orders count
    const today_orders = await Order.countDocuments({
      createdAt: { $gte: today }
    });

    // Today's revenue
    const todayRevenueAgg = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total_price' }
        }
      }
    ]);
    const today_revenue = todayRevenueAgg.length > 0 ? parseFloat(todayRevenueAgg[0].total) : 0;

    // Monthly revenue
    const monthlyRevenueAgg = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: firstDayOfMonth },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total_price' }
        }
      }
    ]);
    const monthly_revenue = monthlyRevenueAgg.length > 0 ? parseFloat(monthlyRevenueAgg[0].total) : 0;

    // Total revenue
    const totalRevenueAgg = await Order.aggregate([
      {
        $match: {
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total_price' }
        }
      }
    ]);
    const total_revenue = totalRevenueAgg.length > 0 ? parseFloat(totalRevenueAgg[0].total) : 0;

    // Total customers
    const total_customers = await User.countDocuments({ role: 'customer' });

    // Pending orders
    const pending_orders = await Order.countDocuments({ status: 'pending' });

    // Cashier stats (Orders processed today)
    const cashierStatsAgg = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          cashierId: { $ne: null },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: '$cashierId',
          order_count: { $sum: 1 },
          total_rev: { $sum: '$total_price' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'cashierInfo'
        }
      },
      {
        $unwind: { path: '$cashierInfo', preserveNullAndEmptyArrays: true }
      }
    ]);

    const cashier_stats = cashierStatsAgg.map(item => ({
      cashier_name: item.cashierInfo ? item.cashierInfo.name : 'Unknown',
      order_count: item.order_count,
      total_rev: parseFloat(item.total_rev || 0)
    }));

    res.json({
      total_orders,
      today_orders,
      today_revenue,
      monthly_revenue,
      total_revenue,
      total_customers,
      pending_orders,
      cashier_stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin list users
router.get('/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const serialized = users.map(u => ({
      id: u._id,
      name: u.name,
      phone: u.phone && u.phone.startsWith('email_') ? '' : (u.phone || ''),
      email: u.email,
      role: u.role,
      points: u.points,
      total_spent: parseFloat(u.total_spent),
      date_joined: u.createdAt.toISOString(),
      subscriptionTier: u.subscriptionTier
    }));
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin create user
router.post('/users', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, phone, email, password, role, points, subscriptionTier } = req.body;

  if (!name || !password || (!phone && !email)) {
    return res.status(400).json({ error: 'Missing fields: name, password, and phone/email required' });
  }

  try {
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) return res.status(409).json({ error: 'Phone already registered' });
    }
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const u = await User.create({
      name,
      phone: phone || `email_${Date.now()}`,
      email: email || null,
      password: hashedPassword,
      role: role || 'customer',
      points: parseInt(points || 0),
      subscriptionTier: subscriptionTier || 'none'
    });

    res.json({ success: true, id: u._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin edit user
router.patch('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, phone, email, role, points, password, subscriptionTier } = req.body;

  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });

    if (name !== undefined) u.name = name;
    if (phone !== undefined) u.phone = phone;
    if (email !== undefined) u.email = email;
    if (role !== undefined) u.role = role;
    if (points !== undefined) u.points = parseInt(points);
    if (subscriptionTier !== undefined) u.subscriptionTier = subscriptionTier;
    if (password) {
      u.password = await bcrypt.hash(password, 10);
    }

    await u.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin delete user
router.delete('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    
    await u.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- ADMIN DRINKS ENDPOINTS ---

// Admin list all drinks (GET /api/admin/drinks)
router.get('/drinks', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const drinks = await Drink.find().populate('categoryId');
    
    // Sort similar to Django settings
    const sortedDrinks = drinks.sort((a, b) => {
      const orderA = a.categoryId ? a.categoryId.sort_order : 999;
      const orderB = b.categoryId ? b.categoryId.sort_order : 999;
      if (orderA !== orderB) return orderA - orderB;
      return String(a._id).localeCompare(String(b._id));
    });

    const serialized = sortedDrinks.map(d => ({
      id: d._id,
      category_id: d.categoryId ? d.categoryId._id : null,
      category_name: d.categoryId ? d.categoryId.name : '',
      category_name_ar: d.categoryId ? d.categoryId.name_ar : '',
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
      cat_name: d.categoryId ? d.categoryId.name_ar : ''
    }));
    
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin create drink (POST /api/admin/drinks)
router.post('/drinks', authenticateToken, requireRole('admin'), async (req, res) => {
  const {
    category_id, name, name_ar, tagline, description, ingredients,
    preparation, price, calories, serving_size, temperature, image_emoji,
    is_featured, is_available
  } = req.body;

  try {
    if (!category_id) return res.status(400).json({ error: 'category_id is required' });
    const category = await Category.findById(category_id);
    if (!category) {
      return res.status(400).json({ error: 'Invalid category_id' });
    }

    const d = await Drink.create({
      categoryId: category_id,
      name,
      name_ar,
      tagline: tagline || 'An unforgettable experience',
      description,
      ingredients,
      preparation: preparation || '',
      price,
      calories,
      serving_size,
      temperature: temperature || 'hot',
      image_emoji: image_emoji || 'imgs/espresso.png',
      is_featured: parseInt(is_featured || 0),
      is_available: parseInt(is_available || 1)
    });
    
    res.json({ success: true, id: d._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin edit drink (PATCH /api/admin/drinks/:id)
router.patch('/drinks/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const d = await Drink.findById(req.params.id);
    if (!d) {
      return res.status(404).json({ error: 'Drink not found' });
    }

    const data = req.body;
    if (data.category_id !== undefined && data.category_id !== '') {
      const category = await Category.findById(data.category_id);
      if (!category) return res.status(400).json({ error: 'Invalid category_id' });
      d.categoryId = data.category_id;
    }
    
    if (data.name !== undefined) d.name = data.name;
    if (data.name_ar !== undefined) d.name_ar = data.name_ar;
    if (data.tagline !== undefined) d.tagline = data.tagline;
    if (data.description !== undefined) d.description = data.description;
    if (data.ingredients !== undefined) d.ingredients = data.ingredients;
    if (data.preparation !== undefined) d.preparation = data.preparation;
    if (data.price !== undefined) d.price = data.price;
    if (data.calories !== undefined) d.calories = data.calories;
    if (data.serving_size !== undefined) d.serving_size = data.serving_size;
    if (data.temperature !== undefined) d.temperature = data.temperature;
    if (data.image_emoji !== undefined) d.image_emoji = data.image_emoji;
    if (data.is_featured !== undefined) d.is_featured = parseInt(data.is_featured);
    if (data.is_available !== undefined) d.is_available = parseInt(data.is_available);

    await d.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin delete drink (DELETE /api/admin/drinks/:id)
router.delete('/drinks/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const d = await Drink.findById(req.params.id);
    if (!d) {
      return res.status(404).json({ error: 'Drink not found' });
    }
    await d.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- ADMIN OFFERS ENDPOINTS ---

// Admin create offer (POST /api/admin/offers)
router.post('/offers', authenticateToken, requireRole('admin'), async (req, res) => {
  const { drink_id, discount_percent, expires_at } = req.body;

  if (!drink_id || !discount_percent) {
    return res.status(400).json({ error: 'Missing drink_id or discount_percent' });
  }

  try {
    const drink = await Drink.findById(drink_id);
    if (!drink) return res.status(400).json({ error: 'Invalid drink_id' });

    const o = await Offer.create({
      drinkId: drink_id,
      discount_percent: parseInt(discount_percent),
      expires_at: expires_at ? new Date(expires_at) : null
    });

    res.json({ success: true, id: o._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin delete offer (DELETE /api/admin/offers/:id)
router.delete('/offers/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const o = await Offer.findById(req.params.id);
    if (!o) return res.status(404).json({ error: 'Offer not found' });
    
    await o.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- ADMIN CATEGORIES ENDPOINTS ---

// Admin list all categories
router.get('/categories', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const cats = await Category.find().sort({ sort_order: 1, _id: 1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin create category
router.post('/categories', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, name_ar, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name (EN) is required' });

  try {
    const c = await Category.create({
      name,
      name_ar: name_ar || name,
      sort_order: parseInt(sort_order || 0)
    });
    res.json({ success: true, id: c._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin edit category
router.patch('/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Category not found' });

    const { name, name_ar, sort_order } = req.body;
    if (name !== undefined) c.name = name;
    if (name_ar !== undefined) c.name_ar = name_ar;
    if (sort_order !== undefined) c.sort_order = parseInt(sort_order);

    await c.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin delete category
router.delete('/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Category not found' });

    // Check if any drinks reference this category
    const drinksUsing = await Drink.countDocuments({ categoryId: req.params.id });
    if (drinksUsing > 0) {
      return res.status(400).json({ error: `Cannot delete: ${drinksUsing} drink(s) use this category. Reassign them first.` });
    }

    await c.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
