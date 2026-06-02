// ===== أوزيل كافيه — لعبة أونو (UNO) متعددة اللاعبين عبر الإنترنت =====
// هذا الملف يدير منطق لعبة الأونو بالكامل بما في ذلك إنشاء الغرف
// والانضمام إليها واللعب عبر Pusher للاتصال الفوري

// متغيرات الحالة العامة للعبة
let pusherClient = null;
let gameChannel = null;
let myRoomCode = '';
let myName = '';
let gameState = null;
let drawnCard = null;

// خريطة الألوان والنصوص الخاصة باللعبة
const COLOR_HEX = { red: '#E74C3C', yellow: '#F1C40F', green: '#2ECC71', blue: '#3498DB', wild: '#2C3E50' };
const COLOR_AR = { red: 'أحمر', yellow: 'أصفر', green: 'أخضر', blue: 'أزرق', wild: 'وايلد' };
const VALUE_LABELS = { skip: '⊘', reverse: '⟳', draw2: '+2', wild: '★', wild4: '+4' };

// دالة مساعدة للترجمة بين اللغتين
function tEnAr(en, ar) { return (window.currentLang === 'ar') ? ar : en; }

// ===== تهيئة بهو اللعبة =====
window.initUnoLobby = function() {
  const user = JSON.parse(localStorage.getItem('ozel_user') || 'null');
  if (user && user.name) document.getElementById('uno-player-name').value = user.name;
};

// ===== إظهار حقل الانضمام للغرفة =====
window.showJoinUnoInput = function() {
  document.getElementById('uno-join-box').style.display = 'flex';
};

