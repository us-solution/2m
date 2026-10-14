// ===== محرك التقارير وتوليد ملفات PDF الرسمي لنظام 2M CAFE =====
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const Order = require('../models/Order');
const Shift = require('../models/Shift');
const User = require('../models/User');
const Drink = require('../models/Drink');
const Category = require('../models/Category');
const Expense = require('../models/Expense');
const CashMovement = require('../models/CashMovement');
const Ingredient = require('../models/Ingredient');
const InventoryTransaction = require('../models/InventoryTransaction');
const Recipe = require('../models/Recipe');
const RecipeItem = require('../models/RecipeItem');

const FINALIZED_STATUSES = ['paid', 'completed'];

// ─── دوال التنسيق المعتمدة لإجبار الأرقام الإنجليزية 0123456789 في ملفات الـ PDF ───

// تحويل أي أرقام هندية/مشرقية إلى أرقام إنجليزية نظامية (0123456789)
function toEnglishDigits(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[\u200e\u200f\u202a-\u202e]/g, ''); // إزالة محارف التوجيه المخفية
}

// تنسيق المبالغ المالية مع الحفاظ على الفواصل الإنجليزية وعلامة العملة العربية
function formatCurrency(val) {
  const num = Number(val) || 0;
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${formatted} ج.م`;
}

// تنسيق الأعداد الصحيحة والكميات بأرقام إنجليزية
function formatNumber(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('en-US');
}

// تنسيق التاريخ والوقت بتوقيت القاهرة بأرقام إنجليزية YYYY/MM/DD HH:mm
function formatDateTime(dateVal) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(d);
    const p = {};
    parts.forEach(part => { p[part.type] = part.value; });
    return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}`;
  } catch (_) {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

// تنسيق التاريخ فقط YYYY/MM/DD
function formatDate(dateVal) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);
    const p = {};
    parts.forEach(part => { p[part.type] = part.value; });
    return `${p.year}/${p.month}/${p.day}`;
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

// دالة مساعدة لحساب نطاق التاريخ بدقة متوافقة مع توقيت القاهرة
function parseReportPeriod(period, start, end) {
  const now = new Date();

  // الحصول على تواريخ القاهرة الحالية
  let cairoParts;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(now);
    const p = {};
    parts.forEach(part => { p[part.type] = part.value; });
    cairoParts = { year: parseInt(p.year, 10), month: parseInt(p.month, 10) - 1, day: parseInt(p.day, 10) };
  } catch (_) {
    cairoParts = { year: now.getUTCFullYear(), month: now.getUTCMonth(), day: now.getUTCDate() };
  }

  // حساب فارق توقيت القاهرة الفعلي (+02:00 أو +03:00)
  const probe = new Date(Date.UTC(cairoParts.year, cairoParts.month, cairoParts.day, 12, 0, 0));
  const cairoHour = parseInt(probe.toLocaleTimeString('en-US', { timeZone: 'Africa/Cairo', hour12: false, hour: 'numeric' }), 10);
  const offsetHours = cairoHour - 12; // 2 أو 3
  const offsetMs = offsetHours * 60 * 60 * 1000;

  const getCairoDayStart = (y, m, d) => new Date(Date.UTC(y, m, d, 0, 0, 0) - offsetMs);
  const getCairoDayEnd = (y, m, d) => new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - offsetMs);

  let startDate, endDate, periodLabel;

  if (start || end) {
    startDate = start ? new Date(start) : new Date(0);
    endDate = end ? new Date(end) : getCairoDayEnd(cairoParts.year, cairoParts.month, cairoParts.day);
    if (endDate.getHours() === 0 && endDate.getMinutes() === 0) endDate.setHours(23, 59, 59, 999);
    periodLabel = `مخصص (${start || ''} إلى ${end || ''})`;
  } else if (period === 'yesterday') {
    startDate = getCairoDayStart(cairoParts.year, cairoParts.month, cairoParts.day - 1);
    endDate = getCairoDayEnd(cairoParts.year, cairoParts.month, cairoParts.day - 1);
    periodLabel = 'أمس';
  } else if (period === 'week') {
    startDate = getCairoDayStart(cairoParts.year, cairoParts.month, cairoParts.day - 6);
    endDate = getCairoDayEnd(cairoParts.year, cairoParts.month, cairoParts.day);
    periodLabel = 'آخر 7 أيام';
  } else if (period === 'last_week') {
    startDate = getCairoDayStart(cairoParts.year, cairoParts.month, cairoParts.day - 13);
    endDate = getCairoDayEnd(cairoParts.year, cairoParts.month, cairoParts.day - 7);
    periodLabel = 'الأسبوع الماضي';
  } else if (period === 'month') {
    startDate = getCairoDayStart(cairoParts.year, cairoParts.month, 1);
    endDate = getCairoDayEnd(cairoParts.year, cairoParts.month, cairoParts.day);
    periodLabel = 'هذا الشهر';
  } else if (period === 'last_month') {
    startDate = getCairoDayStart(cairoParts.year, cairoParts.month - 1, 1);
    const lastDayOfPrevMonth = new Date(Date.UTC(cairoParts.year, cairoParts.month, 0)).getUTCDate();
    endDate = getCairoDayEnd(cairoParts.year, cairoParts.month - 1, lastDayOfPrevMonth);
    periodLabel = 'الشهر الماضي';
  } else if (period === 'all') {
    startDate = new Date(0);
    endDate = getCairoDayEnd(cairoParts.year, cairoParts.month, cairoParts.day);
    periodLabel = 'جميع الفترات';
  } else {
    // الافتراضي: اليوم
    startDate = getCairoDayStart(cairoParts.year, cairoParts.month, cairoParts.day);
    endDate = getCairoDayEnd(cairoParts.year, cairoParts.month, cairoParts.day);
    periodLabel = 'اليوم';
  }

  return { startDate, endDate, label: periodLabel, periodLabel };
}

