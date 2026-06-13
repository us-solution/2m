const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connectDB = require('../config/database');
const Category = require('../models/Category');
const Drink = require('../models/Drink');
const User = require('../models/User');

const categoriesData = [
  { name: 'Turkish & French', name_ar: 'تركي وفرنسي', icon: 'imgs/turkish.png', sort_order: 1 },
  { name: 'Espresso Rituals', name_ar: 'طقوس الإسبريسو', icon: 'imgs/espresso.png', sort_order: 2 },
  { name: 'Refresh Juice', name_ar: 'عصائر منعشة', icon: 'imgs/juice.png', sort_order: 3 },
  { name: 'Smooth Escapes', name_ar: 'سموذي', icon: 'imgs/smoothie.png', sort_order: 4 },
  { name: 'Frappe Rituals', name_ar: 'فرابيه', icon: 'imgs/frappe.png', sort_order: 5 },
  { name: 'Mojito & Sun Rise', name_ar: 'موهيتو وسبارك', icon: 'imgs/mojito.png', sort_order: 6 },
  { name: 'Hot & More', name_ar: 'مشروبات ساخنة', icon: 'imgs/hotchoc.png', sort_order: 7 },
  { name: 'Milk Shaken Rituals', name_ar: 'ميلك شيك', icon: 'imgs/milkshake.png', sort_order: 8 },
  { name: 'Pure Classics Ice Coffee', name_ar: 'قهوة مثلجة كلاسيكية', icon: 'imgs/icedcoffee.png', sort_order: 9 },
  { name: 'Ice Cream', name_ar: 'آيس كريم', icon: 'imgs/icecream.png', sort_order: 10 },
  { name: 'Desserts', name_ar: 'حلويات', icon: 'imgs/desserts.png', sort_order: 11 }
];

const drinksData = [
  [0, 'Turkish Coffee', 'قهوة تركية', 25, 'hot', 'imgs/turkish.png', 0],
  [0, 'French Coffee', 'قهوة فرنسية', 30, 'hot', 'imgs/turkish.png', 0],
  [0, 'Hazelnut French Coffee', 'فرنسي بالبندق', 35, 'hot', 'imgs/turkish.png', 1],
  [1, 'Espresso Single', 'إسبريسو سينجل', 30, 'hot', 'imgs/espresso.png', 0],
  [1, 'Espresso Double', 'إسبريسو دبل', 35, 'hot', 'imgs/espresso.png', 0],
  [1, 'Macchiato Single', 'ماكياتو سينجل', 35, 'hot', 'imgs/espresso.png', 0],
  [1, 'Macchiato Double', 'ماكياتو دبل', 40, 'hot', 'imgs/espresso.png', 0],
  [1, 'Honey Lavender Latte', 'لاتيه عسل لافندر', 50, 'hot', 'imgs/latte.png', 1],
  [1, 'Beet Root Latte', 'لاتيه البنجر', 50, 'hot', 'imgs/latte.png', 1],
  [1, 'Americano Long', 'أمريكانو لونج', 35, 'hot', 'imgs/espresso.png', 0],
  [1, 'Flat White', 'فلات وايت', 40, 'hot', 'imgs/latte.png', 0],
  [1, 'Corto', 'كورتو', 40, 'hot', 'imgs/espresso.png', 0],
  [1, 'Piccolo', 'بيكولو', 40, 'hot', 'imgs/latte.png', 0],
  [1, 'Café Latte', 'كافيه لاتيه', 40, 'hot', 'imgs/latte.png', 0],
  [1, 'Cappuccino', 'كابتشينو', 40, 'hot', 'imgs/latte.png', 0],
  [1, 'Biscoff Espresso', 'إسبريسو بيسكوف', 50, 'hot', 'imgs/latte.png', 1],
  [1, 'Affogato Espresso', 'أفوكاتو', 55, 'hot', 'imgs/espresso.png', 1],
  [1, 'Smoked Rosemary Corto', 'كورتو روزماري مدخن', 55, 'hot', 'imgs/espresso.png', 1],
  [1, 'Mocha Latte', 'موكا لاتيه', 45, 'hot', 'imgs/latte.png', 0],
  [1, 'Spanish Latte', 'لاتيه إسباني', 45, 'hot', 'imgs/latte.png', 1],
  [2, 'Orange Juice', 'عصير برتقال', 40, 'cold', 'imgs/juice.png', 0],
  [2, 'Mango Juice', 'عصير مانجو', 45, 'cold', 'imgs/juice.png', 0],
  [2, 'Strawberry Juice', 'عصير فراولة', 45, 'cold', 'imgs/juice.png', 0],
  [5, 'Sun Rise', 'صن رايز', 45, 'cold', 'imgs/mojito.png', 1],
  [7, 'Lotus Biscoff Lava', 'لوتس لافا', 55, 'cold', 'imgs/milkshake.png', 1],
  [8, 'Ice Latte', 'آيس لاتيه', 45, 'cold', 'imgs/icedcoffee.png', 0],
  [10, 'Molten Lava', 'مولتن لافا', 60, 'hot', 'imgs/desserts.png', 1]
];

async function seed() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected. Deleting old categories and drinks...');
    
    await Category.deleteMany({});
    await Drink.deleteMany({});
    
    console.log('Inserting new categories...');
    const createdCategories = await Category.insertMany(categoriesData);
    console.log(`Successfully inserted ${createdCategories.length} categories.`);
    
    const catMap = {};
    createdCategories.forEach((c, idx) => {
      catMap[idx] = c._id;
    });

    console.log('Inserting new drinks...');
    for (const d of drinksData) {
      await Drink.create({
        category_id: catMap[d[0]],
        name: d[1],
        name_ar: d[2],
        price: d[3],
        temperature: d[4],
        image_emoji: d[5],
        is_featured: d[6],
        is_available: 1,
        tagline: 'An unforgettable experience',
        description: 'A premium drink crafted with the finest ingredients'
      });
    }
    console.log(`Successfully inserted ${drinksData.length} drinks.`);

    // Seed default admin & cashier if not present
    console.log('Checking for default admin and cashier users...');
    const existingAdmin = await User.findOne({ email: 'admin@ozel.cafe' });
    if (!existingAdmin) {
      const adminPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        name: 'Admin',
        phone: '01000000000',
        email: 'admin@ozel.cafe',
        password: adminPassword,
        role: 'admin',
        subscriptionTier: 'gold'
      });
      console.log('Created default admin user.');
    } else {
      console.log('Admin user already exists.');
    }

    const existingCashier = await User.findOne({ email: 'cashier@ozel.cafe' });
    if (!existingCashier) {
      const cashierPassword = await bcrypt.hash('cashier123', 10);
      await User.create({
        name: 'Cashier',
        phone: '01000000001',
        email: 'cashier@ozel.cafe',
        password: cashierPassword,
        role: 'cashier',
        subscriptionTier: 'silver'
      });
      console.log('Created default cashier user.');
    } else {
      console.log('Cashier user already exists.');
    }

    console.log('Database seeding completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seed();
