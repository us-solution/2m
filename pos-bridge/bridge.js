require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.BRIDGE_PORT || 5001;
const BRIDGE_KEY = process.env.BRIDGE_API_KEY || 'ozel-bridge-secret';
const pendingRetryQueue = [];
let bridgeStats = { received: 0, synced: 0, failed: 0, retried: 0, lastSuccessAt: null };

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'pos_system',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'MproM7*#',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', err => console.error('[PG] Pool error:', err.message));

async function ensureInfrastructure(client, branchId) {
  // Ensure "Online" category exists
  // NOTE: categories uses lowercase/snake_case columns (EF Core HasColumnName override)
  let catResult = await client.query(
    `SELECT id FROM categories WHERE name = 'Online Orders' LIMIT 1`
  );
  if (catResult.rows.length === 0) {
    const catId = uuidv4();
    await client.query(
      `INSERT INTO categories (id, name, description, is_active, created_at, updated_at)
       VALUES ($1, 'Online Orders', 'Website & takeaway orders', true, NOW(), NOW())`,
      [catId]
    );
    catResult = { rows: [{ id: catId }] };
  }

  // Ensure generic "Online Item" menu item exists
  // NOTE: menu_items uses lowercase/snake_case columns (EF Core HasColumnName override)
  let itemResult = await client.query(
    `SELECT id, price FROM menu_items WHERE name = 'Online Order Item' LIMIT 1`
  );
  if (itemResult.rows.length === 0) {
    const itemId = uuidv4();
    await client.query(
      `INSERT INTO menu_items (id, category_id, name, description, price, is_available, created_at, updated_at)
       VALUES ($1, $2, 'Online Order Item', 'Generic item for website orders', 0, true, NOW(), NOW())`,
      [itemId, catResult.rows[0].id]
    );
    itemResult = { rows: [{ id: itemId, price: 0 }] };
  }

  return { categoryId: catResult.rows[0].id, genericItemId: itemResult.rows[0].id };
}

async function ensureOnlineTable(client, branchId) {
  let tableResult = await client.query(
    `SELECT "Id" FROM tables WHERE "TableNumber" = 'Online' AND "BranchId" = $1 LIMIT 1`,
    [branchId]
  );

  if (tableResult.rows.length === 0) {
    const tableId = uuidv4();
    await client.query(
      `INSERT INTO tables ("Id", "BranchId", "TableNumber", "Capacity", "Status", "Section")
       VALUES ($1, $2, 'Online', 99, 'Available', 'Online Orders')`,
      [tableId, branchId]
    );
    return tableId;
  }

  return tableResult.rows[0].Id;
}

