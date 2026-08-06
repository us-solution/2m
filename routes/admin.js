// ===== مسار لوحة التحكم (Admin) - إدارة المستخدمين والمشروبات والعروض والفئات والتقارير والنسخ الاحتياطي =====
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

// تهيئة Pusher للإشعارات الفورية
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

// إعلام الواجهة الأمامية بتغيير المنيو
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


// جلب إحصائيات عامة للوحة التحكم (إجمالي الطلبات، إيرادات اليوم والشهر، أداء الكاشير)
router.get('/stats', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // بداية الشهر الحالي
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // إجمالي عدد الطلبات الكلي
    const total_orders = await Order.countDocuments();

    // عدد طلبات اليوم
    const today_orders = await Order.countDocuments({
      createdAt: { $gte: today }
    });

    // إيرادات اليوم (بدون الملغاة)
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

    // إيرادات الشهر الحالي
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

    // إجمالي الإيرادات لكل الوقت
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

    // إجمالي عدد العملاء المسجلين
    const total_customers = await User.countDocuments({ role: 'customer' });

    // الطلبات المعلقة
    const pending_orders = await Order.countDocuments({ status: 'pending' });

    // إحصائيات أداء الكاشير (الطلبات التي تمت معالجتها اليوم)
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

// جلب قائمة جميع المستخدمين (sorted by newest first)
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

// إنشاء مستخدم جديد بواسطة الأدمن (مع تشفير كلمة المرور)
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

// تعديل بيانات مستخدم موجود
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

// حذف مستخدم (يمنع حذف النفس)
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

// ===== إدارة المشروبات =====

// جلب جميع المشروبات مع الفئة (مرتبة حسب ترتيب الفئة)
router.get('/drinks', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const drinks = await Drink.find().populate('category_id');
    
    // ترتيب حسب sort_order للفئة ثم حسب id
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

// إضافة مشروب جديد
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

// تعديل مشروب موجود
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

// حذف مشروب
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

// ===== إدارة العروض =====

// جلب جميع العروض مع المشروبات المرتبطة
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

// إنشاء عرض جديد (خصم على مشروب)
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

// حذف عرض
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

// ===== إدارة الفئات =====

// جلب جميع الفئات مرتبة
router.get('/categories', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const cats = await Category.find().sort({ sort_order: 1, _id: 1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إنشاء فئة جديدة
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

// تعديل فئة
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

// حذف فئة (يمنع إذا كان هناك مشروبات مرتبطة بها)
router.delete('/categories/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Category not found' });

    // التحقق من عدم وجود مشروبات تستخدم هذه الفئة
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

// إنشاء رمز QR لرقم طاولة معين
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

// جلب تقارير متزامنة من نظام نقاط البيع (POS)
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

// تصدير نسخة احتياطية لجميع المجموعات
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

// استعادة مجموعة محددة من النسخة الاحتياطية (يمنع استعادة المستخدمين والطلبات عبر API)
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

// جلب صور الشركاء المعتمدة وقيد الانتظار
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

// الموافقة على صورة الشريك (لوجو، صورة رئيسية، معرض صور)
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

// حذف/رفض صورة الشريك (سواء معتمدة أو قيد الانتظار)
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
