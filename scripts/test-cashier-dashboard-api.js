/**
 * test-cashier-dashboard-api.js
 * Tests the /api/admin/cashier-dashboard endpoint with real Express server and JWT admin token.
 */

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/database');
const adminRouter = require('../routes/admin');
const { authenticateToken, requireRole } = require('../middlewares/auth');

async function testApi() {
  console.log('🚀 Testing Cashier Dashboard API endpoint...\n');
  await connectDB();

  const app = express();
  app.use(express.json());

  // Mount admin router
  app.use('/api/admin', adminRouter);

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  const JWT_SECRET = process.env.JWT_SECRET || '2m_cafe_secret_2026';
  const adminToken = jwt.sign(
    { id: '6ac1471c38f56e0fea7f25cd', name: '2M Admin', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  async function get(pathWithQuery, token = adminToken) {
    return new Promise((resolve, reject) => {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      http.get(`http://127.0.0.1:${port}${pathWithQuery}`, { headers }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (_) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }).on('error', reject);
    });
  }

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      failed++;
    }
  }

  // TEST 1: Unauthorized request without token
  const unauth = await get('/api/admin/cashier-dashboard', null);
  assert(unauth.status === 401 || unauth.status === 403, 'Unauthorized request correctly rejected (Status 401/403)');

  // TEST 2: Today period
  const today = await get('/api/admin/cashier-dashboard?period=today');
  assert(today.status === 200, 'Period=today returns 200 OK');
  assert(today.data.success === true, 'Response success is true');
  assert(today.data.kpis != null, 'KPIs object present');
  assert(typeof today.data.kpis.totalSales === 'number', 'KPI totalSales is a number');
  assert(Array.isArray(today.data.invoices), 'Invoices is an array');
  assert(Array.isArray(today.data.products), `Products list populated (${today.data.products.length} products)`);
  assert(Array.isArray(today.data.categories), `Categories list populated (${today.data.categories.length} categories)`);

  // TEST 3: Yesterday period
  const yesterday = await get('/api/admin/cashier-dashboard?period=yesterday');
  assert(yesterday.status === 200, 'Period=yesterday returns 200 OK');
  assert(yesterday.data.period.label === 'أمس', 'Period label is yesterday (أمس)');

  // TEST 4: Week period
  const week = await get('/api/admin/cashier-dashboard?period=week');
  assert(week.status === 200, 'Period=week returns 200 OK');

  // TEST 5: Month period
  const month = await get('/api/admin/cashier-dashboard?period=month');
  assert(month.status === 200, 'Period=month returns 200 OK');

  // TEST 6: Custom date range
  const custom = await get('/api/admin/cashier-dashboard?period=custom&from=2026-01-01&to=2026-10-09');
  assert(custom.status === 200, 'Period=custom returns 200 OK');
  assert(custom.data.period.label.includes('مخصص'), 'Period label reflects custom range');

  server.close();
  console.log(`\n========================================`);
  console.log(`API Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

testApi().catch(e => {
  console.error('API Test Error:', e);
  process.exit(1);
});
