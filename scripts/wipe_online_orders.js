require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = require('../config/database');
const Order = require('../models/Order');
const SyncEvent = require('../models/SyncEvent');
const QueueOrder = require('../models/QueueOrder');

async function wipeOnlineOrders() {
  try {
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected to MongoDB successfully.');

    const resOrders = await Order.deleteMany({});
    console.log(`✓ Deleted ${resOrders.deletedCount} orders from MongoDB Order collection.`);

    const resSync = await SyncEvent.deleteMany({});
    console.log(`✓ Deleted ${resSync.deletedCount} sync events from SyncEvent collection.`);

    const resQueue = await QueueOrder.deleteMany({});
    console.log(`✓ Deleted ${resQueue.deletedCount} queue items from QueueOrder collection.`);

    console.log('✅ All online orders data wiped successfully from cloud database.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error wiping online orders:', err.message);
    process.exit(1);
  }
}

wipeOnlineOrders();
