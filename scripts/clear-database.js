const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connectDB = require('../config/database');

// Import all models to ensure they register schemas
const User = require('../models/User');
const Category = require('../models/Category');
const Drink = require('../models/Drink');
const Order = require('../models/Order');
const Shift = require('../models/Shift');
const VlogPost = require('../models/VlogPost');
const Offer = require('../models/Offer');
const Ingredient = require('../models/Ingredient');
const Recipe = require('../models/Recipe');
const RecipeItem = require('../models/RecipeItem');
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const CashMovement = require('../models/CashMovement');
const CustomizationOption = require('../models/CustomizationOption');
const GameRoom = require('../models/GameRoom');
const InventoryCount = require('../models/InventoryCount');
const InventoryTransaction = require('../models/InventoryTransaction');
const PointsLog = require('../models/PointsLog');
const QueueOrder = require('../models/QueueOrder');
const ReportSnapshot = require('../models/ReportSnapshot');
const StockAlert = require('../models/StockAlert');
const SyncEvent = require('../models/SyncEvent');

async function wipeDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected. Starting database wipe...');

    const collectionsToClear = [
      { name: 'Category', model: Category },
      { name: 'Drink', model: Drink },
      { name: 'Order', model: Order },
      { name: 'Shift', model: Shift },
      { name: 'VlogPost', model: VlogPost },
      { name: 'Offer', model: Offer },
      { name: 'Ingredient', model: Ingredient },
      { name: 'Recipe', model: Recipe },
      { name: 'RecipeItem', model: RecipeItem },
      { name: 'Expense', model: Expense },
      { name: 'ExpenseCategory', model: ExpenseCategory },
      { name: 'CashMovement', model: CashMovement },
      { name: 'CustomizationOption', model: CustomizationOption },
      { name: 'GameRoom', model: GameRoom },
      { name: 'InventoryCount', model: InventoryCount },
      { name: 'InventoryTransaction', model: InventoryTransaction },
      { name: 'PointsLog', model: PointsLog },
      { name: 'QueueOrder', model: QueueOrder },
      { name: 'ReportSnapshot', model: ReportSnapshot },
      { name: 'StockAlert', model: StockAlert },
      { name: 'SyncEvent', model: SyncEvent }
    ];

    for (const item of collectionsToClear) {
      const res = await item.model.deleteMany({});
      console.log(`🧹 Wiped collection: ${item.name} (deleted ${res.deletedCount} documents)`);
    }

    // Clean up User collection - keep admin and cashier, delete customers and others
    console.log('Cleaning up users collection...');
    
    // Delete non-admin and non-cashier users
    const resUsers = await User.deleteMany({ role: { $nin: ['admin', 'cashier'] } });
    console.log(`🧹 Deleted ${resUsers.deletedCount} customer/other user accounts.`);

    // Ensure default admin user exists
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
      console.log('👤 Created default admin user (admin@ozel.cafe / admin123).');
    } else {
      console.log('👤 Admin user already exists.');
    }

    // Ensure default cashier user exists
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
      console.log('👤 Created default cashier user (cashier@ozel.cafe / cashier123).');
    } else {
      console.log('👤 Cashier user already exists.');
    }

    console.log('✨ MongoDB database wipe and initialization completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error wiping MongoDB database:', err);
    process.exit(1);
  }
}

wipeDatabase();
