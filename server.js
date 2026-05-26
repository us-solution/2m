const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { sanitizeInput } = require('./middlewares/sanitize');
const connectDB = require('./config/database');
require('dotenv').config();

// Initialize Models (register Mongoose models)
require('./models/User');
require('./models/Category');
require('./models/Drink');
require('./models/Order');
require('./models/PointsLog');
require('./models/Offer');
require('./models/GameRoom');

const app = express();
const PORT = process.env.PORT || 5000;

// 0. Middleware to connect MongoDB only for API routes
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

// 1. Security Headers (with Helmet configured to allow CDNs for frontend)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://js.pusher.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://*"],
      connectSrc: ["'self'", "https://api.pusher.com", "wss://ws-eu.pusher.com", "https://sockjs-eu.pusher.com"]
    }
  }
}));

// 2. CORS configurations
app.use(cors());

// 3. Compression middleware (Gzip)
app.use(compression());

// 4. Body parsers & sanitization
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);

// 5. Caching headers middleware for static assets
app.use((req, res, next) => {
  const ext = path.extname(req.path);
  if (['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'].includes(ext)) {
    // Cache static files for 1 year
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (['.html', '.htm'].includes(ext) || req.path === '/' || req.path === '') {
    // HTML files should validate cache
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

// 6. API Routes (with DB middleware)
app.use('/api/auth', requireDB, require('./routes/auth'));
app.use('/api/categories', requireDB, require('./routes/categories'));
app.use('/api/drinks', requireDB, require('./routes/drinks'));
app.use('/api/orders', requireDB, require('./routes/orders'));
app.use('/api/offers', requireDB, require('./routes/offers'));
app.use('/api/me', requireDB, require('./routes/me'));
app.use('/api/admin', requireDB, require('./routes/admin'));

app.use('/api/game', requireDB, require('./routes/game'));

app.post('/api/debug-log', requireDB, (req, res) => {
  console.log('[FRONTEND LOG]', req.body);
  res.json({ success: true });
});

// Create admin (GET from browser — remove after use)




// 8. Serve Frontend Static Pages
app.use(express.static(path.join(__dirname, 'frontend')));

// Serve custom page fallbacks if not ending in extension
app.get('/cashier', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'cashier.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'login.html')));

// Catch-all to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Database seeding logic
async function seedDatabase() {
  const Category = require('./models/Category');
  const Drink = require('./models/Drink');
  const User = require('./models/User');
  const bcrypt = require('bcryptjs');

  // Clear existing data
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
      categoryId: catMap[d[0]],
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

  // Create default admin and cashier (only if they don't exist)
  const existingAdmin = await User.findOne({ email: 'admin@ozel.cafe' });
  if (!existingAdmin) {
    const adminPassword = await bcrypt.hash('admin123', 10);
    await User.create({
      name: 'Admin',
      phone: '01000000000',
      email: 'admin@ozel.cafe',
      password: adminPassword,
      role: 'admin',
      subscriptionTier: 'gold'
    });
  }

  const existingCashier = await User.findOne({ email: 'cashier@ozel.cafe' });
  if (!existingCashier) {
    const cashierPassword = await bcrypt.hash('cashier123', 10);
    await User.create({
      name: 'Cashier',
      phone: '01000000001',
      email: 'cashier@ozel.cafe',
      password: cashierPassword,
      role: 'cashier',
      subscriptionTier: 'silver'
    });
  }

  console.log('Database seeding finished.');
}

// 9. Start Server (only for local dev, not on Vercel)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server is running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;
