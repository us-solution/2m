// ============================================
// الملف الرئيسي للخادم - 2M CAFE
// يحتوي على إعدادات Express Routes, Middleware, Seeding
// ============================================

const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
require('dotenv').config();
const { sanitizeInput } = require('./middlewares/sanitize');
const connectDB = require('./config/database');

// ============================
// تسجيل نماذج Mongoose (Models)
// ============================
require('./models/User');
require('./models/Category');
require('./models/Drink');
require('./models/Order');
require('./models/PointsLog');
require('./models/Offer');
require('./models/SyncEvent');
require('./models/Expense');
require('./models/CashMovement');
require('./models/Ingredient');
require('./models/Recipe');
require('./models/RecipeItem');
require('./models/InventoryTransaction');
require('./models/InventoryCount');
require('./models/StockAlert');
const retryQueue = require('./retry-queue');
require('./models/ExpenseCategory');
require('./models/CustomizationOption');
require('./models/QueueOrder');
require('./models/QueueCustomer');
require('./models/SystemLicense');
require('./models/PosDevice');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================
// 0. Middleware لتوصيل MongoDB فقط لمسارات API
// ============================
async function requireDB(req, res, next) {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    res.status(500).json({ 
      error: 'Database connection failed',
      details: err.message
    });
  }
}

// ============================
// 1. رؤوس الأمان (Helmet) مع السماح لـ CDNs بالواجهة الأمامية
// ============================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://js.pusher.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*"],
      mediaSrc: ["'self'", "blob:", "mediastream:"],
      connectSrc: ["'self'", "https://api.pusher.com", "wss://ws-eu.pusher.com", "https://sockjs-eu.pusher.com", "https://js.pusher.com"]
    }
  }
}));

// ============================
// 2. إعدادات CORS (السماح بالنطاقات الأخرى)
// ============================
const websiteAllowedOrigins = String(process.env.WEBSITE_ALLOWED_ORIGINS || '')
  .split(',').map(value => value.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isLocal = origin.startsWith('http://localhost') || 
                    origin.startsWith('http://127.0.0.1') || 
                    /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin);
    const isDomain = origin.includes('2million.store') || 
                     origin.endsWith('.vercel.app') || 
                     origin.includes('ozel-cafe');

    if (isLocal || isDomain || websiteAllowedOrigins.length === 0 || websiteAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // السماح دائماً مع تسجيل تحذير بدلاً من رمي استثناء 500
    return callback(null, true);
  },
  credentials: true
}));

// ============================
// 3. Middleware للضغط (Gzip)
// ============================
app.use(compression());

// ============================
// 4. تفسير جسم الطلب (Body parsers) وتنظيف البيانات (حد الأقصى 10 ميجابايت للصور)
// ============================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(sanitizeInput);

// ============================
// 5. Middleware لتخزين الملفات الثابتة في الذاكرة المؤقتة (Caching)
// ============================
app.use((req, res, next) => {
  const ext = path.extname(req.path);
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'].includes(ext)) {
    // تخزين الصور والخطوط لمدة أسبوع
    res.setHeader('Cache-Control', 'public, max-age=604800');
  } else if (['.css', '.js', '.html', '.htm'].includes(ext) || req.path === '/' || req.path === '') {
    // ملفات CSS و JS و HTML يجب أن يتم تحديثها فوراً دون كاش قديم
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

// ============================
// 6. مسارات API (مع Middleware قاعدة البيانات)
// ============================
app.use('/api/auth', requireDB, require('./routes/auth'));
app.use('/api/categories', requireDB, require('./routes/categories'));
app.use('/api/drinks', requireDB, require('./routes/drinks'));
app.use('/api/orders', requireDB, require('./routes/orders'));
app.use('/api/offers', requireDB, require('./routes/offers'));
app.use('/api/me', requireDB, require('./routes/me'));
app.use('/api/admin', requireDB, require('./routes/admin'));
app.use('/api/bridge', requireDB, require('./routes/bridge'));
app.use('/api/shifts', requireDB, require('./routes/shifts'));
app.use('/api/reports', requireDB, require('./routes/reports'));
app.use('/api/finance', requireDB, require('./routes/finance'));
app.use('/api/inventory', requireDB, require('./routes/inventory'));
app.use('/api/recipes', requireDB, require('./routes/recipes'));
app.use('/api/customization', requireDB, require('./routes/customization'));
app.use('/api/cron', requireDB, require('./routes/cron'));

app.post('/api/debug-log', requireDB, (req, res) => {
  console.log('[FRONTEND LOG]', req.body);
  res.json({ success: true });
});

// ============================
// 7. (محجوز) إنشاء مشرف عبر المتصفح - يُزال بعد الاستخدام
// ============================




// ============================
// 8. خدمة الصفحات الثابتة للواجهة الأمامية
// ============================
app.use(express.static(path.join(__dirname, 'frontend')));

// مسارات مخصصة للصفحات عند عدم وجود امتداد
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'login.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'cart.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'profile.html')));

