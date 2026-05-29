/**
 * ====================================================
 *  OZEL Cafe - Local Bridge Server
 *  الوسيط المحلي بين موقع Vercel والكاشير المحلي
 * ====================================================
 *
 * كيف يعمل:
 * 1. يستمع لأحداث Pusher من موقع Vercel
 * 2. عند وصول طلب جديد: يطبعه على الطابعة الحرارية
 * 3. يخزن الطلبات في قاعدة بيانات SQLite محلية (sql.js)
 * 4. يوفر REST API محلي لعرض الطلبات وتحديث حالتها
 *
 * تشغيل: node bridge-server.js
 */

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const fs        = require('fs');
const Pusher    = require('pusher-js/node');
const { ThermalPrinter, PrinterTypes, CharacterSet, BreakLine } = require('node-thermal-printer');
const initSqlJs = require('sql.js');

// ─── إعداد قاعدة البيانات (sql.js - Pure JavaScript, no compilation) ────────
const DB_FILE = path.join(__dirname, 'orders.db');
let db = null;

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id            TEXT PRIMARY KEY,
      table_number  TEXT NOT NULL,
      items         TEXT NOT NULL,
      total_price   REAL NOT NULL,
      points_earned INTEGER DEFAULT 0,
      notes         TEXT DEFAULT '',
      status        TEXT DEFAULT 'pending',
      customer_name  TEXT,
      customer_phone TEXT,
      qr_token      TEXT,
      printed       INTEGER DEFAULT 0,
      created_at    TEXT,
      updated_at    TEXT
    )
  `);

  saveDB();
  console.log('[DB] ✅ قاعدة البيانات المحلية جاهزة:', DB_FILE);
}

// حفظ DB على القرص بعد كل تعديل
function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
  } catch (e) {
    console.error('[DB] خطأ في الحفظ:', e.message);
  }
}

// Helper: تشغيل SELECT وإرجاع صفوف كـ array of objects
function dbAll(sql, params = []) {
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (e) {
    console.error('[DB] خطأ في الاستعلام:', e.message);
    return [];
  }
}

// Helper: تشغيل SELECT وإرجاع صف واحد
function dbGet(sql, params = []) {
  if (!db) return null;
  try {
    const results = db.exec(sql.replace(/\?/g, () => {
      const p = params.shift();
      return typeof p === 'string' ? `'${p.replace(/'/g, "''")}'` : p;
    }));
    if (!results.length || !results[0].values.length) return null;
    const cols = results[0].columns;
    const vals = results[0].values[0];
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    return obj;
  } catch (e) {
    console.error('[DB] خطأ في dbGet:', e.message);
    return null;
  }
}

// Helper: تشغيل INSERT/UPDATE/DELETE
function dbRun(sql, params = []) {
  if (!db) return { changes: 0 };
  try {
    // sql.js يستخدم bind parameters بشكل مختلف
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
    saveDB();
    return { changes: 1 };
  } catch (e) {
    console.error('[DB] خطأ في dbRun:', e.message, '\nSQL:', sql);
    return { changes: 0 };
  }
}

// ─── إعداد Express ────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.BRIDGE_PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

// ─── SSE Clients (للتحديثات اللحظية) ────────────────────────────────────────
const sseClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try { client.write(payload); } catch (_) { sseClients.delete(client); }
  });
}

// ─── إعداد الطابعة الحرارية ──────────────────────────────────────────────────
const PRINTER_IP   = process.env.PRINTER_IP;
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT) || 9100;
const PRINTER_TYPE = process.env.PRINTER_TYPE === 'STAR' ? PrinterTypes.STAR : PrinterTypes.EPSON;

