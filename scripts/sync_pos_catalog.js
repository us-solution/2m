const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Category = require('../models/Category');
const Drink = require('../models/Drink');
const User = require('../models/User');
const CustomizationOption = require('../models/CustomizationOption');
const bcrypt = require('bcryptjs');

const JSON_DUMP_PATH = path.join(__dirname, '../../pos_catalog_dump.json');

// خريطة أيقونات وأسماء إنجليزية للتصنيفات الـ 20
const CATEGORY_META = {
  1: { en: 'Coffee & Espresso', icon: 'imgs/espresso.png' },
  2: { en: 'Tea & Teapots', icon: 'imgs/hotchoc.png' },
  3: { en: 'Hot Drinks & Herbs', icon: 'imgs/hotchoc.png' },
  4: { en: 'Hot Chocolate', icon: 'imgs/hotchoc.png' },
  5: { en: 'Sahlab', icon: 'imgs/hotchoc.png' },
  6: { en: 'Fresh Juices', icon: 'imgs/juice.png' },
  7: { en: 'Smoothies', icon: 'imgs/smoothie.png' },
  8: { en: 'Cocktails', icon: 'imgs/juice.png' },
  9: { en: 'Milkshakes', icon: 'imgs/milkshake.png' },
  10: { en: 'Frappe & Iced Coffee', icon: 'imgs/frappe.png' },
  11: { en: 'Mojito & Refreshment', icon: 'imgs/mojito.png' },
  12: { en: 'Soft Drinks', icon: 'imgs/mojito.png' },
  13: { en: 'Fruit Slush & Yogurt', icon: 'imgs/smoothie.png' },
  14: { en: 'Ice Cream', icon: 'imgs/icecream.png' },
  15: { en: 'Waffles', icon: 'imgs/desserts.png' },
  16: { en: 'Pancakes & Crepes', icon: 'imgs/desserts.png' },
  17: { en: 'Desserts', icon: 'imgs/desserts.png' },
  18: { en: 'Boba Drinks', icon: 'imgs/frappe.png' },
  19: { en: 'Extras & Additions', icon: 'imgs/espresso.png' },
  20: { en: 'Food, Sandwiches & Pastries', icon: 'imgs/desserts.png' }
};

// الـ 12 إضافة الفعلية من تصنيف 19 بنظام الكاشير
const CASHIER_REAL_EXTRAS = [
  { key: 'None', nameEn: 'No Extras', nameAr: 'بدون إضافات', price: 0, sortOrder: 0 },
  { key: 'extra_honey', nameEn: 'Honey Addition', nameAr: 'إضافة عسل', price: 25, sortOrder: 1 },
  { key: 'extra_milk', nameEn: 'Milk Addition', nameAr: 'إضافة حليب', price: 25, sortOrder: 2 },
  { key: 'extra_nuts', nameEn: 'Nuts Addition', nameAr: 'إضافة مكسرات', price: 35, sortOrder: 3 },
  { key: 'extra_tea_packet', nameEn: 'Tea Packet', nameAr: 'إضافة باكت شاي', price: 5, sortOrder: 4 },
  { key: 'extra_oreo', nameEn: 'Oreo Addition', nameAr: 'إضافة أوريو', price: 20, sortOrder: 5 },
  { key: 'extra_sauce', nameEn: 'Sauce Addition', nameAr: 'إضافة صوص', price: 20, sortOrder: 6 },
  { key: 'extra_herbs', nameEn: 'Herbs Packet', nameAr: 'إضافة باكت أعشاب', price: 25, sortOrder: 7 },
  { key: 'extra_ice_cream', nameEn: 'Ice Cream Scoop', nameAr: 'إضافة آيس كريم', price: 30, sortOrder: 8 },
  { key: 'extra_fruits', nameEn: 'Fruits Addition', nameAr: 'إضافة فواكه', price: 35, sortOrder: 9 },
  { key: 'extra_cold', nameEn: 'Cold Extras', nameAr: 'إضافات بارد', price: 15, sortOrder: 10 },
  { key: 'extra_boba', nameEn: 'Boba Addition', nameAr: 'إضافة بوبا', price: 30, sortOrder: 11 },
  { key: 'extra_lemon_slices', nameEn: 'Lemon Slices', nameAr: 'سلايز ليمون', price: 5, sortOrder: 12 }
];

const SUGAR_LEVELS = [
  { key: 'Normal', nameEn: 'Normal Sugar', nameAr: 'سكر طبيعي', sortOrder: 0 },
  { key: 'Medium', nameEn: 'Medium Sugar', nameAr: 'سكر وسط', sortOrder: 1 },
  { key: 'Less', nameEn: 'Less Sugar', nameAr: 'سكر خفيف', sortOrder: 2 },
  { key: 'No Sugar', nameEn: 'No Sugar', nameAr: 'بدون سكر', sortOrder: 3 },
  { key: 'Extra Sugar', nameEn: 'Extra Sugar', nameAr: 'سكر زيادة', sortOrder: 4 }
];

