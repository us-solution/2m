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
router.get('/qr-tables-pdf', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const start   = parseInt(req.query.start) || 1;
    const end     = parseInt(req.query.end)   || 1;
    const baseUrl       = req.query.baseUrl       || process.env.BASE_URL || 'https://www.ozel.cafe';
    const welcomeText   = req.query.welcomeText   || 'Welcome!';
    const thankYouText  = req.query.thankYouText  || 'Thank you for choosing Ã–zel.';
    const enjoyText     = req.query.enjoyText     || 'Enjoy your time with us.';
    const showTableNum  = req.query.showTableNum  !== 'false';

    if (start < 1 || end < 1 || start > end) {
      return res.status(400).json({ error: 'Invalid range' });
    }

    const fs    = require('fs');
    const path  = require('path');
    const axios = require('axios');
    const PDFDocument = require('pdfkit');
    const QRCode      = require('qrcode');

    // â”€â”€ ØªØ­Ù…ÙŠÙ„ Ø§Ù„Ø®Ø·ÙˆØ· Ø§Ù„Ø«Ø§Ø¨ØªØ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const fontsDir = path.join(__dirname, '../fonts');
    if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

    const fontUrls = {
      'CormorantGaramond-Bold':    'https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_hg9KnTOj9k7Ifo.ttf',
      'CormorantGaramond-Regular': 'https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_v86KnTOj9k7Ifo.ttf',
      'AlexBrush-Regular':         'https://fonts.gstatic.com/s/alexbrush/v23/SZc83FzrJKuqFbwMKk6EhUXz6BlNiCY.ttf',
      'Montserrat-Medium':         'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtZ6Hw5aX9-obK4.ttf',
      'Tajawal-Bold':              'https://fonts.gstatic.com/s/tajawal/v12/Iura6YBj_oCad4k1nzGNDw.ttf',
      'Tajawal-Regular':           'https://fonts.gstatic.com/s/tajawal/v12/Iura6YBj_oCad4k1nzGBCw.ttf'
    };
    for (const [name, url] of Object.entries(fontUrls)) {
      const fp = path.join(fontsDir, `${name}.ttf`);
      if (!fs.existsSync(fp)) {
        try {
          const r = await axios({ method: 'get', url, responseType: 'stream' });
          const w = fs.createWriteStream(fp);
          r.data.pipe(w);
          await new Promise((res, rej) => { w.on('finish', res); w.on('error', rej); });
        } catch (e) { console.error('[PDF Font]', name, e.message); }
      }
    }

    // â”€â”€ Ø¥Ø¹Ø¯Ø§Ø¯ Ù…Ø³ØªÙ†Ø¯ PDF  A6 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Ø­Ø¬Ù… A6 Ø¨Ø§Ù„Ù†Ù‚Ø§Ø·: 297.64 Ã— 419.53  (Ø¹Ø±Ø¶ Ã— Ø§Ø±ØªÙØ§Ø¹)
    const PW = 297.64;
    const PH = 419.53;

    const doc = new PDFDocument({ size: [PW, PH], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OZEL-Table-Cards-${start}-to-${end}.pdf"`);
    doc.pipe(res);

    // â”€â”€ ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø®Ø·ÙˆØ· â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const F = (name, fallback) => {
      const fp = path.join(fontsDir, `${name}.ttf`);
      if (fs.existsSync(fp)) { doc.registerFont(name, fp); return name; }
      return fallback;
    };
    const fSerif  = F('CormorantGaramond-Regular', 'Times-Roman');
    const fSerifB = F('CormorantGaramond-Bold',    'Times-Bold');
    const fScript = F('AlexBrush-Regular',         'Times-Italic');
    const fSans   = F('Montserrat-Medium',          'Helvetica');
    const fArReg  = F('Tajawal-Regular',            'Helvetica');
    const fArBold = F('Tajawal-Bold',               'Helvetica-Bold');

    const hasArabic = t => /[\u0600-\u06FF]/.test(t);

    // â”€â”€ Ø£Ù„ÙˆØ§Ù† â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const bgColor   = '#F4F0EB';
    const dkGreen   = '#3F4E46';
    const burgundy  = '#4E1B1B';
    const textDark  = '#2C2520';
    const leafColor = '#8FA090';
    const woodDark  = '#5C3A1E';
    const woodLight = '#8B5E3C';

    // â”€â”€ Ù…Ø³Ø§Ø± Ø§Ù„Ù„ÙˆØ¬Ùˆ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const logoPath = path.join(__dirname, '../frontend/imgs/Ozel-Logo--02.png');

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    //  Ø¯Ø§Ù„Ø©: Ø±Ø³Ù… Ø§Ù„ÙƒØ§Ø±Øª ÙƒØ§Ù…Ù„Ø§Ù‹ Ù„Ø·Ø§ÙˆÙ„Ø© Ù…Ø¹ÙŠÙ‘Ù†Ø©
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const drawCard = (tableNum) => {

      // Ø§Ù„Ø«ÙˆØ§Ø¨Øª Ø§Ù„Ù‡Ù†Ø¯Ø³ÙŠØ© Ù„Ù„Ø´ÙƒÙ„ Ø§Ù„Ù‚ÙˆØ³ÙŠ
      // Ø§Ù„Ù‚ÙˆØ³ ÙŠØ¨Ø¯Ø£ Ù…Ù† Ø£Ø³ÙÙ„ Ø¨Ø­Ø§ÙØ© Ù…Ø³ØªÙ‚ÙŠÙ…Ø© Ø¹Ù†Ø¯ Y=408 Ø«Ù… ÙŠØ±ØªÙØ¹ Ø¨Ø´ÙƒÙ„ Ù…Ø³ØªÙ‚ÙŠÙ… Ø­ØªÙ‰ Y=155
      // Ø«Ù… ÙŠÙ†Ø­Ù†ÙŠ ÙÙŠ Ù‚ÙˆØ³ Ø¯Ø§Ø¦Ø±ÙŠ ÙˆÙŠÙ†ØªÙ‡ÙŠ Ø¹Ù†Ø¯ Ø§Ù„Ù‚Ù…Ø©
      const arcCenterY = 140;   // Ù…Ø±ÙƒØ² Ø§Ù„Ù‚ÙˆØ³ Ø§Ù„Ø¹Ù„ÙˆÙŠ
      const arcR       = 130;   // Ù†ØµÙ Ù‚Ø·Ø± Ø§Ù„Ù‚ÙˆØ³
      const arcCenterX = PW / 2;
      const cardLeft   = arcCenterX - arcR;   // = 18.82
      const cardRight  = arcCenterX + arcR;   // = 278.82
      const cardBottom = 408;                 // Ø§Ù„Ø­Ø¯ Ø§Ù„Ø³ÙÙ„ÙŠ Ù„Ù„ÙƒØ§Ø±Øª (ÙÙˆÙ‚ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø®Ø´Ø¨ÙŠØ©)

      // â”€â”€ 1. Ø®Ù„ÙÙŠØ© Ø§Ù„ÙƒØ§Ø±Øª Ø§Ù„Ù‚ÙˆØ³ÙŠØ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      doc.save()
         .moveTo(cardLeft, cardBottom)
         .lineTo(cardLeft, arcCenterY)
         .arc(arcCenterX, arcCenterY, arcR, Math.PI, 0, false)
         .lineTo(cardRight, cardBottom)
         .closePath()
         .fill(bgColor)
         .restore();

      // Ø§Ù„Ø¥Ø·Ø§Ø± Ø§Ù„Ù…ØªÙ‚Ø·Ø¹ (Ø­ÙˆØ§Ù Ø§Ù„Ù‚Øµ)
      doc.save()
         .moveTo(cardLeft, cardBottom)
         .lineTo(cardLeft, arcCenterY)
         .arc(arcCenterX, arcCenterY, arcR, Math.PI, 0, false)
         .lineTo(cardRight, cardBottom)
         .lineTo(cardLeft, cardBottom)
         .strokeColor('#AAAAAA')
         .lineWidth(0.5)
         .dash(3, { space: 3 })
         .stroke()
         .restore();

      // â”€â”€ 2. Ø§Ù„ÙØ±ÙˆØ¹ Ø§Ù„Ù†Ø¨Ø§ØªÙŠØ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Ø¯Ø§Ù„Ø© Ø±Ø³Ù… ÙˆØ±Ù‚Ø© Ù†Ø¨Ø§ØªÙŠØ© Ù…Ù† Ù†Ù‚Ø·ØªÙŠÙ†
      const leaf = (x1, y1, x2, y2, bulge = 0.4) => {
        const dx = x2 - x1, dy = y2 - y1;
        const nx = -dy * bulge, ny = dx * bulge;
        doc.moveTo(x1, y1)
           .bezierCurveTo(x1 + dx*0.3 + nx, y1 + dy*0.3 + ny, x1 + dx*0.7 + nx, y1 + dy*0.7 + ny, x2, y2)
           .bezierCurveTo(x1 + dx*0.7 - nx, y1 + dy*0.7 - ny, x1 + dx*0.3 - nx, y1 + dy*0.3 - ny, x1, y1)
           .closePath()
           .fill();
      };

      // â† ÙØ±ÙˆØ¹ Ø§Ù„Ø²Ø§ÙˆÙŠØ© Ø§Ù„Ø¹Ù„ÙˆÙŠØ© Ø§Ù„ÙŠÙ…Ù†Ù‰
      doc.save().fillColor(leafColor).fillOpacity(0.7);
      // Ø³Ø§Ù‚ Ø±Ø¦ÙŠØ³ÙŠ
      doc.strokeColor(leafColor).lineWidth(1).fillOpacity(0.0);
      doc.moveTo(240, 40).bezierCurveTo(260, 55, 268, 85, 255, 110).stroke();
      doc.moveTo(255, 80).bezierCurveTo(270, 70, 278, 60, 272, 50).stroke();
      doc.moveTo(250, 100).bezierCurveTo(268, 95, 276, 85, 271, 72).stroke();
      // Ø§Ù„Ø£ÙˆØ±Ø§Ù‚
      doc.fillOpacity(0.6);
      leaf(248, 42,  264, 30,  0.45);
      leaf(257, 56,  275, 48,  0.45);
      leaf(260, 72,  280, 63,  0.45);
      leaf(258, 88,  277, 82,  0.45);
      leaf(252, 105, 270, 102, 0.40);
      doc.restore();

      // â† ÙØ±ÙˆØ¹ Ø§Ù„Ø²Ø§ÙˆÙŠØ© Ø§Ù„Ø³ÙÙ„ÙŠØ© Ø§Ù„ÙŠØ³Ø±Ù‰
      doc.save().fillColor(leafColor).fillOpacity(0.7);
      doc.strokeColor(leafColor).lineWidth(1).fillOpacity(0.0);
      doc.moveTo(55, 370).bezierCurveTo(38, 355, 30, 325, 42, 300).stroke();
      doc.moveTo(42, 325).bezierCurveTo(28, 332, 20, 345, 26, 358).stroke();
      doc.moveTo(47, 344).bezierCurveTo(30, 347, 22, 360, 27, 372).stroke();
      doc.fillOpacity(0.6);
      leaf(53, 368,  38, 378, 0.45);
      leaf(46, 352,  28, 358, 0.45);
      leaf(43, 336,  24, 338, 0.45);
      leaf(43, 318,  25, 316, 0.45);
      leaf(44, 300,  28, 296, 0.40);
      doc.restore();

      // â”€â”€ 3. Ù„ÙˆØ¬Ùˆ + Ø§Ø³Ù… Ø§Ù„ÙƒØ§ÙÙŠÙ‡ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const midX = PW / 2;

      // Ø¯Ø§Ø¦Ø±Ø© Ø§Ù„Ù„ÙˆØ¬Ùˆ
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, midX - 18, 28, { width: 36 });
      } else {
        // Ø¨Ø¯ÙŠÙ„ Ù…Ø±Ø³ÙˆÙ… ÙŠØ¯ÙˆÙŠØ§Ù‹
        doc.save()
           .strokeColor(burgundy).lineWidth(1.2)
           .circle(midX, 46, 16).stroke()
           .restore();
      }

      // Ã¶zel Ø¨Ø§Ù„Ø®Ø· Ø§Ù„Ù€ Serif Ø§Ù„ÙƒØ¨ÙŠØ±
      doc.fillColor(burgundy)
         .font(fSerifB)
         .fontSize(38)
         .text('Ã¶zel', 0, 68, { align: 'center', width: PW, characterSpacing: 1 });

      // Hidden Gem ØµØºÙŠØ±Ø©
      doc.fillColor(textDark)
         .font(fSans)
         .fontSize(6.5)
         .text('Hidden Gem', 0, 108, { align: 'center', width: PW, characterSpacing: 1.5 });

      // Ø®Ø· ÙØ§ØµÙ„ Ø±ÙÙŠØ¹
      doc.save()
         .strokeColor(textDark).lineWidth(0.4)
         .moveTo(midX - 55, 120).lineTo(midX + 55, 120)
         .stroke()
         .restore();

      // â”€â”€ 4. Ø¹Ù†ÙˆØ§Ù† Scan the QR Code â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      doc.fillColor(textDark)
         .font(fSerif)
         .fontSize(18)
         .text('Scan the QR Code', 0, 126, { align: 'center', width: PW });

      // Ø®Ø·ÙˆØ· TO VIEW OUR MENU Ù…Ø¹ Ø³Ø·Ø±ÙŠÙ† Ø¹Ù„Ù‰ Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠÙ†
      const menuY = 148;
      doc.save()
         .strokeColor(textDark).lineWidth(0.4)
         .moveTo(cardLeft + 8, menuY + 4).lineTo(midX - 52, menuY + 4)
         .stroke()
         .restore();
      doc.fillColor(textDark).font(fSans).fontSize(6.5)
         .text('TO VIEW OUR MENU', 0, menuY, { align: 'center', width: PW, characterSpacing: 1.2 });
      doc.save()
         .strokeColor(textDark).lineWidth(0.4)
         .moveTo(midX + 52, menuY + 4).lineTo(cardRight - 8, menuY + 4)
         .stroke()
         .restore();

      // Ù†Ù‚Ø·Ø© Ø²Ø®Ø±ÙÙŠØ© ØµØºÙŠØ±Ø© ÙÙŠ Ø§Ù„Ù…Ù†ØªØµÙ Ø£Ø³ÙÙ„ Ø§Ù„Ø³Ø·Ø±
      doc.save()
         .fillColor(textDark)
         .circle(midX, menuY + 12, 1.5)
         .fill()
         .restore();

      // â”€â”€ 5. ÙƒØ§Ø±Øª QR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const qrUrl = `${baseUrl}/cart.html?table=${tableNum}`;
      const qr = QRCode.create(qrUrl, { errorCorrectionLevel: 'H' });
      const N  = qr.modules.size;

      const cardSz = 138;
      const cardX  = midX - cardSz / 2;
      const cardY  = 163;

      // Ø¸Ù„ Ù†Ø§Ø¹Ù…
      doc.save()
         .fillColor('#D9D3CA')
         .roundedRect(cardX + 3, cardY + 3, cardSz, cardSz, 12)
         .fill()
         .restore();

      // Ø®Ù„ÙÙŠØ© Ø¨ÙŠØ¶Ø§Ø¡
      doc.save()
         .fillColor('#FFFFFF')
         .roundedRect(cardX, cardY, cardSz, cardSz, 12)
         .fill()
         .restore();

      // Ø­Ø³Ø§Ø¨ Ù†Ù‚Ø§Ø· QR
      const qrPad  = 12;
      const qrSz   = cardSz - qrPad * 2;
      const d      = qrSz / N;
      const qx     = cardX + qrPad;
      const qy     = cardY + qrPad;
      const cx     = qx + qrSz / 2;
      const cy     = qy + qrSz / 2;
      const cRad   = 4.8 * d;   // Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ù„ÙˆØ¬Ùˆ Ø§Ù„Ù…Ø±ÙƒØ²ÙŠØ©

      // Ù†Ù‚Ø§Ø· QR Ø§Ù„Ø¯Ø§Ø¦Ø±ÙŠØ©
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (r < 7 && c < 7)       continue;
          if (r < 7 && c >= N - 7)  continue;
          if (r >= N - 7 && c < 7)  continue;
          const mx = qx + c * d + d / 2;
          const my = qy + r * d + d / 2;
          const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
          if (dist < cRad) continue;
          if (qr.modules.get(r, c)) {
            doc.save()
               .fillColor(dkGreen)
               .circle(mx, my, d * 0.42)
               .fill()
               .restore();
          }
        }
      }

      // Finder Patterns Ø§Ù„Ù…Ø®ØµØµØ©
      const finders = [
        { fx: qx, fy: qy },
        { fx: qx + (N - 7) * d, fy: qy },
        { fx: qx, fy: qy + (N - 7) * d }
      ];
      finders.forEach(({ fx, fy }) => {
        doc.save()
           .fillColor(dkGreen)
           .roundedRect(fx, fy, 7*d, 7*d, 1.6*d).fill()
           .fillColor('#FFFFFF')
           .roundedRect(fx + 0.9*d, fy + 0.9*d, 5.2*d, 5.2*d, 1.1*d).fill()
           .fillColor(burgundy)
           .roundedRect(fx + 2*d, fy + 2*d, 3*d, 3*d, 0.7*d).fill()
           .restore();
      });

      // Ø¯Ø§Ø¦Ø±Ø© Ø§Ù„Ù„ÙˆØ¬Ùˆ Ø§Ù„Ù…Ø±ÙƒØ²ÙŠØ©
      doc.save()
         .fillColor('#FFFFFF')
         .strokeColor(dkGreen).lineWidth(1)
         .circle(cx, cy, cRad - 0.5)
         .fillAndStroke()
         .restore();

      if (fs.existsSync(logoPath)) {
        const lSz = cRad * 1.5;
        doc.image(logoPath, cx - lSz/2, cy - lSz/2, { width: lSz });
      }

      // â”€â”€ 6. Ø§Ù„Ø£ÙŠÙ‚ÙˆÙ†Ø§Øª Ø§Ù„Ø¬Ø§Ù†Ø¨ÙŠØ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const iconMidY = cardY + cardSz / 2;

      // â† ÙŠØ³Ø§Ø±: ØºØ·Ø§Ø¡ ØªÙ‚Ø¯ÙŠÙ… Ø§Ù„Ø·Ø¹Ø§Ù…
      const LX = cardX - 35;
      doc.save()
         .strokeColor(dkGreen).lineWidth(1.2);
      // Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„ØµØ­Ù†
      doc.moveTo(LX - 12, iconMidY + 8).lineTo(LX + 12, iconMidY + 8).stroke();
      // Ù‚Ø¨Ø© Ø§Ù„ØºØ·Ø§Ø¡
      doc.moveTo(LX - 10, iconMidY + 8)
         .bezierCurveTo(LX - 10, iconMidY, LX + 10, iconMidY, LX + 10, iconMidY + 8)
         .stroke();
      // Ø§Ù„Ù…Ù‚Ø¨Ø¶
      doc.circle(LX, iconMidY - 2, 2).stroke();
      doc.restore();
      doc.fillColor(textDark).font(fSans).fontSize(5)
         .text('EXPLORE', LX - 18, iconMidY + 11, { width: 36, align: 'center', characterSpacing: 0.5 })
         .text('OUR MENU', LX - 18, iconMidY + 17, { width: 36, align: 'center', characterSpacing: 0.5 });

      // â† ÙŠÙ…ÙŠÙ†: Ù‡Ø§ØªÙ + Ø¨Ø±Ù‚
      const RX = cardX + cardSz + 35;
      doc.save()
         .strokeColor(dkGreen).lineWidth(1.2)
         .roundedRect(RX - 7, iconMidY - 10, 12, 18, 2).stroke()
         .circle(RX - 1, iconMidY + 5, 1.2).fill(dkGreen)
         .restore();
      // Ø§Ù„Ø¨Ø±Ù‚
      doc.save()
         .strokeColor(burgundy).lineWidth(1)
         .moveTo(RX + 8,  iconMidY - 6)
         .lineTo(RX + 4,  iconMidY + 0)
         .lineTo(RX + 8,  iconMidY + 0)
         .lineTo(RX + 4,  iconMidY + 7)
         .stroke()
         .restore();
      doc.fillColor(textDark).font(fSans).fontSize(5)
         .text('FAST',  RX - 16, iconMidY + 11, { width: 32, align: 'center', characterSpacing: 0.5 })
         .text('& EASY', RX - 16, iconMidY + 17, { width: 32, align: 'center', characterSpacing: 0.5 });

      // â”€â”€ 7. Ø²Ø± ozel.cafe â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const pillW  = 90;
      const pillH  = 17;
      const pillX  = midX - pillW / 2;
      const pillY  = cardY + cardSz + 12;

      doc.save()
         .fillColor(dkGreen)
         .roundedRect(pillX, pillY, pillW, pillH, pillH / 2)
         .fill()
         .restore();

      // Ø£ÙŠÙ‚ÙˆÙ†Ø© Ø§Ù„ÙƒØ±Ø© Ø§Ù„Ø£Ø±Ø¶ÙŠØ©
      const gX = pillX + 15, gY = pillY + pillH / 2;
      doc.save()
         .strokeColor('#FFFFFF').lineWidth(0.85)
         .circle(gX, gY, 5).stroke()
         .moveTo(gX - 5, gY).lineTo(gX + 5, gY).stroke()
         .moveTo(gX, gY - 5).lineTo(gX, gY + 5).stroke()
         .restore();
      // Ø®Ø·ÙˆØ· Ø®Ø· Ø§Ù„Ø¹Ø±Ø¶ Ø§Ù„Ù…Ù†Ø­Ù†ÙŠØ©
      doc.save().strokeColor('#FFFFFF').lineWidth(0.6);
      doc.moveTo(gX - 4.5, gY - 2.5).bezierCurveTo(gX, gY - 3.5, gX, gY - 3.5, gX + 4.5, gY - 2.5).stroke();
      doc.moveTo(gX - 4.5, gY + 2.5).bezierCurveTo(gX, gY + 3.5, gX, gY + 3.5, gX + 4.5, gY + 2.5).stroke();
      doc.restore();

      // Ø§Ù„Ù†Øµ
      doc.fillColor('#FFFFFF')
         .font(fSans).fontSize(7.5)
         .text('ozel.cafe', pillX + 26, pillY + 4.5, { width: pillW - 28, align: 'center' });

      // Ù…Ø¤Ø´Ø± Ø§Ù„Ù…Ø§ÙˆØ³ Ø¨Ø¬Ø§Ù†Ø¨ Ø§Ù„Ø²Ø±
      const curX = pillX + pillW + 4, curY = pillY + pillH - 2;
      doc.save()
         .fillColor('#FFFFFF').strokeColor('#333333').lineWidth(0.5)
         .moveTo(curX, curY)
         .lineTo(curX - 4, curY + 10)
         .lineTo(curX - 1, curY + 7)
         .lineTo(curX + 3, curY + 11)
         .lineTo(curX + 5, curY + 9)
         .lineTo(curX + 1, curY + 5)
         .lineTo(curX + 4, curY + 2)
         .closePath()
         .fillAndStroke()
         .restore();

      // â”€â”€ 8. Ù†Øµ Ø§Ù„ØªØ±Ø­ÙŠØ¨ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const welcomeY = pillY + pillH + 10;
      doc.fillColor(burgundy)
         .font(fScript)
         .fontSize(26)
         .text(welcomeText, 0, welcomeY, { align: 'center', width: PW });

      // Ø®Ø· ÙØ§ØµÙ„ Ø®ÙÙŠÙ
      doc.save()
         .strokeColor(textDark).lineWidth(0.3).opacity(0.4)
         .moveTo(midX - 60, welcomeY + 30).lineTo(midX + 60, welcomeY + 30)
         .stroke()
         .restore();

      // Ø¬Ù…Ù„Ø© Ø§Ù„Ø´ÙƒØ±
      const tyF = hasArabic(thankYouText) ? fArReg : fSerif;
      doc.fillColor(textDark).font(tyF).fontSize(8)
         .text(thankYouText, 0, welcomeY + 34, { align: 'center', width: PW });

      // Ø¬Ù…Ù„Ø© Ø§Ù„Ø§Ø³ØªÙ…ØªØ§Ø¹
      const ejF = hasArabic(enjoyText) ? fArReg : fSerif;
      doc.fillColor(textDark).font(ejF).fontSize(8)
         .text(enjoyText, 0, welcomeY + 45, { align: 'center', width: PW });

      // â”€â”€ 9. Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø®Ø´Ø¨ÙŠØ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const baseTop = cardBottom;  // = 408
      const baseH   = PH - baseTop; // Ø§Ù„Ù…Ø³Ø§Ø­Ø© Ø§Ù„Ù…ØªØ¨Ù‚ÙŠØ©

      // Ø§Ù„Ø´ÙƒÙ„ Ø§Ù„Ù…Ù‚ÙˆØ³ Ù„Ù„Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø®Ø´Ø¨ÙŠØ© (ÙŠØ´Ø¨Ù‡ Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© ÙÙŠ Ø§Ù„ØµÙˆØ±Ø©)
      const baseW = 70, baseHgt = baseH - 4;
      const bx = midX - baseW / 2;
      const by = baseTop;

      // Ø§Ù„Ø¬Ø²Ø¡ Ø§Ù„Ø¹Ù„ÙˆÙŠ Ù…Ù† Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø© (Ù…Ø³ØªØ·ÙŠÙ„ Ù…Ù†Ø­Ù†ÙŠ Ø§Ù„Ø­ÙˆØ§Ù)
      doc.save()
         .fillColor(woodLight)
         .roundedRect(bx, by, baseW, baseHgt, 3)
         .fill()
         .restore();

      // Ø®Ø´Ø¨ Ø¯Ø§ÙƒÙ† (Ø­Ø¨ÙŠØ¨Ø§Øª)
      doc.save().strokeColor(woodDark).lineWidth(0.5).opacity(0.3);
      for (let i = 0; i < 5; i++) {
        doc.moveTo(bx + 6 + i * 11, by + 2).lineTo(bx + 8 + i * 11, by + baseHgt - 2).stroke();
      }
      doc.restore();

      // Ø§Ù„Ù„ÙˆØ¬Ùˆ Ø§Ù„ØµØºÙŠØ± ÙÙŠ ÙˆØ³Ø· Ø§Ù„Ù‚Ø§Ø¹Ø¯Ø©
      if (fs.existsSync(logoPath)) {
        const lbSz = 10;
        doc.image(logoPath, midX - lbSz/2, by + (baseHgt - lbSz)/2, { width: lbSz });
      }

      // Ø±Ù‚Ù… Ø§Ù„Ø·Ø§ÙˆÙ„Ø©
      if (showTableNum) {
        doc.fillColor(burgundy).font(fSerifB).fontSize(8)
           .text(`Table ${tableNum}`, bx, by + baseHgt + 1, { width: baseW, align: 'center' });
      }
    };

    // â”€â”€ ØªÙˆÙ„ÙŠØ¯ ØµÙØ­Ø© Ù„ÙƒÙ„ Ø·Ø§ÙˆÙ„Ø© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (let tableNum = start; tableNum <= end; tableNum++) {
      if (tableNum > start) {
        doc.addPage({ size: [PW, PH], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
      }
      drawCard(tableNum);
    }

    doc.end();
  } catch (err) {
    console.error('[Admin PDF Generate Error]', err);
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
