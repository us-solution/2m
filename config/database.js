const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ozel_cafe';

// Cache connection for serverless environments (Vercel)
let cached = global._mongooseConnection;
if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,              // handle concurrent serverless invocations
      serverSelectionTimeoutMS: 10000, // allow more time on cold starts
      socketTimeoutMS: 45000,       // prevent socket timeouts on slow queries
      connectTimeoutMS: 10000,      // connection establishment timeout
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      console.log('MongoDB connected successfully.');
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null; // reset so next request retries
    throw e;
  }

  return cached.conn;
}

module.exports = connectDB;
