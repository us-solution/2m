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
    pendingPartnerLogo: req.user.pendingPartnerLogo || '',
    pendingPartnerMainImage: req.user.pendingPartnerMainImage || '',
    pendingPartnerGallery: req.user.pendingPartnerGallery || [],
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
    if (partnerBio !== undefined) req.user.partnerBio = partnerBio;
    if (partnerBrief !== undefined) req.user.partnerBrief = partnerBrief.slice(0, 140);

    // معالجة اللوجو
    if (partnerLogo !== undefined) {
      if (partnerLogo === '') {
        req.user.partnerLogo = '';
        req.user.pendingPartnerLogo = '';
      } else if (partnerLogo.startsWith('data:image/')) {
        req.user.pendingPartnerLogo = partnerLogo;
      }
    }

    // معالجة الصورة الرئيسية
    if (partnerMainImage !== undefined) {
      if (partnerMainImage === '') {
        req.user.partnerMainImage = '';
        req.user.pendingPartnerMainImage = '';
      } else if (partnerMainImage.startsWith('data:image/')) {
        req.user.pendingPartnerMainImage = partnerMainImage;
      }
    }

    // معالجة معرض الصور
    if (partnerGallery !== undefined) {
      const newPending = partnerGallery.filter(img => img.startsWith('data:image/'));
      const existingApproved = partnerGallery.filter(img => !img.startsWith('data:image/'));
      
      // الإبقاء فقط على الصور المعتمدة مسبقاً والتي لم يتم حذفها
      req.user.partnerGallery = req.user.partnerGallery.filter(img => existingApproved.includes(img));
      
      // إضافة الصور الجديدة للمراجعة
      req.user.pendingPartnerGallery = [...(req.user.pendingPartnerGallery || []), ...newPending];
    }

    await req.user.save();
    res.json({
      success: true,
      partnerLogo: req.user.partnerLogo,
      partnerBio: req.user.partnerBio,
      partnerMainImage: req.user.partnerMainImage,
      partnerBrief: req.user.partnerBrief,
      partnerGallery: req.user.partnerGallery,
      pendingPartnerLogo: req.user.pendingPartnerLogo,
      pendingPartnerMainImage: req.user.pendingPartnerMainImage,
      pendingPartnerGallery: req.user.pendingPartnerGallery
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