async function printOrder(order) {
  if (!PRINTER_IP) {
    console.log('[PRINTER] ⚠️  لم يتم تحديد PRINTER_IP - تخطي الطباعة');
    return false;
  }

  const printer = new ThermalPrinter({
    type: PRINTER_TYPE,
    interface: `tcp://${PRINTER_IP}:${PRINTER_PORT}`,
    characterSet: CharacterSet.PC850_MULTILINGUAL,
    breakLine: BreakLine.WORD,
    options: { timeout: 5000 }
  });

  const isConnected = await printer.isPrinterConnected();
  if (!isConnected) {
    console.error('[PRINTER] ❌ تعذر الاتصال بالطابعة:', `${PRINTER_IP}:${PRINTER_PORT}`);
    return false;
  }

  // ─── تصميم الإيصال ──────────────────────────────────────────────
  printer.alignCenter();
  printer.bold(true);
  printer.setTextSize(1, 1);
  printer.println('OZEL CAFE');
  printer.setTextSize(0, 0);
  printer.bold(false);
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Table / طاولة : ${order.table_number}`);
  printer.println(`Order #        : ${String(order.id).substring(0, 8).toUpperCase()}`);
  printer.println(`Time           : ${new Date(order.created_at || Date.now()).toLocaleTimeString('ar-EG')}`);

  if (order.customer_name) {
    printer.println(`Customer       : ${order.customer_name}`);
  }

  printer.drawLine();
  printer.bold(true);
  printer.println('ITEMS / الأصناف:');
  printer.bold(false);

  let items = [];
  try {
    items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
  } catch (_) { items = []; }

  items.forEach((item) => {
    const name  = item.name_ar || item.name || 'Unknown';
    const qty   = item.quantity || item.qty || 1;
    const price = item.price ? `${item.price} EGP` : '';
    printer.leftRight(`  ${qty}x ${name}`, price);
  });

  printer.drawLine();
  printer.bold(true);
  printer.leftRight('TOTAL / المجموع:', `${order.total_price} EGP`);
  printer.bold(false);

  if (order.notes && String(order.notes).trim()) {
    printer.drawLine();
    printer.println('Notes / ملاحظات:');
    printer.println(order.notes);
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println('Thank you! شكراً لزيارتكم');
  printer.cut();

  try {
    await printer.execute();
    console.log('[PRINTER] ✅ تمت الطباعة - Order:', order.id);
    return true;
  } catch (err) {
    console.error('[PRINTER] ❌ خطأ في الطباعة:', err.message);
    return false;
  }
}

// ─── إعداد Pusher Listener ───────────────────────────────────────────────────
const PUSHER_KEY     = process.env.PUSHER_KEY;
const PUSHER_CLUSTER = process.env.PUSHER_CLUSTER || 'eu';

if (!PUSHER_KEY) {
  console.error('❌ PUSHER_KEY غير محدد في ملف .env - يرجى إضافته');
  process.exit(1);
}

const pusherClient = new Pusher(PUSHER_KEY, {
  cluster: PUSHER_CLUSTER,
});

const channel = pusherClient.subscribe('cashier-orders');

channel.bind('pusher:subscription_succeeded', () => {
  console.log('✅ [Pusher] متصل بـ channel: cashier-orders');
});

// Reusable handler for new orders from both Pusher and Webhook
async function handleNewOrder(data, source = 'Pusher') {
  const orderId = data.order_id || data.id;
  if (!orderId) {
    console.warn(`[Bridge] [${source}] ⚠️  الطلب لا يحتوي على معرف (order_id)`);
    return false;
  }

  console.log(`\n📦 [${source}] طلب جديد وصل!`, {
    id: orderId,
    table: data.table_number,
    total: data.total_price
  });

  // 1. حفظ الطلب في SQLite
  const createdAt = data.created_at || new Date().toISOString();
  try {
    dbRun(
      `INSERT OR IGNORE INTO orders
        (id, table_number, items, total_price, points_earned, notes, status,
         customer_name, customer_phone, qr_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        data.table_number,
        typeof data.items === 'string' ? data.items : JSON.stringify(data.items || []),
        data.total_price,
        data.points_earned || 0,
        data.notes || '',
        data.status || 'pending',
        data.customer_name || null,
        data.customer_phone || null,
        data.qr_token || null,
        createdAt,
        createdAt
      ]
    );
    console.log('[DB] ✅ الطلب محفوظ محلياً');
  } catch (dbErr) {
    console.error('[DB] ❌ خطأ في الحفظ:', dbErr.message);
  }

  // 2. إرسال الطلب فوراً لجميع شاشات الكاشير عبر SSE
  const parsedItems = (() => {
    try { return typeof data.items === 'string' ? JSON.parse(data.items) : (data.items || []); } catch (_) { return []; }
  })();
  broadcastSSE('new-order', {
    id: orderId,
    table_number: data.table_number,
    items: parsedItems,
    total_price: data.total_price,
    points_earned: data.points_earned || 0,
    notes: data.notes || '',
    status: data.status || 'pending',
    customer_name: data.customer_name || null,
    customer_phone: data.customer_phone || null,
    qr_token: data.qr_token || null,
    printed: false,
    created_at: createdAt,
    updated_at: createdAt
  });

  // 3. طباعة الطلب
  const printed = await printOrder({
    ...data,
    id: orderId,
    created_at: createdAt
  });

  // 4. تحديث حالة الطباعة
  if (printed) {
    dbRun('UPDATE orders SET printed = 1 WHERE id = ?', [orderId]);
  }

  return true;
}

channel.bind('new-order', async (data) => {
  await handleNewOrder(data, 'Pusher');
});

pusherClient.connection.bind('error', (err) => {
  console.error('[Pusher] ❌ خطأ في الاتصال:', err.message || err);
});

pusherClient.connection.bind('disconnected', () => {
  console.warn('[Pusher] ⚠️  انقطع الاتصال - إعادة الاتصال تلقائياً...');
});

// ─── REST API المحلي ─────────────────────────────────────────────────────────

// POST /api/inbound - Webhook endpoint for inbound events (e.g. from Vercel)
app.post('/api/inbound', async (req, res) => {
  const bridgeKey = req.headers['x-bridge-key'];
  const expectedKey = process.env.BRIDGE_API_KEY;

  if (!expectedKey) {
    console.warn('[Webhook] ⚠️  BRIDGE_API_KEY is not configured on this bridge server');
    return res.status(500).json({ error: 'Bridge server is missing BRIDGE_API_KEY configuration' });
  }

  if (bridgeKey !== expectedKey) {
    console.warn('[Webhook] ❌ Unauthorized webhook attempt from IP:', req.ip);
    return res.status(401).json({ error: 'Unauthorized: Invalid bridge key' });
  }

  const { event, order } = req.body;
  if (!event || !order) {
    return res.status(400).json({ error: 'Bad Request: Missing event or order payload' });
  }

  if (event === 'new-order') {
    // Process new order asynchronously so we don't hold the webhook connection
    handleNewOrder(order, 'Webhook').catch(err => {
      console.error('[Webhook] ❌ Error handling new order:', err.message);
    });
    return res.json({ success: true, message: 'Order received and processing started' });
  }

  res.status(400).json({ error: `Unknown event: ${event}` });
});

// GET /orders - قائمة الطلبات (مع دعم CORS كامل للكاشير)
app.get('/orders', (req, res) => {
  const { status, limit = 100, since } = req.query;
  let sql = 'SELECT * FROM orders';
  const params = [];
  const conditions = [];

  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (since) {
    conditions.push('created_at > ?');
    params.push(since);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const rows = dbAll(sql, params);

  // parse items JSON string → array for each row
  const parsed = rows.map(r => ({
    ...r,
    items: (() => { try { return JSON.parse(r.items); } catch (_) { return []; } })()
  }));

  res.json(parsed);
});

// GET /orders/export - صدّر الطلبات كـ JSON (للكاشير الخارجي أو أي نظام)
app.get('/orders/export', (req, res) => {
  const { status, date, format = 'json' } = req.query;
  let sql = 'SELECT * FROM orders';
  const params = [];
  const conditions = [];

  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }
  if (date) {
    conditions.push('date(created_at) = date(?)');
    params.push(date);
  } else {
    // بدون تاريخ → آخر 24 ساعة فقط
    conditions.push("created_at > datetime('now','-24 hours')");
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';

  const rows = dbAll(sql, params);
  const parsed = rows.map(r => ({
    id: r.id,
    table_number: r.table_number,
    items: (() => { try { return JSON.parse(r.items); } catch (_) { return []; } })(),
    total_price: r.total_price,
    points_earned: r.points_earned,
    notes: r.notes || '',
    status: r.status,
    customer_name: r.customer_name || null,
    customer_phone: r.customer_phone || null,
    qr_token: r.qr_token || null,
    printed: r.printed === 1 || r.printed === true,
    created_at: r.created_at,
    updated_at: r.updated_at
  }));

  res.setHeader('Content-Disposition', `inline; filename="ozel-orders-${new Date().toISOString().split('T')[0]}.json"`);
  res.json({
    exported_at: new Date().toISOString(),
    bridge_version: '2.0.0',
    total: parsed.length,
    orders: parsed
  });
});

// GET /orders/stream - Server-Sent Events للتحديثات اللحظية
app.get('/orders/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // إرسال heartbeat كل 25 ثانية لإبقاء الاتصال
  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { clearInterval(hb); }
  }, 25000);

  sseClients.add(res);
  console.log(`[SSE] 🔌 كاشير متصل - إجمالي: ${sseClients.size}`);

  // إرسال الطلبات الحالية فور الاتصال
  const currentOrders = dbAll(
    "SELECT * FROM orders WHERE status IN ('pending','confirmed','preparing','ready') ORDER BY created_at DESC LIMIT 50"
  ).map(r => ({
    ...r,
    items: (() => { try { return JSON.parse(r.items); } catch (_) { return []; } })()
  }));
  res.write(`event: init\ndata: ${JSON.stringify({ orders: currentOrders })}\n\n`);

  req.on('close', () => {
    clearInterval(hb);
    sseClients.delete(res);
    console.log(`[SSE] 🔌 كاشير قطع الاتصال - إجمالي: ${sseClients.size}`);
  });
});

// GET /orders/stats - إحصائيات سريعة
app.get('/orders/stats', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const pending  = dbAll("SELECT COUNT(*) as n FROM orders WHERE status='pending'")[0]?.n || 0;
  const confirmed = dbAll("SELECT COUNT(*) as n FROM orders WHERE status='confirmed'")[0]?.n || 0;
  const ready    = dbAll("SELECT COUNT(*) as n FROM orders WHERE status='ready'")[0]?.n || 0;
  const todayRows = dbAll(`SELECT total_price, status FROM orders WHERE date(created_at) = date('${today}')`);
  const todayRevenue = todayRows.filter(r => r.status !== 'cancelled').reduce((s, r) => s + (r.total_price || 0), 0);
  res.json({
    pending, confirmed, ready,
    today_orders: todayRows.length,
    today_revenue: Math.round(todayRevenue * 100) / 100,
    timestamp: new Date().toISOString()
  });
});

// GET /orders/:id - تفاصيل طلب
app.get('/orders/:id', (req, res) => {
  const rows = dbAll(
    `SELECT * FROM orders WHERE id = ? LIMIT 1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });
  res.json(rows[0]);
});

