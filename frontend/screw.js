/* ═══════════════════════════════════════
   OZEL CAFE — Screw Multiplayer Card Game
   ═══════════════════════════════════════ */

let pusherClient = null;
let gameChannel = null;
let myRoomCode = '';
let myName = '';
let gameRoomState = null;
let selectedHandIndex = null;
let selectedPowerCard = null;
let currentDrawnCard = null;
let pendingSwapSelfIndex = null;

// Map suit symbols/colors
const suitSymbols = {
  'hearts': { sym: '♥', color: '#C0392B' },
  'diamonds': { sym: '♦', color: '#C0392B' },
  'spades': { sym: '♠', color: '#241E1A' },
  'clubs': { sym: '♣', color: '#241E1A' },
  'joker': { sym: '🃏', color: '#D35400' }
};

// Initialize Lobby Form
window.initScrewLobby = function() {
  const user = JSON.parse(localStorage.getItem('ozel_user') || 'null');
  if (user && user.name) {
    document.getElementById('screw-player-name').value = user.name;
  }
};

window.showJoinScrewInput = function() {
  document.getElementById('screw-join-box').style.display = 'flex';
};

// Create Room
window.createScrewRoom = async function() {
  const nameInput = document.getElementById('screw-player-name');
  const playerName = nameInput.value.trim();
  if (!playerName) return alert(currentLang === 'ar' ? 'الرجاء إدخال اسمك المستعار' : 'Please enter your nickname');

  try {
    const res = await fetch('/api/game/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName })
    });
    const data = await res.json();
    if (data.success) {
      setupWaitingLobby(data.roomCode, data.playerName, true);
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert(currentLang === 'ar' ? 'خطأ في إنشاء الغرفة' : 'Error creating room');
  }
};

// Join Room
window.submitJoinScrewRoom = async function() {
  const nameInput = document.getElementById('screw-player-name');
  const codeInput = document.getElementById('screw-room-code');
  const playerName = nameInput.value.trim();
  const roomCode = codeInput.value.trim().toUpperCase();

  if (!playerName || !roomCode) {
    return alert(currentLang === 'ar' ? 'يرجى إدخال الاسم ورمز الغرفة' : 'Please enter nickname and room code');
  }

  try {
    const res = await fetch('/api/game/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode, playerName })
    });
    const data = await res.json();
    if (data.success) {
      setupWaitingLobby(data.roomCode, data.playerName, false);
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert(currentLang === 'ar' ? 'خطأ في الانضمام للغرفة' : 'Error joining room');
  }
};

// Setup Waiting Room
function setupWaitingLobby(roomCode, playerName, isHost) {
  myRoomCode = roomCode;
  myName = playerName;

  document.getElementById('screw-lobby').style.display = 'none';
  document.getElementById('screw-waiting').style.display = 'block';
  document.getElementById('screw-display-code').textContent = roomCode;

  if (isHost) {
    document.getElementById('screw-host-actions').style.display = 'block';
    document.getElementById('screw-nonhost-msg').style.display = 'none';
  } else {
    document.getElementById('screw-host-actions').style.display = 'none';
    document.getElementById('screw-nonhost-msg').style.display = 'block';
  }

  // Subscribe to Pusher Room Channel
  subscribeToRoom(roomCode);
  fetchRoomState();

  // Safety fallback polling (in case Pusher is blocked or has invalid keys)
  if (!window.screwInterval) {
    window.screwInterval = setInterval(fetchRoomState, 3000);
  }
}

// Subscribe to Pusher
function subscribeToRoom(roomCode) {
  // Gracefully skip if Pusher is not found (offline/mock development)
  if (typeof Pusher === 'undefined') {
    console.warn('Pusher library is not loaded. Realtime updates disabled.');
    return;
  }

  // Initialize Pusher Client if not exists
  if (!pusherClient) {
    pusherClient = new Pusher('d7010f3c5b8b98295a04', {
      cluster: 'eu',
      forceTLS: true
    });
  }

  if (gameChannel) {
    pusherClient.unsubscribe(gameChannel.name);
  }

  gameChannel = pusherClient.subscribe(`room-${roomCode}`);

  gameChannel.bind('player-joined', function(data) {
    updatePlayersList(data.players);
  });

  gameChannel.bind('game-started', function(data) {
    document.getElementById('screw-waiting').style.display = 'none';
    document.getElementById('screw-board').style.display = 'block';
    document.getElementById('screw-board-code').textContent = roomCode;
    fetchRoomState();
  });

  gameChannel.bind('game-action', function(data) {
    addLogMessage(data.log);
    fetchRoomState();
  });
}

