const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

// Load environment variables if needed
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ozel_cafe_secret_2025';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database (MongoDB) ───────────────────────────────────────────
const MONGO_URI = 'mongodb+srv://m16565680_db_user:MCFFg12%405@cluster0.zwr8bzd.mongodb.net/ozel_cafe?retryWrites=true&w=majority&appName=Cluster0';

async function dbMiddleware(req, res, next) {
  if (mongoose.connection.readyState >= 1) return next();
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB Atlas (via middleware)');
    next();
  } catch (err) {
    console.error('MongoDB connection error:', err);
    return res.status(500).json({ error: 'Database connection failed' });
  }
}
app.use('/api', dbMiddleware);

// ── Mongoose Schemas ─────────────────────────────────────────────
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  name_ar: { type: String, required: true },
  icon: String,
  description: String,
  sort_order: { type: Number, default: 0 }
});
const Category = mongoose.model('Category', categorySchema);

const drinkSchema = new mongoose.Schema({
  category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  name: { type: String, required: true },
  name_ar: String,
  tagline: String,
  description: String,
  ingredients: String,
  preparation: { type: String, default: '' },
  price: { type: Number, required: true },
  calories: Number,
  serving_size: String,
  temperature: { type: String, default: 'hot' },
  image_emoji: { type: String, default: 'imgs/espresso.png' },
  is_featured: { type: Number, default: 0 },
  is_available: { type: Number, default: 1 }
});
const Drink = mongoose.model('Drink', drinkSchema);

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  role: { type: String, default: 'customer' },
  points: { type: Number, default: 0 },
  total_spent: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const orderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  table_number: { type: String, required: true },
  items: { type: String, required: true },
  total_price: { type: Number, required: true },
  points_earned: { type: Number, default: 0 },
  status: { type: String, default: 'pending' },
  notes: String,
  cashier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

const pointsLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  points: { type: Number, required: true },
  reason: String,
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  created_at: { type: Date, default: Date.now }
});
const PointsLog = mongoose.model('PointsLog', pointsLogSchema);

const offerSchema = new mongoose.Schema({
  drink_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Drink', required: true },
  discount_percent: { type: Number, required: true },
  expires_at: Date,
  created_at: { type: Date, default: Date.now }
});
const Offer = mongoose.model('Offer', offerSchema);

// Create default admin, cashier & categories
async function initDefaults() {
  try {
    const admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      await User.create({
        name: 'Admin',
        phone: '01000000000',
        password_hash: bcrypt.hashSync('admin123', 10),
        role: 'admin'
      });
      await User.create({
        name: 'Cashier',
        phone: '01000000001',
        password_hash: bcrypt.hashSync('cashier123', 10),
        role: 'cashier'
      });
      console.log('Default admin & cashier created in MongoDB');
    }

    const catCount = await Category.countDocuments();
    if (catCount === 0) {
      await Category.insertMany([
        { name: 'Classic Coffee', name_ar: 'القهوة الكلاسيكية', icon: '☕', sort_order: 1 },
        { name: 'Cold Drinks', name_ar: 'مشروبات باردة', icon: '🧊', sort_order: 2 },
        { name: 'Signature', name_ar: 'مشروبات مميزة', icon: '✨', sort_order: 3 },
        { name: 'Desserts', name_ar: 'حلويات ومخبوزات', icon: '🥐', sort_order: 4 }
      ]);
      console.log('Default categories created in MongoDB');
    }
  } catch(e) {}
}
initDefaults();

// ── Auth Middleware ──────────────────────────────────────────────
function authMiddleware(requiredRole) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return res.status(401).json({ error: 'User not found' });
      if (requiredRole) {
        const hierarchy = { customer: 0, cashier: 1, admin: 2 };
        if (hierarchy[user.role] < hierarchy[requiredRole])
          return res.status(403).json({ error: 'Forbidden' });
      }
      req.user = user;
      next();
    } catch(e) { res.status(401).json({ error: 'Invalid token' }); }
  };
}

// ── Auth Routes ──────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const exists = await User.findOne({ phone });
    if (exists) return res.status(409).json({ error: 'Phone already registered' });
    const user = await User.create({ name, phone, password_hash: bcrypt.hashSync(password, 10) });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name, phone, role: 'customer', points: 0 } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name: user.name, phone: user.phone, role: user.role, points: user.points } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware(), (req, res) => {
  const { password_hash, ...safe } = req.user.toObject();
  res.json({ ...safe, id: req.user._id });
});

