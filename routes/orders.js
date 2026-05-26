const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const Order = require('../models/Order');
const User = require('../models/User');
const PointsLog = require('../models/PointsLog');
const { authenticateToken, requireRole } = require('../middlewares/auth');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ozel_cafe_secret_2026';

// Helper to get authenticated user if token is present
const getOptionalUser = async (req) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return await User.findByPk(decoded.id);
  } catch (e) {
    return null;
  }
};

// Create Order (with optional Auth)
router.post('/', async (req, res) => {
  const { table_number, items, total_price, notes } = req.body;

  if (table_number === undefined || !items || !total_price) {
    return res.status(400).json({ error: 'Missing fields: table_number, items, and total_price are required' });
  }

  const user = await getOptionalUser(req);
  const qrCodeToken = uuidv4(); // Unique token for checkout validation

  try {
    const points_earned = Math.floor(parseFloat(total_price));
    const items_str = typeof items === 'string' ? items : JSON.stringify(items);

    const order = await Order.create({
      userId: user ? user.id : null,
      table_number: String(table_number),
      items: items_str,
      total_price: total_price,
      points_earned: points_earned,
      notes: notes || '',
      status: 'pending',
      qrCodeToken,
      isQrConfirmed: false
    });

    if (user) {
      user.points += points_earned;
      user.total_spent = parseFloat(user.total_spent) + parseFloat(total_price);
      await user.save();

      await PointsLog.create({
        userId: user.id,
        points: points_earned,
        reason: `Order #${order.id}`,
        orderId: order.id
      });
    }

    // Generate base64 QR Code. The QR code contains the link to confirm order status
    // Cashier/Admin will scan this. We can encode the confirm endpoint URL or raw token.
    // Encodes: /api/orders/confirm-qr?token=xyz
    const host = req.get('host');
    const protocol = req.protocol;
    const confirmUrl = `${protocol}://${host}/api/orders/confirm-qr?token=${qrCodeToken}`;
    const qrCodeDataUrl = await QRCode.toDataURL(confirmUrl);

    res.json({
      success: true,
      order_id: order.id,
      points_earned: points_earned,
      qrCodeUrl: qrCodeDataUrl, // base64 data url for direct rendering in <img>
      qrToken: qrCodeToken
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List Orders for Cashier/Admin
router.get('/', authenticateToken, requireRole('cashier'), async (req, res) => {
  const { status } = req.query;
  const whereClause = {};
  if (status) {
    whereClause.status = status;
  }

  try {
    const orders = await Order.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['name', 'phone', 'email'] }]
    });

    const serialized = orders.map(o => ({
      id: o.id,
      user_id: o.userId,
      customer_name: o.user ? o.user.name : null,
      customer_phone: o.user ? (o.user.phone.startsWith('email_') ? '' : o.user.phone) : null,
      table_number: o.table_number,
      items: o.items,
      total_price: parseFloat(o.total_price),
      points_earned: o.points_earned,
      status: o.status,
      notes: o.notes,
      cashier_id: o.cashierId,
      created_at: o.createdAt.toISOString(),
      updated_at: o.updatedAt.toISOString(),
      isQrConfirmed: o.isQrConfirmed
    }));

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirm Order via QR Scan (Cashier/Admin Scans)
router.get('/confirm-qr', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('<h1>Error</h1><p>Missing verification token</p>');
  }

  try {
    const order = await Order.findOne({ where: { qrCodeToken: token } });
    if (!order) {
      return res.status(404).send('<h1>Not Found</h1><p>Order not found or invalid token</p>');
    }

    if (order.isQrConfirmed) {
      return res.send(`
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: 'Tajawal', sans-serif; background: #0b1310; color: #fff; text-align: center; padding: 3rem 1rem; }
              .card { background: #121e1a; padding: 2rem; border-radius: 12px; border: 1px solid #c29f43; max-width: 400px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
              h1 { color: #c29f43; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>الطلب مؤكد بالفعل!</h1>
              <p>تم تأكيد هذا الطلب #${order.id} مسبقاً.</p>
              <p style="color: #6d8e80;">Table: ${order.table_number}</p>
            </div>
          </body>
        </html>
      `);
    }

    order.isQrConfirmed = true;
    order.status = 'confirmed';
    await order.save();

    res.send(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Tajawal', sans-serif; background: #0b1310; color: #fff; text-align: center; padding: 3rem 1rem; }
            .card { background: #121e1a; padding: 2rem; border-radius: 12px; border: 1px solid #27ae60; max-width: 400px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
            h1 { color: #27ae60; }
            .btn { display: inline-block; background: #c29f43; color: #fff; text-decoration: none; padding: 0.8rem 1.5rem; border-radius: 6px; margin-top: 1.5rem; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>تم تأكيد الطلب بنجاح!</h1>
            <p>الطلب رقم #${order.id} تم تأكيده وتغيير حالته في النظام.</p>
            <p style="color: #6d8e80;">طاولة: ${order.table_number} | المجموع: ${order.total_price} ج.م</p>
            <a href="/cashier" class="btn">الذهاب للوحة الكاشير</a>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<h1>Internal Server Error</h1><p>${err.message}</p>`);
  }
});

// Update Order Status (Cashier)
router.patch('/:id/status', authenticateToken, requireRole('cashier'), async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Missing status' });
  }

  try {
    const order = await Order.findByPk(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    order.status = status;
    order.cashierId = req.user.id;
    await order.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer's Personal Order History
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 20
    });

    const serialized = orders.map(o => ({
      id: o.id,
      user_id: o.userId,
      table_number: o.table_number,
      items: o.items,
      total_price: parseFloat(o.total_price),
      points_earned: o.points_earned,
      status: o.status,
      notes: o.notes,
      created_at: o.createdAt.toISOString(),
      updated_at: o.updatedAt.toISOString(),
      isQrConfirmed: o.isQrConfirmed
    }));

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
