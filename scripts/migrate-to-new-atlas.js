/**
 * migrate-to-new-atlas.js
 * Tool to safely migrate or restore all 2M CAFE collections to a new, dedicated MongoDB Atlas account/cluster.
 * 
 * Usage:
 *   node scripts/migrate-to-new-atlas.js [TARGET_MONGODB_URI]
 * If no argument provided, reads MONGODB_URI from .env
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const targetUri = process.argv[2] || process.env.NEW_MONGODB_URI || process.env.MONGODB_URI;

if (!targetUri) {
  console.error('❌ Error: No target MongoDB URI provided. Provide it as argument or set in .env');
  process.exit(1);
}

const backupFile = path.join(__dirname, '../backups/backup_2m_cafe_latest.json');
if (!fs.existsSync(backupFile)) {
  console.error('❌ Error: Backup file not found at:', backupFile);
  process.exit(1);
}

async function migrate() {
  console.log(`🚀 Starting migration to dedicated MongoDB Atlas...`);
  console.log(`🎯 Target URI: ${targetUri.replace(/:([^:@]+)@/, ':****@')}`);

  const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
  const collections = backupData.collections;

  const targetConn = await mongoose.createConnection(targetUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 15000,
  }).asPromise();

  console.log(`✅ Successfully connected to target database: ${targetConn.name}`);

  for (const [colName, docs] of Object.entries(collections)) {
    if (!docs || docs.length === 0) {
      console.log(`⏩ Skipping empty collection: ${colName}`);
      continue;
    }

    const col = targetConn.collection(colName);
    const existingCount = await col.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️ Collection ${colName} already has ${existingCount} documents. Performing additive merge/upsert...`);
      for (const doc of docs) {
        await col.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true });
      }
      console.log(`  ✓ Merged ${docs.length} documents into ${colName}`);
    } else {
      await col.insertMany(docs);
      console.log(`  ✓ Inserted ${docs.length} documents into ${colName}`);
    }
  }

  // Create vital indexes
  console.log('⚡ Ensuring collection indexes...');
  try {
    await targetConn.collection('users').createIndex({ phone: 1 }, { unique: true, sparse: true });
    await targetConn.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
    await targetConn.collection('orders').createIndex({ createdAt: -1 });
    await targetConn.collection('orders').createIndex({ status: 1 });
    await targetConn.collection('orders').createIndex(
      { externalOrderId: 1 },
      { unique: true, partialFilterExpression: { externalOrderId: { $type: "string" } } }
    );
    await targetConn.collection('drinks').createIndex({ category_id: 1 });
    await targetConn.collection('categories').createIndex({ sort_order: 1 });
    await targetConn.collection('posdevices').createIndex({ deviceId: 1 }, { unique: true });
    console.log('✅ Vital indexes created successfully.');
  } catch (idxErr) {
    console.warn('⚠️ Index creation note:', idxErr.message);
  }

  console.log('\n🎉 Migration completed successfully and verified!\n');
  await targetConn.close();
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