app.post('/api/auth/change-password', authMiddleware(), async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Please enter old and new passwords' });
  try {
    const user = await User.findById(req.user.id);
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Incorrect old password' });
    }
    user.password_hash = bcrypt.hashSync(newPassword, 10);
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Menu Routes ──────────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  try {
    const cats = await Category.find().sort({ sort_order: 1, _id: 1 }).lean();
    res.json(cats.map(c => ({...c, id: c._id})));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/drinks', async (req, res) => {
  try {
    const { category, featured } = req.query;
    let query = { is_available: 1 };
    if (category) query.category_id = category;
    if (featured === '1') query.is_featured = 1;
    
    const drinks = await Drink.find(query).populate('category_id').lean();
    const formatted = drinks.map(d => ({
      ...d, 
      id: d._id,
      category_id: d.category_id?._id,
      category_name: d.category_id?.name,
      category_name_ar: d.category_id?.name_ar,
      category_icon: d.category_id?.icon
    }));
    res.json(formatted);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/drinks/:id', async (req, res) => {
  try {
    const d = await Drink.findById(req.params.id).populate('category_id').lean();
    if (!d) return res.status(404).json({ error: 'Not found' });
    res.json({
      ...d, id: d._id,
      category_id: d.category_id?._id,
      category_name: d.category_id?.name,
      category_name_ar: d.category_id?.name_ar
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Order Routes ─────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  const { table_number, items, total_price, notes } = req.body;
  if (table_number === undefined || !items || !total_price) return res.status(400).json({ error: 'Missing fields' });

  let userId = null;
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.id;
    } catch(e) {}
  }

  try {
    const pointsEarned = Math.floor(total_price);
    const order = await Order.create({
      user_id: userId, table_number, items: JSON.stringify(items), total_price, points_earned: pointsEarned, notes: notes || ''
    });

    if (userId) {
      await User.findByIdAndUpdate(userId, { $inc: { points: pointsEarned, total_spent: total_price } });
      await PointsLog.create({ user_id: userId, points: pointsEarned, reason: 'Order #' + order._id, order_id: order._id });
    }
    res.json({ success: true, order_id: order._id, points_earned: pointsEarned });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders', authMiddleware('cashier'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};
    if (status) query.status = status;
    const orders = await Order.find(query).sort({ created_at: -1 }).populate('user_id').lean();
    res.json(orders.map(o => ({
      ...o, id: o._id,
      customer_name: o.user_id?.name,
      customer_phone: o.user_id?.phone
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orders/:id/status', authMiddleware('cashier'), async (req, res) => {
  try {
    const { status } = req.body;
    await Order.findByIdAndUpdate(req.params.id, { status, cashier_id: req.user._id, updated_at: new Date() });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Customer Profile Routes ──────────────────────────────────────
app.get('/api/me/orders', authMiddleware(), async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.user._id }).sort({ created_at: -1 }).limit(20).lean();
    res.json(orders.map(o => ({...o, id: o._id})));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me/points', authMiddleware(), async (req, res) => {
  try {
    const log = await PointsLog.find({ user_id: req.user._id }).sort({ created_at: -1 }).lean();
    res.json({ points: req.user.points, total_spent: req.user.total_spent, log: log.map(l => ({...l, id: l._id})) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Admin Routes ─────────────────────────────────────────────────
app.get('/api/admin/stats', authMiddleware('admin'), async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayStart = new Date(todayStr);
    const monthStart = new Date(todayStr.substring(0, 7) + '-01');

    const total_orders = await Order.countDocuments();
    const today_orders = await Order.countDocuments({ created_at: { $gte: todayStart } });
    
    const todayRevAggr = await Order.aggregate([
      { $match: { created_at: { $gte: todayStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: "$total_price" } } }
    ]);
    const monthlyRevAggr = await Order.aggregate([
      { $match: { created_at: { $gte: monthStart }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: "$total_price" } } }
    ]);
    const totalRevAggr = await Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: "$total_price" } } }
    ]);

    const total_customers = await User.countDocuments({ role: 'customer' });
    const pending_orders = await Order.countDocuments({ status: 'pending' });

    const cashier_stats_aggr = await Order.aggregate([
      { $match: { created_at: { $gte: todayStart }, status: { $ne: 'cancelled' }, cashier_id: { $exists: true, $ne: null } } },
      { $group: { _id: "$cashier_id", order_count: { $sum: 1 }, total_rev: { $sum: "$total_price" } } }
    ]);
    
    const cashier_stats = [];
    for (const c of cashier_stats_aggr) {
      const u = await User.findById(c._id);
      cashier_stats.push({ cashier_name: u?.name || 'Unknown', order_count: c.order_count, total_rev: c.total_rev });
    }

    res.json({
      total_orders, today_orders,
      today_revenue: todayRevAggr[0]?.total || 0,
      monthly_revenue: monthlyRevAggr[0]?.total || 0,
      total_revenue: totalRevAggr[0]?.total || 0,
      total_customers, pending_orders, cashier_stats
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/drinks', authMiddleware('admin'), async (req, res) => {
  try {
    const drinks = await Drink.find().populate('category_id').lean();
    drinks.sort((a,b) => ((a.category_id?.sort_order||0) - (b.category_id?.sort_order||0)) || a._id.toString().localeCompare(b._id.toString()));
    res.json(drinks.map(d => ({...d, id: d._id, cat_name: d.category_id?.name_ar, category_id: d.category_id?._id})));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/admin/drinks/:id', authMiddleware('admin'), async (req, res) => {
  try {
    await Drink.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/admin/drinks', authMiddleware('admin'), async (req, res) => {
  try {
    const d = await Drink.create(req.body);
    res.json({ success: true, id: d._id });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/admin/drinks/:id', authMiddleware('admin'), async (req, res) => {
  try {
    await Drink.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// ── Offers Routes ────────────────────────────────────────────────
app.get('/api/offers', async (req, res) => {
  try {
    const offers = await Offer.find({
      $or: [{ expires_at: null }, { expires_at: { $gt: new Date() } }]
    }).populate('drink_id').lean();
    
    const active = offers.filter(o => o.drink_id && o.drink_id.is_available === 1);
    res.json(active.map(o => ({
      ...o, id: o._id, drink_id: o.drink_id._id,
      name: o.drink_id.name, name_ar: o.drink_id.name_ar,
      price: o.drink_id.price, image_emoji: o.drink_id.image_emoji
    })));
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/offers', authMiddleware('admin'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (!data.expires_at) delete data.expires_at;
    const o = await Offer.create(data);
    res.json({ success: true, id: o._id });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/admin/offers/:id', authMiddleware('admin'), async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/admin/users', authMiddleware('admin'), async (req, res) => {
  try {
    const users = await User.find().sort({ created_at: -1 }).select('-password_hash').lean();
    res.json(users.map(u => ({...u, id: u._id})));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/users', authMiddleware('admin'), async (req, res) => {
  try {
    const { name, phone, password, role, points } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ error: 'Missing fields' });
    const exists = await User.findOne({ phone });
    if (exists) return res.status(409).json({ error: 'Phone already registered' });
    const u = await User.create({ name, phone, password_hash: bcrypt.hashSync(password, 10), role: role||'customer', points: points||0 });
    res.json({ success: true, id: u._id });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.patch('/api/admin/users/:id', authMiddleware('admin'), async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) { updates.password_hash = bcrypt.hashSync(updates.password, 10); delete updates.password; }
    await User.findByIdAndUpdate(req.params.id, updates);
    res.json({ success: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', authMiddleware('admin'), async (req, res) => {
  try {
    if (req.params.id == req.user._id.toString()) return res.status(400).json({ error: 'Cannot delete yourself' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/migrate-db', async (req, res) => {
  if (req.query.secret !== 'ozel') return res.status(403).send('Forbidden');
  try {
    const C = [
      { name:'Turkish & French',           ar:'تركي وفرنسي',            icon:'',  img:'imgs/turkish.png',   desc:'أصالة المذاق الكلاسيكي' },
      { name:'Espresso Rituals',           ar:'طقوس الإسبريسو',          icon:'',  img:'imgs/espresso.png',  desc:'مشروبات الإسبريسو الغنية' },
      { name:'Refresh Juice',              ar:'عصائر منعشة',             icon:'',  img:'imgs/juice.png',     desc:'فواكه طازجة ممتازة' },
      { name:'Smooth Escapes',             ar:'سموذي',                   icon:'',  img:'imgs/smoothie.png',  desc:'اختر الفاكهة المفضلة' },
      { name:'Frappe Rituals',             ar:'فرابيه',                  icon:'',  img:'imgs/frappe.png',    desc:'مشروبات فرابيه مثلجة' },
      { name:'Mojito & Sun Rise',          ar:'موهيتو وسبارك',           icon:'',  img:'imgs/mojito.png',    desc:'ألوان ومذاقات منعشة' },
      { name:'Hot & More',                 ar:'مشروبات ساخنة',           icon:'',  img:'imgs/hotchoc.png',   desc:'دفء ومشروبات كلاسيكية' },
      { name:'Milk Shaken Rituals',        ar:'ميلك شيك',               icon:'',  img:'imgs/milkshake.png', desc:'مزيج الحليب والآيس كريم' },
      { name:'Pure Classics Ice Coffee',   ar:'قهوة مثلجة كلاسيكية',   icon:'',  img:'imgs/icedcoffee.png',desc:'انتعاش القهوة الباردة' },
      { name:'Ice Cream',                  ar:'آيس كريم',               icon:'',  img:'imgs/icecream.png',  desc:'حلوى الآيس كريم الفاخرة' },
      { name:'Desserts',                   ar:'حلويات',                 icon:'',  img:'imgs/desserts.png',  desc:'وافل وبان كيك وأكثر' },
    ];

    const drinks = [
      [0,'Turkish Coffee','قهوة تركية',25,'hot','imgs/turkish.png',0],
      [0,'French Coffee','قهوة فرنسية',30,'hot','imgs/turkish.png',0],
      [0,'Hazelnut French Coffee','فرنسي بالبندق',35,'hot','imgs/turkish.png',1],
      [1,'Espresso Single','إسبريسو سينجل',30,'hot','imgs/espresso.png',0],
      [1,'Espresso Double','إسبريسو دبل',35,'hot','imgs/espresso.png',0],
      [1,'Macchiato Single','ماكياتو سينجل',35,'hot','imgs/espresso.png',0],
      [1,'Macchiato Double','ماكياتو دبل',40,'hot','imgs/espresso.png',0],
      [1,'Honey Lavender Latte','لاتيه عسل لافندر',50,'hot','imgs/latte.png',1],
      [1,'Beet Root Latte','لاتيه البنجر',50,'hot','imgs/latte.png',1],
      [1,'Americano Long','أمريكانو لونج',35,'hot','imgs/espresso.png',0],
      [1,'Flat White','فلات وايت',40,'hot','imgs/latte.png',0],
      [1,'Corto','كورتو',40,'hot','imgs/espresso.png',0],
      [1,'Piccolo','بيكولو',40,'hot','imgs/latte.png',0],
      [1,'Café Latte','كافيه لاتيه',40,'hot','imgs/latte.png',0],
      [1,'Cappuccino','كابتشينو',40,'hot','imgs/latte.png',0],
      [1,'Biscoff Espresso','إسبريسو بيسكوف',50,'hot','imgs/latte.png',1],
      [1,'Affogato Espresso','أفوكاتو',55,'hot','imgs/espresso.png',1],
      [1,'Smoked Rosemary Corto','كورتو روزماري مدخن',55,'hot','imgs/espresso.png',1],
      [1,'Mocha Latte','موكا لاتيه',45,'hot','imgs/latte.png',0],
      [1,'Spanish Latte','لاتيه إسباني',45,'hot','imgs/latte.png',1],
      [1,'Marocchino','ماروكينو',45,'hot','imgs/latte.png',0],
      [2,'Orange Juice','عصير برتقال',40,'cold','imgs/juice.png',0],
      [2,'Mango Juice','عصير مانجو',45,'cold','imgs/juice.png',0],
      [2,'Strawberry Juice','عصير فراولة',45,'cold','imgs/juice.png',0],
      [2,'Guava Juice','عصير جوافة',40,'cold','imgs/juice.png',0],
      [2,'Watermelon Juice','عصير بطيخ',40,'cold','imgs/juice.png',0],
      [2,'Kiwi Juice','عصير كيوي',45,'cold','imgs/juice.png',0],
      [2,'Avocado Juice','عصير أفوكادو',50,'cold','imgs/juice.png',1],
      [2,'Lemon Mint','ليمون نعناع',35,'cold','imgs/juice.png',0],
      [3,'Custom Smoothie','سموذي مخصص',50,'cold','imgs/smoothie.png',1],
      [4,'Lotus Blast','لوتس بلاست',55,'cold','imgs/frappe.png',1],
      [4,'White Velvet','وايت فيلفيت',55,'cold','imgs/frappe.png',0],
      [4,'Candy Cloud','كاندي كلاود',55,'cold','imgs/frappe.png',0],
      [4,'Blueberry Muffin','بلوبيري مافن',55,'cold','imgs/frappe.png',1],
      [4,'Mid Night Mocha','مد نايت موكا',55,'cold','imgs/frappe.png',1],
      [4,'Caramel Swirl','كراميل سويرل',55,'cold','imgs/frappe.png',0],
      [4,'Coffee Frappe','فرابيه قهوة',50,'cold','imgs/frappe.png',0],
      [5,'Sun Rise','صن رايز',45,'cold','imgs/mojito.png',1],
      [5,'Ruby Fizz','روبي فيز',45,'cold','imgs/mojito.png',0],
      [5,'Blue Mist','بلو ميست',45,'cold','imgs/mojito.png',0],
      [5,'Lavender Lemon','لافندر ليمون',45,'cold','imgs/mojito.png',1],
      [5,'Lava Lamp','لافا لامب',50,'cold','imgs/mojito.png',1],
      [5,'Rose Garden','روز جاردن',45,'cold','imgs/mojito.png',0],
      [5,'Berry Passion Spritz','بيري باشن سبريتز',50,'cold','imgs/mojito.png',1],
      [5,'Black Berry Wild Cherry Cream','بلاك بيري وايلد شيري',55,'cold','imgs/mojito.png',0],
      [5,'Coffee Mojito','موهيتو قهوة',45,'cold','imgs/mojito.png',1],
      [5,'Passion Fire','باشن فاير',50,'cold','imgs/mojito.png',0],
      [5,'Blue Lagoon Mojito','بلو لاجون موهيتو',45,'cold','imgs/mojito.png',0],
      [5,'Summer Berry','سمر بيري',45,'cold','imgs/mojito.png',0],
      [5,'Redbull Coconut Breeze','ريد بول جوز هند',60,'cold','imgs/mojito.png',1],
      [5,'Classic Energy Mojito','موهيتو إنيرجي',60,'cold','imgs/mojito.png',0],
      [5,'Berry Energizer','بيري إنيرجايزر',60,'cold','imgs/mojito.png',0],
      [5,'Tropic Bull','تروبيك بول',60,'cold','imgs/mojito.png',0],
      [5,'Original Mojito','موهيتو أصلي',40,'cold','imgs/mojito.png',0],
      [5,'Sparkling Diamonds','سباركلينج دايموندز',50,'cold','imgs/mojito.png',1],
      [5,'Vimto Espresso Fizz','فيمتو إسبريسو فيز',50,'cold','imgs/mojito.png',1],
      [6,'Classic Milk Hot Chocolate','شوكولاتة حليب',45,'hot','imgs/hotchoc.png',0],
      [6,'Rich Dark Hot Chocolate','شوكولاتة داكنة',50,'hot','imgs/hotchoc.png',1],
      [6,'Ferrero Rocher Hot Chocolate','شوكولاتة روشيه',60,'hot','imgs/hotchoc.png',1],
      [6,'Original Spiced Cider','سايدر بالتوابل',40,'hot','imgs/hotchoc.png',0],
      [6,'Sahlab','سحلب',45,'hot','imgs/hotchoc.png',1],
      [6,'Black Tea & Green','شاي أسود وأخضر',20,'hot','imgs/hotchoc.png',0],
      [6,'Karak Tea','شاي كرك',30,'hot','imgs/hotchoc.png',0],
      [6,'London Fog Tea','لندن فوج تي',40,'hot','imgs/hotchoc.png',1],
      [6,'Hot Biscoff Lotus','بيسكوف لوتس ساخن',50,'hot','imgs/hotchoc.png',1],
      [6,'Hot Milky Oreo','أوريو حليب ساخن',50,'hot','imgs/hotchoc.png',0],
      [6,'Nescafe','نسكافيه',25,'hot','imgs/espresso.png',0],
      [6,'Hot Matcha','ماتشا ساخنة',45,'hot','imgs/latte.png',1],
      [7,'Classic Vanilla','فانيليا كلاسيك',45,'cold','imgs/milkshake.png',0],
      [7,'Rich Chocolate','شوكولاتة غنية',45,'cold','imgs/milkshake.png',0],
      [7,'Lotus Biscoff Lava','لوتس لافا',55,'cold','imgs/milkshake.png',1],
      [7,'Ferrero Rocher Luxe','روشيه لوكس',60,'cold','imgs/milkshake.png',1],
      [7,'Oreo Milk Crunch','أوريو كرانش',50,'cold','imgs/milkshake.png',0],
      [7,'Milk Shake Fruit Rituals','ميلك شيك فاكهة',55,'cold','imgs/milkshake.png',0],
      [7,'Tiramisu Chill','تيراميسو تشيل',55,'cold','imgs/milkshake.png',1],
      [7,'BlueBerry Shaken','بلوبيري شيكن',50,'cold','imgs/milkshake.png',0],
      [7,'Dark Choc & Date','شوكولاتة داكنة وتمر',55,'cold','imgs/milkshake.png',1],
      [8,'Ice Latte','آيس لاتيه',45,'cold','imgs/icedcoffee.png',0],
      [8,'Ice Spanish Latte','آيس لاتيه إسباني',50,'cold','imgs/icedcoffee.png',0],
      [8,'Cold Brew','كولد برو',45,'cold','imgs/icedcoffee.png',1],
      [8,'Iced Cracking Latte','كراكينج لاتيه',55,'cold','imgs/icedcoffee.png',1],
      [8,'Charcoal BlackBerry Latte','لاتيه فحم وبلاك بيري',55,'cold','imgs/icedcoffee.png',1],
      [8,'Rose Coconut Cold Brew','ورد وجوز هند كولد برو',50,'cold','imgs/icedcoffee.png',1],
      [8,'Camp Fire Mocha','كامب فاير موكا',55,'cold','imgs/icedcoffee.png',1],
      [8,'Iced Mid Night Mocha','آيس مد نايت موكا',55,'cold','imgs/icedcoffee.png',0],
      [8,'Iced Matcha Latte','آيس ماتشا لاتيه',50,'cold','imgs/icedcoffee.png',1],
      [9,'Mango Sorbet','سوربيه مانجو',35,'cold','imgs/icecream.png',0],
      [9,'Rocher Overload','روشيه أوفرلود',45,'cold','imgs/icecream.png',1],
      [9,'Strawberry Ice Cream','آيس كريم فراولة',35,'cold','imgs/icecream.png',0],
      [9,'Maple Walnut','مابل والنت',40,'cold','imgs/icecream.png',0],
      [9,'Flight Boards','فلايت بوردز',50,'cold','imgs/icecream.png',1],
      [9,'Flower Pot','فلاور بوت',45,'cold','imgs/icecream.png',1],
      [9,'Chocolate Ice Cream','آيس كريم شوكولاتة',35,'cold','imgs/icecream.png',0],
      [10,'Date Me! Waffle','وافل التمر',60,'hot','imgs/desserts.png',1],
      [10,'Bubble Waffle Cones','بابل وافل كونز',55,'hot','imgs/desserts.png',0],
      [10,'Waffle Cakes & Stacks','وافل كيك',65,'hot','imgs/desserts.png',1],
      [10,'Lolly Stick Waffles','لولي وافل',45,'hot','imgs/desserts.png',0],
      [10,'Pancake Board Royale','بان كيك رويال',80,'hot','imgs/desserts.png',1],
      [10,'Mini Pancake Classic','ميني بان كيك',50,'hot','imgs/desserts.png',0],
      [10,'Gourmet Donut Flights','دونات جورميه',55,'hot','imgs/desserts.png',0],
      [10,'Molten Lava','مولتن لافا',60,'hot','imgs/desserts.png',1],
      [10,'Cheese Cake','تشيز كيك',55,'hot','imgs/desserts.png',0],
      [10,'Tiramisu','تيراميسو',55,'hot','imgs/desserts.png',1],
      [10,'Chocolate Mousse','موس شوكولاتة',50,'hot','imgs/desserts.png',0],
      [10,'Crepe Roll','كريب رول',55,'hot','imgs/desserts.png',0]
    ];

    await Category.deleteMany({});
    await Drink.deleteMany({});
    
    const catIds = [];
    for (let i = 0; i < C.length; i++) {
      const cat = await Category.create({
        name: C[i].name,
        name_ar: C[i].ar,
        icon: C[i].img,
        sort_order: i + 1
      });
      catIds.push(cat._id);
    }

    for (const d of drinks) {
      await Drink.create({
        category_id: catIds[d[0]],
        name: d[1],
        name_ar: d[2],
        tagline: 'An unforgettable experience',
        description: 'A premium drink crafted with the finest ingredients',
        price: d[3],
        temperature: d[4],
        image_emoji: d[5],
        is_featured: d[6],
        is_available: 1
      });
    }

    res.json({ success: true, message: 'Database populated successfully with categories and drinks.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Page Routes ──────────────────────────────────────────────────
app.get('/cashier', (_, res) => res.sendFile(path.join(__dirname, 'public', 'cashier.html')));
app.get('/admin',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/login',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get(/.*/, (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`OZEL CAFE running → http://localhost:${PORT}`));