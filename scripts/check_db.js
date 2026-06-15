const connectDB = require('../config/database');
const Category = require('../models/Category');
const Drink = require('../models/Drink');

async function run() {
  try {
    await connectDB();
    console.log('Connected to DB');
    const catCount = await Category.countDocuments({});
    const drinkCount = await Drink.countDocuments({});
    console.log('Categories count:', catCount);
    console.log('Drinks count:', drinkCount);
    if (drinkCount > 0) {
      const sample = await Drink.findOne({});
      console.log('Sample drink:', JSON.stringify(sample, null, 2));
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
