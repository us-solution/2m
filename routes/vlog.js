// ===== مسار ألبوم الصور والفلوج (Vlog & Album) - رفع الصور، الإعجابات، المسابقات، ولوحة الإدارة =====
const express = require('express');
const router = express.Router();
const VlogPost = require('../models/VlogPost');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// 1. جلب الصور النشطة (ليست الفائزة بعد) مرتبة من الأحدث للأقدم
router.get('/', async (req, res) => {
  try {
    const posts = await VlogPost.find({ isWinner: false })
      .sort({ createdAt: -1 })
      .limit(50);
    
    // التحقق من هوية المستخدم الحالية لتحديد هل قام بالإعجاب بالصور أم لا
    let currentUserId = null;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const JWT_SECRET = process.env.JWT_SECRET || 'ozel_cafe_secret_2026';
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded.id;
      } catch (_) {}
    }

    const serialized = posts.map(p => {
      const hasLiked = currentUserId ? p.likes.some(id => String(id) === String(currentUserId)) : false;
      return {
        id: p._id,
        userName: p.userName,
        caption: p.caption,
        image: p.image,
        likesCount: p.likesCount,
        hasLiked,
        createdAt: p.createdAt
      };
    });

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. جلب المتصدرين الحاليين والفائزين السابقين بالمسابقة
router.get('/contest', async (req, res) => {
  try {
    // أكثر 5 صور حازت على إعجابات في المسابقة الحالية
    const leaders = await VlogPost.find({ isWinner: false })
      .sort({ likesCount: -1, createdAt: -1 })
      .limit(5);

    // آخر 10 صور فائزة
    const winners = await VlogPost.find({ isWinner: true })
      .sort({ updatedAt: -1 })
      .limit(10);

    res.json({
      leaders: leaders.map(l => ({
        id: l._id,
        userName: l.userName,
        caption: l.caption,
        image: l.image,
        likesCount: l.likesCount,
        createdAt: l.createdAt
      })),
      winners: winners.map(w => ({
        id: w._id,
        userName: w.userName,
        caption: w.caption,
        image: w.image,
        likesCount: w.likesCount,
        winnerPrize: w.winnerPrize,
        createdAt: w.createdAt,
        wonAt: w.updatedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب الصور الخاصة بالعميل الحالي
router.get('/my-photos', authenticateToken, async (req, res) => {
  try {
    const posts = await VlogPost.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب الصور التي نالت إعجاب العميل الحالي
router.get('/my-liked', authenticateToken, async (req, res) => {
  try {
    const posts = await VlogPost.find({ likes: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب الصور التي تمت إضافتها للمفضلة للعميل الحالي
router.get('/my-favorites', authenticateToken, async (req, res) => {
  try {
    const favIds = req.user.favorites || [];
    const posts = await VlogPost.find({ _id: { $in: favIds } }).sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. رفع صورة جديدة (يسمح بصورة واحدة فقط كل 24 ساعة لمنع التكرار المفرط)
router.post('/', authenticateToken, async (req, res) => {
  const { image, caption } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Image payload is required' });
  }

  try {
    // التحقق من حد التكرار اليومي للمستخدم
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const uploadedToday = await VlogPost.findOne({
      userId: req.user._id,
      createdAt: { $gte: startOfToday }
    });

    if (uploadedToday) {
      return res.status(429).json({ error: 'يمكنك مشاركة صورة واحدة فقط في اليوم! شاركنا بلقطة جديدة غداً.' });
    }

    const post = await VlogPost.create({
      userId: req.user._id,
      userName: req.user.name,
      caption: caption || '',
      image,
      likes: [],
      likesCount: 0,
      isWinner: false
    });

    res.json({ success: true, id: post._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. تسجيل الإعجاب بصورة أو إلغاؤه
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const post = await VlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const userIndex = post.likes.indexOf(req.user._id);
    let hasLiked = false;

    if (userIndex > -1) {
      // العميل ألغى إعجابه
      post.likes.splice(userIndex, 1);
    } else {
      // العميل أضاف إعجاباً جديداً
      post.likes.push(req.user._id);
      hasLiked = true;
    }

    post.likesCount = post.likes.length;
    await post.save();

    res.json({
      success: true,
      likesCount: post.likesCount,
      hasLiked
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. اختيار الصورة كفائزة بالمسابقة (للأدمن فقط)
router.patch('/:id/winner', authenticateToken, requireRole('admin'), async (req, res) => {
  const { prize } = req.body;
  try {
    const post = await VlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    if (post.isWinner) {
      return res.status(400).json({ error: 'هذه الصورة فازت بالفعل بالمسابقة!' });
    }

    post.isWinner = true;
    post.winnerPrize = prize || 'أوردر مجاني هدية 🎁';
    await post.save();

    // منح العميل أوردر هدية في رصيده
    const user = await User.findById(post.userId);
    if (user) {
      user.freeOrdersCount = (user.freeOrdersCount || 0) + 1;
      await user.save();
    }

    res.json({ success: true, user: user ? user.name : 'Unknown' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. جلب جميع الصور لإدارتها (للأدمن فقط)
router.get('/admin-all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const posts = await VlogPost.find()
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. حذف صورة (للأدمن أو صاحب الصورة)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const post = await VlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // السماح بالحذف إذا كان المستخدم أدمن أو كان هو صاحب المنشور نفسه
    const isOwner = String(post.userId) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own photos' });
    }

    await post.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
