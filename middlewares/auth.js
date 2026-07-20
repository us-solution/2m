// ============================================
// Middleware المصادقة والصلاحيات - OZEL Cafe
// التحقق من JWT والأدوار (Admin, Cashier, Customer)
// ============================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

// ============================
// المفتاح السري لتوقيع JWT
// ============================
const JWT_SECRET = process.env.JWT_SECRET || 'ozel_cafe_secret_2026';

// ============================
// التحقق من صحة التوكن JWT واستخراج المستخدم
// ============================
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
    return res.status(500).json({ error: 'Authentication error: ' + err.message });
  }
};

// ============================
// التحقق من صلاحية الدور (Admin, Cashier, Customer)
// ============================
const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // تسلسل هرمي للأدوار: customer (0) < cashier (1) < partner / admin (2)
    const hierarchy = { 'customer': 0, 'cashier': 1, 'partner': 2, 'admin': 2 };
    const userRole = req.user.role || 'customer';
    const reqRole = requiredRole || 'customer';

    const userLevel = (req.user.isPartner || userRole === 'partner') ? 2 : (hierarchy[userRole] ?? 0);
    const reqLevel = hierarchy[reqRole] ?? 0;

    if (userLevel < reqLevel) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    next();
  };
};

// ============================
// تصدير الدوال للاستخدام في المسارات
// ============================
module.exports = {
  authenticateToken,
  requireRole
};
