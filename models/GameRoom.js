const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GameRoom = sequelize.define('GameRoom', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  roomCode: {
    type: DataTypes.STRING(10),
    unique: true,
    allowNull: false
  },
  players: {
    type: DataTypes.TEXT, // JSON string: [{ id, name, cards: [number/object], score, isReady }]
    defaultValue: '[]'
  },
  drawPile: {
    type: DataTypes.TEXT, // JSON string: [cards...]
    defaultValue: '[]'
  },
  discardPile: {
    type: DataTypes.TEXT, // JSON string: [cards...]
    defaultValue: '[]'
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'lobby' // lobby, playing, finished
  },
  turnIndex: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  turnPhase: {
    type: DataTypes.STRING,
    defaultValue: 'draw' // draw, play, discard
  },
  drawnCard: {
    type: DataTypes.STRING, // Store the card currently drawn by the active player
    allowNull: true
  },
  screwCalledBy: {
    type: DataTypes.STRING, // Name of the player who called screw
    allowNull: true
  },
  roundsLeft: {
    type: DataTypes.INTEGER,
    defaultValue: -1
  }
}, {
  tableName: 'game_rooms',
  timestamps: true
});

module.exports = GameRoom;