// PATCH /orders/:id/status - تحديث حالة الطلب
app.patch('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'الحالة مطلوبة' });

  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `حالة غير صالحة. القيم المسموحة: ${validStatuses.join(', ')}`
    });
  }

  // التحقق من وجود الطلب
  const existing = dbAll(`SELECT id FROM orders WHERE id = ? LIMIT 1`, [req.params.id]);
  if (!existing.length) {
    return res.status(404).json({ error: 'الطلب غير موجود محلياً' });
  }

  const updatedAt = new Date().toISOString();

  // تحديث محلي
  dbRun(
    `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`,
    [status, updatedAt, req.params.id]
  );

  // إعلام جميع شاشات الكاشير المتصلة عبر SSE
  broadcastSSE('status-update', {
    id: req.params.id,
    status,
    updated_at: updatedAt
  });

  // مزامنة مع Vercel (اختياري)
  const VERCEL_API    = process.env.VERCEL_API_URL;
  const CASHIER_TOKEN = process.env.CASHIER_JWT_TOKEN;

  if (VERCEL_API && CASHIER_TOKEN && !VERCEL_API.includes('your-project')) {
    try {
      const response = await fetch(`${VERCEL_API}/api/orders/${req.params.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CASHIER_TOKEN}`
        },
        body: JSON.stringify({ status })
      });
      if (response.ok) {
        console.log('[Vercel Sync] ✅ تم تحديث الحالة على Vercel:', status);
      } else {
        const txt = await response.text();
        console.warn('[Vercel Sync] ⚠️  فشل:', txt.substring(0, 100));
      }
    } catch (syncErr) {
      console.error('[Vercel Sync] ❌', syncErr.message);
    }
  }

  res.json({ success: true, status, id: req.params.id });
});

