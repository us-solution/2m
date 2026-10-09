// ============================================
// إعدادات قاعدة البيانات - 2M CAFE
// الاتصال بـ MongoDB Atlas مع دعم Serverless والحماية من حجب DNS/SRV/TXT
// ============================================

const mongoose = require('mongoose');
require('dotenv').config();

/**
 * تحويل روابط mongodb+srv إلى اتصال مباشر متعدد الشاردات لتفادي مشاكل queryTxt ETIMEOUT 
 * التي تحدث بسبب حجب خوادم DNS في بعض مزودي خدمات الإنترنت المحليين
 */
function resolveMongoUri(rawUri) {
  if (!rawUri) return '';
  const trimmed = rawUri.trim();
  
  if (trimmed.startsWith('mongodb+srv://') && trimmed.includes('8bos2na.mongodb.net')) {
    try {
      const authMatch = trimmed.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@/);
      if (authMatch) {
        const user = authMatch[1];
        const pass = authMatch[2];
        const dbNameMatch = trimmed.match(/8bos2na\.mongodb\.net\/([^?]+)/);
        const dbName = dbNameMatch ? dbNameMatch[1] : 'two_million_cafe';
        return `mongodb://${user}:${pass}@ac-oa4b4b7-shard-00-00.8bos2na.mongodb.net:27017,ac-oa4b4b7-shard-00-01.8bos2na.mongodb.net:27017,ac-oa4b4b7-shard-00-02.8bos2na.mongodb.net:27017/${dbName}?ssl=true&replicaSet=atlas-ylljrc-shard-0&authSource=admin&retryWrites=true&w=majority`;
      }
    } catch (_) {}
  }
  return trimmed;
}

const MONGODB_URI = resolveMongoUri(process.env.MONGODB_URI || '');

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
  const activeUri = resolveMongoUri(process.env.MONGODB_URI || MONGODB_URI);
  if (!activeUri) {
    throw new Error('MONGODB_URI is not configured');
  }
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise || mongoose.connection.readyState === 0) {
    const opts = {
      bufferCommands: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
      heartbeatFrequencyMS: 10000,
    };

    cached.promise = mongoose.connect(activeUri, opts).then((mongooseInstance) => {
      console.log('✅ [MongoDB Atlas] Connected successfully to cluster.');
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

module.exports = connectDB;
