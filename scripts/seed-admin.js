const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const MONGO_URI = 'mongodb+srv://m16565680_db_user:MCFFg12@5@cluster0.zwr8bzd.mongodb.net/ozel_cafe?retryWrites=true&w=majority&appName=Cluster0';

(async () => {
  try {
    console.log('Connecting to MongoDB...');
    mongoose.set('strictQuery', false);
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000
    });
    console.log('Connected to MongoDB');

    const phone = '01000000000';
    const password = 'admin123';

    const existing = await User.findOne({ phone });
    if (existing) {
      console.log('Admin already exists:', existing.name, '(role:', existing.role + ')');
      await mongoose.disconnect();
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const admin = await User.create({
      name: 'Admin',
      phone,
      email: 'admin@ozel.cafe',
      password: hashed,
      role: 'admin',
      subscriptionTier: 'none'
    });

    console.log('Admin created:');
    console.log('  Phone:', phone);
    console.log('  Password:', password);
    console.log('  Role:', admin.role);

    await mongoose.disconnect();
    console.log('Done');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
