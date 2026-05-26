const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: User,
      key: 'id'
    }
  },
  table_number: {
    type: DataTypes.STRING,
    allowNull: false
  },
  items: {
    type: DataTypes.TEXT, // Will store a JSON stringified array of items
    allowNull: false
  },
  total_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  points_earned: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending' // pending, ready, served, cancelled, confirmed
  },
  notes: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  cashierId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: User,
      key: 'id'
    }
  },
  qrCodeToken: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  isQrConfirmed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'orders',
  timestamps: true
});

Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Order.belongsTo(User, { foreignKey: 'cashierId', as: 'cashier' });
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });

module.exports = Order;