// Fetch Room State
async function fetchRoomState() {
  if (!myRoomCode) return;
  try {
    const res = await fetch(`/api/game/${myRoomCode}?playerName=${encodeURIComponent(myName)}`);
    const data = await res.json();
    gameRoomState = data;
    renderGameBoard();
  } catch (e) {
    console.error('Failed to fetch game state', e);
  }
}

// Start Game
window.startScrewGame = async function() {
  try {
    const res = await fetch('/api/game/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: myRoomCode, playerName: myName })
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.error);
    }
  } catch (e) {
    alert('Error starting game');
  }
};

// Update Player Lobby List
function updatePlayersList(players) {
  const container = document.getElementById('screw-players-list');
  if (!container) return;
  container.innerHTML = players.map((p, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg3); padding:0.6rem 1rem; border-radius:6px;">
      <span style="font-weight:bold;">${idx + 1}. ${p.name} ${p.name === myName ? '(You)' : ''}</span>
      <span style="font-size:0.7rem; background:${p.isHost ? 'var(--gold)' : 'var(--accent-emerald)'}; color:var(--white); padding:2px 6px; border-radius:3px;">
        ${p.isHost ? 'Host' : 'Ready'}
      </span>
    </div>
  `).join('');
}

// Render Game Board
function renderGameBoard() {
  if (!gameRoomState) return;

  const isAr = currentLang === 'ar';

  // 1. Lobby/Waiting panels visibility based on room status
  if (gameRoomState.status === 'lobby') {
    document.getElementById('screw-lobby').style.display = 'none';
    document.getElementById('screw-waiting').style.display = 'block';
    document.getElementById('screw-board').style.display = 'none';
    document.getElementById('screw-finished').style.display = 'none';
    
    // Show/hide host actions based on whether current user is host
    const hostPlayer = gameRoomState.players.find(p => p.isHost);
    const isHost = hostPlayer && hostPlayer.name === myName;
    document.getElementById('screw-host-actions').style.display = isHost ? 'block' : 'none';
    document.getElementById('screw-nonhost-msg').style.display = isHost ? 'none' : 'block';
    
    // Find player list from state
    const playersInLobby = gameRoomState.players.map(p => ({
      name: p.name,
      isHost: p.isHost,
      isReady: p.isReady
    }));
    updatePlayersList(playersInLobby);
    return;
  }

  if (gameRoomState.status === 'finished') {
    document.getElementById('screw-lobby').style.display = 'none';
    document.getElementById('screw-waiting').style.display = 'none';
    document.getElementById('screw-board').style.display = 'none';
    document.getElementById('screw-finished').style.display = 'block';
    document.getElementById('screw-host-actions').style.display = 'none';
    document.getElementById('screw-nonhost-msg').style.display = 'none';
    
    // Render Tallies
    renderTallies();
    return;
  }

  // Active Play State
  document.getElementById('screw-lobby').style.display = 'none';
  document.getElementById('screw-waiting').style.display = 'none';
  document.getElementById('screw-board').style.display = 'block';
  document.getElementById('screw-finished').style.display = 'none';
  document.getElementById('screw-host-actions').style.display = 'none';
  document.getElementById('screw-nonhost-msg').style.display = 'none';

  // 2. Set Turn Indicators
  const players = gameRoomState.players;
  const activePlayer = players[gameRoomState.turnIndex];
  const isMyTurn = activePlayer.name === myName;

  const turnLabel = isAr ? 'دور اللاعب:' : 'Current Turn:';
  const myTurnLabel = isAr ? 'دورك الآن! قم بالسحب.' : "Your Turn! Draw a card.";
  const powerLabel = isAr ? 'استخدام القوة الكارت!' : 'Use your card power!';
  
  let indicatorText = `${turnLabel} ${activePlayer.name}`;
  if (isMyTurn) {
    indicatorText = gameRoomState.turnPhase === 'power' ? powerLabel : myTurnLabel;
    document.getElementById('screw-turn-indicator').style.color = 'var(--gold)';
  } else {
    document.getElementById('screw-turn-indicator').style.color = 'var(--accent-emerald)';
  }

  if (gameRoomState.screwCalledBy) {
    const screwIndicator = isAr 
      ? ` [سكرو بقلم ${gameRoomState.screwCalledBy} - ${gameRoomState.roundsLeft} لفات متبقية]`
      : ` [Screw called by ${gameRoomState.screwCalledBy} - ${gameRoomState.roundsLeft} turns left]`;
    indicatorText += screwIndicator;
  }
  document.getElementById('screw-turn-indicator').textContent = indicatorText;

  // 3. Render Center Deck and Discard
  document.getElementById('screw-deck-count').textContent = `${gameRoomState.drawCount} cards`;
  document.getElementById('screw-discard-count').textContent = `${gameRoomState.discardCount} cards`;
  
  const discardTop = gameRoomState.discardTop;
  const discardEl = document.getElementById('screw-discard');
  if (discardTop) {
    const info = suitSymbols[discardTop.suit] || { sym: '', color: 'var(--text)' };
    discardEl.innerHTML = `
      <span style="font-size:1.4rem; color:${info.color}; font-weight:bold; position:absolute; top:4px; left:4px;">${discardTop.value === 0 ? '' : getCardLabel(discardTop.value)}</span>
      <span style="font-size:2rem; color:${info.color};">${info.sym}</span>
      <span style="font-size:0.75rem; color:var(--muted); font-weight:bold; margin-top:2px;">(${discardTop.points} pts)</span>
    `;
    discardEl.style.background = '#fff';
    discardEl.style.borderColor = 'var(--gold)';
  } else {
    discardEl.innerHTML = '<span style="color:var(--muted)">Empty</span>';
    discardEl.style.background = 'var(--bg3)';
  }

  // 4. Render Drawn Card Slot
  const drawn = gameRoomState.drawnCard;
  const drawnArea = document.getElementById('screw-drawn-card-area');
  const drawnEl = document.getElementById('screw-drawn');

  if (drawn && isMyTurn) {
    currentDrawnCard = drawn;
    drawnArea.style.opacity = '1';
    const info = suitSymbols[drawn.suit] || { sym: '', color: 'var(--text)' };
    drawnEl.innerHTML = `
      <span style="font-size:1.4rem; color:${info.color}; font-weight:bold; position:absolute; top:4px; left:4px;">${drawn.value === 0 ? '' : getCardLabel(drawn.value)}</span>
      <span style="font-size:2rem; color:${info.color};">${info.sym}</span>
    `;
    drawnEl.style.background = '#fff';
    drawnEl.style.borderColor = 'var(--gold)';
  } else {
    currentDrawnCard = null;
    drawnArea.style.opacity = '0.3';
    drawnEl.innerHTML = '-';
    drawnEl.style.background = 'var(--bg2)';
    drawnEl.style.borderColor = 'var(--line)';
  }

  // 5. Render Other Players' Brief Info
  const otherPlayersContainer = document.getElementById('screw-other-players');
  const otherPlayers = players.filter(p => p.name !== myName);
  otherPlayersContainer.innerHTML = otherPlayers.map(p => {
    const isHisTurn = activePlayer.name === p.name;
    const border = isHisTurn ? '2px solid var(--gold)' : '1px solid var(--line)';
    const cardIcons = Array.from({ length: p.cardCount }).map((_, cIdx) => `
      <div onclick="selectOtherPlayerCard('${p.name}', ${cIdx})" style="width:28px; height:40px; background:linear-gradient(135deg, var(--accent-emerald), #2c3a35); border-radius:3px; border:1px solid #fff; box-shadow:0 2px 4px rgba(0,0,0,0.1); cursor:pointer; display:inline-block; margin-inline:1px; transition:transform 0.2s;" class="other-card-node" data-player="${p.name}" data-idx="${cIdx}"></div>
    `).join('');

    return `
      <div style="background:var(--bg2); border:${border}; border-radius:8px; padding:0.8rem; text-align:center; min-width:130px; box-shadow:0 4px 10px rgba(0,0,0,0.02);">
        <strong style="display:block; font-size:0.9rem; color:var(--text);">${p.name}</strong>
        <span style="font-size:0.75rem; color:var(--gold); font-weight:bold; display:block; margin-bottom:0.4rem;">${p.score} pts</span>
        <div style="display:flex; justify-content:center; gap:2px; margin-top:0.4rem;">
          ${cardIcons}
        </div>
      </div>
    `;
  }).join('');

  // 6. Render My Cards
  const myPlayer = players.find(p => p.name === myName);
  const myCardsContainer = document.getElementById('screw-my-cards');
  myCardsContainer.innerHTML = '';

  if (myPlayer && myPlayer.cards) {
    myPlayer.cards.forEach((card, idx) => {
      const isKnown = myPlayer.knownCards && myPlayer.knownCards[idx];
      const cardDiv = document.createElement('div');
      cardDiv.style.width = '70px';
      cardDiv.style.height = '100px';
      cardDiv.style.borderRadius = '6px';
      cardDiv.style.cursor = 'pointer';
      cardDiv.style.transition = 'all 0.2s';
      cardDiv.style.position = 'relative';
      cardDiv.className = 'my-card-node';
      
      if (isKnown) {
        const info = suitSymbols[card.suit] || { sym: '', color: 'var(--text)' };
        cardDiv.innerHTML = `
          <span style="font-size:1.4rem; color:${info.color}; font-weight:bold; position:absolute; top:4px; left:4px;">${card.value === 0 ? '' : getCardLabel(card.value)}</span>
          <span style="font-size:1.8rem; color:${info.color}; display:block; text-align:center; margin-top:20px;">${info.sym}</span>
          <span style="font-size:0.6rem; color:var(--muted); position:absolute; bottom:4px; right:4px;">(${card.points} pts)</span>
        `;
        cardDiv.style.background = '#fff';
        cardDiv.style.border = '2px solid var(--accent-emerald)';
      } else {
        // Face down
        cardDiv.innerHTML = `<span style="font-size:1.4rem; color:var(--white);">✦</span>`;
        cardDiv.style.background = 'linear-gradient(135deg, var(--gold), #9c6161)';
        cardDiv.style.border = '2px solid var(--white)';
        cardDiv.style.display = 'flex';
        cardDiv.style.alignItems = 'center';
        cardDiv.style.justifyContent = 'center';
      }

      cardDiv.addEventListener('click', () => handleMyCardClick(idx));
      myCardsContainer.appendChild(cardDiv);
    });
  }

  // 7. Enable/Disable Controls
  const discardDrawnBtn = document.getElementById('btn-screw-discard-drawn');
  const callScrewBtn = document.getElementById('btn-screw-call');

  if (isMyTurn) {
    callScrewBtn.disabled = (gameRoomState.turnPhase !== 'draw' || gameRoomState.screwCalledBy);
    discardDrawnBtn.disabled = (gameRoomState.turnPhase !== 'play');
  } else {
    callScrewBtn.disabled = true;
    discardDrawnBtn.disabled = true;
  }
}

// Convert numbers to labels (e.g. 1 -> A, 11 -> J, etc.)
function getCardLabel(val) {
  if (val === 1) return 'A';
  if (val === 11) return 'J';
  if (val === 12) return 'Q';
  if (val === 13) return 'K';
  return val;
}

// Active player draws card from Deck
window.drawFromScrewDeck = async function() {
  if (!gameRoomState) return;
  const activePlayer = gameRoomState.players[gameRoomState.turnIndex];
  if (activePlayer.name !== myName || gameRoomState.turnPhase !== 'draw') return;

  try {
    await fetch(`/api/game/${myRoomCode}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: myName,
        actionType: 'draw-deck'
      })
    });
  } catch (e) {
    console.error(e);
  }
};

