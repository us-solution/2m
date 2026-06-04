// ===== أمر واحد لربط menuItemIdInCashier من PostgreSQL إلى MongoDB =====
// شغّل على PostgreSQL الأول:
//   SELECT Id, Name FROM menu_items;
// ثم انسخ النتائج في مصفوفة mapping أدناه، ثم شغّل:
//   node scripts/sync-menu-item-ids.js

const mongoose = require('mongoose');
const Drink = require('./models/Drink');
require('dotenv').config();

const MAPPING = [
  // { name: 'Turkish Coffee', menuItemIdInCashier: 'GUID-FROM-POSTGRES' },
  // { name: 'Espresso Single', menuItemIdInCashier: 'GUID-FROM-POSTGRES' },
  // مثال:
  // { name: 'Latte', menuItemIdInCashier: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
];

async function sync() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to MongoDB: ${mongoose.connection.host}`);

  for (const entry of MAPPING) {
    const result = await Drink.updateOne(
      { name: entry.name },
      { $set: { menuItemIdInCashier: entry.menuItemIdInCashier } }
    );
    if (result.matchedCount > 0) {
      console.log(`✅ ${entry.name} ← ${entry.menuItemIdInCashier}`);
    } else {
      console.log(`❌ ${entry.name} — مشروب غير موجود في MongoDB`);
    }
  }

  // عرض المشروبات اللي لسه مالهاش ID
  const missing = await Drink.find({ menuItemIdInCashier: { $in: ['', null] } }).lean();
  if (missing.length > 0) {
    console.log(`\n⚠️ ${missing.length} مشروب(ات) لسه مالهاش menuItemIdInCashier:`);
    missing.forEach(d => console.log(`   - ${d.name} (${d.name_ar})`));
  }

  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

sync().catch(console.error);
