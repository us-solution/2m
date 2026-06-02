const express = require('express');
const router = express.Router();
const Ingredient = require('../models/Ingredient');
const InventoryTransaction = require('../models/InventoryTransaction');
const InventoryCount = require('../models/InventoryCount');
const StockAlert = require('../models/StockAlert');
const { authenticateToken, requireRole } = require('../middlewares/auth');

// ── Ingredients ──
router.get('/ingredients', authenticateToken, async (req, res) => {
  try {
    const filter = {};
    if (req.query.active === 'true') filter.isActive = true;
    const items = await Ingredient.find(filter).sort({ name: 1 });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/ingredients/:id', authenticateToken, async (req, res) => {
  try {
    const item = await Ingredient.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'غير موجود' });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ingredients', requireRole('admin'), async (req, res) => {
  try {
    const { name, name_ar, category, unit, unitCost, currentStock, minStock } = req.body;
    const ingredient = await Ingredient.create({ name, name_ar, category, unit, unitCost: unitCost || 0, currentStock: currentStock || 0, minStock: minStock || 0, costLastUpdated: unitCost ? new Date() : undefined });
    res.status(201).json(ingredient);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/ingredients/:id', requireRole('admin'), async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.unitCost !== undefined) updates.costLastUpdated = new Date();
    const item = await Ingredient.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!item) return res.status(404).json({ error: 'غير موجود' });
    res.json(item);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/ingredients/:id', requireRole('admin'), async (req, res) => {
  try {
    await Ingredient.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Inventory Transactions ──
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    const filter = {};
    if (req.query.ingredientId) filter.ingredientId = req.query.ingredientId;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.start || req.query.end) {
      filter.createdAt = {};
      if (req.query.start) filter.createdAt.$gte = new Date(req.query.start);
      if (req.query.end) filter.createdAt.$lte = new Date(req.query.end);
    }
    const items = await InventoryTransaction.find(filter).populate('ingredientId', 'name name_ar unit').populate('performedBy', 'username').sort({ createdAt: -1 }).limit(200);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function applyTransaction(type, ingredientId, qty, unitCost, note, performedBy, relatedOrderId) {
  const ingredient = await Ingredient.findById(ingredientId);
  if (!ingredient) throw new Error('الخامة غير موجودة');
  const cost = unitCost || ingredient.unitCost;
  const totalCost = Math.abs(qty) * cost;
  const tx = await InventoryTransaction.create({ ingredientId, type, quantity: qty, unitCost: cost, totalCost, note, performedBy, relatedOrderId });
  if (type === 'purchase' || type === 'return') {
    ingredient.currentStock += Math.abs(qty);
  } else if (type === 'consumption' || type === 'waste') {
    ingredient.currentStock -= Math.abs(qty);
  } else if (type === 'adjustment') {
    ingredient.currentStock = qty;
  }
  if (type === 'purchase' && unitCost) ingredient.unitCost = unitCost;
  await ingredient.save();
  await checkLowStock(ingredient);
  return tx;
}

async function checkLowStock(ingredient) {
  if (ingredient.minStock <= 0) return;
  if (ingredient.currentStock <= ingredient.minStock) {
    const exists = await StockAlert.findOne({ ingredientId: ingredient._id, type: 'low_stock', resolved: false });
    if (!exists) {
      await StockAlert.create({
        ingredientId: ingredient._id,
        type: 'low_stock',
        message: `نقص في خامة ${ingredient.name_ar || ingredient.name}: المخزون ${ingredient.currentStock} ${ingredient.unit} (الحد الأدنى ${ingredient.minStock})`,
        currentStock: ingredient.currentStock,
        minStock: ingredient.minStock,
        severity: ingredient.currentStock <= ingredient.minStock * 0.5 ? 'critical' : 'warning'
      });
    }
  }
}

router.post('/transactions', requireRole('admin'), async (req, res) => {
  try {
    const { type, ingredientId, quantity, unitCost, note } = req.body;
    if (!type || !ingredientId || quantity === undefined) return res.status(400).json({ error: 'نوع وكمية والخامة مطلوبة' });
    const tx = await applyTransaction(type, ingredientId, quantity, unitCost, note, req.user?.id);
    res.status(201).json(tx);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Physical Inventory Count ──
router.get('/counts', authenticateToken, async (req, res) => {
  try {
    const items = await InventoryCount.find().populate('items.ingredientId', 'name name_ar unit').populate('performedBy', 'username').sort({ createdAt: -1 }).limit(50);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/counts', requireRole('admin'), async (req, res) => {
  try {
    const { items, note } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'المقاييس مطلوبة' });
    const countItems = [];
    let totalDiffCost = 0;
    for (const it of items) {
      const ingredient = await Ingredient.findById(it.ingredientId);
      if (!ingredient) continue;
      const diff = it.actualQty - it.expectedQty;
      const diffCost = diff * ingredient.unitCost;
      countItems.push({ ingredientId: it.ingredientId, expectedQty: it.expectedQty, actualQty: it.actualQty, diff, diffCost });
      totalDiffCost += diffCost;
      if (Math.abs(diff) > 0.001) {
        await applyTransaction('adjustment', it.ingredientId, it.actualQty, ingredient.unitCost, `جرد فعلي: توقع ${it.expectedQty}، فعلي ${it.actualQty}`, req.user?.id);
      }
      if (Math.abs(diff) > ingredient.minStock * 0.5 && ingredient.minStock > 0) {
        await StockAlert.create({
          ingredientId: it.ingredientId,
          type: 'over_consumption',
          message: `فروق جرد كبيرة في ${ingredient.name_ar || ingredient.name}: فرق ${diff > 0 ? 'زيادة' : 'عجز'} ${Math.abs(diff)} ${ingredient.unit}`,
          currentStock: it.actualQty,
          minStock: ingredient.minStock,
          severity: 'warning'
        });
      }
    }
    const countDoc = await InventoryCount.create({ items: countItems, note, totalDiffCost, performedBy: req.user?.id });
    await countDoc.populate('items.ingredientId', 'name name_ar unit');
    res.status(201).json(countDoc);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/counts/:id', requireRole('admin'), async (req, res) => {
  try {
    await InventoryCount.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Stock Alerts ──
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const filter = {};
    if (req.query.resolved === 'false') filter.resolved = false;
    const items = await StockAlert.find(filter).populate('ingredientId', 'name name_ar unit currentStock minStock').populate('resolvedBy', 'username').sort({ createdAt: -1 }).limit(100);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/alerts/:id/resolve', requireRole('admin'), async (req, res) => {
  try {
    const alert = await StockAlert.findByIdAndUpdate(req.params.id, { resolved: true, resolvedAt: new Date(), resolvedBy: req.user?.id }, { new: true });
    if (!alert) return res.status(404).json({ error: 'غير موجود' });
    res.json(alert);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Stock Status (dashboard) ──
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const totalIngredients = await Ingredient.countDocuments({ isActive: true });
    const lowStockCount = await Ingredient.countDocuments({ isActive: true, minStock: { $gt: 0 }, $expr: { $lte: ['$currentStock', '$minStock'] } });
    const outOfStock = await Ingredient.countDocuments({ isActive: true, currentStock: { $lte: 0 } });
    const totalStockValue = await Ingredient.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: { $multiply: ['$currentStock', '$unitCost'] } } } }
    ]);
    const pendingAlerts = await StockAlert.countDocuments({ resolved: false });
    res.json({ totalIngredients, lowStockCount, outOfStock, totalStockValue: totalStockValue[0]?.total || 0, pendingAlerts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;