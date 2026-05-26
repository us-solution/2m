const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

const dialect = process.env.DB_DIALECT || 'sqlite';

let sequelize;

if (dialect === 'mysql') {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      dialect: 'mysql',
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );
} else {
  // SQLite
  const storagePath = process.env.DB_STORAGE 
    ? path.resolve(__dirname, '..', process.env.DB_STORAGE)
    : path.resolve(__dirname, '..', 'db.sqlite3');
    
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging: false
  });
}

module.exports = sequelize;
