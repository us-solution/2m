const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Drink = require('./Drink');

const Offer = sequelize.define('Offer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  drinkId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Drink,
      key: 'id'
    }
  },
  discount_percent: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'offers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

Offer.belongsTo(Drink, { foreignKey: 'drinkId', as: 'drink' });

module.exports = Offer;
