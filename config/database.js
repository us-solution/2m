// ============================================
// إعدادات قاعدة البيانات - 2M CAFE
// عزل صارم لقاعدة بيانات two_million_cafe مع دعم Serverless والحماية من حجب DNS/SRV/TXT
// ============================================

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const TARGET_DB_NAME = 'two_million_cafe';

/**
 * تحويل روابط mongodb+srv إلى اتصال مباشر متعدد الشاردات لتفادي مشاكل queryTxt ETIMEOUT 
 * مع فرض العزل التام والتأكد من أن قاعدة البيانات المستهدفة حصراً هي two_million_cafe
 */
function resolveMongoUri(rawUri) {
  if (!rawUri) return '';
  let trimmed = String(rawUri).trim().replace(/^"|"$/g, '');

  if (trimmed.startsWith('mongodb+srv://') && trimmed.includes('8bos2na.mongodb.net')) {
    try {
      const authMatch = trimmed.match(/mongodb\+srv:\/\/([^:]+):([^@]+)@/);
      if (authMatch) {
        const user = authMatch[1];
        const pass = authMatch[2];
        return `mongodb://${user}:${pass}@ac-oa4b4b7-shard-00-00.8bos2na.mongodb.net:27017,ac-oa4b4b7-shard-00-01.8bos2na.mongodb.net:27017,ac-oa4b4b7-shard-00-02.8bos2na.mongodb.net:27017/${TARGET_DB_NAME}?ssl=true&replicaSet=atlas-ylljrc-shard-0&authSource=admin&retryWrites=true&w=majority`;
      }
    } catch (_) {}
  }

  // إذا كان الرابط مباشراً، نتأكد من عزل مسار اسم قاعدة البيانات إلى two_million_cafe حصراً
  if (trimmed.includes('8bos2na.mongodb.net')) {
    // استبدال أي اسم قاعدة بيانات آخر بـ two_million_cafe
    trimmed = trimmed.replace(/8bos2na\.mongodb\.net:27017\/([^?]+)/, `8bos2na.mongodb.net:27017/${TARGET_DB_NAME}`);
  }

  return trimmed;
}

const MONGODB_URI = resolveMongoUri(process.env.MONGODB_URI || '');

// تخزين الاتصال مؤقتًا لبيئات Serverless (Vercel) — منع الاتصالات المتكررة واستنزاف الموارد
let cached = global._mongooseConnection;
if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

// ============================
// دالة الاتصال بقاعدة البيانات
// تستخدم التخزين المؤقت مع التحقق الإلزامي من عزل قاعدة البيانات
// ============================
async function connectDB() {
  const activeUri = resolveMongoUri(process.env.MONGODB_URI || MONGODB_URI);
  if (!activeUri) {
    throw new Error('CRITICAL_CONFIG_ERROR: MONGODB_URI is not configured in environment.');
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    if (mongoose.connection.name !== TARGET_DB_NAME) {
      await mongoose.disconnect();
      cached.conn = null;
      cached.promise = null;
      throw new Error(`CRITICAL_SECURITY_VIOLATION: Connected database "${mongoose.connection.name}" does not match isolated target "${TARGET_DB_NAME}". Connection aborted.`);
    }
    return cached.conn;
  }

  if (!cached.promise || mongoose.connection.readyState === 0) {
    const opts = {
      dbName: TARGET_DB_NAME,
      bufferCommands: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
    };

    cached.promise = mongoose.connect(activeUri, opts).then((mongooseInstance) => {
      const currentName = mongooseInstance.connection.name;
      if (currentName !== TARGET_DB_NAME) {
        mongoose.disconnect();
        throw new Error(`CRITICAL_SECURITY_VIOLATION: Connected to unauthorized database "${currentName}". Must connect strictly to "${TARGET_DB_NAME}".`);
      }
      console.log(`✅ [MongoDB Atlas] Isolated database verified: ${currentName}`);
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

/**
 * تقرير تشخيصي آمن لفحص حالة قاعدة البيانات دون تسريب أي أسرار
 */
async function getSafeDatabaseDiagnostic() {
  const isConnected = mongoose.connection.readyState === 1;
  const dbName = mongoose.connection.name || 'not_connected';
  const isIsolated = dbName === TARGET_DB_NAME;

  let collectionsCount = 0;
  if (isConnected && mongoose.connection.db) {
    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      collectionsCount = collections.length;
    } catch (_) {}
  }

  return {
    status: isConnected ? 'connected' : 'disconnected',
    databaseName: dbName,
    targetDatabase: TARGET_DB_NAME,
    isStrictlyIsolated: isIsolated,
    clusterHost: '8bos2na.mongodb.net',
    collectionsCount,
    timestamp: new Date().toISOString()
  };
}

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.getSafeDatabaseDiagnostic = getSafeDatabaseDiagnostic;
module.exports.TARGET_DB_NAME = TARGET_DB_NAME;

