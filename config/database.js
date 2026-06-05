// ============================================
// إعدادات قاعدة البيانات - OZEL Cafe
// الاتصال بـ MongoDB مع دعم Serverless (Vercel)
// ============================================

const mongoose = require('mongoose');
const dns = require('dns');
require('dotenv').config();

// استخدام Google DNS كبديل لحل SRV records في حالة DNS محلي لا يدعمها
dns.setServers(['8.8.8.8', '8.8.4.4']);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ozel_cafe';

// تخزين الاتصال مؤقتًا لبيئات Serverless (Vercel) — منع الاتصالات المتكررة
let cached = global._mongooseConnection;
if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

// ============================
// دالة الاتصال بقاعدة البيانات
// تستخدم التخزين المؤقت لتفادي إنشاء اتصالات متعددة
// ============================
async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // إعدادات الاتصال: حجم التجمع، المهلات الزمنية للسيرفر البارد والاستعلامات
    const opts = {
      bufferCommands: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 5000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      console.log('MongoDB connected successfully.');
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null; // إعادة تعيين ليعيد المحاولة في الطلب التالي
    throw e;
  }

  return cached.conn;
}

// تصدير دالة الاتصال
module.exports = connectDB;