// 1. تجميع بيانات التقرير المطلوب برمجياً من قاعدة البيانات
async function getReportData(reportType, queryParams = {}) {
  const { period, start, end, startDate: qStartDate, endDate: qEndDate, cashierId, shiftId, categoryId } = queryParams;
  const sDate = start || qStartDate;
  const eDate = end || qEndDate;
  const { startDate, endDate, periodLabel } = parseReportPeriod(period, sDate, eDate);

  const cleanType = String(reportType || 'sales').toLowerCase().trim();

  switch (cleanType) {
    case 'sales': {
      // 1. تقرير المبيعات
      const match = {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: FINALIZED_STATUSES }
      };
      if (shiftId) match.posShiftId = Number(shiftId);

      const orders = await Order.find(match).sort({ createdAt: -1 }).populate('userId', 'name phone').lean();
      const totalSales = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
      let cashSales = 0, cardSales = 0, walletSales = 0;
      orders.forEach(o => {
        const pm = (o.paymentMethod || 'cash').toLowerCase();
        const val = Number(o.total_price) || 0;
        if (pm === 'card' || pm === 'visa') cardSales += val;
        else if (pm === 'wallet') walletSales += val;
        else cashSales += val;
      });

      return {
        type: 'sales',
        title: 'تقرير المبيعات والعمليات النهائية (Sales Report)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: periodLabel },
        kpis: [
          { label: 'إجمالي المبيعات', value: formatCurrency(totalSales) },
          { label: 'عدد الفواتير', value: formatNumber(orders.length) },
          { label: 'مبيعات نقدية (كاش)', value: formatCurrency(cashSales) },
          { label: 'مبيعات إلكترونية (فيزا)', value: formatCurrency(cardSales) },
          { label: 'متوسط الفاتورة', value: formatCurrency(orders.length ? (totalSales / orders.length) : 0) }
        ],
        columns: [
          { key: 'index', label: '#', width: 25, align: 'center' },
          { key: 'invoiceNumber', label: 'رقم الفاتورة', width: 85, align: 'left' },
          { key: 'createdAt', label: 'التاريخ والوقت', width: 110, align: 'center' },
          { key: 'customerName', label: 'اسم العميل', width: 120, align: 'right' },
          { key: 'paymentMethod', label: 'الدفع', width: 65, align: 'center' },
          { key: 'total', label: 'المبلغ الإجمالي', width: 85, align: 'left' }
        ],
        rows: orders.map((o, idx) => ({
          index: idx + 1,
          invoiceNumber: toEnglishDigits(o.syncMeta?.lastEventId || o.externalOrderId || String(o._id).slice(-6)),
          createdAt: formatDateTime(o.createdAt),
          customerName: o.userId?.name || o.customerPhone || 'محلي/سفري',
          paymentMethod: o.paymentMethod === 'card' ? 'فيزا/بطاقة' : (o.paymentMethod === 'wallet' ? 'محفظة' : 'نقدي'),
          total: formatCurrency(o.total_price)
        }))
      };
    }

    case 'menu_products': {
      // 2. قائمة المشروبات والمنتجات
      const filter = {};
      if (categoryId) filter.category_id = categoryId;
      const drinks = await Drink.find(filter).populate('category_id', 'name name_ar').sort({ name: 1 }).lean();
      const avgPrice = drinks.length ? drinks.reduce((s, d) => s + (Number(d.price) || 0), 0) / drinks.length : 0;

      return {
        type: 'menu_products',
        title: 'قائمة المنتجات والتصنيفات (Menu & Products)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: 'الحالة الحالية للمنيو' },
        kpis: [
          { label: 'إجمالي الأصناف', value: formatNumber(drinks.length) },
          { label: 'الأصناف المتاحة', value: formatNumber(drinks.filter(d => d.is_available).length) },
          { label: 'الأصناف غير المتاحة', value: formatNumber(drinks.filter(d => !d.is_available).length) },
          { label: 'متوسط السعر', value: formatCurrency(avgPrice) }
        ],
        columns: [
          { key: 'index', label: '#', width: 25, align: 'center' },
          { key: 'nameAr', label: 'اسم الصنف (بالعربية)', width: 145, align: 'right' },
          { key: 'nameEn', label: 'الاسم (English)', width: 135, align: 'left' },
          { key: 'category', label: 'التصنيف', width: 90, align: 'center' },
          { key: 'price', label: 'سعر البيع', width: 70, align: 'left' },
          { key: 'status', label: 'الحالة', width: 60, align: 'center' }
        ],
        rows: drinks.map((d, idx) => ({
          index: idx + 1,
          nameAr: d.name_ar || d.name,
          nameEn: d.name || '—',
          category: d.category_id ? (d.category_id.name_ar || d.category_id.name) : 'عام',
          price: formatCurrency(d.price),
          status: d.is_available ? 'متاح' : 'غير متوفر'
        }))
      };
    }

    case 'income_revenue': {
      // 3. تقرير الدخل والإيرادات
      const match = {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: FINALIZED_STATUSES }
      };
      const orders = await Order.find(match).lean();
      const totalIncome = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);

      // تجميع حسب الأيام
      const byDay = {};
      orders.forEach(o => {
        const dayStr = o.createdAt ? formatDate(o.createdAt) : 'غير محدد';
        if (!byDay[dayStr]) byDay[dayStr] = { date: dayStr, count: 0, cash: 0, card: 0, wallet: 0, total: 0 };
        const val = Number(o.total_price) || 0;
        const pm = (o.paymentMethod || 'cash').toLowerCase();
        byDay[dayStr].count += 1;
        byDay[dayStr].total += val;
        if (pm === 'card' || pm === 'visa') byDay[dayStr].card += val;
        else if (pm === 'wallet') byDay[dayStr].wallet += val;
        else byDay[dayStr].cash += val;
      });

      const dayRows = Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date));

      return {
        type: 'income_revenue',
        title: 'تقرير الدخل والإيرادات اليومية (Income & Revenue)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: periodLabel },
        kpis: [
          { label: 'إجمالي الدخل المحقق', value: formatCurrency(totalIncome) },
          { label: 'عدد أيام المبيعات', value: formatNumber(dayRows.length) },
          { label: 'متوسط الدخل اليومي', value: formatCurrency(dayRows.length ? (totalIncome / dayRows.length) : 0) }
        ],
        columns: [
          { key: 'date', label: 'التاريخ', width: 95, align: 'center' },
          { key: 'count', label: 'عدد الفواتير', width: 75, align: 'center' },
          { key: 'cash', label: 'إيراد نقدي (كاش)', width: 100, align: 'left' },
          { key: 'card', label: 'إيراد إلكتروني (فيزا)', width: 100, align: 'left' },
          { key: 'wallet', label: 'محافظ ذكية', width: 80, align: 'left' },
          { key: 'total', label: 'إجمالي الدخل', width: 90, align: 'left' }
        ],
        rows: dayRows.map(r => ({
          date: r.date,
          count: formatNumber(r.count),
          cash: formatCurrency(r.cash),
          card: formatCurrency(r.card),
          wallet: formatCurrency(r.wallet),
          total: formatCurrency(r.total)
        }))
      };
    }

    case 'profit_loss': {
      // 4. تقرير الأرباح والخسائر
      const [orders, expenses] = await Promise.all([
        Order.find({ createdAt: { $gte: startDate, $lte: endDate }, status: { $in: FINALIZED_STATUSES } }).lean(),
        Expense.find({ expenseDate: { $gte: startDate, $lte: endDate } }).lean()
      ]);

      const totalRevenue = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
      const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const estimatedCogs = Math.round(totalRevenue * 0.35 * 100) / 100;
      const grossProfit = totalRevenue - estimatedCogs;
      const netOperatingProfit = grossProfit - totalExpenses;
      const profitMargin = totalRevenue > 0 ? ((netOperatingProfit / totalRevenue) * 100).toFixed(1) : '0.0';

      return {
        type: 'profit_loss',
        title: 'قائمة الأرباح والخسائر التشغيلية (Profit & Loss Statement)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: periodLabel },
        kpis: [
          { label: 'إجمالي الإيرادات (المبيعات)', value: formatCurrency(totalRevenue) },
          { label: 'المصروفات التشغيلية', value: formatCurrency(totalExpenses) },
          { label: 'تكلفة الخامات التقديرية', value: formatCurrency(estimatedCogs) },
          { label: 'صافي الأرباح التشغيلية', value: formatCurrency(netOperatingProfit) },
          { label: 'هامش الربح التشغيلي', value: `${profitMargin}%` }
        ],
        columns: [
          { key: 'item', label: 'البند / البيان المالي', width: 220, align: 'right' },
          { key: 'category', label: 'التصنيف', width: 120, align: 'center' },
          { key: 'amount', label: 'القيمة المالية (ج.م)', width: 140, align: 'left' }
        ],
        rows: [
          { item: 'إجمالي مبيعات المشروبات والطلبات المكتملة', category: 'إيراد تشغيلي (+)', amount: formatCurrency(totalRevenue) },
          { item: 'تكلفة الخامات والمشروبات المباعة (COGS)', category: 'تكلفة مباشرة (-)', amount: formatCurrency(estimatedCogs) },
          { item: 'مجمل الربح التجاري (Gross Profit)', category: 'ربح إجمالي', amount: formatCurrency(grossProfit) },
          { item: 'المصروفات العامة والإدارية والتشغيلية', category: 'مصروفات تشغيل (-)', amount: formatCurrency(totalExpenses) },
          { item: 'صافي الربح التشغيلي النهائي (Net Operating Profit)', category: 'صافي الربح (=)', amount: formatCurrency(netOperatingProfit) }
        ]
      };
    }

    case 'inventory':
    case 'inventory_stock': {
      // 5. تقرير المخزون وأرصدة الخامات
      const ingredients = await Ingredient.find().sort({ name: 1 }).lean();
      const totalInventoryVal = ingredients.reduce((s, i) => s + ((Number(i.currentStock) || 0) * (Number(i.unitCost) || 0)), 0);
      const lowStockCount = ingredients.filter(i => (Number(i.currentStock) || 0) <= (Number(i.minStock) || 0)).length;

      return {
        type: 'inventory_stock',
        title: 'تقرير المخزون وأرصدة الخامات (Inventory & Stock)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: 'الرصيد الفعلي للمخزن' },
        kpis: [
          { label: 'إجمالي أصناف الخامات', value: formatNumber(ingredients.length) },
          { label: 'القيمة المالية للمخزون', value: formatCurrency(totalInventoryVal) },
          { label: 'أصناف بلغت حد الطلب', value: formatNumber(lowStockCount) }
        ],
        columns: [
          { key: 'index', label: '#', width: 25, align: 'center' },
          { key: 'name', label: 'اسم الخامة / الصنف', width: 150, align: 'right' },
          { key: 'unit', label: 'الوحدة', width: 60, align: 'center' },
          { key: 'stock', label: 'الرصيد الحالي', width: 85, align: 'center' },
          { key: 'minStock', label: 'حد الأمان', width: 70, align: 'center' },
          { key: 'cost', label: 'تكلفة الوحدة', width: 75, align: 'left' },
          { key: 'totalVal', label: 'القيمة الإجمالية', width: 85, align: 'left' }
        ],
        rows: ingredients.map((i, idx) => {
          const cur = Number(i.currentStock) || 0;
          const cost = Number(i.unitCost) || 0;
          return {
            index: idx + 1,
            name: i.name_ar || i.name,
            unit: i.unit || 'وحدة',
            stock: `${formatNumber(cur)} ${i.unit || ''}`.trim(),
            minStock: formatNumber(i.minStock || 0),
            cost: formatCurrency(cost),
            totalVal: formatCurrency(cur * cost)
          };
        })
      };
    }

    case 'warehouses': {
      // 6. تقرير المستودعات
      const ingredients = await Ingredient.find().lean();
      const totalInventoryVal = ingredients.reduce((s, i) => s + ((Number(i.currentStock) || 0) * (Number(i.unitCost) || 0)), 0);

      const warehousesList = [
        { name: 'البار الرئيسي (Main Bar)', code: 'BAR-01', location: 'صالة المقهى', itemsCount: ingredients.length, val: totalInventoryVal * 0.45, status: 'نشط ويعمل' },
        { name: 'المخزن المركزي للخامات (Central Storage)', code: 'STR-01', location: 'مستودع الإمداد الخلفي', itemsCount: ingredients.length, val: totalInventoryVal * 0.55, status: 'نشط ويعمل' }
      ];

      return {
        type: 'warehouses',
        title: 'تقرير المستودعات ونقاط التوزيع (Warehouses Report)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: 'حالة المستودعات التشغيلية' },
        kpis: [
          { label: 'عدد المستودعات المسجلة', value: formatNumber(warehousesList.length) },
          { label: 'إجمالي قيمة البضاعة بالمستودعات', value: formatCurrency(totalInventoryVal) }
        ],
        columns: [
          { key: 'name', label: 'اسم المستودع', width: 160, align: 'right' },
          { key: 'code', label: 'الكود', width: 70, align: 'center' },
          { key: 'location', label: 'الموقع', width: 110, align: 'center' },
          { key: 'items', label: 'عدد الأصناف', width: 75, align: 'center' },
          { key: 'val', label: 'القيمة التقديرية', width: 90, align: 'left' },
          { key: 'status', label: 'الحالة', width: 70, align: 'center' }
        ],
        rows: warehousesList.map(w => ({
          name: w.name,
          code: w.code,
          location: w.location,
          items: formatNumber(w.itemsCount),
          val: formatCurrency(w.val),
          status: w.status
        }))
      };
    }

    case 'product_movements': {
      // 7. تقرير حركة الخامات والمنتجات
      const transactions = await InventoryTransaction.find({
        createdAt: { $gte: startDate, $lte: endDate }
      }).populate('ingredientId', 'name name_ar unit').sort({ createdAt: -1 }).limit(100).lean();

      return {
        type: 'product_movements',
        title: 'تقرير حركة الخامات وسجل العمليات (Stock Movements)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: periodLabel },
        kpis: [
          { label: 'إجمالي الحركات المسجلة', value: formatNumber(transactions.length) }
        ],
        columns: [
          { key: 'date', label: 'التاريخ', width: 95, align: 'center' },
          { key: 'ingredient', label: 'الخامة / المنتج', width: 140, align: 'right' },
          { key: 'type', label: 'نوع الحركة', width: 85, align: 'center' },
          { key: 'quantity', label: 'الكمية', width: 75, align: 'center' },
          { key: 'cost', label: 'التكلفة', width: 85, align: 'left' }
        ],
        rows: transactions.map(t => ({
          date: formatDateTime(t.createdAt),
          ingredient: t.ingredientId ? (t.ingredientId.name_ar || t.ingredientId.name) : 'صنف عام',
          type: t.type === 'consumption' ? 'استهلاك بيع' : (t.type === 'purchase' ? 'شراء وتوريد' : (t.type === 'waste' ? 'هدر وتالف' : 'تسوية')),
          quantity: `${formatNumber(t.quantity)} ${t.ingredientId?.unit || ''}`.trim(),
          cost: formatCurrency(t.totalCost)
        }))
      };
    }

    case 'costs': {
      // 8. تقرير التكاليف والوصفات
      const recipes = await Recipe.find({ isActive: true }).populate('drinkId', 'name name_ar price').lean();
      const recipeItems = await RecipeItem.find({ recipeId: { $in: recipes.map(r => r._id) } }).populate('ingredientId', 'unitCost').lean();

      const costMap = {};
      recipeItems.forEach(ri => {
        if (!costMap[ri.recipeId]) costMap[ri.recipeId] = 0;
        if (ri.ingredientId) costMap[ri.recipeId] += (Number(ri.quantity) || 0) * (Number(ri.ingredientId.unitCost) || 0);
      });

      const costRows = recipes.map(r => {
        const cost = costMap[r._id] || 0;
        const sellPrice = r.drinkId ? (Number(r.drinkId.price) || 0) : 0;
        const profit = sellPrice - cost;
        const margin = sellPrice > 0 ? ((profit / sellPrice) * 100).toFixed(1) : '0.0';
        return {
          name: r.drinkId ? (r.drinkId.name_ar || r.drinkId.name) : r.name,
          sellPrice,
          cost,
          profit,
          margin
        };
      });

      return {
        type: 'costs',
        title: 'تحليل تكلفة المشروبات والوصفات (Drink Costing & Margin)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: 'تكاليف الإنتاج القياسية' },
        kpis: [
          { label: 'عدد الوصفات المحسوبة', value: formatNumber(costRows.length) }
        ],
        columns: [
          { key: 'name', label: 'المشروب / الصنف', width: 170, align: 'right' },
          { key: 'sellPrice', label: 'سعر البيع', width: 85, align: 'left' },
          { key: 'cost', label: 'تكلفة الخامات', width: 85, align: 'left' },
          { key: 'profit', label: 'هامش الربح', width: 85, align: 'left' },
          { key: 'margin', label: 'الربحية %', width: 70, align: 'center' }
        ],
        rows: costRows.map(r => ({
          name: r.name,
          sellPrice: formatCurrency(r.sellPrice),
          cost: formatCurrency(r.cost),
          profit: formatCurrency(r.profit),
          margin: `${r.margin}%`
        }))
      };
    }

    case 'expenses': {
      // 9. تقرير المصروفات
      const expenses = await Expense.find({
        expenseDate: { $gte: startDate, $lte: endDate }
      }).sort({ expenseDate: -1 }).lean();

      const totalExp = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

      return {
        type: 'expenses',
        title: 'تقرير المصروفات التشغيلية والنثرية (Operating Expenses)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: periodLabel },
        kpis: [
          { label: 'إجمالي المصروفات', value: formatCurrency(totalExp) },
          { label: 'عدد إيصالات الصرف', value: formatNumber(expenses.length) }
        ],
        columns: [
          { key: 'index', label: '#', width: 25, align: 'center' },
          { key: 'title', label: 'بيان المصروف', width: 170, align: 'right' },
          { key: 'category', label: 'التصنيف', width: 95, align: 'center' },
          { key: 'date', label: 'تاريخ الصرف', width: 95, align: 'center' },
          { key: 'amount', label: 'المبلغ', width: 90, align: 'left' }
        ],
        rows: expenses.map((e, idx) => ({
          index: idx + 1,
          title: e.title || e.description || 'مصروف عام',
          category: e.category || 'عام',
          date: formatDate(e.expenseDate),
          amount: formatCurrency(e.amount)
        }))
      };
    }

    case 'cash_flow': {
      // 10. السيولة وحركات الخزينة
      const movements = await CashMovement.find({
        movementDate: { $gte: startDate, $lte: endDate }
      }).sort({ movementDate: -1 }).lean();

      const totalIn = movements.filter(m => m.movementType === 'in').reduce((s, m) => s + (Number(m.amount) || 0), 0);
      const totalOut = movements.filter(m => m.movementType === 'out').reduce((s, m) => s + (Number(m.amount) || 0), 0);

      return {
        type: 'cash_flow',
        title: 'تقرير السيولة النقدية وحركات الخزينة (Cash Flow & Vaults)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: periodLabel },
        kpis: [
          { label: 'إجمالي المقبوضات (Inflow)', value: formatCurrency(totalIn) },
          { label: 'إجمالي المدفوعات (Outflow)', value: formatCurrency(totalOut) },
          { label: 'صافي التدفق النقدي', value: formatCurrency(totalIn - totalOut) }
        ],
        columns: [
          { key: 'date', label: 'التاريخ', width: 95, align: 'center' },
          { key: 'type', label: 'نوع الحركة', width: 85, align: 'center' },
          { key: 'reason', label: 'البيان / السبب', width: 190, align: 'right' },
          { key: 'amount', label: 'المبلغ النقدي', width: 105, align: 'left' }
        ],
        rows: movements.map(m => ({
          date: formatDateTime(m.movementDate),
          type: m.movementType === 'in' ? 'إيداع نقدي (+)' : 'صرف نقدي (-)',
          reason: m.reason || m.category || 'حركة خزينة',
          amount: formatCurrency(m.amount)
        }))
      };
    }

    case 'shifts':
    case 'cashier_shifts': {
      // 11. الكاشير والورديات
      const shifts = await Shift.find({
        $or: [
          { closedAt: { $gte: startDate, $lte: endDate } },
          { openedAt: { $gte: startDate, $lte: endDate } },
          { status: 'open' }
        ]
      }).sort({ openedAt: -1 }).lean();

      const totalShiftRev = shifts.reduce((s, sh) => s + (Number(sh.totalRevenue) || 0), 0);

      return {
        type: 'cashier_shifts',
        title: 'تقرير ورديات الكاشير وإغلاق الدرج (Cashier & Shifts)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: periodLabel },
        kpis: [
          { label: 'عدد الورديات المسجلة', value: formatNumber(shifts.length) },
          { label: 'إجمالي مبيعات الورديات', value: formatCurrency(totalShiftRev) }
        ],
        columns: [
          { key: 'id', label: 'رقم الوردية', width: 65, align: 'center' },
          { key: 'cashier', label: 'اسم الكاشير', width: 105, align: 'right' },
          { key: 'opened', label: 'وقت الفتح', width: 95, align: 'center' },
          { key: 'closed', label: 'وقت الإغلاق', width: 95, align: 'center' },
          { key: 'status', label: 'الحالة', width: 60, align: 'center' },
          { key: 'sales', label: 'المبيعات', width: 75, align: 'left' }
        ],
        rows: shifts.map(s => ({
          id: s.posShiftId ? `#${s.posShiftId}` : String(s._id).slice(-4),
          cashier: s.cashierName || 'كاشير السيستم',
          opened: formatDateTime(s.openedAt),
          closed: s.closedAt ? formatDateTime(s.closedAt) : 'نشطة حالياً',
          status: s.status === 'open' ? 'مفتوحة' : 'مغلقة',
          sales: formatCurrency(s.totalRevenue)
        }))
      };
    }

    case 'invoices':
    case 'invoices_orders':
    default: {
      // 12. الفواتير والطلبات الشامل
      const match = { createdAt: { $gte: startDate, $lte: endDate } };
      const orders = await Order.find(match).sort({ createdAt: -1 }).populate('userId', 'name phone').lean();

      const finalized = orders.filter(o => FINALIZED_STATUSES.includes(o.status));
      const pending = orders.filter(o => o.status === 'pending');
      const cancelled = orders.filter(o => ['cancelled', 'rejected'].includes(o.status));
      const totalAmount = finalized.reduce((s, o) => s + (Number(o.total_price) || 0), 0);

      return {
        type: 'invoices_orders',
        title: 'سجل الفواتير والطلبات الشامل (Invoices & Orders)',
        period: { from: startDate.toISOString(), to: endDate.toISOString(), label: periodLabel },
        kpis: [
          { label: 'إجمالي الفواتير', value: formatNumber(orders.length) },
          { label: 'الفواتير المكتملة', value: formatNumber(finalized.length) },
          { label: 'الفواتير المعلقة', value: formatNumber(pending.length) },
          { label: 'الفواتير الملغاة', value: formatNumber(cancelled.length) },
          { label: 'قيمة المبيعات المحققة', value: formatCurrency(totalAmount) }
        ],
        columns: [
          { key: 'index', label: '#', width: 25, align: 'center' },
          { key: 'invNo', label: 'رقم الفاتورة', width: 90, align: 'left' },
          { key: 'date', label: 'التاريخ', width: 100, align: 'center' },
          { key: 'customer', label: 'العميل', width: 110, align: 'right' },
          { key: 'status', label: 'الحالة', width: 65, align: 'center' },
          { key: 'payment', label: 'الدفع', width: 65, align: 'center' },
          { key: 'amount', label: 'المبلغ الإجمالي', width: 85, align: 'left' }
        ],
        rows: orders.map((o, idx) => ({
          index: idx + 1,
          invNo: toEnglishDigits(o.syncMeta?.lastEventId || o.externalOrderId || String(o._id).slice(-6)),
          date: formatDateTime(o.createdAt),
          customer: o.userId?.name || o.customerPhone || 'محلي/سفري',
          status: o.status === 'paid' || o.status === 'completed' ? 'مدفوعة' : (o.status === 'pending' ? 'معلقة' : 'ملغاة'),
          payment: o.paymentMethod === 'card' ? 'فيزا/بطاقة' : (o.paymentMethod === 'wallet' ? 'محفظة' : 'نقدي'),
          amount: formatCurrency(o.total_price)
        }))
      };
    }
  }
}

