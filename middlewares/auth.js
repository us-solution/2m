const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'ozel_cafe_secret_2026';

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
  }
};

const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hierarchy = { 'customer': 0, 'cashier': 1, 'admin': 2 };
    const userRole = req.user.role || 'customer';
    const reqRole = requiredRole || 'customer';

    if ((hierarchy[userRole] ?? 0) < (hierarchy[reqRole] ?? 0)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  requireRole
};
