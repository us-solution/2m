const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const reportEngine = require('../services/reportEngine');

const REPORT_TYPES = [
  'sales',
  'menu_products',
  'income_revenue',
  'profit_loss',
  'inventory',
  'warehouses',
  'product_movements',
  'costs',
  'expenses',
  'cash_flow',
  'shifts',
  'invoices'
];

async function testAllReports() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas:', mongoose.connection.name);

  const testDir = path.join(__dirname, 'generated_reports_test');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const results = [];

  for (const rType of REPORT_TYPES) {
    try {
      const data = await reportEngine.getReportData(rType, { period: 'all' });
      const doc = reportEngine.generateReportPdfStream(data);
      const filePath = path.join(testDir, `report_${rType}.pdf`);

      await new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);
        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      const stats = fs.statSync(filePath);
      console.log(`✅ [${rType}] PDF Generated: ${stats.size} bytes | Title: "${data.title}" | Rows: ${data.rows.length}`);
      results.push({ type: rType, size: stats.size, rows: data.rows.length, success: true });
    } catch (err) {
      console.error(`❌ [${rType}] Failed:`, err.message);
      results.push({ type: rType, success: false, error: err.message });
    }
  }

  await mongoose.disconnect();
  console.log('--- TEST SUMMARY ---');
  console.log(`Successfully generated ${results.filter(r => r.success).length} of ${REPORT_TYPES.length} PDF reports.`);
}

testAllReports().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
