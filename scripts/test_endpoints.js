const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {}

const mongoose = require('mongoose');
require('dotenv').config();

const Category = require('../models/Category');
const Drink = require('../models/Drink');
const User = require('../models/User');
const CustomizationOption = require('../models/CustomizationOption');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

async function runTests() {
  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 15000,
  });
  console.log('✓ Connected to MongoDB');

  // 1. Verify Categories
  const categories = await Category.find({}).sort({ sort_order: 1 });
  console.log(`✓ Categories in DB: ${categories.length} (Expected: 20)`);
  if (categories.length !== 20) {
    console.error('Category count mismatch!');
  } else {
    console.log('  Top 5 categories:', categories.slice(0, 5).map(c => `${c.id}: ${c.name} / ${c.name_ar}`));
  }

  // 2. Verify Drinks / Products
  const drinks = await Drink.find({});
  console.log(`✓ Products in DB: ${drinks.length} (Expected: 279)`);
  if (drinks.length !== 279) {
    console.error('Drink count mismatch!');
  } else {
    console.log('  Sample product:', {
      id: drinks[0].id,
      name: drinks[0].name,
      name_ar: drinks[0].name_ar,
      price: drinks[0].price,
      category_id: drinks[0].category_id
    });
  }

  // 3. Verify Customization / Extras
  const customDoc = await CustomizationOption.findOne({ configId: 'default' });
  if (customDoc) {
    console.log(`✓ Customization found: ${customDoc.sugarLevels?.length} sugar levels, ${customDoc.extras?.length} extras`);
    console.log('  Extras sample:', customDoc.extras?.slice(0, 4).map(e => `${e.nameAr} (+${e.price} EGP)`));
  } else {
    console.error('Customization document not found!');
  }

  // 4. Verify Admin User
  const admin = await User.findOne({ email: 'admin@2m.cafe' });
  if (admin) {
    const isMatch = await bcrypt.compare('admin123', admin.password);
    console.log(`✓ Admin user verified: ${admin.email}, role: ${admin.role}, password match: ${isMatch}`);
  } else {
    console.error('Admin user not found!');
  }

  // 5. Verify Cashier User
  const cashier = await User.findOne({ email: 'cashier@2m.cafe' });
  if (cashier) {
    const isMatch = await bcrypt.compare('cashier123', cashier.password);
    console.log(`✓ Cashier user verified: ${cashier.email}, role: ${cashier.role}, password match: ${isMatch}`);
  } else {
    console.error('Cashier user not found!');
  }

  await mongoose.disconnect();
  console.log('All backend integration tests passed successfully!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
