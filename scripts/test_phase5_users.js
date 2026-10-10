const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('../config/database');
const User = require('../models/User');

async function testPhase5Users() {
  console.log('====================================================');
  console.log('🧪 TESTING PHASE 5: SIMPLIFIED CUSTOMERS & USERS');
  console.log('====================================================');

  await connectDB();

  // Unset any legacy explicit email: null so sparse index works
  await mongoose.connection.db.collection('users').updateMany({ email: null }, { $unset: { email: '' } });

  const testCustPhone = `0109999${Date.now().toString().slice(-4)}`;
  const testMgrPhone = `0108888${Date.now().toString().slice(-4)}`;

  try {
    // 1. Create a Customer
    console.log('\n--- 1. Testing Customer Creation (Name, Phone, Role: customer) ---');
    const custPass = await bcrypt.hash(testCustPhone, 10);
    const customerUser = await User.create({
      name: 'عميل تجريبي مرحلة 5',
      phone: testCustPhone,
      role: 'customer',
      password: custPass,
      points: 0,
      total_spent: 0,
      subscriptionTier: 'none',
      customerStatus: 'standard'
    });
    console.log('✅ Customer created successfully:', {
      id: customerUser._id.toString(),
      name: customerUser.name,
      phone: customerUser.phone,
      role: customerUser.role
    });

    if (customerUser.role !== 'customer') {
      throw new Error(`Expected role 'customer' but got '${customerUser.role}'`);
    }

    // 2. Create a Manager
    console.log('\n--- 2. Testing Manager Creation (Name, Phone, Role: admin) ---');
    const mgrPass = await bcrypt.hash('secretPass123', 10);
    const managerUser = await User.create({
      name: 'مدير تجريبي مرحلة 5',
      phone: testMgrPhone,
      role: 'admin',
      password: mgrPass,
      points: 0,
      total_spent: 0,
      subscriptionTier: 'none',
      customerStatus: 'standard'
    });
    console.log('✅ Manager created successfully:', {
      id: managerUser._id.toString(),
      name: managerUser.name,
      phone: managerUser.phone,
      role: managerUser.role
    });

    if (managerUser.role !== 'admin') {
      throw new Error(`Expected role 'admin' but got '${managerUser.role}'`);
    }

    // 3. Verify Password Verification
    const isCustPassMatch = await bcrypt.compare(testCustPhone, customerUser.password);
    console.log('✅ Customer default password matches phone:', isCustPassMatch);
    if (!isCustPassMatch) throw new Error('Customer password does not match default phone');

    const isMgrPassMatch = await bcrypt.compare('secretPass123', managerUser.password);
    console.log('✅ Manager custom password matches provided password:', isMgrPassMatch);
    if (!isMgrPassMatch) throw new Error('Manager custom password does not match');

    // 4. Test Role Update (Customer -> Manager)
    console.log('\n--- 3. Testing Role Update (Promote Customer to Manager) ---');
    customerUser.role = 'admin';
    await customerUser.save();
    const updatedCust = await User.findById(customerUser._id);
    console.log('✅ Role updated successfully to:', updatedCust.role);
    if (updatedCust.role !== 'admin') throw new Error('Role update failed');

    // 5. Test Role Demotion (Manager -> Customer)
    customerUser.role = 'customer';
    await customerUser.save();
    const demotedCust = await User.findById(customerUser._id);
    console.log('✅ Role demoted successfully back to:', demotedCust.role);
    if (demotedCust.role !== 'customer') throw new Error('Role demotion failed');

    // 6. Test Legacy Fields Preservation
    console.log('\n--- 4. Checking Legacy DB Fields Preservation ---');
    const rawDoc = await User.findById(customerUser._id).lean();
    console.log('✅ DB Document fields present:', Object.keys(rawDoc));
    console.log('   points:', rawDoc.points, '| customerStatus:', rawDoc.customerStatus);
    if (rawDoc.points === undefined || rawDoc.customerStatus === undefined) {
      throw new Error('Legacy fields were unexpectedly removed from schema');
    }

    // 7. Cleanup
    console.log('\n--- 5. Cleaning up test accounts ---');
    await User.deleteOne({ _id: customerUser._id });
    await User.deleteOne({ _id: managerUser._id });
    console.log('✅ Test accounts deleted cleanly.');

    console.log('\n====================================================');
    console.log('🎉 ALL PHASE 5 CUSTOMER & USER TESTS PASSED WITH 100% SUCCESS');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testPhase5Users();