// POST /orders/:id/print - إعادة طباعة
app.post('/orders/:id/print', async (req, res) => {
  const rows = dbAll(`SELECT * FROM orders WHERE id = ? LIMIT 1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });

  const printed = await printOrder(rows[0]);
  if (printed) {
    dbRun('UPDATE orders SET printed = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'تمت الطباعة بنجاح' });
  } else {
    res.status(500).json({ error: 'فشل الطباعة - تحقق من اتصال الطابعة' });
  }
});

// GET /status - حالة السيرفر (Health Check)
app.get('/status', (req, res) => {
  const total   = dbAll('SELECT COUNT(*) as n FROM orders')[0]?.n || 0;
  const pending = dbAll("SELECT COUNT(*) as n FROM orders WHERE status = 'pending'")[0]?.n || 0;

  res.json({
    status: 'running',
    version: '2.0.0',
    pusher_state: pusherClient.connection.state,
    printer_ip: PRINTER_IP || 'not configured',
    printer_port: PRINTER_PORT,
    sse_clients: sseClients.size,
    orders_total: total,
    orders_pending: pending,
    endpoints: [
      'GET /status',
      'GET /orders',
      'GET /orders/export',
      'GET /orders/stream  (SSE)',
      'GET /orders/stats',
      'GET /orders/:id',
      'PATCH /orders/:id/status',
      'POST /orders/:id/print'
    ],
    timestamp: new Date().toISOString()
  });
});

// ─── تشغيل السيرفر ───────────────────────────────────────────────────────────
async function start() {
  try {
    await initDB();

    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log('  🚀 OZEL Cafe Local Bridge Server');
      console.log('='.repeat(50));
      console.log(`  📡 API المحلي : http://localhost:${PORT}`);
      console.log(`  🖨️  الطابعة    : ${PRINTER_IP ? `tcp://${PRINTER_IP}:${PRINTER_PORT}` : '⚠️ غير محددة (PRINTER_IP)'}`);
      console.log(`  🔗 Pusher     : cluster=${PUSHER_CLUSTER} | channel=cashier-orders`);
      console.log('='.repeat(50) + '\n');
    });
  } catch (err) {
    console.error('❌ فشل تشغيل السيرفر:', err.message);
    process.exit(1);
  }
}

start();
