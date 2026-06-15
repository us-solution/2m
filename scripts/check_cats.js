const connectDB = require('../config/database');
const Category = require('../models/Category');

async function run() {
  try {
    await connectDB();
    const cats = await Category.find({});
    console.log('Categories:', JSON.stringify(cats, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
