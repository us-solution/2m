const express = require('express');
const router = express.Router();
const Pusher = require('pusher');
const GameRoom = require('../models/GameRoom');
require('dotenv').config();

// Initialize Pusher (gracefully fallback if dummy credentials are used)
let pusher = null;
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
    console.error('Failed to initialize Pusher: ', e.message);
  }
}

// Helper to broadcast events
const broadcastGameUpdate = async (roomCode, eventName, data) => {
  if (pusher) {
    try {
      await pusher.trigger(`room-${roomCode}`, eventName, data);
    } catch (e) {
      console.error(`Pusher trigger error in room ${roomCode}:`, e.message);
    }
  } else {
    console.log(`[Pusher Mock Broadcast] Channel: room-${roomCode}, Event: ${eventName}`);
  }
};

// Generate standard 52-card deck + 2 Jokers
const createDeck = () => {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  // Values: 1-13 (1=Ace, 11=Jack, 12=Queen, 13=King)
  const deck = [];

  // Add standard cards
  for (const suit of suits) {
    for (let val = 1; val <= 13; val++) {
      let points = val;
      // Special rules for Screw (اسكرو):
      // - Jack/Queen = 10 pts (swapping power)
      // - Red Kings (hearts/diamonds) = 0 pts
      // - Black Kings (clubs/spades) = 13 or 20 pts (the Screw card!)
      if (val === 11 || val === 12) points = 10;
      if (val === 13) {
        points = (suit === 'hearts' || suit === 'diamonds') ? 0 : 20;
      }
      
      deck.push({
        id: `${suit}-${val}`,
        suit,
        value: val,
        points,
        code: `${suit.charAt(0).toUpperCase()}${val}`
      });
    }
  }

  // Add 2 Jokers (-2 points)
  deck.push({ id: 'joker-1', suit: 'joker', value: 0, points: -2, code: 'JK1' });
  deck.push({ id: 'joker-2', suit: 'joker', value: 0, points: -2, code: 'JK2' });

  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
};