// ===== إنشاء غرفة جديدة =====
window.createUnoRoom = async function() {
  const name = document.getElementById('uno-player-name').value.trim();
  if (!name) return alert(tEnAr('Enter your nickname', 'أدخل اسمك'));
  try {
    const r = await fetch('/api/game/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerName: name }) });
    const d = await r.json();
    if (d.success) setupWaitingRoom(d.roomCode, d.playerName, true);
    else alert(d.error);
  } catch (e) { alert(tEnAr('Error', 'خطأ')); }
};

// ===== الانضمام إلى غرفة موجودة =====
window.submitJoinUnoRoom = async function() {
  const name = document.getElementById('uno-player-name').value.trim();
  const code = document.getElementById('uno-room-code').value.trim().toUpperCase();
  if (!name || !code) return alert(tEnAr('Fill all fields', 'املأ جميع الحقول'));
  try {
    const r = await fetch('/api/game/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode: code, playerName: name }) });
    const d = await r.json();
    if (d.success) setupWaitingRoom(d.roomCode, d.playerName, false);
    else alert(d.error);
  } catch (e) { alert(tEnAr('Error', 'خطأ')); }
};

// ===== إعداد غرفة الانتظار =====
function setupWaitingRoom(code, name, isHost) {
  myRoomCode = code; myName = name;
  document.getElementById('uno-lobby').style.display = 'none';
  document.getElementById('uno-waiting').style.display = 'block';
  document.getElementById('uno-code-display').textContent = code;
  document.getElementById('uno-host-actions').style.display = isHost ? 'block' : 'none';
  document.getElementById('uno-nonhost-msg').style.display = isHost ? 'none' : 'block';
  subscribeToChannel(code);
  fetchState();
  if (!window.unoInterval) window.unoInterval = setInterval(fetchState, 3000);
}

// ===== الاشتراك في قناة Pusher للغرفة =====
function subscribeToChannel(code) {
  if (typeof Pusher === 'undefined') return;
  if (!pusherClient) pusherClient = new Pusher('d7010f3c5b8b98295a04', { cluster: 'eu', forceTLS: true });
  if (gameChannel) pusherClient.unsubscribe(gameChannel.name);
  gameChannel = pusherClient.subscribe(`room-${code}`);
  gameChannel.bind('player-joined', d => updatePlayerList(d.players));
  gameChannel.bind('game-started', () => { document.getElementById('uno-waiting').style.display = 'none'; document.getElementById('uno-board').style.display = 'block'; fetchState(); });
  gameChannel.bind('card-played', () => fetchState());
  gameChannel.bind('card-drawn', () => fetchState());
  gameChannel.bind('turn-passed', () => fetchState());
  gameChannel.bind('game-over', d => showGameOver(d));
  gameChannel.bind('said-uno', d => addLog(d.player + ' ' + tEnAr('said UNO!', 'قال أونو!')));
}

// ===== جلب حالة اللعبة من الخادم =====
async function fetchState() {
  if (!myRoomCode) return;
  try {
    const r = await fetch(`/api/game/${myRoomCode}?playerName=${encodeURIComponent(myName)}`);
    gameState = await r.json();
    render();
  } catch (e) { console.error(e); }
}

// ===== تحديث قائمة اللاعبين في بهو الانتظار =====
function updatePlayerList(players) {
  const el = document.getElementById('uno-player-list');
  if (!el) return;
  el.innerHTML = players.map((p, i) => `<div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg3);padding:.6rem 1rem;border-radius:6px;"><span style="font-weight:bold;">${i+1}. ${p.name} ${p.name===myName?'(You)':''}</span><span style="font-size:.7rem;background:${p.isHost?'var(--gold)':'var(--accent-emerald)'};color:var(--white);padding:2px 6px;border-radius:3px;">${p.isHost?'Host':'Ready'}</span></div>`).join('');
}

// ===== بدء اللعبة (للمضيف فقط) =====
window.startUnoGame = async function() {
  try {
    const r = await fetch('/api/game/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode: myRoomCode, playerName: myName }) });
    const d = await r.json();
    if (!d.success) alert(d.error);
  } catch (e) { alert('Error'); }
};

// ===== العرض الرئيسي للعبة =====
function render() {
  if (!gameState) return;
  if (gameState.status === 'lobby') {
    document.getElementById('uno-lobby').style.display = 'none';
    document.getElementById('uno-waiting').style.display = 'block';
    document.getElementById('uno-board').style.display = 'none';
    document.getElementById('uno-finish').style.display = 'none';
    const host = gameState.players.find(p => p.isHost);
    const isHost = host && host.name === myName;
    document.getElementById('uno-host-actions').style.display = isHost ? 'block' : 'none';
    document.getElementById('uno-nonhost-msg').style.display = isHost ? 'none' : 'block';
    updatePlayerList(gameState.players.map(p => ({ name: p.name, isHost: p.isHost })));
    return;
  }
  if (gameState.status === 'finished') return;
  if (gameState.status === 'playing') renderBoard();
}

// ===== عرض لوحة اللعبة =====
function renderBoard() {
  if (!gameState || gameState.status !== 'playing') return;
  document.getElementById('uno-lobby').style.display = 'none';
  document.getElementById('uno-waiting').style.display = 'none';
  document.getElementById('uno-board').style.display = 'block';
  document.getElementById('uno-finish').style.display = 'none';

  const isAr = window.currentLang === 'ar';
  const me = gameState.players.find(p => p.name === myName);
  const activePlayer = gameState.players[gameState.turnIndex];
  const isMyTurn = activePlayer && activePlayer.name === myName;
  const top = gameState.topCard;
  const cc = gameState.currentColor;

  // عرض البطاقة العلوية
  const topEl = document.getElementById('uno-top-card');
  if (top) {
    const c = top.chosenColor || top.color;
    const label = VALUE_LABELS[top.value] !== undefined ? VALUE_LABELS[top.value] : top.value;
    topEl.innerHTML = `<div style="font-size:1.8rem;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.3);">${label}</div>`;
    topEl.style.background = COLOR_HEX[c] || '#2C3E50';
    topEl.style.borderColor = 'rgba(255,255,255,.5)';
  } else {
    topEl.innerHTML = '<span style="color:var(--muted);font-size:.8rem;">---</span>';
    topEl.style.background = 'var(--bg3)';
  }

  // مؤشر اللون الحالي
  document.getElementById('uno-current-color').innerHTML = cc ? `${tEnAr('Color:','اللون:')} <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${COLOR_HEX[cc]||'#2C3E50'};vertical-align:middle;border:1px solid rgba(255,255,255,.3);"></span> ${isAr?COLOR_AR[cc]:cc}` : '';

  // مؤشر الدور
  const turnEl = document.getElementById('uno-turn-indicator');
  if (isMyTurn) {
    turnEl.textContent = tEnAr('Your Turn!', 'دورك!');
    turnEl.style.color = 'var(--gold)';
  } else {
    turnEl.textContent = tEnAr(`Turn: ${activePlayer.name}`, `دور: ${activePlayer.name}`);
    turnEl.style.color = 'var(--accent-emerald)';
  }

  // اتجاه اللعب
  document.getElementById('uno-direction').textContent = gameState.direction === 1 ? tEnAr('→ Clockwise', '→ مع عقارب الساعة') : tEnAr('← Counter-clockwise', '← عكس عقارب الساعة');

  // عرض اللاعبين الآخرين
  const othersEl = document.getElementById('uno-other-players');
  const others = gameState.players.filter(p => p.name !== myName);
  othersEl.innerHTML = others.map(p => {
    const isHisTurn = activePlayer && activePlayer.name === p.name;
    const border = isHisTurn ? '2px solid var(--gold)' : '1px solid var(--line)';
    return `<div style="background:var(--bg2);border:${border};border-radius:8px;padding:.6rem 1rem;text-align:center;min-width:100px;"><strong style="display:block;font-size:.85rem;">${p.name}</strong><span style="font-size:.75rem;color:var(--gold);font-weight:bold;">${p.cardCount} ${tEnAr('cards','بطاقات')}</span></div>`;
  }).join('');

  // عدد البطاقات المتبقية
  document.getElementById('uno-deck-count').textContent = `${gameState.drawCount} cards`;

  // عرض بطاقاتي
  const handEl = document.getElementById('uno-my-hand');
  handEl.innerHTML = '';
  if (me && me.cards) {
    me.cards.forEach((card, i) => {
      const div = document.createElement('div');
      const c = card.color;
      const label = VALUE_LABELS[card.value] !== undefined ? VALUE_LABELS[card.value] : card.value;
      div.className = 'uno-card';
      div.style.background = COLOR_HEX[c] || '#2C3E50';
      div.innerHTML = `<div class="uno-card-label">${label}</div>`;
      if (card.color === 'wild') div.style.background = 'linear-gradient(135deg,#E74C3C,#F1C40F,#2ECC71,#3498DB)';
      div.title = `${card.color} ${card.value}`;
      
      const playable = top ? canPlayCard(card, top, gameState.currentColor) : true;
      
      div.addEventListener('click', () => playCard(i));
      
      if (isMyTurn && playable) {
        div.style.cursor = 'pointer';
        div.onmouseenter = () => { div.style.transform = 'translateY(-12px)'; div.style.boxShadow = '0 8px 20px rgba(0,0,0,.25)'; };
        div.onmouseleave = () => { div.style.transform = ''; div.style.boxShadow = ''; };
      } else if (!isMyTurn) {
        div.style.opacity = '.7';
      } else {
        div.style.opacity = '.5';
        div.style.cursor = 'not-allowed';
      }
      
      handEl.appendChild(div);
    });
  }

  // أزرار التحكم
  document.getElementById('uno-draw-btn').disabled = !isMyTurn;
  document.getElementById('uno-pass-btn').disabled = !isMyTurn || !drawnCard;
  document.getElementById('uno-uno-btn').style.display = (me && me.cards && me.cards.length === 2 && !me.saidUno) ? 'inline-block' : 'none';
}

// ===== التحقق من إمكانية لعب البطاقة =====
function canPlayCard(card, top, currentColor) {
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  if (top && card.type === 'number' && top.type === 'number' && card.value === top.value) return true;
  if (top && card.type === 'action' && top.type === 'action' && card.value === top.value) return true;
  return false;
}

// ===== لعب بطاقة =====
async function playCard(index) {
  if (!gameState) return;
  const me = gameState.players.find(p => p.name === myName);
  const active = gameState.players[gameState.turnIndex];
  if (!active || active.name !== myName) return;
  if (index < 0 || index >= me.cards.length) return;

  const card = me.cards[index];
  if (!canPlayCard(card, gameState.topCard, gameState.currentColor)) return;

  let chosenColor = null;
  if (card.color === 'wild') {
    chosenColor = await pickColor();
    if (!chosenColor) return;
  }

  try {
    const r = await fetch(`/api/game/${myRoomCode}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: myName, cardIndex: index, chosenColor })
    });
    const d = await r.json();
    if (d.gameOver) {
      fetchState();
    } else if (!d.success) {
      alert(d.error);
    }
    drawnCard = null;
  } catch (e) { alert('Error'); }
}

// ===== اختيار اللون للبطاقات البرية =====
function pickColor() {
  return new Promise(resolve => {
    const overlay = document.getElementById('uno-color-picker');
    overlay.style.display = 'flex';
    const btns = overlay.querySelectorAll('.uno-color-btn');
    btns.forEach(b => {
      b.onclick = () => {
        overlay.style.display = 'none';
        resolve(b.dataset.color);
      };
    });
  });
}

// ===== سحب بطاقة من الكومة =====
window.drawUnoCard = async function() {
  if (!gameState) return;
  const active = gameState.players[gameState.turnIndex];
  if (!active || active.name !== myName) return;
  try {
    const r = await fetch(`/api/game/${myRoomCode}/draw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: myName })
    });
    const d = await r.json();
    if (d.success) {
      drawnCard = d.card;
      // التحقق إذا كانت البطاقة المسحوبة قابلة للعب
      if (canPlayCard(d.card, gameState.topCard, gameState.currentColor)) {
        if (confirm(tEnAr('Play drawn card?', 'هل تلعب البطاقة المسحوبة؟'))) {
          const me = gameState.players.find(p => p.name === myName);
          const idx = me.cards ? me.cards.length - 1 : -1;
          if (idx >= 0) playCard(idx);
          else passTurn();
        } else {
          passTurn();
        }
      } else {
        passTurn();
      }
      fetchState();
    } else {
      alert(d.error);
    }
  } catch (e) { alert('Error'); }
};

