const mongoose = require('mongoose');
const assert = require('assert');
require('dotenv').config();

const Order = require('../models/Order');

async function testFinancials() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('--- Phase 1 Financial Audit Test ---');

  const FINALIZED_STATUSES = ['paid', 'completed'];

  // 1. Initial State
  const initialAgg = await Order.aggregate([
    { $match: { status: { $in: FINALIZED_STATUSES } } },
    { $group: { _id: null, total: { $sum: '$total_price' } } }
  ]);
  const initialSales = initialAgg.length > 0 ? initialAgg[0].total : 0;
  console.log('Initial Finalized Sales Total:', initialSales);

  // 2. Acceptance Test 1: Create a pending order and verify that finalized sales DO NOT increase
  const pendingOrder = await Order.create({
    table_number: 'TEST-P1',
    total_price: 150,
    status: 'pending',
    items: [{ name: 'Test Drink Pending', price: 150, quantity: 1 }]
  });

  const postPendingAgg = await Order.aggregate([
    { $match: { status: { $in: FINALIZED_STATUSES } } },
    { $group: { _id: null, total: { $sum: '$total_price' } } }
  ]);
  const postPendingSales = postPendingAgg.length > 0 ? postPendingAgg[0].total : 0;
  assert.strictEqual(postPendingSales, initialSales, 'PASS: Pending order did NOT increase finalized sales total');
  console.log('✅ Acceptance Test 1 Passed: Pending order does NOT increase finalized sales');

  // 3. Acceptance Test 2: Create a finalized sale and verify that sales increase
  const finalizedOrder = await Order.create({
    table_number: 'TEST-F1',
    total_price: 250,
    status: 'paid',
    items: [{ name: 'Test Drink Finalized', price: 250, quantity: 1 }]
  });

  const postFinalizedAgg = await Order.aggregate([
    { $match: { status: { $in: FINALIZED_STATUSES } } },
    { $group: { _id: null, total: { $sum: '$total_price' } } }
  ]);
  const postFinalizedSales = postFinalizedAgg.length > 0 ? postFinalizedAgg[0].total : 0;
  assert.strictEqual(postFinalizedSales, initialSales + 250, 'PASS: Finalized sale increased totals correctly');
  console.log('✅ Acceptance Test 2 Passed: Finalized sale correctly increases sales by 250 EGP');

  // 4. Acceptance Test 3: Cancel or reject an order and verify finalized sales do not inflate
  const cancelledOrder = await Order.create({
    table_number: 'TEST-C1',
    total_price: 300,
    status: 'cancelled',
    items: [{ name: 'Test Drink Cancelled', price: 300, quantity: 1 }]
  });

  const postCancelledAgg = await Order.aggregate([
    { $match: { status: { $in: FINALIZED_STATUSES } } },
    { $group: { _id: null, total: { $sum: '$total_price' } } }
  ]);
  const postCancelledSales = postCancelledAgg.length > 0 ? postCancelledAgg[0].total : 0;
  assert.strictEqual(postCancelledSales, postFinalizedSales, 'PASS: Cancelled order did NOT inflate sales');
  console.log('✅ Acceptance Test 3 Passed: Cancelled order does NOT inflate sales');

  // 5. Acceptance Test 4: Change an order's status and verify totals update
  // Change pendingOrder to 'completed'
  pendingOrder.status = 'completed';
  await pendingOrder.save();

  const postStatusChangeAgg = await Order.aggregate([
    { $match: { status: { $in: FINALIZED_STATUSES } } },
    { $group: { _id: null, total: { $sum: '$total_price' } } }
  ]);
  const postChangeSales = postStatusChangeAgg.length > 0 ? postStatusChangeAgg[0].total : 0;
  assert.strictEqual(postChangeSales, postCancelledSales + 150, 'PASS: Status change updated totals');
  console.log('✅ Acceptance Test 4 Passed: Status change from pending to completed increased totals by 150 EGP');

  // Clean up test documents
  await Order.deleteMany({ _id: { $in: [pendingOrder._id, finalizedOrder._id, cancelledOrder._id] } });
  console.log('🧹 Cleaned up temporary test orders');

  await mongoose.disconnect();
  console.log('--- ALL PHASE 1 FINANCIAL ACCEPTANCE TESTS PASSED ---');
}

testFinancials().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
