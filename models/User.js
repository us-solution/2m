const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: 'customer' // customer, cashier, admin
  },
  points: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_spent: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  subscriptionTier: {
    type: DataTypes.STRING,
    defaultValue: 'none' // none, bronze, silver, gold, student
  }
}, {
  tableName: 'users',
  timestamps: true
});

module.exports = User;
