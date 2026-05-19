const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'ozel_cafe.db'));

db.exec('DELETE FROM drinks;');
db.exec('DELETE FROM categories;');
db.exec("DELETE FROM sqlite_sequence WHERE name='drinks' OR name='categories';");

const insertCat   = db.prepare('INSERT INTO categories (name, name_ar, icon, description) VALUES (?, ?, ?, ?)');
const insertDrink = db.prepare(`
  INSERT INTO drinks (category_id, name, name_ar, tagline, description, ingredients, preparation, price, calories, serving_size, temperature, image_emoji, is_featured)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// image_emoji column is re-used to store the image path
const C = [
  { name:'Turkish & French',           ar:'تركي وفرنسي',            icon:'',  img:'imgs/turkish.png',   desc:'أصالة المذاق الكلاسيكي' },
  { name:'Espresso Rituals',           ar:'طقوس الإسبريسو',          icon:'',  img:'imgs/espresso.png',  desc:'مشروبات الإسبريسو الغنية' },
  { name:'Refresh Juice',              ar:'عصائر منعشة',             icon:'',  img:'imgs/juice.png',     desc:'فواكه طازجة ممتازة' },
  { name:'Smooth Escapes',             ar:'سموذي',                   icon:'',  img:'imgs/smoothie.png',  desc:'اختر الفاكهة المفضلة' },
  { name:'Frappe Rituals',             ar:'فرابيه',                  icon:'',  img:'imgs/frappe.png',    desc:'مشروبات فرابيه مثلجة' },
  { name:'Mojito & Sun Rise',          ar:'موهيتو وسبارك',           icon:'',  img:'imgs/mojito.png',    desc:'ألوان ومذاقات منعشة' },
  { name:'Hot & More',                 ar:'مشروبات ساخنة',           icon:'',  img:'imgs/hotchoc.png',   desc:'دفء ومشروبات كلاسيكية' },
  { name:'Milk Shaken Rituals',        ar:'ميلك شيك',               icon:'',  img:'imgs/milkshake.png', desc:'مزيج الحليب والآيس كريم' },
  { name:'Pure Classics Ice Coffee',   ar:'قهوة مثلجة كلاسيكية',   icon:'',  img:'imgs/icedcoffee.png',desc:'انتعاش القهوة الباردة' },
  { name:'Ice Cream',                  ar:'آيس كريم',               icon:'',  img:'imgs/icecream.png',  desc:'حلوى الآيس كريم الفاخرة' },
  { name:'Desserts',                   ar:'حلويات',                 icon:'',  img:'imgs/desserts.png',  desc:'وافل وبان كيك وأكثر' },
];

const ids = C.map(c => insertCat.run(c.name, c.ar, c.icon, c.desc).lastInsertRowid);

// [catIdx, name, name_ar, price, temp, img, featured]
const drinks = [
  // Turkish & French (0)
  [0,'Turkish Coffee','قهوة تركية',25,'hot','imgs/turkish.png',0],
  [0,'French Coffee','قهوة فرنسية',30,'hot','imgs/turkish.png',0],
  [0,'Hazelnut French Coffee','فرنسي بالبندق',35,'hot','imgs/turkish.png',1],

  // Espresso Rituals (1)
  [1,'Espresso Single','إسبريسو سينجل',30,'hot','imgs/espresso.png',0],
  [1,'Espresso Double','إسبريسو دبل',35,'hot','imgs/espresso.png',0],
  [1,'Macchiato Single','ماكياتو سينجل',35,'hot','imgs/espresso.png',0],
  [1,'Macchiato Double','ماكياتو دبل',40,'hot','imgs/espresso.png',0],
  [1,'Honey Lavender Latte','لاتيه عسل لافندر',50,'hot','imgs/latte.png',1],
  [1,'Beet Root Latte','لاتيه البنجر',50,'hot','imgs/latte.png',1],
  [1,'Americano Long','أمريكانو لونج',35,'hot','imgs/espresso.png',0],
  [1,'Flat White','فلات وايت',40,'hot','imgs/latte.png',0],
  [1,'Corto','كورتو',40,'hot','imgs/espresso.png',0],
  [1,'Piccolo','بيكولو',40,'hot','imgs/latte.png',0],
  [1,'Café Latte','كافيه لاتيه',40,'hot','imgs/latte.png',0],
  [1,'Cappuccino','كابتشينو',40,'hot','imgs/latte.png',0],
  [1,'Biscoff Espresso','إسبريسو بيسكوف',50,'hot','imgs/latte.png',1],
  [1,'Affogato Espresso','أفوكاتو',55,'hot','imgs/espresso.png',1],
  [1,'Smoked Rosemary Corto','كورتو روزماري مدخن',55,'hot','imgs/espresso.png',1],
  [1,'Mocha Latte','موكا لاتيه',45,'hot','imgs/latte.png',0],
  [1,'Spanish Latte','لاتيه إسباني',45,'hot','imgs/latte.png',1],
  [1,'Marocchino','ماروكينو',45,'hot','imgs/latte.png',0],

  // Refresh Juice (2)
  [2,'Orange Juice','عصير برتقال',40,'cold','imgs/juice.png',0],
  [2,'Mango Juice','عصير مانجو',45,'cold','imgs/juice.png',0],
  [2,'Strawberry Juice','عصير فراولة',45,'cold','imgs/juice.png',0],
  [2,'Guava Juice','عصير جوافة',40,'cold','imgs/juice.png',0],
  [2,'Watermelon Juice','عصير بطيخ',40,'cold','imgs/juice.png',0],
  [2,'Kiwi Juice','عصير كيوي',45,'cold','imgs/juice.png',0],
  [2,'Avocado Juice','عصير أفوكادو',50,'cold','imgs/juice.png',1],
  [2,'Lemon Mint','ليمون نعناع',35,'cold','imgs/juice.png',0],

  // Smooth Escapes (3)
  [3,'Custom Smoothie','سموذي مخصص',50,'cold','imgs/smoothie.png',1],

  // Frappe Rituals (4)
  [4,'Lotus Blast','لوتس بلاست',55,'cold','imgs/frappe.png',1],
  [4,'White Velvet','وايت فيلفيت',55,'cold','imgs/frappe.png',0],
  [4,'Candy Cloud','كاندي كلاود',55,'cold','imgs/frappe.png',0],
  [4,'Blueberry Muffin','بلوبيري مافن',55,'cold','imgs/frappe.png',1],
  [4,'Mid Night Mocha','مد نايت موكا',55,'cold','imgs/frappe.png',1],
  [4,'Caramel Swirl','كراميل سويرل',55,'cold','imgs/frappe.png',0],
  [4,'Coffee Frappe','فرابيه قهوة',50,'cold','imgs/frappe.png',0],

  // Mojito (5)
  [5,'Sun Rise','صن رايز',45,'cold','imgs/mojito.png',1],
  [5,'Ruby Fizz','روبي فيز',45,'cold','imgs/mojito.png',0],
  [5,'Blue Mist','بلو ميست',45,'cold','imgs/mojito.png',0],
  [5,'Lavender Lemon','لافندر ليمون',45,'cold','imgs/mojito.png',1],
  [5,'Lava Lamp','لافا لامب',50,'cold','imgs/mojito.png',1],
  [5,'Rose Garden','روز جاردن',45,'cold','imgs/mojito.png',0],
  [5,'Berry Passion Spritz','بيري باشن سبريتز',50,'cold','imgs/mojito.png',1],
  [5,'Black Berry Wild Cherry Cream','بلاك بيري وايلد شيري',55,'cold','imgs/mojito.png',0],
  [5,'Coffee Mojito','موهيتو قهوة',45,'cold','imgs/mojito.png',1],
  [5,'Passion Fire','باشن فاير',50,'cold','imgs/mojito.png',0],
  [5,'Blue Lagoon Mojito','بلو لاجون موهيتو',45,'cold','imgs/mojito.png',0],
  [5,'Summer Berry','سمر بيري',45,'cold','imgs/mojito.png',0],
  [5,'Redbull Coconut Breeze','ريد بول جوز هند',60,'cold','imgs/mojito.png',1],
  [5,'Classic Energy Mojito','موهيتو إنيرجي',60,'cold','imgs/mojito.png',0],
  [5,'Berry Energizer','بيري إنيرجايزر',60,'cold','imgs/mojito.png',0],
  [5,'Tropic Bull','تروبيك بول',60,'cold','imgs/mojito.png',0],
  [5,'Original Mojito','موهيتو أصلي',40,'cold','imgs/mojito.png',0],
  [5,'Sparkling Diamonds','سباركلينج دايموندز',50,'cold','imgs/mojito.png',1],
  [5,'Vimto Espresso Fizz','فيمتو إسبريسو فيز',50,'cold','imgs/mojito.png',1],

  // Hot & More (6)
  [6,'Classic Milk Hot Chocolate','شوكولاتة حليب',45,'hot','imgs/hotchoc.png',0],
  [6,'Rich Dark Hot Chocolate','شوكولاتة داكنة',50,'hot','imgs/hotchoc.png',1],
  [6,'Ferrero Rocher Hot Chocolate','شوكولاتة روشيه',60,'hot','imgs/hotchoc.png',1],
  [6,'Original Spiced Cider','سايدر بالتوابل',40,'hot','imgs/hotchoc.png',0],
  [6,'Sahlab','سحلب',45,'hot','imgs/hotchoc.png',1],
  [6,'Black Tea & Green','شاي أسود وأخضر',20,'hot','imgs/hotchoc.png',0],
  [6,'Karak Tea','شاي كرك',30,'hot','imgs/hotchoc.png',0],
  [6,'London Fog Tea','لندن فوج تي',40,'hot','imgs/hotchoc.png',1],
  [6,'Hot Biscoff Lotus','بيسكوف لوتس ساخن',50,'hot','imgs/hotchoc.png',1],
  [6,'Hot Milky Oreo','أوريو حليب ساخن',50,'hot','imgs/hotchoc.png',0],
  [6,'Nescafe','نسكافيه',25,'hot','imgs/espresso.png',0],
  [6,'Hot Matcha','ماتشا ساخنة',45,'hot','imgs/latte.png',1],

  // Milk Shaken (7)
  [7,'Classic Vanilla','فانيليا كلاسيك',45,'cold','imgs/milkshake.png',0],
  [7,'Rich Chocolate','شوكولاتة غنية',45,'cold','imgs/milkshake.png',0],
  [7,'Lotus Biscoff Lava','لوتس لافا',55,'cold','imgs/milkshake.png',1],
  [7,'Ferrero Rocher Luxe','روشيه لوكس',60,'cold','imgs/milkshake.png',1],
  [7,'Oreo Milk Crunch','أوريو كرانش',50,'cold','imgs/milkshake.png',0],
  [7,'Milk Shake Fruit Rituals','ميلك شيك فاكهة',55,'cold','imgs/milkshake.png',0],
  [7,'Tiramisu Chill','تيراميسو تشيل',55,'cold','imgs/milkshake.png',1],
  [7,'BlueBerry Shaken','بلوبيري شيكن',50,'cold','imgs/milkshake.png',0],
  [7,'Dark Choc & Date','شوكولاتة داكنة وتمر',55,'cold','imgs/milkshake.png',1],

  // Iced Coffee (8)
  [8,'Ice Latte','آيس لاتيه',45,'cold','imgs/icedcoffee.png',0],
  [8,'Ice Spanish Latte','آيس لاتيه إسباني',50,'cold','imgs/icedcoffee.png',0],
  [8,'Cold Brew','كولد برو',45,'cold','imgs/icedcoffee.png',1],
  [8,'Iced Cracking Latte','كراكينج لاتيه',55,'cold','imgs/icedcoffee.png',1],
  [8,'Charcoal BlackBerry Latte','لاتيه فحم وبلاك بيري',55,'cold','imgs/icedcoffee.png',1],
  [8,'Rose Coconut Cold Brew','ورد وجوز هند كولد برو',50,'cold','imgs/icedcoffee.png',1],
  [8,'Camp Fire Mocha','كامب فاير موكا',55,'cold','imgs/icedcoffee.png',1],
  [8,'Iced Mid Night Mocha','آيس مد نايت موكا',55,'cold','imgs/icedcoffee.png',0],
  [8,'Iced Matcha Latte','آيس ماتشا لاتيه',50,'cold','imgs/icedcoffee.png',1],

  // Ice Cream (9)
  [9,'Mango Sorbet','سوربيه مانجو',35,'cold','imgs/icecream.png',0],
  [9,'Rocher Overload','روشيه أوفرلود',45,'cold','imgs/icecream.png',1],
  [9,'Strawberry Ice Cream','آيس كريم فراولة',35,'cold','imgs/icecream.png',0],
  [9,'Maple Walnut','مابل والنت',40,'cold','imgs/icecream.png',0],
  [9,'Flight Boards','فلايت بوردز',50,'cold','imgs/icecream.png',1],
  [9,'Flower Pot','فلاور بوت',45,'cold','imgs/icecream.png',1],
  [9,'Chocolate Ice Cream','آيس كريم شوكولاتة',35,'cold','imgs/icecream.png',0],

  // Desserts (10)
  [10,'Date Me! Waffle','وافل التمر',60,'hot','imgs/desserts.png',1],
  [10,'Bubble Waffle Cones','بابل وافل كونز',55,'hot','imgs/desserts.png',0],
  [10,'Waffle Cakes & Stacks','وافل كيك',65,'hot','imgs/desserts.png',1],
  [10,'Lolly Stick Waffles','لولي وافل',45,'hot','imgs/desserts.png',0],
  [10,'Pancake Board Royale','بان كيك رويال',80,'hot','imgs/desserts.png',1],
  [10,'Mini Pancake Classic','ميني بان كيك',50,'hot','imgs/desserts.png',0],
  [10,'Gourmet Donut Flights','دونات جورميه',55,'hot','imgs/desserts.png',0],
  [10,'Molten Lava','مولتن لافا',60,'hot','imgs/desserts.png',1],
  [10,'Cheese Cake','تشيز كيك',55,'hot','imgs/desserts.png',0],
  [10,'Tiramisu','تيراميسو',55,'hot','imgs/desserts.png',1],
  [10,'Chocolate Mousse','موس شوكولاتة',50,'hot','imgs/desserts.png',0],
  [10,'Crepe Roll','كريب رول',55,'hot','imgs/desserts.png',0],
];

for (const d of drinks) {
  insertDrink.run(
    ids[d[0]], d[1], d[2],
    'An unforgettable experience',
    'A premium drink crafted with the finest ingredients',
    'Selected ingredients', '',
    d[3], 150, 'Medium', d[4], d[5], d[6]
  );
}
console.log('✅ Menu seeded with real images successfully!');
