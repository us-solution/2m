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

// إنشاء ملف PDF لبطاقات رموز QR للطاولات مع التصميم المخصص
router.get('/qr-tables-pdf', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 1;
    const end = parseInt(req.query.end) || 1;
    const baseUrl = req.query.baseUrl || process.env.BASE_URL || 'https://www.ozel.cafe';
    const welcomeText = req.query.welcomeText || 'Welcome!';
    const thankYouText = req.query.thankYouText || 'Thank you for choosing Özel.';
    const enjoyText = req.query.enjoyText || 'Enjoy your time with us.';
    const showTableNum = req.query.showTableNum !== 'false';

    if (start < 1 || end < 1 || start > end) {
      return res.status(400).json({ error: 'Invalid range: start and end must be >= 1 and start <= end' });
    }

    const fs = require('fs');
    const path = require('path');
    const axios = require('axios');
    const PDFDocument = require('pdfkit');
    const QRCode = require('qrcode');

    // التأكد من تحميل الخطوط
    const fontsDir = path.join(__dirname, '../fonts');
    if (!fs.existsSync(fontsDir)) {
      fs.mkdirSync(fontsDir, { recursive: true });
    }

    const fontUrls = {
      'CormorantGaramond-Bold': 'https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_hg9KnTOj9k7Ifo.ttf',
      'CormorantGaramond-Regular': 'https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_v86KnTOj9k7Ifo.ttf',
      'AlexBrush-Regular': 'https://fonts.gstatic.com/s/alexbrush/v23/SZc83FzrJKuqFbwMKk6EhUXz6BlNiCY.ttf',
      'Montserrat-Medium': 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtZ6Hw5aX9-obK4.ttf',
      'Tajawal-Bold': 'https://fonts.gstatic.com/s/tajawal/v12/Iura6YBj_oCad4k1nzGNDw.ttf',
      'Tajawal-Regular': 'https://fonts.gstatic.com/s/tajawal/v12/Iura6YBj_oCad4k1nzGBCw.ttf'
    };

    for (const [name, url] of Object.entries(fontUrls)) {
      const fontPath = path.join(fontsDir, `${name}.ttf`);
      if (!fs.existsSync(fontPath)) {
        console.log(`[Admin PDF] Downloading missing font: ${name}...`);
        try {
          const response = await axios({ method: 'get', url, responseType: 'stream' });
          const writer = fs.createWriteStream(fontPath);
          response.data.pipe(writer);
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
        } catch (err) {
          console.error(`[Admin PDF] Error downloading font ${name}:`, err.message);
        }
      }
    }

    // إعداد مستند PDF
    const doc = new PDFDocument({
      size: [297.64, 419.53], // A6 في نقاط (points)
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OZEL-Table-Cards-${start}-to-${end}.pdf"`);
    doc.pipe(res);

    // مسارات الخطوط
    const fontBold = fs.existsSync(path.join(fontsDir, 'CormorantGaramond-Bold.ttf')) ? path.join(fontsDir, 'CormorantGaramond-Bold.ttf') : 'Helvetica-Bold';
    const fontRegular = fs.existsSync(path.join(fontsDir, 'CormorantGaramond-Regular.ttf')) ? path.join(fontsDir, 'CormorantGaramond-Regular.ttf') : 'Helvetica';
    const fontScript = fs.existsSync(path.join(fontsDir, 'AlexBrush-Regular.ttf')) ? path.join(fontsDir, 'AlexBrush-Regular.ttf') : 'Times-Italic';
    const fontSans = fs.existsSync(path.join(fontsDir, 'Montserrat-Medium.ttf')) ? path.join(fontsDir, 'Montserrat-Medium.ttf') : 'Helvetica';
    const fontArabicReg = fs.existsSync(path.join(fontsDir, 'Tajawal-Regular.ttf')) ? path.join(fontsDir, 'Tajawal-Regular.ttf') : 'Helvetica';
    const fontArabicBold = fs.existsSync(path.join(fontsDir, 'Tajawal-Bold.ttf')) ? path.join(fontsDir, 'Tajawal-Bold.ttf') : 'Helvetica-Bold';

    // تسجيل الخطوط في PDFKit
    if (fontBold !== 'Helvetica-Bold') doc.registerFont('Serif-Bold', fontBold);
    if (fontRegular !== 'Helvetica') doc.registerFont('Serif-Regular', fontRegular);
    if (fontScript !== 'Times-Italic') doc.registerFont('Script', fontScript);
    if (fontSans !== 'Helvetica') doc.registerFont('Sans', fontSans);
    doc.registerFont('Ar-Reg', fontArabicReg);
    doc.registerFont('Ar-Bold', fontArabicBold);

    const hasArabic = (text) => /[\u0600-\u06FF]/.test(text);

    // دالة مساعدة لرسم غصن نباتي زخرفي واقعي وجميل
    const drawLeafBranch = (pdfDoc, x, y, scale, rotation, leafColor) => {
      pdfDoc.save();
      pdfDoc.translate(x, y);
      pdfDoc.scale(scale);
      pdfDoc.rotate(rotation);

      // رسم الساق الرئيسي (stem)
      pdfDoc.strokeColor(leafColor)
            .lineWidth(1)
            .moveTo(0, 0)
            .bezierCurveTo(20, -10, 45, -25, 55, -55)
            .stroke();

      // دالة فرعية لرسم ورقة واحدة
      const drawSingleLeaf = (lx, ly, w, h, angle) => {
        pdfDoc.save();
        pdfDoc.translate(lx, ly);
        pdfDoc.rotate(angle);
        pdfDoc.moveTo(0, 0)
              .bezierCurveTo(w * 0.3, -h * 0.5, w * 0.7, -h * 0.5, w, 0)
              .bezierCurveTo(w * 0.7, h * 0.5, w * 0.3, h * 0.5, 0, 0)
              .closePath()
              .fillColor(leafColor)
              .fill();
        pdfDoc.restore();
      };

      // رسم الأوراق على امتداد الساق بـ opacity
      pdfDoc.fillOpacity(0.45);
      drawSingleLeaf(52, -50, 14, 5.5, -45); // ورقة القمة
      drawSingleLeaf(42, -32, 16, 6, -15);
      drawSingleLeaf(33, -25, 15, 5.5, -75);
      drawSingleLeaf(22, -14, 18, 6.5, 0);
      drawSingleLeaf(15, -11, 16, 6, -95);

      pdfDoc.restore();
    };

    // حلقة توليد البطاقات
    for (let tableNum = start; tableNum <= end; tableNum++) {
      if (tableNum > start) {
        doc.addPage({
          size: [297.64, 419.53],
          margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });
      }

      const qrUrl = `${baseUrl}/cart.html?table=${tableNum}`;
      const qr = QRCode.create(qrUrl, { errorCorrectionLevel: 'H' });
      const N = qr.modules.size;

      // الألوان
      const bgColor = '#F4F0EB';
      const darkGreen = '#3F4E46';
      const burgundy = '#4E1B1B';
      const textDark = '#2C2520';
      const softGreen = '#7E8F85';

      // 1. رسم الحدود الخارجية والإطار القوسي المقصوص
      doc.save()
         .moveTo(10, 410)
         .lineTo(10, 149)
         .arc(149, 149, 139, 180, 0, false)
         .lineTo(288, 410)
         .closePath()
         .fillAndStroke(bgColor, '#CCCCCC');

      // رسم ورقة نباتية زخرفية في الزاوية العلوية اليمنى (منحنية لأسفل ولليسار)
      drawLeafBranch(doc, 250, 60, 1.1, 40, softGreen);

      // رسم ورقة نباتية زخرفية في الزاوية السفلية اليسرى (منحنية لأعلى ولليمين)
      drawLeafBranch(doc, 45, 360, 1.1, 220, softGreen);

      // 2. رسم شعار الكافيه العلوي
      const logoPath = path.join(__dirname, '../frontend/imgs/Ozel-Logo--02.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 149 - 25, 45, { width: 50 });
      }

      // رسم اسم الكافيه
      doc.fillColor(burgundy)
         .font(fontRegular !== 'Helvetica' ? 'Serif-Regular' : 'Helvetica')
         .fontSize(36)
         .text('özel', 0, 95, { align: 'center', width: 297.64 });

      doc.fillColor(textDark)
         .font(fontSans !== 'Helvetica' ? 'Sans' : 'Helvetica')
         .fontSize(7)
         .text('H I D D E N   G E M', 0, 135, { align: 'center', width: 297.64 });

      // رسم الخط الفاصل
      doc.strokeColor(textDark)
         .lineWidth(0.5)
         .moveTo(100, 145)
         .lineTo(198, 145)
         .stroke();

      // العناوين
      doc.fillColor(textDark)
         .font(fontRegular !== 'Helvetica' ? 'Serif-Regular' : 'Helvetica')
         .fontSize(16)
         .text('Scan the QR Code', 0, 155, { align: 'center', width: 297.64 });

      doc.font(fontSans !== 'Helvetica' ? 'Sans' : 'Helvetica')
         .fontSize(8)
         .text('TO VIEW OUR MENU', 0, 175, { align: 'center', width: 297.64 });

      // 3. رسم كارت رمز QR بالزوايا الدائرية والخلفية البيضاء
      const cardSize = 130;
      const cardX = 149 - cardSize / 2;
      const cardY = 195;
      doc.roundedRect(cardX, cardY, cardSize, cardSize, 12)
         .fillColor('#FFFFFF')
         .fill();

      // رسم مربعات ونقاط رمز QR
      const qrPadding = 12;
      const qrSize = cardSize - qrPadding * 2;
      const d = qrSize / N;
      const qx = cardX + qrPadding;
      const qy = cardY + qrPadding;

      const cx = qx + qrSize / 2;
      const cy = qy + qrSize / 2;
      const centerRadiusLimit = 4.2 * d;

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          // تخطي زوايا التوجيه الرئيسية الثلاث
          if (r < 7 && c < 7) continue;
          if (r < 7 && c >= N - 7) continue;
          if (r >= N - 7 && c < 7) continue;

          const mx = qx + c * d;
          const my = qy + r * d;

          // تخطي المركز لوضع الشعار الدائري
          const dist = Math.sqrt((mx + d/2 - cx) ** 2 + (my + d/2 - cy) ** 2);
          if (dist < centerRadiusLimit) continue;

          if (qr.modules.get(r, c)) {
            doc.fillColor(darkGreen)
               .roundedRect(mx + d * 0.05, my + d * 0.05, d * 0.9, d * 0.9, d * 0.3)
               .fill();
          }
        }
      }

      // رسم زوايا التوجيه الدائرية المخصصة (Finder Patterns)
      const finders = [
        { fx: qx, fy: qy },
        { fx: qx + (N - 7) * d, fy: qy },
        { fx: qx, fy: qy + (N - 7) * d }
      ];

      finders.forEach(({ fx, fy }) => {
        // الإطار الخارجي الأخضر
        doc.fillColor(darkGreen)
           .roundedRect(fx, fy, 7 * d, 7 * d, 1.8 * d)
           .fill();
        // الإطار الأوسط الأبيض
        doc.fillColor('#FFFFFF')
           .roundedRect(fx + d, fy + d, 5 * d, 5 * d, 1.2 * d)
           .fill();
        // المربع الداخلي العنابي
        doc.fillColor(burgundy)
           .roundedRect(fx + 2 * d, fy + 2 * d, 3 * d, 3 * d, 0.8 * d)
           .fill();
      });

      // رسم الدائرة البيضاء في المنتصف
      doc.fillColor('#FFFFFF')
         .strokeColor(darkGreen)
         .lineWidth(1)
         .circle(cx, cy, centerRadiusLimit - 0.5)
         .fillAndStroke();

      // وضع شعار الوردة الصغير في منتصف الـ QR
      if (fs.existsSync(logoPath)) {
        const lSize = 5.5 * d;
        doc.image(logoPath, cx - lSize / 2, cy - lSize / 2, { width: lSize });
      }

      // الأيقونات الجانبية (explore / phone)
      const iconY = cardY + cardSize / 2 - 10;
      
      // اليسار: أيقونة غطاء تقديم الطعام (Explore menu)
      doc.strokeColor(darkGreen)
         .lineWidth(1.2)
         .moveTo(35, iconY + 5)
         .lineTo(55, iconY + 5)
         .stroke()
         .arc(45, iconY + 5, 8, 180, 360, false)
         .stroke()
         .circle(45, iconY - 4, 1.5)
         .fill(darkGreen);

      doc.fillColor(textDark)
         .font(fontSans !== 'Helvetica' ? 'Sans' : 'Helvetica')
         .fontSize(4.5)
         .text('EXPLORE', 20, iconY + 12, { align: 'center', width: 50 })
         .text('OUR MENU', 20, iconY + 18, { align: 'center', width: 50 });

      // اليمين: أيقونة الهاتف والنقر (Fast & Easy)
      doc.strokeColor(darkGreen)
         .lineWidth(1.2)
         .roundedRect(240, iconY - 8, 10, 16, 2)
         .stroke()
         .circle(245, iconY + 5, 1)
         .fill(darkGreen);
      
      doc.strokeColor(burgundy)
         .lineWidth(0.8)
         .moveTo(252, iconY - 2)
         .lineTo(256, iconY - 4)
         .moveTo(253, iconY + 2)
         .lineTo(257, iconY + 2)
         .moveTo(252, iconY + 6)
         .lineTo(256, iconY + 8)
         .stroke();

      doc.fillColor(textDark)
         .font(fontSans !== 'Helvetica' ? 'Sans' : 'Helvetica')
         .fontSize(4.5)
         .text('FAST', 220, iconY + 12, { align: 'center', width: 50 })
         .text('& EASY', 220, iconY + 18, { align: 'center', width: 50 });

      // رسم زر الموقع الأخضر أسفل كارت الـ QR
      const pillW = 75;
      const pillH = 15;
      const pillX = 149 - pillW / 2;
      const pillY = cardY + cardSize + 10;
      
      doc.fillColor(darkGreen)
         .roundedRect(pillX, pillY, pillW, pillH, 7.5)
         .fill();

      // الكرة الأرضية البيضاء داخل الزر
      doc.strokeColor('#FFFFFF')
         .lineWidth(0.8)
         .circle(pillX + 8, pillY + 7.5, 4)
         .stroke();

      doc.fillColor('#FFFFFF')
         .font(fontSans !== 'Helvetica' ? 'Sans' : 'Helvetica')
         .fontSize(6)
         .text('ozel.cafe', pillX + 15, pillY + 4.5, { width: pillW - 15, align: 'left' });

      // 4. رسالة الترحيب الكيرسيف اليدوية
      doc.fillColor(burgundy)
         .font(fontScript !== 'Times-Italic' ? 'Script' : 'Times-Italic')
         .fontSize(28)
         .text(welcomeText, 0, 345, { align: 'center', width: 297.64 });

      // 5. رسائل الشكر وتمنيات المتعة
      const isThankAr = hasArabic(thankYouText);
      const isEnjoyAr = hasArabic(enjoyText);

      doc.fillColor(textDark)
         .font(isThankAr ? 'Ar-Reg' : (fontRegular !== 'Helvetica' ? 'Serif-Regular' : 'Helvetica'))
         .fontSize(isThankAr ? 8 : 9)
         .text(thankYouText, 0, 375, { align: 'center', width: 297.64 });

      doc.font(isEnjoyAr ? 'Ar-Reg' : (fontRegular !== 'Helvetica' ? 'Serif-Regular' : 'Helvetica'))
         .fontSize(isEnjoyAr ? 8 : 9)
         .text(enjoyText, 0, 386, { align: 'center', width: 297.64 });

      // رسم الغصن النباتي البسيط أسفل كارت الترحيب
      doc.strokeColor(softGreen)
         .lineWidth(0.5)
         .moveTo(140, 400)
         .quadraticCurveTo(149, 398, 158, 400)
         .stroke();

      // 6. كتابة رقم الطاولة
      if (showTableNum) {
        doc.fillColor(burgundy)
           .font(fontRegular !== 'Helvetica' ? 'Serif-Bold' : 'Helvetica-Bold')
           .fontSize(10)
           .text(`Table ${tableNum}`, 0, 405, { align: 'center', width: 297.64 });
      }
    }

    doc.end();
  } catch (err) {
    console.error('[Admin PDF Generate Error]', err);
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
