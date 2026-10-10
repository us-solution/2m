const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/database');
const User = require('../models/User');

async function verifyProduction() {
  console.log('🌐 Verifying live production deployment on Vercel...');
  await connectDB();

  const admin = await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('Admin user not found');

  const token = jwt.sign(
    { id: admin._id, role: 'admin', name: admin.name },
    process.env.JWT_SECRET || '2m_cafe_secret_2026',
    { expiresIn: '1h' }
  );

  const prodUrls = [
    'https://2m-five.vercel.app',
    'https://2million.store'
  ];

  for (const baseUrl of prodUrls) {
    console.log(`\nTesting endpoint: ${baseUrl}`);
    try {
      // 1. Check diagnostic
      const diagRes = await axios.get(`${baseUrl}/api/admin/db-diagnostic`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      console.log('  ✅ [PASS] /api/admin/db-diagnostic returned 200:');
      console.log('     Status:', diagRes.data.status);
      console.log('     Database Name:', diagRes.data.databaseName);
      console.log('     Is Strictly Isolated:', diagRes.data.isStrictlyIsolated);
      console.log('     Collections Count:', diagRes.data.collectionsCount);
      console.log('     Cluster Host:', diagRes.data.clusterHost);

      // 2. Check cashier-dashboard
      const dashRes = await axios.get(`${baseUrl}/api/admin/cashier-dashboard?period=today&includeCatalog=false`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      console.log('  ✅ [PASS] /api/admin/cashier-dashboard returned 200:');
      console.log('     Success:', dashRes.data.success);
      console.log('     Source:', dashRes.data.source);
      console.log('     Total sales:', dashRes.data.kpis?.totalSales);
      console.log('     Orders count:', dashRes.data.kpis?.ordersCount);
      console.log('     POS status:', dashRes.data.posConnection?.status);
      console.log('     Current open shift:', dashRes.data.currentOpenShift ? dashRes.data.currentOpenShift.cashierName : 'None (closed)');

      // 3. Check Reports Engine API
      const reportRes = await axios.get(`${baseUrl}/api/reports/engine/data?reportType=sales`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      console.log('  ✅ [PASS] /api/reports/engine/data?reportType=sales returned 200:');
      console.log('     Report Title:', reportRes.data.title);
      console.log('     Rows Count:', reportRes.data.rows?.length);
      console.log('     Headers:', reportRes.data.headers);

      // 4. Check Simplified Users API
      const usersRes = await axios.get(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      console.log('  ✅ [PASS] /api/admin/users returned 200:');
      console.log('     Users Count:', usersRes.data?.length);
      if (usersRes.data?.length > 0) {
        console.log('     First User Fields:', Object.keys(usersRes.data[0]));
      }
    } catch (err) {
      console.warn(`  ⚠️ Request to ${baseUrl} encountered:`, err.message);
      if (err.response) {
        console.warn(`     Status: ${err.response.status}`, err.response.data);
      }
    }
  }

  process.exit(0);
}

verifyProduction().catch(err => {
  console.error('Production verification script error:', err);
  process.exit(1);
});
