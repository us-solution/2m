// ===== مسار اللعبة - إدارة غرف لعبة UNO متعددة اللاعبين عبر Pusher (بث مباشر) =====
const express = require('express');
const router = express.Router();
const Pusher = require('pusher');
const GameRoom = require('../models/GameRoom');
require('dotenv').config();

let pusher = null;
// تهيئة Pusher للبث المباشر إذا كانت الإعدادات متوفرة
if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET) {
  try {
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER || 'eu',
      useTLS: true
    });
  } catch (e) {
    console.error('Failed to init Pusher:', e.message);
  }
}

// دالة البث لجميع اللاعبين في الغرفة
async function broadcast(roomCode, event, data) {
  if (pusher) {
    try { await pusher.trigger(`room-${roomCode}`, event, data); }
    catch (e) { console.error('Pusher error:', e.message); }
  }
}

const COLORS = ['red', 'yellow', 'green', 'blue'];
const COLOR_EMOJI = { red: '🔴', yellow: '🟡', green: '🟢', blue: '🔵', wild: '🃏' };

// إنشاء أوراق لعبة UNO
function createUnoDeck() {
  const deck = [];
  for (const c of COLORS) {
    deck.push({ color: c, value: 0, type: 'number' });
    for (let v = 1; v <= 9; v++) {
      deck.push({ color: c, value: v, type: 'number' });
      deck.push({ color: c, value: v, type: 'number' });
    }
    for (const a of ['skip', 'reverse', 'draw2']) {
      deck.push({ color: c, value: a, type: 'action' });
      deck.push({ color: c, value: a, type: 'action' });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild', type: 'wild' });
    deck.push({ color: 'wild', value: 'wild4', type: 'wild' });
  }
  // خلط الأوراق
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// حساب نقاط الورقة
function cardPoints(card) {
  if (card.type === 'number') return card.value || 10;
  if (['skip', 'reverse', 'draw2'].includes(card.value)) return 20;
  return 50;
}

// التحقق من إمكانية لعب الورقة
function canPlay(card, top) {
  if (!top) return true;
  if (card.color === 'wild') return true;
  if (card.color === top.color) return true;
  if (card.type === 'number' && top.type === 'number' && card.value === top.value) return true;
  if (card.type === 'action' && top.type === 'action' && card.value === top.value) return true;
  return false;
}

// حساب الفهرس التالي (باتجاه عقارب الساعة أو عكسه)
function nextIndex(players, current, direction) {
  return (current + direction + players.length) % players.length;
}

// إنشاء غرفة جديدة
router.post('/create', async (req, res) => {
  const { playerName } = req.body;
  if (!playerName) return res.status(400).json({ error: 'Name required' });
  // توليد كود غرفة عشوائي من 4 أحرف
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let roomCode = '', exists = true;
  while (exists) {
    roomCode = '';
    for (let i = 0; i < 4; i++) roomCode += chars[Math.floor(Math.random() * 26)];
    exists = await GameRoom.findOne({ roomCode });
  }
  try {
    const players = [{ name: playerName, cards: [], score: 0, isHost: true, saidUno: false }];
    await GameRoom.create({ roomCode, players: JSON.stringify(players), gameType: 'uno' });
    res.json({ success: true, roomCode, playerName, isHost: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الانضمام إلى غرفة موجودة
router.post('/join', async (req, res) => {
  const { roomCode, playerName } = req.body;
  if (!roomCode || !playerName) return res.status(400).json({ error: 'Room code and name required' });
  try {
    const room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status !== 'lobby') return res.status(400).json({ error: 'Game already started' });
    const players = JSON.parse(room.players);
    if (players.length >= 4) return res.status(400).json({ error: 'Room full (max 4)' });
    if (players.some(p => p.name === playerName)) return res.status(409).json({ error: 'Name taken' });
    players.push({ name: playerName, cards: [], score: 0, isHost: false, saidUno: false });
    room.players = JSON.stringify(players);
    await room.save();
    // إعلام اللاعبين بانضمام عضو جديد
    await broadcast(room.roomCode, 'player-joined', { players: players.map(p => ({ name: p.name, isHost: p.isHost })) });
    res.json({ success: true, roomCode: room.roomCode, playerName, isHost: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// بدء اللعبة (فقط المضيف يمكنه البدء)
router.post('/start', async (req, res) => {
  const { roomCode, playerName } = req.body;
  try {
    const room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const players = JSON.parse(room.players);
    const host = players.find(p => p.isHost);
    if (!host || host.name !== playerName) return res.status(403).json({ error: 'Only host can start' });
    if (players.length < 2) return res.status(400).json({ error: 'Need 2+ players' });

    // توزيع الأوراق (7 لكل لاعب)
    const deck = createUnoDeck();
    for (const p of players) {
      p.cards = [];
      for (let i = 0; i < 7; i++) p.cards.push(deck.pop());
    }
    // أول ورقة في الكومة (تتخطى الـ Wild)
    let firstDiscard = deck.pop();
    while (firstDiscard.color === 'wild') {
      deck.unshift(firstDiscard);
      firstDiscard = deck.pop();
    }

    room.players = JSON.stringify(players);
    room.drawPile = JSON.stringify(deck);
    room.discardPile = JSON.stringify([firstDiscard]);
    room.status = 'playing';
    room.turnIndex = 0;
    room.turnPhase = 'play';
    room.unoState = JSON.stringify({ direction: 1, currentColor: firstDiscard.color, pendingDraw: 0 });
    await room.save();

    await broadcast(room.roomCode, 'game-started', {
      players: players.map(p => ({ name: p.name, cardCount: p.cards.length })),
      topCard: firstDiscard
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب حالة الغرفة الحالية (لللاعبين)
router.get('/:roomCode', async (req, res) => {
  const { playerName } = req.query;
  try {
    const room = await GameRoom.findOne({ roomCode: req.params.roomCode.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const players = JSON.parse(room.players);
    const discard = JSON.parse(room.discardPile);
    const draw = JSON.parse(room.drawPile);
    const uno = JSON.parse(room.unoState || '{}');

    // إخفاء أوراق اللاعبين الآخرين
    const sanitized = players.map(p => ({
      name: p.name,
      isHost: p.isHost,
      score: p.score,
      cardCount: p.cards.length,
      cards: (p.name === playerName || room.status === 'finished') ? p.cards : null,
      saidUno: p.saidUno
    }));

    res.json({
      roomCode: room.roomCode,
      status: room.status,
      players: sanitized,
      topCard: discard.length > 0 ? discard[discard.length - 1] : null,
      discardCount: discard.length,
      drawCount: draw.length,
      turnIndex: room.turnIndex,
      turnPhase: room.turnPhase,
      currentColor: uno.currentColor || null,
      direction: uno.direction || 1,
      pendingDraw: uno.pendingDraw || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// لعب ورقة
router.post('/:roomCode/play', async (req, res) => {
  const { playerName, cardIndex, chosenColor } = req.body;
  const roomCode = req.params.roomCode.toUpperCase();
  try {
    const room = await GameRoom.findOne({ roomCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status !== 'playing') return res.status(400).json({ error: 'Game not in progress' });

    const players = JSON.parse(room.players);
    const active = players[room.turnIndex];
    if (active.name !== playerName) return res.status(403).json({ error: 'Not your turn' });
    if (cardIndex < 0 || cardIndex >= active.cards.length) return res.status(400).json({ error: 'Invalid card' });

    const card = active.cards[cardIndex];
    const discard = JSON.parse(room.discardPile);
    const top = discard[discard.length - 1];
    const uno = JSON.parse(room.unoState || '{}');

    // التحقق من إمكانية لعب الورقة
    if (!canPlay(card, top) && card.color !== uno.currentColor) {
      return res.status(400).json({ error: 'Cannot play that card' });
    }

    const chosen = (card.color === 'wild' && chosenColor) ? chosenColor : (card.color === 'wild' ? 'red' : card.color);

    // إزالة الورقة من يد اللاعب وإضافتها لكومة الطرح
    active.cards.splice(cardIndex, 1);
    discard.push({ ...card, chosenColor: card.color === 'wild' ? chosen : undefined });
    room.discardPile = JSON.stringify(discard);

    let nextIdx = nextIndex(players, room.turnIndex, uno.direction);
    let phase = 'play';

    // إذا نفذت أوراق اللاعب → انتهت اللعبة
    if (active.cards.length === 0) {
      room.status = 'finished';
      const total = players.reduce((sum, p) => sum + (p === active ? 0 : p.cards.reduce((s, c) => s + cardPoints(c), 0)), 0);
      active.score += total;
      room.players = JSON.stringify(players);
      await room.save();
      await broadcast(roomCode, 'game-over', {
        winner: active.name,
        players: players.map(p => ({ name: p.name, score: p.score, cards: p.cards }))
      });
      return res.json({ success: true, gameOver: true });
    }

    // تطبيق تأثيرات الأوراق الخاصة
    if (card.value === 'skip') {
      nextIdx = nextIndex(players, nextIndex(players, room.turnIndex, uno.direction), uno.direction);
    } else if (card.value === 'reverse') {
      uno.direction *= -1;
      if (players.length === 2) nextIdx = nextIndex(players, room.turnIndex, uno.direction);
    } else if (card.value === 'draw2') {
      const nextPlayer = players[nextIdx];
      const draw = JSON.parse(room.drawPile);
      for (let i = 0; i < 2; i++) { if (draw.length) nextPlayer.cards.push(draw.pop()); }
      room.drawPile = JSON.stringify(draw);
      nextIdx = nextIndex(players, nextIdx, uno.direction);
    } else if (card.value === 'wild4') {
      const nextPlayer = players[nextIdx];
      const draw = JSON.parse(room.drawPile);
      for (let i = 0; i < 4; i++) { if (draw.length) nextPlayer.cards.push(draw.pop()); }
      room.drawPile = JSON.stringify(draw);
      nextIdx = nextIndex(players, nextIdx, uno.direction);
    }

    uno.currentColor = chosen;
    room.turnIndex = nextIdx;
    room.turnPhase = 'play';

    // إعادة تعيين حالة UNO لكل اللاعبين
    players.forEach(p => p.saidUno = false);
    active.saidUno = true;

    room.players = JSON.stringify(players);
    room.unoState = JSON.stringify(uno);
    await room.save();

    await broadcast(roomCode, 'card-played', {
      player: playerName,
      card: { color: card.color, value: card.value },
      topCard: discard[discard.length - 1],
      turnIndex: nextIdx,
      currentColor: chosen,
      direction: uno.direction
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// سحب ورقة من الكومة
router.post('/:roomCode/draw', async (req, res) => {
  const { playerName } = req.body;
  const roomCode = req.params.roomCode.toUpperCase();
  try {
    const room = await GameRoom.findOne({ roomCode });
    if (!room || room.status !== 'playing') return res.status(400).json({ error: 'Invalid game' });
    const players = JSON.parse(room.players);
    const active = players[room.turnIndex];
    if (active.name !== playerName) return res.status(403).json({ error: 'Not your turn' });

    const draw = JSON.parse(room.drawPile);
    // إعادة خلط الكومة إذا نفدت
    if (draw.length === 0) {
      const discard = JSON.parse(room.discardPile);
      const top = discard.pop();
      for (const c of discard) draw.push(c);
      discard.length = 0;
      discard.push(top);
      for (let i = draw.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [draw[i], draw[j]] = [draw[j], draw[i]];
      }
    }

    const drawnCard = draw.pop();
    active.cards.push(drawnCard);
    room.drawPile = JSON.stringify(draw);
    room.players = JSON.stringify(players);
    await room.save();

    await broadcast(roomCode, 'card-drawn', { player: playerName });

    res.json({ success: true, card: drawnCard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تخطي الدور
router.post('/:roomCode/pass', async (req, res) => {
  const { playerName } = req.body;
  const roomCode = req.params.roomCode.toUpperCase();
  try {
    const room = await GameRoom.findOne({ roomCode });
    if (!room || room.status !== 'playing') return res.status(400).json({ error: 'Invalid game' });
    const players = JSON.parse(room.players);
    const active = players[room.turnIndex];
    if (active.name !== playerName) return res.status(403).json({ error: 'Not your turn' });
    if (room.turnPhase !== 'play') return res.status(400).json({ error: 'Cannot pass now' });

    const uno = JSON.parse(room.unoState || '{}');
    const nextIdx = nextIndex(players, room.turnIndex, uno.direction);
    room.turnIndex = nextIdx;
    room.turnPhase = 'play';
    players.forEach(p => p.saidUno = false);
    room.players = JSON.stringify(players);
    room.unoState = JSON.stringify(uno);
    await room.save();

    await broadcast(roomCode, 'turn-passed', { player: playerName, turnIndex: nextIdx });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// قول UNO
router.post('/:roomCode/say-uno', async (req, res) => {
  const { playerName } = req.body;
  const roomCode = req.params.roomCode.toUpperCase();
  try {
    const room = await GameRoom.findOne({ roomCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const players = JSON.parse(room.players);
    const p = players.find(p => p.name === playerName);
    if (p) p.saidUno = true;
    room.players = JSON.stringify(players);
    await room.save();
    await broadcast(roomCode, 'said-uno', { player: playerName });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
