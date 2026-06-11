const mongoose = require('mongoose');
require('dotenv').config();
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://m16565680_db_user:MCFFg12%405@cluster0.zwr8bzd.mongodb.net/ozel_cafe?retryWrites=true&w=majority&appName=Cluster0';

const drinksByCategory = {
  'Turkish & French': [
    { name: 'Classic Turkish Coffee', nameAr: 'قهوة تركية كلاسيك', price: 35, description: 'Rich, unfiltered coffee brewed in a cezve with a signature foam.' },
    { name: 'French Press', nameAr: 'فرينش بريس', price: 40, description: 'Full-bodied coffee steeped to perfection in a French press.' }
  ],
  'Espresso Rituals': [
    { name: 'Double Espresso', nameAr: 'إسبريسو دبل', price: 30, description: 'A bold double shot of our signature espresso blend.' },
    { name: 'Latte Macchiato', nameAr: 'لاتيه ماكياتو', price: 42, description: 'Velvety milk layered over a shot of espresso.' }
  ],
  'Refresh Juice': [
    { name: 'Fresh Orange Juice', nameAr: 'عصير برتقال طازج', price: 35, description: 'Freshly squeezed orange juice served chilled.' },
    { name: 'Watermelon Juice', nameAr: 'عصير بطيخ', price: 30, description: 'Cool and refreshing watermelon juice.' }
  ],
  'Smooth Escapes': [
    { name: 'Berry Blast Smoothie', nameAr: 'سموثي بيري', price: 50, description: 'Mixed berries blended with yogurt and honey.' },
    { name: 'Tropical Mango', nameAr: 'مانجو استوائي', price: 50, description: 'Mango, banana, and coconut milk smoothie.' }
  ],
  'Frappe Rituals': [
    { name: 'Caramel Frappe', nameAr: 'فرابتشينو كراميل', price: 55, description: 'Blended coffee with caramel drizzle and whipped cream.' },
    { name: 'Mocha Frappe', nameAr: 'فرابتشينو موكا', price: 55, description: 'Chocolate and coffee blended with milk and ice.' }
  ],
  'Mojito & Sun Rise': [
    { name: 'Classic Mojito', nameAr: 'موخيتو كلاسيك', price: 35, description: 'Fresh mint, lime, and soda with a hint of sugar.' },
    { name: 'Sunrise Splash', nameAr: 'صن رايز سبلاش', price: 38, description: 'Orange, grenadine, and lemon with sparkling water.' }
  ],
  'Hot & More': [
    { name: 'Hot Chocolate', nameAr: 'شوكولاتة ساخنة', price: 35, description: 'Rich hot chocolate topped with marshmallows.' },
    { name: 'Masala Chai', nameAr: 'شاي ماسالا', price: 30, description: 'Spiced Indian tea with milk and aromatic spices.' }
  ],
  'Milk Shaken Rituals': [
    { name: 'Oreo Milkshake', nameAr: 'ميلك شيك أوريو', price: 50, description: 'Creamy milkshake with Oreo crumbles.' },
    { name: 'Strawberry Milkshake', nameAr: 'ميلك شيك فراولة', price: 48, description: 'Fresh strawberry milkshake with vanilla ice cream.' }
  ],
  'Pure Classics Ice Coffee': [
    { name: 'Iced Americano', nameAr: 'أمريكانو مثلج', price: 32, description: 'Espresso shot over ice topped with water.' },
    { name: 'Iced Caramel Latte', nameAr: 'لاتيه كراميل مثلج', price: 45, description: 'Iced latte with caramel syrup and cold milk.' }
  ],
  'Ice Cream': [
    { name: 'Chocolate Sundae', nameAr: 'صانداي شوكولاتة', price: 40, description: 'Vanilla ice cream with hot fudge and whipped cream.' },
    { name: 'Mango Sorbet', nameAr: 'سوربيه مانجو', price: 35, description: 'Refreshing mango sorbet made with real fruit.' }
  ],
  'Desserts': [
    { name: 'Baklava', nameAr: 'بقلاوة', price: 45, description: 'Layers of filo pastry with nuts and honey syrup.' },
    { name: 'Cheesecake', nameAr: 'تشيز كيك', price: 55, description: 'New York style cheesecake with berry compote.' }
  ]
};

async function seed() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;

  const categories = await db.collection('categories').find().toArray();

  for (const cat of categories) {
    const catName = cat.name;
    const drinks = drinksByCategory[catName];
    if (!drinks) continue;
    for (const d of drinks) {
      await db.collection('drinks').updateOne(
        { category: catName, name: d.name },
        { $set: { ...d, category: catName, available: true, featured: false, createdAt: new Date() } },
        { upsert: true }
      );
    }
  }

  const count = await db.collection('drinks').countDocuments();
  console.log('Total drinks: ' + count);
  await mongoose.disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