// 1. Create Room
router.post('/create', async (req, res) => {
  const { playerName } = req.body;
  if (!playerName) return res.status(400).json({ error: 'Player name is required' });

  // Generate a random 4-letter room code
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let roomCode = '';
  let roomExists = true;

  while (roomExists) {
    roomCode = '';
    for (let i = 0; i < 4; i++) {
      roomCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    roomExists = await GameRoom.findOne({ roomCode });
  }

  try {
    const players = [{
      name: playerName,
      cards: [],
      score: 0,
      isHost: true,
      isReady: true,
      knownCards: [false, false, false, false] // whether the player knows their card at index 0-3
    }];

    const room = await GameRoom.create({
      roomCode,
      players: JSON.stringify(players),
      status: 'lobby',
      turnIndex: 0,
      turnPhase: 'draw'
    });

    res.json({
      success: true,
      roomCode: room.roomCode,
      playerName,
      isHost: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Join Room
router.post('/join', async (req, res) => {
  const { roomCode, playerName } = req.body;
  if (!roomCode || !playerName) {
    return res.status(400).json({ error: 'Room code and player name are required' });
  }

  try {
    const room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status !== 'lobby') return res.status(400).json({ error: 'Game already in progress' });

    const players = JSON.parse(room.players);
    if (players.length >= 8) return res.status(400).json({ error: 'Room is full' });
    if (players.some(p => p.name === playerName)) {
      return res.status(409).json({ error: 'Player name already taken in this room' });
    }

    players.push({
      name: playerName,
      cards: [],
      score: 0,
      isHost: false,
      isReady: false,
      knownCards: [false, false, false, false]
    });

    room.players = JSON.stringify(players);
    await room.save();

    // Broadcast update to all players
    await broadcastGameUpdate(room.roomCode, 'player-joined', { players });

    res.json({
      success: true,
      roomCode: room.roomCode,
      playerName,
      isHost: false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Start Game
router.post('/start', async (req, res) => {
  const { roomCode, playerName } = req.body;

  try {
    const room = await GameRoom.findOne({ roomCode: roomCode.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const players = JSON.parse(room.players);
    const host = players.find(p => p.isHost);

    if (host.name !== playerName) {
      return res.status(403).json({ error: 'Only the host can start the game' });
    }

    if (players.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 players to start' });
    }

    // Initialize deck
    const deck = createDeck();

    // Deal 4 cards to each player
    for (const player of players) {
      player.cards = [deck.pop(), deck.pop(), deck.pop(), deck.pop()];
      // In Screw, players are allowed to look at 2 cards at start. Let's mark the first 2 as known.
      player.knownCards = [true, true, false, false];
    }

    // Place one card on discard pile
    const initialDiscard = deck.pop();

    room.players = JSON.stringify(players);
    room.drawPile = JSON.stringify(deck);
    room.discardPile = JSON.stringify([initialDiscard]);
    room.status = 'playing';
    room.turnIndex = 0;
    room.turnPhase = 'draw';
    room.drawnCard = null;
    room.screwCalledBy = null;
    room.roundsLeft = -1;

    await room.save();

    const gameState = {
      players: players.map(p => ({
        name: p.name,
        isHost: p.isHost,
        score: p.score,
        // Hide card details on start (except client-side knows their own first 2)
        cardCount: p.cards.length
      })),
      discardTop: initialDiscard,
      turnIndex: 0,
      turnPhase: 'draw',
      status: 'playing'
    };

    // Broadcast start
    await broadcastGameUpdate(room.roomCode, 'game-started', gameState);

    res.json({ success: true, message: 'Game started successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Retrieve Game Room State
router.get('/:roomCode', async (req, res) => {
  const { playerName } = req.query;

  try {
    const room = await GameRoom.findOne({ roomCode: req.params.roomCode.toUpperCase() });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const players = JSON.parse(room.players);
    const discard = JSON.parse(room.discardPile);
    const draw = JSON.parse(room.drawPile);

    // Hide other players' cards, only show if game is finished or for specific actions
    const sanitizedPlayers = players.map(p => {
      const isSelf = p.name === playerName;
      return {
        name: p.name,
        isHost: p.isHost,
        score: p.score,
        isReady: p.isReady,
        cardCount: p.cards.length,
        // Only return cards if it's the player themselves, or game is finished
        cards: (isSelf || room.status === 'finished') ? p.cards : null,
        knownCards: isSelf ? p.knownCards : null
      };
    });

    res.json({
      roomCode: room.roomCode,
      status: room.status,
      players: sanitizedPlayers,
      discardTop: discard.length > 0 ? discard[discard.length - 1] : null,
      discardCount: discard.length,
      drawCount: draw.length,
      turnIndex: room.turnIndex,
      turnPhase: room.turnPhase,
      drawnCard: room.drawnCard ? JSON.parse(room.drawnCard) : null,
      screwCalledBy: room.screwCalledBy,
      roundsLeft: room.roundsLeft
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Game Actions (Draw, Discard, Swap, Screw)
router.post('/:roomCode/action', async (req, res) => {
  const { playerName, actionType, targetIndex, swapIndex, targetPlayer } = req.body;
  const roomCode = req.params.roomCode.toUpperCase();

  try {
    const room = await GameRoom.findOne({ roomCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.status !== 'playing') return res.status(400).json({ error: 'Game is not in progress' });

    const players = JSON.parse(room.players);
    const activePlayer = players[room.turnIndex];

    if (activePlayer.name !== playerName) {
      return res.status(403).json({ error: 'It is not your turn' });
    }

    let drawPile = JSON.parse(room.drawPile);
    let discardPile = JSON.parse(room.discardPile);
    let drawnCard = room.drawnCard ? JSON.parse(room.drawnCard) : null;
    let logMessage = '';
    let cardReveal = '';

    if (actionType === 'draw-deck') {
      if (room.turnPhase !== 'draw') return res.status(400).json({ error: 'Invalid turn phase' });
      if (drawPile.length === 0) {
        // Reshuffle discard pile except top card
        const topDiscard = discardPile.pop();
        drawPile = discardPile;
        // Shuffle
        for (let i = drawPile.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [drawPile[i], drawPile[j]] = [drawPile[j], drawPile[i]];
        }
        discardPile = [topDiscard];
      }

      drawnCard = drawPile.pop();
      room.drawnCard = JSON.stringify(drawnCard);
      room.drawPile = JSON.stringify(drawPile);
      room.turnPhase = 'play';
      logMessage = `${playerName} drew a card from the deck`;
      
    } else if (actionType === 'draw-discard') {
      if (room.turnPhase !== 'draw') return res.status(400).json({ error: 'Invalid turn phase' });
      if (discardPile.length === 0) return res.status(400).json({ error: 'Discard pile is empty' });

      // Immediate swap with discard pile top card
      const chosenCard = discardPile.pop();
      const oldCard = activePlayer.cards[swapIndex];
      activePlayer.cards[swapIndex] = chosenCard;
      // Mark the swapped card as known to owner
      activePlayer.knownCards[swapIndex] = true;
      
      discardPile.push(oldCard);
      room.discardPile = JSON.stringify(discardPile);
      
      logMessage = `${playerName} swapped top discard card with their card #${swapIndex + 1}`;
      
      // Advance Turn
      advanceTurn(room, players);
      
    } else if (actionType === 'discard-drawn') {
      if (room.turnPhase !== 'play') return res.status(400).json({ error: 'Must draw card first' });
      if (!drawnCard) return res.status(400).json({ error: 'No drawn card' });

      discardPile.push(drawnCard);
      room.discardPile = JSON.stringify(discardPile);
      room.drawnCard = null;

      logMessage = `${playerName} discarded the drawn card (${drawnCard.code})`;

      // Check card power:
      // In Screw, if a card has a power, player can choose to execute it now or skip.
      // - 7 or 8: peek self card
      // - 9 or 10: peek other player card
      // - 11 or 12 (Jack/Queen): swap cards between two players
      const hasPower = [7, 8, 9, 10, 11, 12].includes(drawnCard.value);
      if (hasPower) {
        room.turnPhase = 'power';
        // Save power card value in database so we can validate next use-power request
        room.drawnCard = JSON.stringify(drawnCard); 
      } else {
        advanceTurn(room, players);
      }
      
    } else if (actionType === 'swap-drawn') {
      if (room.turnPhase !== 'play') return res.status(400).json({ error: 'Must draw card first' });
      if (!drawnCard) return res.status(400).json({ error: 'No drawn card' });

      const oldCard = activePlayer.cards[swapIndex];
      activePlayer.cards[swapIndex] = drawnCard;
      // Mark swapped card as known to owner
      activePlayer.knownCards[swapIndex] = true;

      discardPile.push(oldCard);
      room.discardPile = JSON.stringify(discardPile);
      room.drawnCard = null;

      logMessage = `${playerName} swapped drawn card with their card #${swapIndex + 1}`;

      advanceTurn(room, players);
      
    } else if (actionType === 'use-power') {
      if (room.turnPhase !== 'power' || !drawnCard) {
        return res.status(400).json({ error: 'No active card power to use' });
      }

      const val = drawnCard.value;

      if (val === 7 || val === 8) {
        // Peek at self card
        activePlayer.knownCards[targetIndex] = true;
        logMessage = `${playerName} peeked at their own card #${targetIndex + 1}`;
      } else if (val === 9 || val === 10) {
        // Peek other player card
        const otherUser = players.find(p => p.name === targetPlayer);
        if (otherUser && otherUser.cards && otherUser.cards[targetIndex]) {
          const peekedCard = otherUser.cards[targetIndex];
          const suitSymbolsShort = { 'hearts': '♥', 'diamonds': '♦', 'spades': '♠', 'clubs': '♣', 'joker': '🃏' };
          const sym = suitSymbolsShort[peekedCard.suit] || '';
          const label = peekedCard.value === 0 ? 'Joker' : (peekedCard.value === 1 ? 'A' : (peekedCard.value === 11 ? 'J' : (peekedCard.value === 12 ? 'Q' : (peekedCard.value === 13 ? 'K' : peekedCard.value))));
          cardReveal = `${label}${sym} (${peekedCard.points} pts)`;
        }
        logMessage = `${playerName} peeked at a card of ${targetPlayer}`;
      } else if (val === 11 || val === 12) {
        // Swap yours with another player's card
        const otherUser = players.find(p => p.name === targetPlayer);
        if (!otherUser) return res.status(404).json({ error: 'Target player not found' });

        const selfCard = activePlayer.cards[swapIndex];
        const otherCard = otherUser.cards[targetIndex];

        activePlayer.cards[swapIndex] = otherCard;
        otherUser.cards[targetIndex] = selfCard;

        // Swapping resets knowledge of the cards since they moved
        activePlayer.knownCards[swapIndex] = false;
        otherUser.knownCards[targetIndex] = false;

        logMessage = `${playerName} swapped their card #${swapIndex + 1} with ${targetPlayer}'s card #${targetIndex + 1}`;
      }

      room.drawnCard = null;
      advanceTurn(room, players);
      
    } else if (actionType === 'call-screw') {
      if (room.turnPhase !== 'draw') return res.status(400).json({ error: 'Can only call Screw at the start of your turn' });
      if (room.screwCalledBy) return res.status(400).json({ error: 'Screw has already been called' });

      room.screwCalledBy = playerName;
      room.roundsLeft = players.length - 1; // Everyone else gets one turn
      logMessage = `${playerName} CALLED SCREW (اسكرو)!`;

      advanceTurn(room, players);
    }

    room.players = JSON.stringify(players);
    await room.save();

    // Broadcast the update via Pusher
    const updatedState = {
      action: actionType,
      log: logMessage,
      turnIndex: room.turnIndex,
      turnPhase: room.turnPhase,
      screwCalledBy: room.screwCalledBy,
      roundsLeft: room.roundsLeft,
      discardTop: discardPile.length > 0 ? discardPile[discardPile.length - 1] : null,
      status: room.status,
      players: players.map(p => ({
        name: p.name,
        score: p.score,
        isHost: p.isHost,
        cardCount: p.cards.length
      }))
    };

    // If game ended, broadcast full reveal
    if (room.status === 'finished') {
      updatedState.players = players; // Reveal all cards!
    }

    await broadcastGameUpdate(room.roomCode, 'game-action', updatedState);

    res.json({ success: true, log: logMessage, cardReveal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to advance turns
function advanceTurn(room, players) {
  if (room.roundsLeft === 0) {
    // Game over! Calculate scores
    room.status = 'finished';
    calculateRoundScores(room, players);
  } else {
    if (room.roundsLeft > 0) {
      room.roundsLeft--;
      if (room.roundsLeft === 0) {
        room.status = 'finished';
        calculateRoundScores(room, players);
        return;
      }
    }
    
    room.turnIndex = (room.turnIndex + 1) % players.length;
    room.turnPhase = 'draw';
    room.drawnCard = null;
  }
}

// Calculate scores when round ends
function calculateRoundScores(room, players) {
  // Sum up card points for each player
  const roundScores = players.map(p => {
    const total = p.cards.reduce((sum, card) => sum + card.points, 0);
    return { name: p.name, total };
  });

  // Find minimum score
  let minScore = Infinity;
  roundScores.forEach(s => {
    if (s.total < minScore) minScore = s.total;
  });

  const callerName = room.screwCalledBy;
  const callerScore = roundScores.find(s => s.name === callerName)?.total;

  roundScores.forEach(s => {
    const playerObj = players.find(p => p.name === s.name);
    
    // Penalize the Screw caller if they do not have the absolute lowest score
    if (s.name === callerName) {
      const isSuccessful = s.total === minScore;
      if (isSuccessful) {
        // Caller gets 0 points for this round as a reward
        playerObj.score += 0;
      } else {
        // Caller penalty: gets 40 points + their actual score
        playerObj.score += (s.total + 40);
      }
    } else {
      playerObj.score += s.total;
    }
  });
}

module.exports = router;