// ============================
// مسار Catch-all لإرجاع index.html
// ============================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ============================
// معالج الأخطاء العام (Global error handler) — يجب أن يكون آخر middleware
// ============================
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================
// منطق البذر الأولي لقاعدة البيانات (Seeding)
// ============================
async function seedDatabase() {
  const Category = require('./models/Category');
  const Drink = require('./models/Drink');
  const User = require('./models/User');
  const bcrypt = require('bcryptjs');

  // حذف البيانات الحالية
  await Category.deleteMany({});
  await Drink.deleteMany({});

  console.log('Seeding database categories and drinks...');

  const categoriesData = [
    { name: 'Turkish & French', name_ar: 'تركي وفرنسي', icon: 'imgs/turkish.png', sort_order: 1 },
    { name: 'Espresso Rituals', name_ar: 'طقوس الإسبريسو', icon: 'imgs/espresso.png', sort_order: 2 },
    { name: 'Refresh Juice', name_ar: 'عصائر منعشة', icon: 'imgs/juice.png', sort_order: 3 },
    { name: 'Smooth Escapes', name_ar: 'سموذي', icon: 'imgs/smoothie.png', sort_order: 4 },
    { name: 'Frappe Rituals', name_ar: 'فرابيه', icon: 'imgs/frappe.png', sort_order: 5 },
    { name: 'Mojito & Sun Rise', name_ar: 'موهيتو وسبارك', icon: 'imgs/mojito.png', sort_order: 6 },
    { name: 'Hot & More', name_ar: 'مشروبات ساخنة', icon: 'imgs/hotchoc.png', sort_order: 7 },
    { name: 'Milk Shaken Rituals', name_ar: 'ميلك شيك', icon: 'imgs/milkshake.png', sort_order: 8 },
    { name: 'Pure Classics Ice Coffee', name_ar: 'قهوة مثلجة كلاسيكية', icon: 'imgs/icedcoffee.png', sort_order: 9 },
    { name: 'Ice Cream', name_ar: 'آيس كريم', icon: 'imgs/icecream.png', sort_order: 10 },
    { name: 'Desserts', name_ar: 'حلويات', icon: 'imgs/desserts.png', sort_order: 11 }
  ];

  const createdCategories = await Category.insertMany(categoriesData);
  const catMap = {};
  createdCategories.forEach((c, idx) => {
    catMap[idx] = c._id;
  });

  const drinksData = [
    [0, 'Turkish Coffee', 'قهوة تركية', 25, 'hot', 'imgs/turkish.png', 0],
    [0, 'French Coffee', 'قهوة فرنسية', 30, 'hot', 'imgs/turkish.png', 0],
    [0, 'Hazelnut French Coffee', 'فرنسي بالبندق', 35, 'hot', 'imgs/turkish.png', 1],
    [1, 'Espresso Single', 'إسبريسو سينجل', 30, 'hot', 'imgs/espresso.png', 0],
    [1, 'Espresso Double', 'إسبريسو دبل', 35, 'hot', 'imgs/espresso.png', 0],
    [1, 'Macchiato Single', 'ماكياتو سينجل', 35, 'hot', 'imgs/espresso.png', 0],
    [1, 'Macchiato Double', 'ماكياتو دبل', 40, 'hot', 'imgs/espresso.png', 0],
    [1, 'Honey Lavender Latte', 'لاتيه عسل لافندر', 50, 'hot', 'imgs/latte.png', 1],
    [1, 'Beet Root Latte', 'لاتيه البنجر', 50, 'hot', 'imgs/latte.png', 1],
    [1, 'Americano Long', 'أمريكانو لونج', 35, 'hot', 'imgs/espresso.png', 0],
    [1, 'Flat White', 'فلات وايت', 40, 'hot', 'imgs/latte.png', 0],
    [1, 'Corto', 'كورتو', 40, 'hot', 'imgs/espresso.png', 0],
    [1, 'Piccolo', 'بيكولو', 40, 'hot', 'imgs/latte.png', 0],
    [1, 'Café Latte', 'كافيه لاتيه', 40, 'hot', 'imgs/latte.png', 0],
    [1, 'Cappuccino', 'كابتشينو', 40, 'hot', 'imgs/latte.png', 0],
    [1, 'Biscoff Espresso', 'إسبريسو بيسكوف', 50, 'hot', 'imgs/latte.png', 1],
    [1, 'Affogato Espresso', 'أفوكاتو', 55, 'hot', 'imgs/espresso.png', 1],
    [1, 'Smoked Rosemary Corto', 'كورتو روزماري مدخن', 55, 'hot', 'imgs/espresso.png', 1],
    [1, 'Mocha Latte', 'موكا لاتيه', 45, 'hot', 'imgs/latte.png', 0],
    [1, 'Spanish Latte', 'لاتيه إسباني', 45, 'hot', 'imgs/latte.png', 1],
    [2, 'Orange Juice', 'عصير برتقال', 40, 'cold', 'imgs/juice.png', 0],
    [2, 'Mango Juice', 'عصير مانجو', 45, 'cold', 'imgs/juice.png', 0],
    [2, 'Strawberry Juice', 'عصير فراولة', 45, 'cold', 'imgs/juice.png', 0],
    [5, 'Sun Rise', 'صن رايز', 45, 'cold', 'imgs/mojito.png', 1],
    [7, 'Lotus Biscoff Lava', 'لوتس لافا', 55, 'cold', 'imgs/milkshake.png', 1],
    [8, 'Ice Latte', 'آيس لاتيه', 45, 'cold', 'imgs/icedcoffee.png', 0],
    [10, 'Molten Lava', 'مولتن لافا', 60, 'hot', 'imgs/desserts.png', 1]
  ];

  for (const d of drinksData) {
    await Drink.create({
      category_id: catMap[d[0]],
      name: d[1],
      name_ar: d[2],
      price: d[3],
      temperature: d[4],
      image_emoji: d[5],
      is_featured: d[6],
      is_available: 1,
      tagline: 'An unforgettable experience',
      description: 'A premium drink crafted with the finest ingredients'
    });
  }

  // إنشاء مشرف وكاشير افتراضيين (إذا لم يكونوا موجودين)
  const existingAdmin = await User.findOne({ email: 'admin@2m.cafe' });
  if (!existingAdmin) {
    const adminPassword = await bcrypt.hash('admin123', 10);
    await User.create({
      name: '2M Admin',
      phone: '01000000000',
      email: 'admin@2m.cafe',
      password: adminPassword,
      role: 'admin',
      subscriptionTier: 'gold'
    });
  }

  const existingCashier = await User.findOne({ email: 'cashier@2m.cafe' });
  if (!existingCashier) {
    const cashierPassword = await bcrypt.hash('cashier123', 10);
    await User.create({
      name: '2M Cashier',
      phone: '01000000001',
      email: 'cashier@2m.cafe',
      password: cashierPassword,
      role: 'cashier',
      subscriptionTier: 'silver'
    });
  }

  console.log('Database seeding finished.');
}

// ============================
// 9. بدء الخادم (للتطوير المحلي فقط، وليس على Vercel)
// ============================
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  // الاتصال بقاعدة البيانات ثم بدء طابور إعادة المحاولة
  connectDB().then(() => {
    console.log('MongoDB connection established for startup.');
    retryQueue.start(60000);
  }).catch(err => {
    console.error('MongoDB startup connection failed:', err.message);
    retryQueue.start(60000);
  });
}

// ============================
// تصدير التطبيق لاستخدام Vercel Serverless
// ============================
module.exports = app;
