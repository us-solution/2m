// ===== نموذج GameRoom - يمثل غرف الألعاب (UNO) =====
const mongoose = require('mongoose');

const gameRoomSchema = new mongoose.Schema({
  // رمز الغرفة الفريد
  roomCode: {
    type: String,
    unique: true,
    required: true,
    maxlength: 10
  },
  // نوع اللعبة
  gameType: {
    type: String,
    default: 'uno'
  },
  // قائمة اللاعبين (JSON)
  players: {
    type: String,
    default: '[]'
  },
  // أوراق السحب (JSON)
  drawPile: {
    type: String,
    default: '[]'
  },
  // أوراق الطرح (JSON)
  discardPile: {
    type: String,
    default: '[]'
  },
  // حالة الغرفة (lobby, playing, finished)
  status: {
    type: String,
    default: 'lobby'
  },
  // مؤشر دور اللاعب الحالي
  turnIndex: {
    type: Number,
    default: 0
  },
  // مرحلة الدور
  turnPhase: {
    type: String,
    default: 'play'
  },
  // حالة لعبة UNO (JSON)
  unoState: {
    type: String,
    default: '{}'
  }
}, {
  timestamps: true,
  collection: 'game_rooms'
});

module.exports = mongoose.models.GameRoom || mongoose.model('GameRoom', gameRoomSchema);
