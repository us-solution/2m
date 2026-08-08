// ===== Ù…Ø³Ø§Ø± Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ… (Admin) - Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† ÙˆØ§Ù„Ù…Ø´Ø±ÙˆØ¨Ø§Øª ÙˆØ§Ù„Ø¹Ø±ÙˆØ¶ ÙˆØ§Ù„ÙØ¦Ø§Øª ÙˆØ§Ù„ØªÙ‚Ø§Ø±ÙŠØ± ÙˆØ§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠ =====
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Drink = require('../models/Drink');
const Offer = require('../models/Offer');
const ReportSnapshot = require('../models/ReportSnapshot');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const Pusher = require('pusher');

// ØªÙ‡ÙŠØ¦Ø© Pusher Ù„Ù„Ø¥Ø´Ø¹Ø§Ø±Ø§Øª Ø§Ù„ÙÙˆØ±ÙŠØ©
let pusher = null;
if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET) {
  try {
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER || 'eu',
      useTLS: true
    });
  } catch (e) {
    console.error('[Pusher Init Error in Admin]', e.message);
  }
}

// Ø¥Ø¹Ù„Ø§Ù… Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ø£Ù…Ø§Ù…ÙŠØ© Ø¨ØªØºÙŠÙŠØ± Ø§Ù„Ù…Ù†ÙŠÙˆ
async function triggerMenuUpdate() {
  if (pusher) {
    try {
      await pusher.trigger('menu-updates', 'menu-changed', { timestamp: Date.now() });
      console.log('[Pusher] Menu update triggered.');
    } catch (err) {
      console.error('[Pusher Trigger Error in Admin]', err.message);
    }
  }
}


