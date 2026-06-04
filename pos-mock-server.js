// ===== خادم محاكاة API الكاشير المحلي (.NET) لأغراض الاختبار =====
const express = require('express');
const app = express();
app.use(express.json());

const PORT = 8081;
const VALID_API_KEY = '28ca1cdcfe70c376bd509c52b3b8e2b107ba1e14c35d8bc4be2bae147937aa28';

// التحقق من مفتاح API
app.use((req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== VALID_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
});

// GET /api/shifts/active
app.get('/api/shifts/active', (req, res) => {
  res.json({
    success: true,
    shiftId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    cashRegisterSessionId: '00000000-0000-0000-0000-000000000000',
    startTime: new Date().toISOString()
  });
});

// POST /api/orders
app.post('/api/orders', (req, res) => {
  const body = req.body;
  console.log('='.repeat(60));
  console.log('📦 طلب جديد مستلم من السايت!');
  console.log('-'.repeat(60));
  console.log(`  🔑 idempotencyKey: ${body.idempotencyKey}`);
  console.log(`  🏢 branchId:       ${body.branchId}`);
  console.log(`  👤 employeeId:     ${body.employeeId}`);
  console.log(`  🔄 shiftId:        ${body.shiftId}`);
  console.log(`  📋 عدد الأصناف:    ${body.items ? body.items.length : 0}`);
  if (body.items) {
    body.items.forEach((item, i) => {
      console.log(`     ${i + 1}. menuItemId: ${item.menuItemId} × ${item.quantity} — "${item.notes || '-'}"`);
    });
  }
  console.log('='.repeat(60));
  res.status(200).json({
    orderId: require('crypto').randomUUID(),
    status: 'created',
    message: 'Order received and sent to kitchen successfully.'
  });
});

// GET /api/reports/dashboard
app.get('/api/reports/dashboard', (req, res) => {
  res.json({
    todaysSales: 1250.00,
    monthlySales: 45200.00,
    activeShifts: 1,
    openOrders: 3,
    lowStockCount: 2,
    totalExpenses: 3200.00,
    netProfit: 8750.00,
    salesChartData: [
      { date: '2026-06-01', value: 1420 },
      { date: '2026-06-02', value: 1580 },
      { date: '2026-06-03', value: 1350 },
      { date: '2026-06-04', value: 1250 }
    ],
    bestSellingProducts: [
      { productName: 'Espresso', quantitySold: 47 },
      { productName: 'Latte', quantitySold: 38 },
      { productName: 'Cappuccino', quantitySold: 29 },
      { productName: 'Mocha', quantitySold: 22 }
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   🔄 POS Mock API Server — PORT ${PORT}       ║
╠════════════════════════════════════════════════╣
║  GET  /api/shifts/active                       ║
║  POST /api/orders                              ║
║  GET  /api/reports/dashboard                   ║
╠════════════════════════════════════════════════╣
║  X-API-KEY: dev-test-api-key-12345             ║
╚════════════════════════════════════════════════╝
  `);
});
