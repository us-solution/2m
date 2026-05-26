const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Order = require('./Order');

const PointsLog = sequelize.define('PointsLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  points: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Order,
      key: 'id'
    }
  }
}, {
  tableName: 'points_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

PointsLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
PointsLog.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

module.exports = PointsLog;