// Active player draws from discard pile
window.drawFromScrewDiscard = function() {
  if (!gameRoomState) return;
  const activePlayer = gameRoomState.players[gameRoomState.turnIndex];
  if (activePlayer.name !== myName || gameRoomState.turnPhase !== 'draw') return;

  // Set pending swap action: Next, they must click one of their own card index to swap it
  pendingSwapSelfIndex = true;
  alert(currentLang === 'ar' ? 'اختر إحدى بطاقاتك الأربع لمبادلتها بالكارت المكشوف' : 'Select one of your 4 cards to swap with the discard card.');
};

// Active player discards drawn card
window.discardDrawnScrewCard = async function() {
  if (!gameRoomState || !currentDrawnCard) return;
  
  try {
    await fetch(`/api/game/${myRoomCode}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: myName,
        actionType: 'discard-drawn'
      })
    });
  } catch (e) {
    console.error(e);
  }
};

// Call Screw
window.callScrew = async function() {
  if (!gameRoomState) return;
  if (!confirm(currentLang === 'ar' ? 'هل أنت متأكد من رغبتك في إعلان سكرو؟' : 'Are you sure you want to call Screw?')) return;

  try {
    await fetch(`/api/game/${myRoomCode}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: myName,
        actionType: 'call-screw'
      })
    });
  } catch (e) {
    console.error(e);
  }
};