async function syncOrderToPOS(order) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check for active shift
    const shiftResult = await client.query(
      `SELECT "Id", "BranchId", "OpenedByEmployeeId" FROM shifts WHERE "Status" = 'Open' LIMIT 1`
    );
    if (shiftResult.rows.length === 0) {
      console.log('[Bridge] No active shift — skipping order', order.order_id);
      await client.query('COMMIT');
      return { skipped: true, reason: 'no_active_shift' };
    }

    const shift = shiftResult.rows[0];
    const branchId = shift.BranchId;

    // 2. Ensure Online table + generic menu item
    const tableId = await ensureOnlineTable(client, branchId);
    const { genericItemId } = await ensureInfrastructure(client, branchId);

    // 3. Find or create table session for "Online" table in this shift
    let sessionResult = await client.query(
      `SELECT "Id" FROM table_sessions
       WHERE "TableId" = $1 AND "ShiftId" = $2 AND "Status" = 'Open' LIMIT 1`,
      [tableId, shift.Id]
    );

    let sessionId;
    if (sessionResult.rows.length === 0) {
      sessionId = uuidv4();
      await client.query(
        `INSERT INTO table_sessions ("Id", "TableId", "ShiftId", "BranchId", "Status",
         "OpenedByEmployeeId", "OpenedAt", "LastActivityAt", "GuestCount", "Notes")
         VALUES ($1, $2, $3, $4, 'Open', $5, NOW(), NOW(), 1, 'Online order session')`,
        [sessionId, tableId, shift.Id, branchId, shift.OpenedByEmployeeId]
      );
    } else {
      sessionId = sessionResult.rows[0].Id;
    }

    // 4. Pick employee (prefer first active, fallback to shift opener)
    let empResult = await client.query(
      `SELECT "id", "full_name" FROM employees
       WHERE "is_active" = true AND "branch_id" = $1
       ORDER BY "full_name" LIMIT 1`,
      [branchId]
    );

    let employeeId = shift.OpenedByEmployeeId;
    let employeeName = 'System';
    if (empResult.rows.length > 0) {
      employeeId = empResult.rows[0].id;
      employeeName = empResult.rows[0].full_name;
    }

    // 5. Create the Order
    const orderId = uuidv4();
    const idempotencyKey = uuidv4();
    const items = order.items || [];
    const subtotal = parseFloat(order.total_price) || 0;
    const finalTotal = subtotal;
    const customerInfo = order.customer_name
      ? `Customer: ${order.customer_name}${order.customer_phone ? ` (${order.customer_phone})` : ''}`
      : '';
    const notes = [customerInfo, order.notes || ''].filter(Boolean).join(' | ');

    await client.query(
      `INSERT INTO orders ("Id", "ShiftId", "TableSessionId", "BranchId", "Status",
       "CreatedByEmployeeId", "TransactedBy", "TransactedByName",
       "Subtotal", "Taxes", "Discounts", "FinalTotal",
       "TotalRecipeCost", "GrossProfit", "IdempotencyKey", "Version",
       "CreatedAt", "LastActivityAt", "Notes", "DeviceId",
       "LoyaltyDiscountAmount", "PromoDiscountAmount", "ManualDiscountAmount",
       "CompDiscountAmount", "GrossRevenueSnapshot", "TipsSnapshot", "FeesSnapshot")
       VALUES ($1,$2,$3,$4,'Draft',$5,$6,$7,$8,0,0,$9,0,$10,$11,1,NOW(),NOW(),$12,'web',0,0,0,0,$8,0,0)`,
      [
        orderId, shift.Id, sessionId, branchId,
        employeeId, employeeId, employeeName,
        subtotal, finalTotal, finalTotal,
        idempotencyKey,
        notes
      ]
    );

    // 6. Create OrderItems
    for (const item of items) {
      const itemId = uuidv4();
      const qty = parseFloat(item.quantity) || 1;
      const price = parseFloat(item.price) || 0;
      const itemSubtotal = price * qty;

      await client.query(
        `INSERT INTO order_items ("Id", "OrderId", "MenuItemId", "NameSnapshot", "PriceSnapshot",
         "Quantity", "Subtotal", "TaxSnapshot", "DiscountSnapshot", "FinalTotal",
         "RecipeCostSnapshot", "PreparationStatus", "CreatedAt",
         "QueuePriority", "IsReFiredClone", "IsComplimentary", "Version")
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,0,'Pending',NOW(),0,false,false,1)`,
        [
          itemId, orderId, genericItemId,
          item.name || 'Item', price,
          qty, itemSubtotal, itemSubtotal
        ]
      );
    }

    await client.query('COMMIT');
    console.log('[Bridge] Order synced to POS:', orderId, '| Table:', order.table_number);
    return { success: true, orderId };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Bridge] Sync error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

function normalizeEnvelopeOrder(payload) {
  if (payload?.meta && payload?.data) {
    const data = payload.data;
    return {
      envelopeEventId: payload.meta.eventId,
      envelopeVersion: payload.meta.orderVersion || 1,
      order_id: data.order_id || payload.meta.orderId,
      table_number: data.table_number,
      items: parseItems(data.items),
      total_price: data.total_price,
      notes: data.notes,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      created_at: data.created_at
    };
  }
  return payload;
}

