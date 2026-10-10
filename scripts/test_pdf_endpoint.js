const express = require('express');
const http = require('http');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/database');

async function testPdfEndpoint() {
  console.log('🧪 Testing Official Arabic PDF Report Endpoint...');
  await connectDB();

  const app = express();
  app.use(express.json());

  // Mount routes
  const reportsRouter = require('../routes/reports');
  app.use('/api/reports', reportsRouter);

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  const User = require('../models/User');
  const adminUser = await User.findOne({ role: 'admin' });
  if (!adminUser) {
    throw new Error('No admin user found in database');
  }

  const token = jwt.sign(
    { id: adminUser._id, role: 'admin', name: adminUser.name },
    process.env.JWT_SECRET || '2m_cafe_secret_2026',
    { expiresIn: '1h' }
  );

  const axios = require('axios');

  // Test 1: Generate Today PDF
  try {
    const res = await axios.get(`http://localhost:${port}/api/reports/pdf?period=today&type=sales`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer'
    });
    console.log(`  ✅ [PASS] PDF generated for today: status ${res.status}, length: ${res.data.length} bytes`);
    if (res.headers['content-type']?.includes('application/pdf')) {
      console.log('  ✅ [PASS] Content-Type is application/pdf');
    } else {
      console.error('  ❌ [FAIL] Content-Type is not application/pdf:', res.headers['content-type']);
    }
  } catch (err) {
    console.error('  ❌ [FAIL] Error generating today PDF:', err.message);
  }

  // Test 2: Generate Week PDF
  try {
    const res = await axios.get(`http://localhost:${port}/api/reports/pdf?period=week&type=sales`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer'
    });
    console.log(`  ✅ [PASS] PDF generated for week: status ${res.status}, length: ${res.data.length} bytes`);
  } catch (err) {
    console.error('  ❌ [FAIL] Error generating week PDF:', err.message);
  }

  // Test 3: Unauthorized rejected
  try {
    await axios.get(`http://localhost:${port}/api/reports/pdf?period=today&type=sales`);
    console.error('  ❌ [FAIL] Unauthorized request was NOT rejected');
  } catch (err) {
    if (err.response && [401, 403].includes(err.response.status)) {
      console.log(`  ✅ [PASS] Unauthorized request correctly rejected with status ${err.response.status}`);
    } else {
      console.error('  ❌ [FAIL] Unexpected error on unauthorized test:', err.message);
    }
  }

  server.close();
  process.exit(0);
}

testPdfEndpoint().catch(err => {
  console.error('Fatal error in test:', err);
  process.exit(1);
});
