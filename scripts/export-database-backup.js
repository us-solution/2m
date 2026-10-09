/**
 * export-database-backup.js
 * Script to create a full, recoverable JSON dump of the current 2M CAFE database.
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/database');

async function exportBackup() {
  console.log('🔄 Connecting to MongoDB to create recoverable backup...');
  await connectDB();
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  const backupData = {
    exportedAt: new Date().toISOString(),
    databaseName: mongoose.connection.name,
    collections: {}
  };

  for (const col of collections) {
    const name = col.name;
    const docs = await db.collection(name).find({}).toArray();
    backupData.collections[name] = docs;
    console.log(`📦 Exported collection: ${name} (${docs.length} documents)`);
  }

  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup_2m_cafe_${timestamp}.json`);
  const latestBackupFile = path.join(backupDir, `backup_2m_cafe_latest.json`);

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
  fs.writeFileSync(latestBackupFile, JSON.stringify(backupData, null, 2), 'utf8');

  console.log(`\n✅ Backup successfully saved to:\n  - ${backupFile}\n  - ${latestBackupFile}\n`);
  process.exit(0);
}

exportBackup().catch(err => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});