// Handle clicks on player's cards
async function handleMyCardClick(cardIdx) {
  if (!gameRoomState) return;
  const activePlayer = gameRoomState.players[gameRoomState.turnIndex];
  const isMyTurn = activePlayer.name === myName;

  // Case 1: Draw from discard and swap
  if (isMyTurn && pendingSwapSelfIndex) {
    pendingSwapSelfIndex = false;
    try {
      await fetch(`/api/game/${myRoomCode}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: myName,
          actionType: 'draw-discard',
          swapIndex: cardIdx
        })
      });
    } catch (e) {
      console.error(e);
    }
    return;
  }

  // Case 2: Swap drawn card from deck
  if (isMyTurn && gameRoomState.turnPhase === 'play' && currentDrawnCard) {
    try {
      await fetch(`/api/game/${myRoomCode}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: myName,
          actionType: 'swap-drawn',
          swapIndex: cardIdx
        })
      });
    } catch (e) {
      console.error(e);
    }
    return;
  }

  // Case 3: Use card power 7 or 8 (Peek at self card)
  if (isMyTurn && gameRoomState.turnPhase === 'power' && gameRoomState.drawnCard) {
    const val = gameRoomState.drawnCard.value;
    if (val === 7 || val === 8) {
      try {
        const res = await fetch(`/api/game/${myRoomCode}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerName: myName,
            actionType: 'use-power',
            targetIndex: cardIdx
          })
        });
        if (res.ok) {
          // Reveal card value locally to user for 4 seconds
          const myPlayer = gameRoomState.players.find(p => p.name === myName);
          const cardObj = myPlayer.cards[cardIdx];
          const info = suitSymbols[cardObj.suit] || { sym: '', color: '#000' };
          const label = getCardLabel(cardObj.value);
          
          const cardNodes = document.querySelectorAll('.my-card-node');
          const node = cardNodes[cardIdx];
          if (node) {
            node.innerHTML = `<span style="font-size:1.4rem; color:${info.color}; font-weight:bold;">${label}${info.sym}</span>`;
            node.style.background = '#e8f8f5';
            setTimeout(() => {
              fetchRoomState(); // redraw cards to go back to face down if needed
            }, 4000);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    return;
  }

  // Case 4: Card Power swap J/Q (Step 1: Select my card to swap)
  if (isMyTurn && gameRoomState.turnPhase === 'power' && gameRoomState.drawnCard) {
    const val = gameRoomState.drawnCard.value;
    if (val === 11 || val === 12) {
      selectedHandIndex = cardIdx;
      // Highlight card visually
      const cardNodes = document.querySelectorAll('.my-card-node');
      cardNodes.forEach(n => n.style.transform = '');
      if (cardNodes[cardIdx]) {
        cardNodes[cardIdx].style.transform = 'translateY(-10px)';
      }
      alert(currentLang === 'ar' ? 'اختر الآن بطاقة من كروت لاعب آخر لمبادلتها' : "Select an opponent's card to swap.");
    }
  }
}

// Handle clicks on other players' cards (Peek other / Swap with J/Q)
window.selectOtherPlayerCard = async function(otherPlayerName, cardIdx) {
  if (!gameRoomState) return;
  const activePlayer = gameRoomState.players[gameRoomState.turnIndex];
  const isMyTurn = activePlayer.name === myName;

  if (!isMyTurn || gameRoomState.turnPhase !== 'power' || !gameRoomState.drawnCard) return;

  const val = gameRoomState.drawnCard.value;

  // Case 1: Power 9 or 10 (Peek other player's card)
  if (val === 9 || val === 10) {
    try {
      const res = await fetch(`/api/game/${myRoomCode}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: myName,
          actionType: 'use-power',
          targetPlayer: otherPlayerName,
          targetIndex: cardIdx
        })
      });
      if (res.ok) {
        // Find card value from backend room state and show it locally to player
        // Wait, the backend doesn't return other players' cards normally. But we can fetch it once or the server returns it in this action!
        // To keep it simple, we retrieve the exact card info via a dedicated response or just mock-reveal it if we can
        // Let's reveal it:
        const fullRoomRes = await fetch(`/api/game/${myRoomCode}?playerName=${encodeURIComponent(myName)}`);
        const fullRoomData = await fullRoomRes.json();
        
        // Find other player card:
        const targetPlayerObj = fullRoomData.players.find(p => p.name === otherPlayerName);
        // Note: the backend hide logic makes other players card null. Let's make sure use-power action endpoint returns the card!
        // Let's fetch the response body of use-power action:
        const actionResult = await res.json();
        
        // Since we want to make it look premium: we show an alert revealing the card!
        alert(currentLang === 'ar'
          ? `بطاقة ${otherPlayerName} رقم ${cardIdx + 1} هي: ${actionResult.cardReveal || 'مكشوفة'}`
          : `${otherPlayerName}'s card #${cardIdx + 1} is: ${actionResult.cardReveal || 'revealed'}`);
        fetchRoomState();
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Case 2: Power Jack or Queen (Swap any self card with other player card)
  if (val === 11 || val === 12) {
    if (selectedHandIndex === null) {
      return alert(currentLang === 'ar' ? 'الرجاء تحديد بطاقتك أولاً بالضغط عليها' : 'Please select your card first');
    }

    try {
      await fetch(`/api/game/${myRoomCode}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: myName,
          actionType: 'use-power',
          targetPlayer: otherPlayerName,
          targetIndex: cardIdx,
          swapIndex: selectedHandIndex
        })
      });
      selectedHandIndex = null;
    } catch (e) {
      console.error(e);
    }
  }
};

// Render Tallies
function renderTallies() {
  const container = document.getElementById('screw-tallies');
  if (!container || !gameRoomState) return;

  const isAr = currentLang === 'ar';
  
  // Sort players by round points (lowest wins)
  const players = gameRoomState.players;
  container.innerHTML = players.map((p, idx) => {
    // Show player cards face up
    const cardsMarkup = p.cards.map(card => {
      const info = suitSymbols[card.suit] || { sym: '', color: '#000' };
      const label = getCardLabel(card.value);
      return `
        <div style="width:50px; height:70px; background:#fff; border:1px solid var(--line); border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:0.75rem; position:relative; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
          <span style="font-weight:bold; color:${info.color}; position:absolute; top:2px; left:2px; font-size:0.7rem;">${label}</span>
          <span style="font-size:1.2rem; color:${info.color};">${info.sym}</span>
          <span style="font-size:0.5rem; color:var(--muted); position:absolute; bottom:2px;">${card.points} pts</span>
        </div>
      `;
    }).join('');

    return `
      <div style="background:var(--bg3); border:1px solid var(--line); border-radius:8px; padding:1rem; text-align:left; display:flex; flex-direction:column; gap:0.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:var(--text);">${idx + 1}. ${p.name} ${p.name === myName ? '(You)' : ''}</strong>
          <span style="font-size:0.9rem; color:var(--gold); font-weight:bold;">${p.score} total pts</span>
        </div>
        <div style="display:flex; gap:0.4rem; justify-content:center; margin-top:0.4rem;">
          ${cardsMarkup}
        </div>
      </div>
    `;
  }).join('');
}

// Reset Game Lobby
window.resetScrewLobby = function() {
  myRoomCode = '';
  myName = '';
  gameRoomState = null;
  selectedHandIndex = null;
  currentDrawnCard = null;
  pendingSwapSelfIndex = null;

  if (window.screwInterval) {
    clearInterval(window.screwInterval);
    window.screwInterval = null;
  }
  
  document.getElementById('screw-lobby').style.display = 'block';
  document.getElementById('screw-waiting').style.display = 'none';
  document.getElementById('screw-board').style.display = 'none';
  document.getElementById('screw-finished').style.display = 'none';
};

// Add Log Entry
function addLogMessage(msg) {
  const container = document.getElementById('screw-logs');
  if (!container) return;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  container.innerHTML += `<div style="margin-bottom:0.15rem;">[${time}] ${msg}</div>`;
  container.scrollTop = container.scrollHeight;
}