async function syncPOSCatalogToMongo() {
  console.log('🔄 Starting 2M POS to MongoDB Catalog Sync from JSON dump...');
  
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set in .env');
  }

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB Atlas.');

  const dumpRaw = fs.readFileSync(JSON_DUMP_PATH, 'utf-8');
  const dump = JSON.parse(dumpRaw);

  const posCategories = dump.categories;
  const posProducts = dump.products;

  console.log(`📦 Loaded ${posCategories.length} categories and ${posProducts.length} products from dump.`);

  try {
    // مسح التصنيفات والمنتجات القديمة
    await Category.deleteMany({});
    await Drink.deleteMany({});
    console.log('🧹 Cleared old MongoDB categories and drinks.');

    // 1. إدخال التصنيفات الـ 20
    const catMap = {}; // posCatId -> Mongo ObjectId
    for (const c of posCategories) {
      const meta = CATEGORY_META[c.id] || { en: c.name, icon: 'imgs/espresso.png' };
      const createdCat = await Category.create({
        name: meta.en,
        name_ar: c.name,
        icon: meta.icon,
        description: `أشهى خيارات ${c.name} الفاخرة من 2M CAFE`,
        sort_order: c.id
      });
      catMap[c.id] = createdCat._id;
    }
    console.log(`✅ Successfully seeded ${Object.keys(catMap).length} categories into MongoDB.`);

    // 2. إدخال المنتجات الـ 279
    const extraNames = CASHIER_REAL_EXTRAS.filter(e => e.key !== 'None').map(e => e.nameAr);

    const drinksToInsert = [];
    for (const p of posProducts) {
      const mongoCatId = catMap[p.category_id] || catMap[1];
      const meta = CATEGORY_META[p.category_id] || { en: 'Beverage', icon: 'imgs/espresso.png' };

      let temp = 'both';
      if ([1, 2, 3, 4, 5].includes(p.category_id)) temp = 'hot';
      else if ([6, 7, 8, 9, 10, 11, 12, 13, 14, 18].includes(p.category_id)) temp = 'cold';

      drinksToInsert.push({
        category_id: mongoCatId,
        name: p.name,
        name_ar: p.name,
        tagline: p.unit ? `الحجم / الوحدة: ${p.unit}` : 'صُنع بأعلى معايير الجودة في 2M CAFE',
        description: p.barcode ? `كود الصنف: ${p.barcode}` : 'صنف مميز محضر بعناية من 2M CAFE',
        ingredients: null,
        preparation: '',
        price: parseFloat(p.price) || 0,
        calories: null,
        serving_size: p.unit || null,
        temperature: temp,
        image_emoji: meta.icon,
        is_featured: (p.id % 15 === 0) ? 1 : 0,
        is_available: p.active !== undefined ? Number(p.active) : 1,
        availableExtras: p.category_id !== 19 ? extraNames : [],
        menuItemIdInCashier: String(p.id)
      });
    }

    await Drink.insertMany(drinksToInsert);
    console.log(`✅ Successfully seeded all ${drinksToInsert.length} products into MongoDB!`);

    // 3. تحديث خيارات التخصيص
    await CustomizationOption.deleteMany({});
    await CustomizationOption.create({
      configId: 'default',
      sugarLevels: SUGAR_LEVELS,
      extras: CASHIER_REAL_EXTRAS,
      logo1: 'imgs/2m-logo.png',
      logo2: 'imgs/2m-logo.png',
      heroBg: ''
    });
    console.log('✅ Customization options updated with the 12 authentic cashier extras.');

    // 4. تحديث المشرف الافتراضي والكاشير لـ 2M
    await User.deleteMany({ email: { $in: ['admin@ozel.cafe', 'cashier@ozel.cafe'] } });

    const adminPassword = await bcrypt.hash('admin123', 10);
    await User.findOneAndUpdate(
      { email: 'admin@2m.cafe' },
      {
        name: '2M Admin',
        phone: '01000000000',
        email: 'admin@2m.cafe',
        password: adminPassword,
        role: 'admin',
        customerStatus: 'gold'
      },
      { upsert: true, new: true }
    );

    const cashierPassword = await bcrypt.hash('cashier123', 10);
    await User.findOneAndUpdate(
      { email: 'cashier@2m.cafe' },
      {
        name: '2M Cashier',
        phone: '01000000001',
        email: 'cashier@2m.cafe',
        password: cashierPassword,
        role: 'cashier',
        customerStatus: 'standard'
      },
      { upsert: true, new: true }
    );
    console.log('✅ 2M Admin (admin@2m.cafe / admin123) and Cashier (cashier@2m.cafe / cashier123) ready.');

    console.log('\n🎉 ALL CATALOG SYNC COMPLETED SUCCESSFULLY!');
    await mongoose.disconnect();
    process.exit(0);

  } catch (err) {
    console.error('❌ Error during catalog sync:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

syncPOSCatalogToMongo();