// ── HTTP Endpoints ──

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    bridgeStats,
    retryQueue: pendingRetryQueue.length
  });
});

app.post('/api/inbound', async (req, res) => {
  const apiKey = req.headers['x-bridge-key'];
  if (!apiKey || apiKey !== BRIDGE_KEY) {
    return res.status(403).json({ error: 'Invalid or missing x-bridge-key' });
  }

  const body = req.body || {};
  const eventType = body.meta?.eventType || body.event;
  if ((eventType === 'order.created' || eventType === 'new-order') && (body.data || body.order)) {
    const order = normalizeEnvelopeOrder(body);
    bridgeStats.received += 1;
    try {
      const result = await syncOrderToPOS(order);
      if (result.skipped) {
        console.log('[Bridge] Skipped (no shift):', order.order_id);
        res.json({ received: true, synced: false, reason: result.reason, ack: { eventId: body.meta?.eventId || null, status: 'failed' } });
      } else {
        console.log('[Bridge] Synced:', order.order_id);
        bridgeStats.synced += 1;
        bridgeStats.lastSuccessAt = new Date().toISOString();
        res.json({ received: true, synced: true, pos_order_id: result.orderId, ack: { eventId: body.meta?.eventId || null, status: 'acked' } });
      }
    } catch (err) {
      console.error('[Bridge] Error processing order:', err.message);
      bridgeStats.failed += 1;
      pendingRetryQueue.push({ body, retries: 0, nextTryAt: Date.now() + 5000 });
      res.status(500).json({ error: err.message, ack: { eventId: body.meta?.eventId || null, status: 'failed', reason: err.message } });
    }
  } else {
    res.json({ received: true });
  }
});

// ── Report sync: Push POS data to Vercel for admin dashboard ──

async function syncReports() {
  if (!VERCEL_URL || !VERCEL_KEY) return;

  const today = new Date().toISOString().split('T')[0];

  try {
    const client = await pool.connect();
    try {
      // 1. Daily sales summary
      const salesResult = await client.query(
        `SELECT
           COUNT(*)::int AS order_count,
           COALESCE(SUM("FinalTotal"),0) AS total_revenue,
           COALESCE(AVG("FinalTotal"),0) AS avg_order_value
         FROM orders
         WHERE "Status" IN ('Paid','Completed')
           AND "LastActivityAt" >= CURRENT_DATE`
      );
      const salesRow = salesResult.rows[0] || { order_count: 0, total_revenue: 0, avg_order_value: 0 };

      // 2. Top selling items (today)
      const itemsResult = await client.query(
        `SELECT
           oi."NameSnapshot" AS name,
           SUM(oi."Quantity")::int AS qty,
           SUM(oi."FinalTotal") AS revenue
         FROM order_items oi
         JOIN orders o ON oi."OrderId" = o."Id"
         WHERE o."Status" IN ('Paid','Completed')
           AND o."LastActivityAt" >= CURRENT_DATE
         GROUP BY oi."NameSnapshot"
         ORDER BY revenue DESC
         LIMIT 10`
      );

      const clientRelease = client;
      clientRelease.release();

      // Push daily_summary
      await fetch(`${VERCEL_URL}/api/bridge/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bridge-key': VERCEL_KEY },
        body: JSON.stringify({
          type: 'daily_summary',
          snapshotDate: today,
          data: {
            order_count: parseInt(salesRow.order_count) || 0,
            total_revenue: parseFloat(salesRow.total_revenue) || 0,
            avg_order_value: parseFloat(salesRow.avg_order_value) || 0
          }
        })
      });

      // Push top_items
      const topItems = itemsResult.rows.map(r => ({
        name: r.name || 'Unknown',
        qty: parseInt(r.qty) || 0,
        revenue: parseFloat(r.revenue) || 0
      }));
      await fetch(`${VERCEL_URL}/api/bridge/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bridge-key': VERCEL_KEY },
        body: JSON.stringify({
          type: 'top_items',
          snapshotDate: today,
          data: topItems
        })
      });

      console.log(`[Reports] Synced POS data for ${today} (${salesRow.order_count} orders, ${salesRow.total_revenue} revenue)`);
    } catch (err) {
      console.error('[Reports] Query error:', err.message);
      client.release();
    }
  } catch (err) {
    console.error('[Reports] DB connection error:', err.message);
  }
}

