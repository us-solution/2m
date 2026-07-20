// ===== مسار العميل الشخصي - عرض طلبات العميل السابقة ونقاط الولاء =====
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const PointsLog = require('../models/PointsLog');
const { authenticateToken } = require('../middlewares/auth');

// جلب الملف الشخصي للعميل الحالي
router.get('/', authenticateToken, async (req, res) => {
  res.json({
    id: req.user._id,
    name: req.user.name,
    phone: req.user.phone && req.user.phone.startsWith('email_') ? '' : (req.user.phone || ''),
    email: req.user.email,
    role: req.user.role,
    points: req.user.points,
    total_spent: parseFloat(req.user.total_spent),
    subscriptionTier: req.user.subscriptionTier,
    customerStatus: req.user.customerStatus || 'standard',
    freeOrdersCount: req.user.freeOrdersCount || 0,
    isPartner: req.user.isPartner || false,
    partnerLogo: req.user.partnerLogo || '',
    partnerBio: req.user.partnerBio || '',
    partnerMainImage: req.user.partnerMainImage || '',
    partnerBrief: req.user.partnerBrief || '',
    partnerGallery: req.user.partnerGallery || [],
    favorites: req.user.favorites || []
  });
});

// تحديث الملف الشخصي للشريك (اللوجو والصورة الرئيسية والبريف والنبذة والمعرض)
router.put('/partner-profile', authenticateToken, async (req, res) => {
  try {
    const { partnerLogo, partnerBio, partnerMainImage, partnerBrief, partnerGallery } = req.body;
    if (!req.user.isPartner && req.user.role !== 'partner') {
      return res.status(403).json({ error: 'Only partners can update partner profile' });
    }
    if (partnerLogo !== undefined) req.user.partnerLogo = partnerLogo;
    if (partnerBio !== undefined) req.user.partnerBio = partnerBio;
    if (partnerMainImage !== undefined) req.user.partnerMainImage = partnerMainImage;
    if (partnerBrief !== undefined) req.user.partnerBrief = partnerBrief.slice(0, 140);
    if (partnerGallery !== undefined) req.user.partnerGallery = partnerGallery;

    await req.user.save();
    res.json({
      success: true,
      partnerLogo: req.user.partnerLogo,
      partnerBio: req.user.partnerBio,
      partnerMainImage: req.user.partnerMainImage,
      partnerBrief: req.user.partnerBrief,
      partnerGallery: req.user.partnerGallery
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة صورة للمفضلة
router.post('/favorites/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    if (!req.user.favorites) req.user.favorites = [];
    if (!req.user.favorites.includes(postId)) {
      req.user.favorites.push(postId);
      await req.user.save();
    }
    res.json({ success: true, favorites: req.user.favorites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إزالة صورة من المفضلة
router.delete('/favorites/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    if (req.user.favorites) {
      req.user.favorites = req.user.favorites.filter(id => String(id) !== String(postId));
      await req.user.save();
    }
    res.json({ success: true, favorites: req.user.favorites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب تاريخ طلبات العميل المسجل (آخر 20 طلب)
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    const serialized = orders.map(o => ({
      id: o._id,
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

// جلب نقاط الولاء وسجل النقاط للعميل
router.get('/points', authenticateToken, async (req, res) => {
  try {
    const logs = await PointsLog.find({ userId: req.user._id }).sort({ created_at: -1 });

    res.json({
      points: req.user.points,
      total_spent: parseFloat(req.user.total_spent),
      log: logs.map(l => ({
        id: l._id,
        user_id: l.userId,
        points: l.points,
        reason: l.reason,
        order_id: l.orderId,
        created_at: l.created_at.toISOString()
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
