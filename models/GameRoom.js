const mongoose = require('mongoose');

const gameRoomSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    unique: true,
    required: true,
    maxlength: 10
  },
  players: {
    type: String, // JSON string: [{ name, cards, score, isReady, isHost, knownCards }]
    default: '[]'
  },
  drawPile: {
    type: String, // JSON string: [cards...]
    default: '[]'
  },
  discardPile: {
    type: String, // JSON string: [cards...]
    default: '[]'
  },
  status: {
    type: String,
    default: 'lobby' // lobby, playing, finished
  },
  turnIndex: {
    type: Number,
    default: 0
  },
  turnPhase: {
    type: String,
    default: 'draw' // draw, play, discard
  },
  drawnCard: {
    type: String, // Store the card currently drawn by the active player
    default: null
  },
  screwCalledBy: {
    type: String, // Name of the player who called screw
    default: null
  },
  roundsLeft: {
    type: Number,
    default: -1
  }
}, {
  timestamps: true,
  collection: 'game_rooms'
});

module.exports = mongoose.models.GameRoom || mongoose.model('GameRoom', gameRoomSchema);