// Ø¬Ù„Ø¨ Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø¹Ø§Ù…Ø© Ù„Ù„ÙˆØ­Ø© Ø§Ù„ØªØ­ÙƒÙ… (Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø·Ù„Ø¨Ø§ØªØŒ Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„ÙŠÙˆÙ… ÙˆØ§Ù„Ø´Ù‡Ø±ØŒ Ø£Ø¯Ø§Ø¡ Ø§Ù„ÙƒØ§Ø´ÙŠØ±)
router.get('/stats', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Ø¨Ø¯Ø§ÙŠØ© Ø§Ù„Ø´Ù‡Ø± Ø§Ù„Ø­Ø§Ù„ÙŠ
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø¹Ø¯Ø¯ Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙƒÙ„ÙŠ
    const total_orders = await Order.countDocuments();

    // Ø¹Ø¯Ø¯ Ø·Ù„Ø¨Ø§Øª Ø§Ù„ÙŠÙˆÙ…
    const today_orders = await Order.countDocuments({
      createdAt: { $gte: today }
    });

    // Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„ÙŠÙˆÙ… (Ø¨Ø¯ÙˆÙ† Ø§Ù„Ù…Ù„ØºØ§Ø©)
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

    // Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„Ø´Ù‡Ø± Ø§Ù„Ø­Ø§Ù„ÙŠ
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

    // Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ù„ÙƒÙ„ Ø§Ù„ÙˆÙ‚Øª
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

    // Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø¹Ø¯Ø¯ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø§Ù„Ù…Ø³Ø¬Ù„ÙŠÙ†
    const total_customers = await User.countDocuments({ role: 'customer' });

    // Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù…Ø¹Ù„Ù‚Ø©
    const pending_orders = await Order.countDocuments({ status: 'pending' });

    // Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø£Ø¯Ø§Ø¡ Ø§Ù„ÙƒØ§Ø´ÙŠØ± (Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„ØªÙŠ ØªÙ…Øª Ù…Ø¹Ø§Ù„Ø¬ØªÙ‡Ø§ Ø§Ù„ÙŠÙˆÙ…)
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

// Ø¬Ù„Ø¨ Ù‚Ø§Ø¦Ù…Ø© Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† (sorted by newest first)
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
      subscriptionTier: u.subscriptionTier,
      customerStatus: u.customerStatus || 'standard',
      isPartner: u.isPartner || false,
      partnerLogo: u.partnerLogo || '',
      partnerBio: u.partnerBio || ''
    }));
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ø¥Ù†Ø´Ø§Ø¡ Ù…Ø³ØªØ®Ø¯Ù… Ø¬Ø¯ÙŠØ¯ Ø¨ÙˆØ§Ø³Ø·Ø© Ø§Ù„Ø£Ø¯Ù…Ù† (Ù…Ø¹ ØªØ´ÙÙŠØ± ÙƒÙ„Ù…Ø© Ø§Ù„Ù…Ø±ÙˆØ±)
router.post('/users', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, phone, email, password, role, points, subscriptionTier, customerStatus, isPartner, partnerLogo, partnerBio } = req.body;

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
    const isPartnerVal = role === 'partner' ? true : Boolean(isPartner);
    const u = await User.create({
      name,
      phone: phone || `email_${Date.now()}`,
      email: email || null,
      password: hashedPassword,
      role: role || 'customer',
      points: parseInt(points || 0),
      subscriptionTier: subscriptionTier || 'none',
      customerStatus: customerStatus || 'standard',
      isPartner: isPartnerVal,
      partnerLogo: partnerLogo || '',
      partnerBio: partnerBio || ''
    });

    res.json({ success: true, id: u._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ØªØ¹Ø¯ÙŠÙ„ Ø¨ÙŠØ§Ù†Ø§Øª Ù…Ø³ØªØ®Ø¯Ù… Ù…ÙˆØ¬ÙˆØ¯
router.patch('/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, phone, email, role, points, password, subscriptionTier, customerStatus, isPartner, partnerLogo, partnerBio } = req.body;

  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });

    if (name !== undefined) u.name = name;
    if (phone !== undefined) u.phone = phone;
    if (email !== undefined) u.email = email;
    if (role !== undefined) {
      u.role = role;
      u.isPartner = (role === 'partner') || (isPartner !== undefined ? Boolean(isPartner) : false);
    }
    if (points !== undefined) u.points = parseInt(points);
    if (subscriptionTier !== undefined) u.subscriptionTier = subscriptionTier;
    if (customerStatus !== undefined) u.customerStatus = customerStatus;
    if (isPartner !== undefined) u.isPartner = isPartner;
    if (partnerLogo !== undefined) u.partnerLogo = partnerLogo;
    if (partnerBio !== undefined) u.partnerBio = partnerBio;
    if (password) {
      u.password = await bcrypt.hash(password, 10);
    }

    await u.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ø­Ø°Ù Ù…Ø³ØªØ®Ø¯Ù… (ÙŠÙ…Ù†Ø¹ Ø­Ø°Ù Ø§Ù„Ù†ÙØ³)
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

// ===== Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø´Ø±ÙˆØ¨Ø§Øª =====

// Ø¬Ù„Ø¨ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…Ø´Ø±ÙˆØ¨Ø§Øª Ù…Ø¹ Ø§Ù„ÙØ¦Ø© (Ù…Ø±ØªØ¨Ø© Ø­Ø³Ø¨ ØªØ±ØªÙŠØ¨ Ø§Ù„ÙØ¦Ø©)
router.get('/drinks', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const drinks = await Drink.find().populate('category_id');
    
    // ØªØ±ØªÙŠØ¨ Ø­Ø³Ø¨ sort_order Ù„Ù„ÙØ¦Ø© Ø«Ù… Ø­Ø³Ø¨ id
    const sortedDrinks = drinks.sort((a, b) => {
      const orderA = a.category_id ? a.category_id.sort_order : 999;
      const orderB = b.category_id ? b.category_id.sort_order : 999;
      if (orderA !== orderB) return orderA - orderB;
      return String(a._id).localeCompare(String(b._id));
    });

    const serialized = sortedDrinks.map(d => ({
      id: d._id,
      category_id: d.category_id ? d.category_id._id : null,
      category_name: d.category_id ? d.category_id.name : '',
      category_name_ar: d.category_id ? d.category_id.name_ar : '',
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
      availableExtras: d.availableExtras || [],
      cat_name: d.category_id ? d.category_id.name_ar : ''
    }));
    
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ø¥Ø¶Ø§ÙØ© Ù…Ø´Ø±ÙˆØ¨ Ø¬Ø¯ÙŠØ¯
router.post('/drinks', authenticateToken, requireRole('admin'), async (req, res) => {
  const {
    category_id, name, name_ar, tagline, description, ingredients,
    preparation, price, calories, serving_size, temperature, image_emoji,
    is_featured, is_available, availableExtras
  } = req.body;

  try {
    if (!category_id) return res.status(400).json({ error: 'category_id is required' });
    const category = await Category.findById(category_id);
    if (!category) {
      return res.status(400).json({ error: 'Invalid category_id' });
    }

    const d = await Drink.create({
      category_id: category_id,
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
      is_available: parseInt(is_available || 1),
      availableExtras: availableExtras || []
    });
    
    triggerMenuUpdate();
    res.json({ success: true, id: d._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ØªØ¹Ø¯ÙŠÙ„ Ù…Ø´Ø±ÙˆØ¨ Ù…ÙˆØ¬ÙˆØ¯
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
      d.category_id = data.category_id;
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
    if (data.availableExtras !== undefined) d.availableExtras = data.availableExtras;

    await d.save();
    triggerMenuUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ø­Ø°Ù Ù…Ø´Ø±ÙˆØ¨
router.delete('/drinks/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const d = await Drink.findById(req.params.id);
    if (!d) {
      return res.status(404).json({ error: 'Drink not found' });
    }
    await d.deleteOne();
    triggerMenuUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===== Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø¹Ø±ÙˆØ¶ =====

// Ø¬Ù„Ø¨ Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¹Ø±ÙˆØ¶ Ù…Ø¹ Ø§Ù„Ù…Ø´Ø±ÙˆØ¨Ø§Øª Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø©
router.get('/offers', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const offers = await Offer.find({}).populate('drinkId').sort({ created_at: -1 });
    const serialized = offers.map(o => ({
      id: o._id,
      drink_id: o.drinkId ? o.drinkId._id : null,
      discount_percent: o.discount_percent,
      expires_at: o.expires_at ? o.expires_at.toISOString() : null,
      created_at: o.created_at.toISOString(),
      name: o.drinkId ? o.drinkId.name : 'Deleted',
      name_ar: o.drinkId ? o.drinkId.name_ar : '',
      price: o.drinkId ? parseFloat(o.drinkId.price) : 0,
      image_emoji: o.drinkId ? o.drinkId.image_emoji : null
    }));
    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ø¥Ù†Ø´Ø§Ø¡ Ø¹Ø±Ø¶ Ø¬Ø¯ÙŠØ¯ (Ø®ØµÙ… Ø¹Ù„Ù‰ Ù…Ø´Ø±ÙˆØ¨)
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

// Ø­Ø°Ù Ø¹Ø±Ø¶
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

// ===== Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„ÙØ¦Ø§Øª =====

// Ø¬Ù„Ø¨ Ø¬Ù…ÙŠØ¹ Ø§Ù„ÙØ¦Ø§Øª Ù…Ø±ØªØ¨Ø©
router.get('/categories', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const cats = await Category.find().sort({ sort_order: 1, _id: 1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ø¥Ù†Ø´Ø§Ø¡ ÙØ¦Ø© Ø¬Ø¯ÙŠØ¯Ø©
router.post('/categories', authenticateToken, requireRole('admin'), async (req, res) => {
  const { name, name_ar, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name (EN) is required' });

  try {
    const c = await Category.create({
      name,
      name_ar: name_ar || name,
      sort_order: parseInt(sort_order || 0)
    });
    triggerMenuUpdate();
    res.json({ success: true, id: c._id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ØªØ¹Ø¯ÙŠÙ„ ÙØ¦Ø©
router.patch('/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Category not found' });

    const { name, name_ar, sort_order } = req.body;
    if (name !== undefined) c.name = name;
    if (name_ar !== undefined) c.name_ar = name_ar;
    if (sort_order !== undefined) c.sort_order = parseInt(sort_order);

    await c.save();
    triggerMenuUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ø­Ø°Ù ÙØ¦Ø© (ÙŠÙ…Ù†Ø¹ Ø¥Ø°Ø§ ÙƒØ§Ù† Ù‡Ù†Ø§Ùƒ Ù…Ø´Ø±ÙˆØ¨Ø§Øª Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ù‡Ø§)
router.delete('/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Category not found' });

    // Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ø¹Ø¯Ù… ÙˆØ¬ÙˆØ¯ Ù…Ø´Ø±ÙˆØ¨Ø§Øª ØªØ³ØªØ®Ø¯Ù… Ù‡Ø°Ù‡ Ø§Ù„ÙØ¦Ø©
    const drinksUsing = await Drink.countDocuments({ category_id: req.params.id });
    if (drinksUsing > 0) {
      return res.status(400).json({ error: `Cannot delete: ${drinksUsing} drink(s) use this category. Reassign them first.` });
    }

    await c.deleteOne();
    triggerMenuUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ø¥Ù†Ø´Ø§Ø¡ Ø±Ù…Ø² QR Ù„Ø±Ù‚Ù… Ø·Ø§ÙˆÙ„Ø© Ù…Ø¹ÙŠÙ†
router.get('/qr-table/:number', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const tableNum = parseInt(req.params.number);
    if (!tableNum || tableNum < 1) return res.status(400).json({ error: 'Invalid table number' });
    const QRCode = require('qrcode');
    const baseUrl = process.env.BASE_URL || 'https://www.ozel.cafe';
    const qrUrl = baseUrl + '/cart.html?table=' + tableNum;
    const dataUrl = await QRCode.toDataURL(qrUrl, { width: 400, margin: 2, color: { dark: '#241E1A', light: '#FDFBF7' } });
    res.json({ success: true, qrCodeUrl: dataUrl, table: tableNum, url: qrUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ø¥Ù†Ø´Ø§Ø¡ Ù…Ù„Ù PDF Ù„Ø¨Ø·Ø§Ù‚Ø§Øª Ø±Ù…ÙˆØ² QR Ù„Ù„Ø·Ø§ÙˆÙ„Ø§Øª Ù…Ø¹ Ø§Ù„ØªØµÙ…ÙŠÙ… Ø§Ù„Ù…Ø®ØµØµ
// إنشاء ملف PDF لبطاقات رموز QR للطاولات
router.get('/qr-tables-pdf', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const start        = parseInt(req.query.start)  || 1;
    const end          = parseInt(req.query.end)    || 1;
    const baseUrl      = req.query.baseUrl      || process.env.BASE_URL || 'https://www.ozel.cafe';
    const welcomeText  = req.query.welcomeText  || 'Welcome!';
    const thankYouText = req.query.thankYouText || 'Thank you for choosing Ozel.';
    const enjoyText    = req.query.enjoyText    || 'Enjoy your time with us.';
    const showTableNum = req.query.showTableNum !== 'false';

    if (start < 1 || end < 1 || start > end)
      return res.status(400).json({ error: 'Invalid range' });

    const fs   = require('fs');
    const path = require('path');
    const axios = require('axios');
    const PDFDocument = require('pdfkit');
    const QRCode      = require('qrcode');

    // ─── Font download ────────────────────────────────────────────────────
    const fontsDir = path.join(__dirname, '../fonts');
    if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
    const FONTS = {
      CG_Reg:  'https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_v86KnTOj9k7Ifo.ttf',
      CG_Bold: 'https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_hg9KnTOj9k7Ifo.ttf',
      Alex:    'https://fonts.gstatic.com/s/alexbrush/v23/SZc83FzrJKuqFbwMKk6EhUXz6BlNiCY.ttf',
      Mont:    'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtZ6Hw5aX9-obK4.ttf',
      TajR:    'https://fonts.gstatic.com/s/tajawal/v12/Iura6YBj_oCad4k1nzGBCw.ttf',
    };
    for (const [k, url] of Object.entries(FONTS)) {
      const fp = path.join(fontsDir, `${k}.ttf`);
      if (!fs.existsSync(fp)) {
        try {
          const r = await axios({ method:'get', url, responseType:'stream' });
          const w = fs.createWriteStream(fp);
          r.data.pipe(w);
          await new Promise((ok, fail) => { w.on('finish', ok); w.on('error', fail); });
        } catch(e) { console.warn('[font]', k, e.message); }
      }
    }

    // ─── PDF document (A6: 297.64 x 419.53 pt) ───────────────────────────
    const PW = 297.64, PH = 419.53;
    const doc = new PDFDocument({ size:[PW,PH], margins:{top:0,bottom:0,left:0,right:0} });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OZEL-Tables-${start}-to-${end}.pdf"`);
    doc.pipe(res);

    // ─── Register fonts ───────────────────────────────────────────────────
    const reg = (k, fb) => { const fp = path.join(fontsDir, `${k}.ttf`); if(fs.existsSync(fp)){doc.registerFont(k,fp);return k;} return fb; };
    const fReg  = reg('CG_Reg',  'Times-Roman');
    const fBold = reg('CG_Bold', 'Times-Bold');
    const fScr  = reg('Alex',    'Times-Italic');
    const fSans = reg('Mont',    'Helvetica');
    const fAr   = reg('TajR',    'Helvetica');
    const hasAr = t => /[\u0600-\u06FF]/.test(t);

    // ─── Colors ───────────────────────────────────────────────────────────
    const BG    = '#F4F0EB';
    const GREEN = '#3F4E46';
    const RED   = '#4E1B1B';
    const DARK  = '#2C2520';
    const LEAF  = '#8FA090';
    const WD1   = '#7B4F2E';
    const WD2   = '#A67C52';

    // ─── Logo ─────────────────────────────────────────────────────────────
    const LOGO = path.join(__dirname, '../frontend/imgs/Ozel-Logo--02.png');
    const hasLogo = fs.existsSync(LOGO);

    // ─── Page geometry ────────────────────────────────────────────────────
    // Arch-shaped card: semi-circle top, straight sides, flat bottom
    //   CX   = horizontal center of page
    //   AR   = arch radius  →  card left = CX-AR = 5, card right = CX+AR = 292.64
    //   ACY  = Y-coordinate of arch center (top of straight sides)
    //          arch peak at Y = ACY - AR ≈ 6 (near page top)
    //   CBOT = card flat bottom Y
    const CX   = PW / 2;          // 148.82
    const AR   = CX - 5;          // 143.82  (5 pt margin each side)
    const ACY  = AR + 6;          // 149.82  (arch peak at Y≈6)
    const CBOT = 400;             // card bottom Y (wooden base below)

    // ─── drawCard ─────────────────────────────────────────────────────────
    const drawCard = (tbl) => {

      // ── Leaf helper (filled oval) ──────────────────────────────────────
      const leaf = (x1,y1, x2,y2, b=0.42) => {
        const dx=x2-x1, dy=y2-y1, nx=-dy*b, ny=dx*b;
        doc.moveTo(x1,y1)
           .bezierCurveTo(x1+dx*.3+nx, y1+dy*.3+ny, x1+dx*.7+nx, y1+dy*.7+ny, x2,y2)
           .bezierCurveTo(x1+dx*.7-nx, y1+dy*.7-ny, x1+dx*.3-nx, y1+dy*.3-ny, x1,y1)
           .closePath().fill();
      };

      // ① CARD SHAPE ─────────────────────────────────────────────────────
      // Path: bottom-left → up left side → arch over top → down right side → bottom-right → close
      const archShape = () =>
        doc.moveTo(CX-AR, CBOT)
           .lineTo(CX-AR, ACY)
           .arc(CX, ACY, AR, Math.PI, 0, false)
           .lineTo(CX+AR, CBOT)
           .closePath();

      doc.save(); archShape(); doc.fill(BG); doc.restore();
      doc.save(); archShape();
      doc.strokeColor('#C0B8B0').lineWidth(0.5);
      // Note: PDFKit dash is set via .dash()
      doc.dash(3, { space: 2 }).stroke().undash();
      doc.restore();

      // ② BOTANICAL BRANCHES ────────────────────────────────────────────
      // Top-right (within arch area, verified against arch boundary)
      doc.save();
      doc.fillColor(LEAF).fillOpacity(0.65);
      doc.strokeColor(LEAF).lineWidth(1.1);
      // Stems
      doc.save().fillOpacity(0).moveTo(198,26).bezierCurveTo(214,38,222,58,214,80).stroke().restore();
      doc.save().fillOpacity(0).moveTo(214,56).bezierCurveTo(228,46,234,36,228,24).stroke().restore();
      doc.save().fillOpacity(0).moveTo(212,70).bezierCurveTo(228,62,232,50,226,38).stroke().restore();
      // Leaves
      leaf(198,26, 204,18, 0.45);
      leaf(205,40, 218,32, 0.45);
      leaf(210,54, 224,47, 0.43);
      leaf(210,68, 224,62, 0.40);
      leaf(208,80, 220,77, 0.38);
      doc.restore();

      // Bottom-left (in rectangular portion of card, Y>ACY)
      doc.save();
      doc.fillColor(LEAF).fillOpacity(0.65);
      doc.strokeColor(LEAF).lineWidth(1.1);
      doc.save().fillOpacity(0).moveTo(58,376).bezierCurveTo(42,360,34,336,44,312).stroke().restore();
      doc.save().fillOpacity(0).moveTo(44,336).bezierCurveTo(30,344,22,356,28,368).stroke().restore();
      doc.save().fillOpacity(0).moveTo(50,354).bezierCurveTo(34,358,26,370,30,382).stroke().restore();
      leaf(57,376, 42,385, 0.45);
      leaf(50,360, 35,367, 0.45);
      leaf(45,343, 30,346, 0.42);
      leaf(44,327, 29,325, 0.42);
      leaf(45,311, 31,308, 0.38);
      doc.restore();

      // ③ LOGO + OZEL + HIDDEN GEM ──────────────────────────────────────
      if (hasLogo) doc.image(LOGO, CX-17, 16, { width:34 });
      else {
        doc.save().strokeColor(RED).lineWidth(1.2).circle(CX,33,15).stroke().restore();
      }

      doc.fillColor(RED).font(fBold).fontSize(36)
         .text('ozel', 0, 55, { align:'center', width:PW, characterSpacing:2 });

      doc.fillColor(DARK).font(fSans).fontSize(6.5)
         .text('H I D D E N   G E M', 0, 97, { align:'center', width:PW, characterSpacing:1 });

      doc.save().strokeColor(DARK).lineWidth(0.35)
         .moveTo(CX-48,108).lineTo(CX+48,108).stroke().restore();

      // ④ SCAN TEXT ─────────────────────────────────────────────────────
      doc.fillColor(DARK).font(fReg).fontSize(17)
         .text('Scan the QR Code', 0, 113, { align:'center', width:PW });

      // — TO VIEW OUR MENU —
      const MY = 135;
      doc.save().strokeColor(DARK).lineWidth(0.35)
         .moveTo(CX-AR+12, MY+4).lineTo(CX-46, MY+4).stroke().restore();
      doc.fillColor(DARK).font(fSans).fontSize(6.5)
         .text('TO VIEW OUR MENU', 0, MY, { align:'center', width:PW, characterSpacing:1.5 });
      doc.save().strokeColor(DARK).lineWidth(0.35)
         .moveTo(CX+46, MY+4).lineTo(CX+AR-12, MY+4).stroke().restore();

      // Diamond decoration
      doc.save().fillColor(DARK)
         .moveTo(CX,MY+14).lineTo(CX-3,MY+18).lineTo(CX,MY+22).lineTo(CX+3,MY+18).closePath().fill()
         .restore();

      // ⑤ QR CARD ───────────────────────────────────────────────────────
      const CSZ = 126;                    // QR white-card square size
      const QCX = CX - CSZ/2;            // QR card left X = 85.82
      const QCY = 158;                    // QR card top Y
      // At Y=158 the card is in straight-sided portion (Y > ACY=149.82), full width OK.

      // shadow
      doc.save().fillColor('#CEC8C2')
         .roundedRect(QCX+3, QCY+3, CSZ, CSZ, 10).fill().restore();
      // white card
      doc.save().fillColor('#FFFFFF')
         .roundedRect(QCX, QCY, CSZ, CSZ, 10).fill().restore();

      // QR modules
      const qrUrl = `${baseUrl}/cart.html?table=${tbl}`;
      const qrObj = QRCode.create(qrUrl, { errorCorrectionLevel:'H' });
      const N     = qrObj.modules.size;
      const PAD   = 11;
      const QSZ   = CSZ - 2*PAD;         // usable QR area
      const D     = QSZ / N;             // module size
      const MX    = QCX + PAD + QSZ/2;  // QR center X
      const MY2   = QCY + PAD + QSZ/2;  // QR center Y
      const CRAD  = 4.6 * D;            // center logo radius

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          // Skip 3 finder-pattern zones (top-left, top-right, bottom-left)
          if (r<7 && c<7)     continue;
          if (r<7 && c>=N-7)  continue;
          if (r>=N-7 && c<7)  continue;
          const mx = QCX + PAD + c*D + D/2;
          const my = QCY + PAD + r*D + D/2;
          // Skip center logo zone
          if (Math.sqrt((mx-MX)**2 + (my-MY2)**2) < CRAD) continue;
          if (qrObj.modules.get(r, c)) {
            doc.save().fillColor(GREEN).circle(mx, my, D*0.42).fill().restore();
          }
        }
      }

      // Custom finder patterns: outer=GREEN, middle=WHITE, inner=RED
      [[QCX+PAD, QCY+PAD], [QCX+PAD+(N-7)*D, QCY+PAD], [QCX+PAD, QCY+PAD+(N-7)*D]].forEach(([fx,fy]) => {
        doc.save()
           .fillColor(GREEN).roundedRect(fx, fy, 7*D, 7*D, 1.5*D).fill()
           .fillColor('#FFFFFF').roundedRect(fx+0.9*D, fy+0.9*D, 5.2*D, 5.2*D, 1.1*D).fill()
           .fillColor(RED).roundedRect(fx+2*D, fy+2*D, 3*D, 3*D, 0.7*D).fill()
           .restore();
      });

      // Center logo circle
      doc.save().fillColor('#FFFFFF').strokeColor(GREEN).lineWidth(1)
         .circle(MX, MY2, CRAD).fillAndStroke().restore();
      if (hasLogo) { const ls=CRAD*1.4; doc.image(LOGO, MX-ls/2, MY2-ls/2, {width:ls}); }

      // ⑥ SIDE ICONS (left & right of QR card, Y in straight portion) ───
      const IROW = QCY + CSZ/2;   // = 158 + 63 = 221  (in straight portion, full width)

      // LEFT: food cloche
      const LX = QCX - 34;        // = 85.82 - 34 = 51.82  (> card left=5) ✓
      doc.save().strokeColor(GREEN).lineWidth(1.2)
         .moveTo(LX-13, IROW+8).lineTo(LX+13, IROW+8).stroke()       // plate base
         .moveTo(LX-11, IROW+8)
         .bezierCurveTo(LX-11, IROW-2, LX+11, IROW-2, LX+11, IROW+8).stroke() // dome
         .save().fillColor(GREEN).circle(LX, IROW-5, 2.5).fill().restore()     // knob
         .restore();
      doc.fillColor(DARK).font(fSans).fontSize(5)
         .text('EXPLORE', LX-16, IROW+11, {width:32, align:'center', characterSpacing:0.4})
         .text('OUR MENU', LX-16, IROW+17, {width:32, align:'center', characterSpacing:0.4});

      // RIGHT: phone + lightning
      const RX = QCX + CSZ + 34;  // = 85.82 + 126 + 34 = 245.82  (< card right=292.64) ✓
      doc.save().strokeColor(GREEN).lineWidth(1.2)
         .roundedRect(RX-6, IROW-10, 11, 17, 2).stroke()
         .save().fillColor(GREEN).circle(RX-0.5, IROW+4.5, 1.2).fill().restore()
         .restore();
      doc.save().strokeColor(RED).lineWidth(1)
         .moveTo(RX+7, IROW-6).lineTo(RX+4, IROW+1)
         .lineTo(RX+7, IROW+1).lineTo(RX+3, IROW+8).stroke().restore();
      doc.fillColor(DARK).font(fSans).fontSize(5)
         .text('FAST',   RX-14, IROW+11, {width:28, align:'center', characterSpacing:0.4})
         .text('& EASY', RX-14, IROW+17, {width:28, align:'center', characterSpacing:0.4});

      // ⑦ OZEL.CAFE PILL BUTTON ─────────────────────────────────────────
      const PLW=88, PLH=16, PLX=CX-44, PLY=QCY+CSZ+10;
      doc.save().fillColor(GREEN).roundedRect(PLX, PLY, PLW, PLH, PLH/2).fill().restore();

      // Globe icon
      const GX=PLX+14, GY=PLY+PLH/2;
      doc.save().strokeColor('#FFFFFF').lineWidth(0.9).circle(GX,GY,5).stroke()
         .moveTo(GX-5,GY).lineTo(GX+5,GY).stroke().restore();
      doc.save().strokeColor('#FFFFFF').lineWidth(0.7);
      doc.moveTo(GX-4.5,GY-2.5).bezierCurveTo(GX,GY-3.5,GX,GY-3.5,GX+4.5,GY-2.5).stroke();
      doc.moveTo(GX-4.5,GY+2.5).bezierCurveTo(GX,GY+3.5,GX,GY+3.5,GX+4.5,GY+2.5).stroke();
      doc.restore();
      doc.fillColor('#FFFFFF').font(fSans).fontSize(8)
         .text('ozel.cafe', PLX+24, PLY+4.2, {width:PLW-26, align:'center'});

      // Mouse cursor arrow
      const CuX=PLX+PLW+3, CuY=PLY+PLH-4;
      doc.save().fillColor('#DEDEDE').strokeColor('#555').lineWidth(0.4)
         .moveTo(CuX,CuY).lineTo(CuX-3,CuY+9).lineTo(CuX,CuY+6.5)
         .lineTo(CuX+3.5,CuY+10).lineTo(CuX+5,CuY+8.5).lineTo(CuX+1.5,CuY+5)
         .lineTo(CuX+4,CuY+2.5).closePath().fillAndStroke().restore();

      // ⑧ WELCOME + THANK YOU ───────────────────────────────────────────
      const WY = PLY + PLH + 8;
      doc.fillColor(RED).font(fScr).fontSize(24)
         .text(welcomeText, 0, WY, {align:'center', width:PW});

      doc.save().strokeColor(DARK).lineWidth(0.3).opacity(0.3)
         .moveTo(CX-55, WY+29).lineTo(CX+55, WY+29).stroke().restore();

      const tyF = hasAr(thankYouText) ? fAr : fReg;
      const ejF = hasAr(enjoyText)    ? fAr : fReg;
      doc.fillColor(DARK).font(tyF).fontSize(8)
         .text(thankYouText, 0, WY+33, {align:'center', width:PW});
      doc.fillColor(DARK).font(ejF).fontSize(8)
         .text(enjoyText, 0, WY+44, {align:'center', width:PW});

      // Small decorative sprig
      const SPY = WY+57;
      doc.save().strokeColor(LEAF).lineWidth(0.8).fillColor(LEAF).fillOpacity(0.6);
      doc.moveTo(CX,SPY).lineTo(CX-18,SPY+9).stroke();
      doc.moveTo(CX,SPY).lineTo(CX+18,SPY+9).stroke();
      leaf(CX-9,SPY+4, CX-18,SPY+9, 0.4);
      leaf(CX+9,SPY+4, CX+18,SPY+9, 0.4);
      leaf(CX-4,SPY+1, CX-1,SPY-5, 0.5);
      leaf(CX+4,SPY+1, CX+1,SPY-5, 0.5);
      doc.restore();

      // ⑨ WOODEN BASE ───────────────────────────────────────────────────
      const BW=70, BH=PH-CBOT-2;
      const BX=CX-35, BY=CBOT+2;
      doc.save().fillColor(WD2).roundedRect(BX,BY,BW,BH,3).fill().restore();
      doc.save().strokeColor(WD1).lineWidth(0.6).opacity(0.35);
      for(let i=0;i<6;i++) { const wx=BX+5+i*10; doc.moveTo(wx,BY+2).lineTo(wx+2,BY+BH-2).stroke(); }
      doc.restore();
      if (hasLogo) { const ls=9; doc.image(LOGO, CX-ls/2, BY+(BH-ls)/2, {width:ls}); }

      if (showTableNum) {
        doc.fillColor(RED).font(fBold).fontSize(7)
           .text(`Table ${tbl}`, BX, BY+BH+1, {width:BW, align:'center'});
      }
    };

    // ── Generate pages ─────────────────────────────────────────────────────
    for (let t = start; t <= end; t++) {
      if (t > start) doc.addPage({size:[PW,PH], margins:{top:0,bottom:0,left:0,right:0}});
      drawCard(t);
    }
    doc.end();

  } catch (err) {
    console.error('[QR PDF Error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Ø¬Ù„Ø¨ ØªÙ‚Ø§Ø±ÙŠØ± Ù…ØªØ²Ø§Ù…Ù†Ø© Ù…Ù† Ù†Ø¸Ø§Ù… Ù†Ù‚Ø§Ø· Ø§Ù„Ø¨ÙŠØ¹ (POS)
router.get('/reports/:type', authenticateToken, requireRole('admin'), async (req, res) => {
  const { type } = req.params;
  const { days } = req.query;
  try {
    const limit = parseInt(days) || 30;
    const snapshots = await ReportSnapshot.find({ type })
      .sort({ snapshotDate: -1 })
      .limit(limit)
      .lean();
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ØªØµØ¯ÙŠØ± Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© Ù„Ø¬Ù…ÙŠØ¹ Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹Ø§Øª
router.get('/backup', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const collections = ['User', 'Category', 'Drink', 'Order', 'Offer', 'Expense', 'CashMovement', 'Shift', 'SyncEvent', 'Ingredient', 'Recipe', 'RecipeItem', 'InventoryTransaction', 'InventoryCount', 'StockAlert', 'ExpenseCategory'];
    const backup = {};
    for (const name of collections) {
      const model = require('../models/' + name);
      backup[name] = await model.find({}).lean();
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="ozel-backup-${new Date().toISOString().slice(0,10)}.json"`);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ù…Ø¬Ù…ÙˆØ¹Ø© Ù…Ø­Ø¯Ø¯Ø© Ù…Ù† Ø§Ù„Ù†Ø³Ø®Ø© Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© (ÙŠÙ…Ù†Ø¹ Ø§Ø³ØªØ¹Ø§Ø¯Ø© Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…ÙŠÙ† ÙˆØ§Ù„Ø·Ù„Ø¨Ø§Øª Ø¹Ø¨Ø± API)
router.post('/restore', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { collection, records } = req.body;
    if (!collection || !records) return res.status(400).json({ error: 'collection and records required' });
    if (['User', 'Order'].includes(collection)) return res.status(403).json({ error: 'Cannot restore sensitive collection via API' });
    const model = require('../models/' + collection);
    await model.deleteMany({});
    await model.insertMany(records);
    res.json({ success: true, collection, count: records.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ø¬Ù„Ø¨ ØµÙˆØ± Ø§Ù„Ø´Ø±ÙƒØ§Ø¡ Ø§Ù„Ù…Ø¹ØªÙ…Ø¯Ø© ÙˆÙ‚ÙŠØ¯ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±
router.get('/partners-images', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const partners = await User.find({ $or: [{ isPartner: true }, { role: 'partner' }] })
      .select('name partnerLogo partnerMainImage partnerGallery pendingPartnerLogo pendingPartnerMainImage pendingPartnerGallery')
      .sort({ name: 1 });
    res.json(partners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ø§Ù„Ù…ÙˆØ§ÙÙ‚Ø© Ø¹Ù„Ù‰ ØµÙˆØ±Ø© Ø§Ù„Ø´Ø±ÙŠÙƒ (Ù„ÙˆØ¬ÙˆØŒ ØµÙˆØ±Ø© Ø±Ø¦ÙŠØ³ÙŠØ©ØŒ Ù…Ø¹Ø±Ø¶ ØµÙˆØ±)
router.post('/partners/:id/approve-image', authenticateToken, requireRole('admin'), async (req, res) => {
  const { type, imageUrl } = req.body;
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Partner not found' });

    if (type === 'logo') {
      if (u.pendingPartnerLogo) {
        u.partnerLogo = u.pendingPartnerLogo;
        u.pendingPartnerLogo = '';
      }
    } else if (type === 'mainImage') {
      if (u.pendingPartnerMainImage) {
        u.partnerMainImage = u.pendingPartnerMainImage;
        u.pendingPartnerMainImage = '';
      }
    } else if (type === 'gallery') {
      if (u.pendingPartnerGallery && u.pendingPartnerGallery.includes(imageUrl)) {
        u.partnerGallery.push(imageUrl);
        u.pendingPartnerGallery = u.pendingPartnerGallery.filter(img => img !== imageUrl);
      } else {
        return res.status(400).json({ error: 'Image not found in pending gallery' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    await u.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ø­Ø°Ù/Ø±ÙØ¶ ØµÙˆØ±Ø© Ø§Ù„Ø´Ø±ÙŠÙƒ (Ø³ÙˆØ§Ø¡ Ù…Ø¹ØªÙ…Ø¯Ø© Ø£Ùˆ Ù‚ÙŠØ¯ Ø§Ù„Ø§Ù†ØªØ¸Ø§Ø±)
router.post('/partners/:id/delete-image', authenticateToken, requireRole('admin'), async (req, res) => {
  const { type, isPending, imageUrl } = req.body;
  try {
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'Partner not found' });

    if (type === 'logo') {
      if (isPending) {
        u.pendingPartnerLogo = '';
      } else {
        u.partnerLogo = '';
      }
    } else if (type === 'mainImage') {
      if (isPending) {
        u.pendingPartnerMainImage = '';
      } else {
        u.partnerMainImage = '';
      }
    } else if (type === 'gallery') {
      if (isPending) {
        u.pendingPartnerGallery = (u.pendingPartnerGallery || []).filter(img => img !== imageUrl);
      } else {
        u.partnerGallery = (u.partnerGallery || []).filter(img => img !== imageUrl);
      }
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    await u.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
