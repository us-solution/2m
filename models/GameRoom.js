const mongoose = require('mongoose');

const gameRoomSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    unique: true,
    required: true,
    maxlength: 10
  },
  gameType: {
    type: String,
    default: 'uno'
  },
  players: {
    type: String,
    default: '[]'
  },
  drawPile: {
    type: String,
    default: '[]'
  },
  discardPile: {
    type: String,
    default: '[]'
  },
  status: {
    type: String,
    default: 'lobby'
  },
  turnIndex: {
    type: Number,
    default: 0
  },
  turnPhase: {
    type: String,
    default: 'play'
  },
  unoState: {
    type: String,
    default: '{}'
  }
}, {
  timestamps: true,
  collection: 'game_rooms'
});

module.exports = mongoose.models.GameRoom || mongoose.model('GameRoom', gameRoomSchema);
