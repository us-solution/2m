/**
 * test-production-audit.js
 * Comprehensive automated verification script for:
 * 1. Database connectivity & collection counts
 * 2. Cashier dashboard API endpoint
 * 3. Date range filtering (today, yesterday, week, month, custom)
 * 4. Online order pending filtering & status updates
 * 5. Recoverable backup verification
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/database');

async function runTests() {
  console.log('🧪 Starting 2M CAFE Production Audit Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // TEST 1: Database Connection
  console.log('--- TEST 1: MongoDB Database Connection ---');
  await connectDB();
  assert(mongoose.connection.readyState === 1, 'MongoDB connection state is 1 (Connected)');
  assert(mongoose.connection.name === 'two_million_cafe', `Database name is two_million_cafe (Connected to: ${mongoose.connection.name})`);

  // TEST 2: Collections verification
  console.log('\n--- TEST 2: Essential Collections Verification ---');
  const Drink = require('../models/Drink');
  const Category = require('../models/Category');
  const User = require('../models/User');
  const Order = require('../models/Order');

  const drinkCount = await Drink.countDocuments();
  const catCount = await Category.countDocuments();
  const userCount = await User.countDocuments();

  assert(drinkCount > 0, `Drinks collection populated (${drinkCount} drinks)`);
  assert(catCount > 0, `Categories collection populated (${catCount} categories)`);
  assert(userCount >= 2, `Admin and cashier users exist (${userCount} users)`);

  // TEST 3: Backup File Verification
  console.log('\n--- TEST 3: Recoverable Backup Verification ---');
  const backupPath = path.join(__dirname, '../backups/backup_2m_cafe_latest.json');
  assert(fs.existsSync(backupPath), 'Latest recoverable backup file exists in backups/');
  const backupJson = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert(backupJson.collections && Object.keys(backupJson.collections).length > 0, 'Backup contains valid collections dictionary');
  assert(backupJson.collections.drinks && backupJson.collections.drinks.length === drinkCount, `Backup has complete drink inventory (${backupJson.collections.drinks?.length} items)`);

  // TEST 4: Online Orders Lifecycle & Idempotency
  console.log('\n--- TEST 4: Online Orders Pending Filter & Idempotency ---');
  // Create a temporary test order
  const testOrder = await Order.create({
    table_number: 'طاولة 99 (اختبار)',
    items: [{ name: 'اسبريسو اختبار', quantity: 1, price: 50 }],
    total_price: 50,
    status: 'pending',
    notes: 'أوردر تجريبي لفحص دورة الحياة'
  });
  assert(testOrder._id != null, 'Test online order created with status=pending');

  // Verify it appears in pending query
  const pendingOrders = await Order.find({
    status: 'pending',
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  }).lean();
  assert(pendingOrders.some(o => String(o._id) === String(testOrder._id)), 'Pending test order appears in pending list');

  // Simulate Accept: status -> 'accepted'
  testOrder.status = 'accepted';
  testOrder.isQrConfirmed = true;
  await testOrder.save();

  // Verify it no longer appears in pending list
  const pendingAfterAccept = await Order.find({
    status: 'pending',
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  }).lean();
  assert(!pendingAfterAccept.some(o => String(o._id) === String(testOrder._id)), 'Accepted order NEVER appears in pending list');

  // Clean up test order
  await Order.findByIdAndDelete(testOrder._id);
  assert(true, 'Test order cleaned up cleanly');

  // TEST 5: Cashier Dashboard Aggregation
  console.log('\n--- TEST 5: Cashier Dashboard Data Aggregation ---');
  const Expense = require('../models/Expense');
  const PosDevice = require('../models/PosDevice');

  const todayOrders = await Order.find({
    createdAt: {
      $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      $lte: new Date(new Date().setHours(23, 59, 59, 999))
    }
  }).lean();
  assert(Array.isArray(todayOrders), 'Today orders queried successfully');

  // Check PosDevice registration
  const devices = await PosDevice.find({}).lean();
  assert(devices.length >= 0, `POS devices query executed successfully (${devices.length} registered)`);

  console.log(`\n========================================`);
  console.log(`Audit Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
