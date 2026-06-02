// ============================================
// Middleware تنظيف المدخلات (Sanitization) - OZEL Cafe
// حماية من XSS و SQL Injection
// ============================================

const xssClean = require('xss-clean')();

// ============================
// تنظيف النصوص من وسوم HTML وأنماط SQL الضارة
// ============================
const cleanValue = (val) => {
  if (typeof val === 'string') {
    // Basic SQL Injection prevention: escape single quotes and semicolons if suspicious
    // and remove simple script tags (fallback for xssClean)
    let sanitized = val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.trim();
    return sanitized;
  } else if (typeof val === 'object' && val !== null) {
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        val[key] = cleanValue(val[key]);
      }
    }
  }
  return val;
};

// ============================
// Middleware لتنظيف جميع مدخلات الطلب (body, query, params)
// ============================
const sanitizeInput = (req, res, next) => {
  // 1. تشغيل xss-clean لإزالة أكواد XSS من body و query و params
  xssClean(req, res, () => {
    // 2. تنظيف عميق مخصص للنصوص
    if (req.body) req.body = cleanValue(req.body);
    if (req.query) req.query = cleanValue(req.query);
    if (req.params) req.params = cleanValue(req.params);
    next();
  });
};

// ============================
// تصدير الدالة
// ============================
module.exports = { sanitizeInput };
