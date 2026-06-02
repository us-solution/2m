// ===== مسار المصادقة (Auth) - تسجيل الدخول وإنشاء الحساب وتغيير كلمة المرور والملف الشخصي =====
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const PointsLog = require('../models/PointsLog');
const { authenticateToken } = require('../middlewares/auth');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'ozel_cafe_secret_2026';

// تسجيل مستخدم جديد (يتطلب الاسم وكلمة المرور ورقم الهاتف أو البريد)
router.post('/register', async (req, res) => {
  const { name, phone, email, password, subscriptionTier } = req.body;

  // التحقق من وجود الاسم وكلمة المرور ورقم الهاتف أو البريد الإلكتروني
  if (!name || !password || (!phone && !email)) {
    return res.status(400).json({ error: 'Name, password, and at least a Phone number or Email are required' });
  }

  try {
    // التحقق من عدم تسجيل رقم الهاتف مسبقاً
    if (phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(409).json({ error: 'Phone number already registered' });
      }
    }

    // التحقق من عدم تسجيل البريد الإلكتروني مسبقاً
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({ error: 'Email already registered' });
      }
    }

    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);
    const tier = subscriptionTier || 'none';

    // التحقق من صلاحية مستوى الاشتراك
    const validTiers = ['none', 'bronze', 'silver', 'gold', 'student'];
    const chosenTier = validTiers.includes(tier.toLowerCase()) ? tier.toLowerCase() : 'none';

    const user = await User.create({
      name,
      phone: phone || `email_${Date.now()}`,
      email: email || null,
      password: hashedPassword,
      role: 'customer',
      subscriptionTier: chosenTier
    });

    // إنشاء رمز JWT صالح لمدة 30 يوماً
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone && user.phone.startsWith('email_') ? '' : (user.phone || ''),
        email: user.email,
        role: user.role,
        points: user.points,
        subscriptionTier: user.subscriptionTier
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تسجيل الدخول باستخدام رقم الهاتف أو البريد الإلكتروني
router.post('/login', async (req, res) => {
  const { identifier, phone, password } = req.body;
  const loginKey = identifier || phone;

  if (!loginKey || !password) {
    return res.status(400).json({ error: 'Missing credentials: Phone/Email and password required' });
  }

  try {
    // البحث عن المستخدم بالبريد أو الهاتف
    const user = await User.findOne({
      $or: [
        { phone: loginKey },
        { email: loginKey }
      ]
    });

    if (!user || !user.password) return res.status(401).json({ error: 'Invalid credentials' });
    // التحقق من كلمة المرور
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone && user.phone.startsWith('email_') ? '' : (user.phone || ''),
        email: user.email,
        role: user.role,
        points: user.points,
        subscriptionTier: user.subscriptionTier
      }
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// جلب الملف الشخصي للمستخدم الحالي
router.get('/me', authenticateToken, async (req, res) => {
  res.json({
    id: req.user._id,
    name: req.user.name,
    phone: req.user.phone && req.user.phone.startsWith('email_') ? '' : (req.user.phone || ''),
    email: req.user.email,
    role: req.user.role,
    points: req.user.points,
    total_spent: parseFloat(req.user.total_spent),
    subscriptionTier: req.user.subscriptionTier,
    customerStatus: req.user.customerStatus || 'standard'
  });
});

// تغيير كلمة المرور (يتطلب كلمة المرور القديمة والجديدة)
router.post('/change-password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Please enter old and new passwords' });
  }

  try {
    // التحقق من صحة كلمة المرور القديمة
    if (!req.user || !req.user.password || !(await bcrypt.compare(oldPassword, req.user.password))) {
      return res.status(401).json({ error: 'Incorrect old password' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    req.user.password = hashedNewPassword;
    await req.user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب سجل نقاط الولاء للعميل الحالي
router.get('/me/points', authenticateToken, async (req, res) => {
  try {
    const logs = await PointsLog.find({ userId: req.user._id }).sort({ created_at: -1 });

    res.json({
      points: req.user.points,
      total_spent: parseFloat(req.user.total_spent),
      log: logs.map(l => ({
        id: l._id,
        user_id: l.userId,
        points: l.points,
        reason: l.reason,
        order_id: l.orderId,
        created_at: l.created_at.toISOString()
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