// ===== تخطي الدور =====
async function passTurn() {
  try {
    await fetch(`/api/game/${myRoomCode}/pass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: myName })
    });
    drawnCard = null;
    fetchState();
  } catch (e) {}
}

// ===== قول أونو (عند بقاء بطاقتين) =====
window.sayUno = async function() {
  try {
    await fetch(`/api/game/${myRoomCode}/say-uno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: myName })
    });
    document.getElementById('uno-uno-btn').style.display = 'none';
    addLog(tEnAr('You said UNO!', 'قلت أونو!'));
  } catch (e) {}
};

// ===== عرض شاشة نهاية اللعبة =====
function showGameOver(d) {
  const el = document.getElementById('uno-finish');
  el.style.display = 'block';
  document.getElementById('uno-board').style.display = 'none';
  document.getElementById('uno-waiting').style.display = 'none';

  const isAr = window.currentLang === 'ar';
  let html = `<h2 style="font-family:'Cormorant Garamond',serif;font-size:2rem;color:var(--gold);margin-bottom:1rem;">${isAr ? '🏆 الفائز: ' + d.winner : '🏆 Winner: ' + d.winner}</h2>`;
  html += `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:1.5rem;max-width:360px;margin:0 auto 2rem;">`;
  
  (d.players || []).forEach(p => {
    const cardsHtml = (p.cards || []).map(c => {
      const ch = c.chosenColor || c.color;
      const label = VALUE_LABELS[c.value] !== undefined ? VALUE_LABELS[c.value] : c.value;
      return `<div style="width:40px;height:56px;background:${COLOR_HEX[ch]||'#2C3E50'};border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:.65rem;font-weight:bold;margin:1px;">${label}</div>`;
    }).join('');
    html += `<div style="background:var(--bg3);border:1px solid var(--line);border-radius:8px;padding:.8rem;margin-bottom:.5rem;"><strong>${p.name}</strong> — ${p.score} pts<div style="margin-top:.4rem;">${cardsHtml || '-'}</div></div>`;
  });
  
  html += `</div><button class="btn-gold" onclick="resetUno()" style="margin:0 auto;">${isAr ? 'العب مرة أخرى' : 'Play Again'}</button>`;
  el.innerHTML = html;
}

// ===== إضافة سجل إلى شريط الأحداث =====
function addLog(msg) {
  const el = document.getElementById('uno-logs');
  if (!el) return;
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  el.innerHTML += `<div>[${t}] ${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}

// ===== إعادة تعيين اللعبة =====
window.resetUno = function() {
  myRoomCode = ''; myName = ''; gameState = null; drawnCard = null;
  if (window.unoInterval) { clearInterval(window.unoInterval); window.unoInterval = null; }
  document.getElementById('uno-lobby').style.display = 'block';
  document.getElementById('uno-waiting').style.display = 'none';
  document.getElementById('uno-board').style.display = 'none';
  document.getElementById('uno-finish').style.display = 'none';
};