// ── Vercel polling (fallback when ngrok/tunnel is unavailable) ──

const VERCEL_URL = process.env.VERCEL_BRIDGE_URL;
const VERCEL_KEY = process.env.BRIDGE_API_KEY;

async function pollVercel() {
  if (!VERCEL_URL || !VERCEL_KEY) return;

  try {
    const res = await fetch(`${VERCEL_URL}/api/orders/unsynced`, {
      headers: { 'x-bridge-key': VERCEL_KEY }
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('[Poll] Vercel returned', res.status, txt.substring(0, 120));
      return;
    }

    const envelopes = await res.json();
    const orders = envelopes.map(normalizeEnvelopeOrder);
    if (orders.length === 0) return;

    console.log(`[Poll] Found ${orders.length} unsynced order(s)`);

    for (const order of orders) {
      try {
        const parsedItems = parseItems(order.items);
        const result = await syncOrderToPOS({
          order_id: order.id,
          table_number: order.table_number,
          items: parsedItems,
          total_price: order.total_price,
          notes: order.notes,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          created_at: order.created_at,
        });

        if (result.success) {
          // Mark as synced on Vercel
          const markRes = await fetch(`${VERCEL_URL}/api/orders/mark-synced`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-bridge-key': VERCEL_KEY },
            body: JSON.stringify({ ids: [order.order_id || order.id], eventIds: order.envelopeEventId ? [order.envelopeEventId] : [] })
          });
          if (!markRes.ok) console.warn('[Poll] Failed to mark order synced:', order.id);
        }
      } catch (err) {
        console.error(`[Poll] Error syncing order ${order.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Poll] Vercel fetch error:', err.message);
  }
}

function parseItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try { return JSON.parse(items); } catch { return []; }
}

// Start polling every 15 seconds for orders
if (VERCEL_URL) {
  console.log(`[Bridge] Polling Vercel every 15s: ${VERCEL_URL}/api/orders/unsynced`);
  setInterval(pollVercel, 15000);
  pollVercel();

  // Report sync every 5 minutes
  console.log('[Bridge] Report sync every 5min');
  setInterval(syncReports, 300000);
  syncReports();
} else {
  console.log('[Bridge] VERCEL_BRIDGE_URL not set — polling disabled (webhook-only mode)');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Bridge] OZEL → POS bridge running on port ${PORT}`);
  console.log(`[Bridge] PostgreSQL: ${process.env.PG_HOST || 'localhost'}:${process.env.PG_PORT || '5432'}/${process.env.PG_DATABASE || 'pos_system'}`);
});

setInterval(async () => {
  if (!pendingRetryQueue.length) return;
  const now = Date.now();
  const ready = pendingRetryQueue.filter(x => x.nextTryAt <= now);
  for (const item of ready) {
    try {
      await syncOrderToPOS(normalizeEnvelopeOrder(item.body));
      bridgeStats.retried += 1;
      bridgeStats.synced += 1;
      bridgeStats.lastSuccessAt = new Date().toISOString();
      pendingRetryQueue.splice(pendingRetryQueue.indexOf(item), 1);
    } catch (err) {
      item.retries += 1;
      item.nextTryAt = Date.now() + Math.min(60000, 5000 * (2 ** item.retries));
      if (item.retries > 5) {
        bridgeStats.failed += 1;
        pendingRetryQueue.splice(pendingRetryQueue.indexOf(item), 1);
      }
    }
  }
}, 3000);
