const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Category = require('./Category');

const Drink = sequelize.define('Drink', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Category,
      key: 'id'
    }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name_ar: {
    type: DataTypes.STRING,
    allowNull: true
  },
  tagline: {
    type: DataTypes.STRING,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ingredients: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  preparation: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  price: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false
  },
  calories: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  serving_size: {
    type: DataTypes.STRING,
    allowNull: true
  },
  temperature: {
    type: DataTypes.STRING,
    defaultValue: 'hot'
  },
  image_emoji: {
    type: DataTypes.STRING,
    defaultValue: 'imgs/espresso.png'
  },
  is_featured: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_available: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
}, {
  tableName: 'drinks',
  timestamps: false
});

Drink.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
Category.hasMany(Drink, { foreignKey: 'categoryId', as: 'drinks' });

module.exports = Drink;
