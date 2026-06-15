const connectDB = require('../config/database');
const Drink = require('../models/Drink');

async function run() {
  try {
    await connectDB();
    const countAll = await Drink.countDocuments({});
    const countWithIsAvailable = await Drink.countDocuments({ is_available: 1 });
    const countWithAvailable = await Drink.countDocuments({ available: true });
    console.log('Total drinks:', countAll);
    console.log('Drinks with is_available = 1:', countWithIsAvailable);
    console.log('Drinks with available = true:', countWithAvailable);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