// 2. محرك توليد ملف PDF الموثق والمنسق بخط Tajawal وبدون أي صفحات فارغة مع فرض الأرقام الإنجليزية
function generateReportPdfStream(reportData) {
  const doc = new PDFDocument({ margin: 35, size: 'A4', bufferPages: true });

  // تسجيل خط Tajawal الرسمي المعتمد مع ضمان التوفر الكامل لجميع المحارف العربية
  const { getTajawalFonts } = require('./fontProvider');
  const tajawalFonts = getTajawalFonts();
  doc.registerFont('Tajawal', tajawalFonts.regular);
  doc.registerFont('Tajawal-Bold', tajawalFonts.bold);

  const fontRegular = 'Tajawal';
  const fontBold = 'Tajawal-Bold';

  // الرأس (Header)
  const logoPath = path.join(__dirname, '../frontend/imgs/2m-logo.png');
  if (fs.existsSync(logoPath)) {
    try { doc.image(logoPath, 490, 25, { width: 55 }); } catch (_) {}
  }

  doc.fontSize(20).font(fontBold).fillColor('#1a1a1a').text('2M CAFE — TWO MILLION CAFE', 35, 30);
  doc.fontSize(12).font(fontRegular).fillColor('#c29f43').text(toEnglishDigits(reportData.title), 35, 54);
  doc.fontSize(8.5).font(fontRegular).fillColor('#64748b').text(`الفترة: ${toEnglishDigits(reportData.period.label)} | تاريخ الاستخراج: ${formatDateTime(new Date())} بتوقيت القاهرة`, 35, 70);

  doc.moveTo(35, 86).lineTo(560, 86).strokeColor('#e2e8f0').lineWidth(1.5).stroke();

  // بطاقات المؤشرات (KPIs)
  let curY = 96;
  if (reportData.kpis && reportData.kpis.length > 0) {
    const kpiCount = Math.min(reportData.kpis.length, 5);
    const boxWidth = Math.floor((525 - ((kpiCount - 1) * 8)) / kpiCount);

    reportData.kpis.slice(0, 5).forEach((k, idx) => {
      const boxX = 35 + (idx * (boxWidth + 8));
      doc.rect(boxX, curY, boxWidth, 42).fillAndStroke('#f8fafc', '#cbd5e1');
      const labelText = toEnglishDigits(k.label);
      const valText = toEnglishDigits(k.value);
      doc.fontSize(7.5).font(fontRegular).fillColor('#64748b').text(labelText, boxX + 4, curY + 6, { width: boxWidth - 8, align: 'center' });
      doc.fontSize(9.5).font(fontBold).fillColor('#0f172a').text(valText, boxX + 4, curY + 22, { width: boxWidth - 8, align: 'center' });
    });
    curY += 52;
  }

  // جدول البيانات (Data Table)
  const rawCols = reportData.columns || [];
  const rows = reportData.rows || [];
  const colCount = Math.max(1, rawCols.length);
  const defaultWidth = Math.floor(525 / colCount);
  const cols = rawCols.map(c => ({
    ...c,
    width: Number(c.width) > 0 ? Number(c.width) : defaultWidth
  }));

  function drawTableHeader(y) {
    doc.rect(35, y, 525, 20).fill('#0f172a');
    doc.fontSize(8.5).font(fontBold).fillColor('#ffffff');
    let x = 35;
    cols.forEach(c => {
      const colWidth = c.width || defaultWidth;
      doc.text(toEnglishDigits(c.label || ''), x + 3, y + 5, { width: Math.max(10, colWidth - 6), align: c.align || 'right' });
      x += colWidth;
    });
    return y + 20;
  }

  curY = drawTableHeader(curY);

  if (rows.length === 0) {
    doc.rect(35, curY, 525, 30).fillAndStroke('#ffffff', '#e2e8f0');
    doc.fontSize(10).font(fontRegular).fillColor('#64748b').text('لا توجد سجلات أو بيانات مطابقة خلال هذه الفترة المحددة', 35, curY + 9, { align: 'center', width: 525 });
    curY += 35;
  } else {
    rows.forEach((r, idx) => {
      // التحقق من تجاوز الصفحة
      if (curY > 750) {
        doc.addPage();
        curY = 35;
        curY = drawTableHeader(curY);
      }

      const isEven = idx % 2 === 0;
      doc.rect(35, curY, 525, 18).fillAndStroke(isEven ? '#ffffff' : '#f8fafc', '#f1f5f9');
      doc.fontSize(8).font(fontRegular).fillColor('#1e293b');

      let x = 35;
      cols.forEach(c => {
        const rawVal = r[c.key] !== undefined && r[c.key] !== null ? String(r[c.key]) : '—';
        const val = toEnglishDigits(rawVal);
        const colWidth = c.width || defaultWidth;
        doc.text(val, x + 3, curY + 4, { width: Math.max(10, colWidth - 6), align: c.align || 'right' });
        x += colWidth;
      });
      curY += 18;
    });
  }

  // التذييل النهائي (Footer) وترقيم الصفحات على جميع الصفحات
  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7.5).font(fontRegular).fillColor('#94a3b8').text(
      '2M CAFE — مركز التقارير والتوثيق الرسمي | تم الاستخراج بالربط مع نظام نقاط البيع (POS)',
      35,
      785,
      { align: 'center', width: 525 }
    );
    // رقم الصفحة بالأرقام الإنجليزية
    doc.fontSize(7.5).font(fontRegular).fillColor('#94a3b8').text(
      `صفحة ${i + 1} من ${pageRange.count}`,
      470,
      785,
      { align: 'left', width: 90 }
    );
  }

  return doc;
}

module.exports = {
  toEnglishDigits,
  formatCurrency,
  formatNumber,
  formatDateTime,
  formatDate,
  parseReportPeriod,
  getReportData,
  generateReportPdfStream
};
