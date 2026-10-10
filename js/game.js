// v0.26
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_COLORS = {
    hearts: 'red',
    diamonds: 'red',
    clubs: 'black',
    spades: 'black'
};

let CARD_OFFSET = 20;
let CARD_OFFSET_DOWN = 10;
const FACE_DOWN_RATIO = 0.45;
const FACE_UP_RATIO = 0.9;

function updateCardOffset() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;height:var(--card-stack-offset);width:0;visibility:hidden;left:-9999px;top:-9999px;';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    if (h > 0) {
        CARD_OFFSET = Math.round(h * FACE_UP_RATIO);
        CARD_OFFSET_DOWN = Math.max(4, Math.round(h * FACE_DOWN_RATIO));
    }
}
const ACE_VALUE = 1;
const KING_VALUE = 13;
const TOTAL_CARDS = 52;
const FOUNDATION_COUNT = 4;
const TABLEAU_COUNT = 7;
const STORAGE_KEY = 'solitaire-settings';
const DOUBLE_CLICK_TIMEOUT = 300;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

let gameState = {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    drawCount: 1,
    bgColor: null,
    autoMove: true
};

// Legacy bag the pointer/keyboard paths fill in so executeMove and
// isValidMove can stay unchanged. Only these four fields are ever read.
let dragState = {
    isDragging: false,
    cards: [],
    originPile: null,
    originIndex: 0
};

let moveHistory = [];

// What just happened, announced ahead of the pile counts in the live region.
// Screen-reader users otherwise had to infer a move's result from the totals.
let lastMoveAnnouncement = '';

const UNDO_PENALTY = 5;
let moveCount = 0;
let timerStartMs = 0;
let timerStopMs = 0;
let timerIntervalId = null;

function startTimer() {
    if (timerStartMs) return;
    timerStartMs = Date.now();
    timerStopMs = 0;
    timerIntervalId = setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
}

function stopTimer() {
    if (!timerStartMs || timerStopMs) return;
    timerStopMs = Date.now();
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    updateTimerDisplay();
}

function resetStats() {
    moveCount = 0;
    timerStartMs = 0;
    timerStopMs = 0;
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    updateMovesDisplay();
    updateTimerDisplay();
}

function bumpMoves(n = 1, flash = false) {
    moveCount += n;
    updateMovesDisplay();
    if (flash) {
        const el = document.getElementById('moves');
        if (el) {
            el.classList.remove('flash-red');
            void el.offsetWidth;
            el.classList.add('flash-red');
            setTimeout(() => el.classList.remove('flash-red'), 600);
        }
    }
}

function updateMovesDisplay() {
    const el = document.getElementById('moves');
    if (el) el.textContent = String(moveCount);
}

function updateTimerDisplay() {
    const el = document.getElementById('timer');
    if (!el) return;
    const end = timerStopMs || Date.now();
    el.textContent = formatElapsed(timerStartMs ? Math.max(0, end - timerStartMs) : 0);
}

function formatElapsed(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

let selectedCard = null;
let winAnimating = false;
let autoMoveAnimating = false;
let autocollectActive = false;
// Bumped on every deal(). Deferred animation callbacks capture the value at
// schedule time and bail when it changes — so a New Game mid-animation can't
// let a stale completion mutate the fresh board.
let dealGeneration = 0;
// The draw mode picked mid-game; deal() applies it (see handleDrawCountChange).
let pendingDrawCount = null;

// Pointer-events drag state (see the drag pipeline below).
let pointerDrag = null;

// An animation or an in-flight drag owns the board: input that would mutate
// it waits. A second finger tapping the stock mid-drag used to splice the
// dragged card's pile out from under it.
function isBusy() {
    return winAnimating || autoMoveAnimating || autocollectActive
        || !!(pointerDrag && pointerDrag.active);
}

let audioContext = null;
// Flip sound from opengameart.org/content/playing-card-sounds by BMacZero, CC0.
// Place sound: 554208__memes_hodachy__cardsound32562 by Memes_Hodachy, CC0.
// Stagger between cards of a draw-3 deal (ghosts and their flip sounds).
const DEAL_STAGGER_MS = 120;

const SOUND_FILES = {
    flip: 'sounds/contact1.wav',
    place: 'sounds/554208__memes_hodachy__cardsound32562.mp3',
};
const audioBuffers = {};
const audioBytes = {};
let audioUnlocked = false;

function ensureAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!audioContext) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioContext = new Ctx();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

function unlockAudio() {
    if (audioUnlocked) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    // iOS: play silent buffer inside user gesture to unlock output.
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    audioUnlocked = true;
    for (const name of Object.keys(audioBytes)) decodeSample(name);
}

function decodeSample(name) {
    const ctx = audioContext;
    const bytes = audioBytes[name];
    if (!ctx || !bytes || audioBuffers[name]) return;
    delete audioBytes[name];
    ctx.decodeAudioData(bytes)
        .then(buf => { audioBuffers[name] = buf; })
        .catch(() => {});
}

// Creating an AudioContext costs ~200ms of main thread on slow devices, so
// load only bytes here; the context is built and samples decoded on first gesture.
function preloadAudio() {
    for (const [name, url] of Object.entries(SOUND_FILES)) {
        if (audioBuffers[name]) continue;
        fetch(url)
            .then(r => r.arrayBuffer())
            .then(ab => { audioBytes[name] = ab; decodeSample(name); })
            .catch(() => {});
    }
}

function playSample(name, { volume = 0.6, rateJitter = 0.04 } = {}) {
    const buf = audioBuffers[name];
    const ctx = audioContext;
    if (!buf || !ctx) return false;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 1 + (Math.random() * 2 - 1) * rateJitter;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(0);
        return true;
    } catch (e) {
        return false;
    }
}

function playSynthFlip() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = 0.18;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        data[i] = (Math.random() * 2 - 1) * (1 - t);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(600, now + 0.12);
    filter.Q.setValueAtTime(0.9, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
}

function playFlipSound() {
    if (!playSample('flip', { volume: 0.55, rateJitter: 0.05 })) {
        playSynthFlip();
    }
}

function playPlaceSound() {
    playSample('place', { volume: 0.5, rateJitter: 0.03 });
}

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (let i = 0; i < RANKS.length; i++) {
            deck.push({
                suit,
                rank: RANKS[i],
                value: i + 1,
                color: SUIT_COLORS[suit],
                faceUp: false,
                rotate: Math.round((Math.random() * 4 - 2) * 10) / 10
            });
        }
    }
    return deck;
}

function shuffle(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function deal() {
    hideWinOverlay();
    document.querySelectorAll('.win-blast-layer').forEach(el => el.remove());
    // Stock-deal and autocollect ghosts outlive their pile, so sweep them too
    // or they keep flying over the fresh board for up to a second.
    document.querySelectorAll('.deal-ghost').forEach(el => el.remove());
    if (typeof confetti !== 'undefined' && confetti.stop) confetti.stop();
    // Invalidate any in-flight animation/autocollect callbacks against the
    // old board before we rebuild state.
    dealGeneration++;
    winAnimating = false;
    autoMoveAnimating = false;
    autocollectActive = false;
    cancelDrag();
    clearSelection(); // drop any keyboard selection pointing at the old board
    if (pendingDrawCount !== null) {
        gameState.drawCount = pendingDrawCount;
        pendingDrawCount = null;
        updateDrawNote();
    }
    lastMoveAnnouncement = 'New game dealt.';
    resetStats();
    updateCardOffset();
    const deck = shuffle(createDeck());
    
    gameState.stock = [];
    gameState.waste = [];
    gameState.foundations = [[], [], [], []];
    gameState.tableau = [[], [], [], [], [], [], []];
    moveHistory = [];
    updateUndoButton();
    
    let deckIndex = 0;
    
    for (let i = 0; i < TABLEAU_COUNT; i++) {
        for (let j = 0; j <= i; j++) {
            const card = deck[deckIndex++];
            card.faceUp = (j === i);
            if (card.faceUp) {
                card.justFlipped = true;
            }
            gameState.tableau[i].push(card);
        }
    }
    
    while (deckIndex < TOTAL_CARDS) {
        gameState.stock.push(deck[deckIndex++]);
    }
    
    updateGameStatus();
    renderAll();
}

function renderAll() {
    renderStock();
    renderWaste();
    renderFoundations();
    renderTableau();
}

function renderPile(pileInfo) {
    if (!pileInfo) return;
    if (pileInfo.type === 'waste') renderWaste();
    else if (pileInfo.type === 'foundation') renderFoundation(pileInfo.pileIndex);
    else if (pileInfo.type === 'tableau') renderTableauColumn(pileInfo.pileIndex);
    else if (pileInfo.type === 'stock') renderStock();
}

function renderStock() {
    const stockEl = document.getElementById('stock');
    stockEl.innerHTML = '';
    stockEl.setAttribute('aria-label', `Stock pile, ${gameState.stock.length} cards`);
    // The stock is always actionable (draw, or recycle the waste back).
    stockEl.setAttribute('role', 'button');
    stockEl.tabIndex = 0;

    if (gameState.stock.length === 0) {
        stockEl.classList.add('empty');
    } else {
        stockEl.classList.remove('empty');
        const cardEl = createCardElement(gameState.stock[gameState.stock.length - 1], false);
        cardEl.tabIndex = -1;
        stockEl.appendChild(cardEl);
    }
}

function cardKey(card) {
    return `${card.suit}-${card.rank}`;
}

// Matches the flip-reveal keyframe duration in cards.css.
const FLIP_ANIM_MS = 450;

function applyCardClasses(el, card, faceUp) {
    const wantFD = !faceUp;
    if (el.classList.contains('face-down') !== wantFD) {
        el.classList.toggle('face-down', wantFD);
    }
    if (faceUp && card.justFlipped && !el.classList.contains('just-flipped')) {
        // Under .reduced-motion the flip keyframes never run, so animationend
        // never fires — the class and the flag would stick for the whole game.
        if (reducedMotionActive()) {
            card.justFlipped = false;
            return;
        }
        el.classList.add('just-flipped');
        let done = false;
        const onEnd = () => {
            if (done) return;
            done = true;
            el.classList.remove('just-flipped');
            card.justFlipped = false;
        };
        el.addEventListener('animationend', onEnd, { once: true });
        // Belt and braces: an interrupted or skipped animation still settles.
        setTimeout(onEnd, FLIP_ANIM_MS + 100);
    }
}

function reconcilePile(pileEl, cards, options) {
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const key = cardKey(card);
        const faceUp = options.faceUp(card, i);
        let el = pileEl.children[i];
        if (!el || el.dataset.key !== key) {
            const newEl = createCardElement(card, faceUp);
            if (el) {
                pileEl.replaceChild(newEl, el);
            } else {
                pileEl.appendChild(newEl);
            }
            el = newEl;
        }
        applyCardClasses(el, card, faceUp);
        options.update(el, card, i);
    }
    while (pileEl.children.length > cards.length) {
        pileEl.removeChild(pileEl.lastChild);
    }
}

function renderWaste() {
    const wasteEl = document.getElementById('waste');
    wasteEl.setAttribute('aria-label', `Waste pile, ${gameState.waste.length} cards`);
    wasteEl.classList.toggle('empty', gameState.waste.length === 0);

    // Draw-3 fans the last three cards so the two under the top one stay
    // readable — standard Klondike affordance. Draw-1 keeps a flat stack.
    const fanFrom = gameState.drawCount === 3
        ? Math.max(0, gameState.waste.length - 3)
        : gameState.waste.length;

    reconcilePile(wasteEl, gameState.waste, {
        faceUp: (card) => card.faceUp,
        update: (el, card, i) => {
            el.style.zIndex = i;
            el.style.setProperty('--fan', i >= fanFrom ? i - fanFrom : 0);
            el.dataset.pile = 'waste';
            el.dataset.index = i;
            el.setAttribute('role', 'img');
            el.setAttribute('aria-label', `${card.rank} of ${card.suit}`);
            // Only the top card is playable, so only it is tab-focusable.
            el.tabIndex = (card.faceUp && i === gameState.waste.length - 1) ? 0 : -1;
        }
    });
    updateEmptyPileFocus(wasteEl, gameState.waste.length === 0);
}

function renderFoundations() {
    for (let i = 0; i < FOUNDATION_COUNT; i++) {
        renderFoundation(i);
    }
}

function renderFoundation(i) {
    const foundationEl = document.getElementById(`foundation-${i}`);
    const pile = gameState.foundations[i];
    const suit = SUITS[i];

    foundationEl.setAttribute('aria-label', `${suit} foundation, ${pile.length} cards`);
    foundationEl.classList.toggle('empty', pile.length === 0);

    reconcilePile(foundationEl, pile, {
        faceUp: () => true,
        update: (el, card, j) => {
            el.dataset.pile = `foundation-${i}`;
            el.dataset.index = j;
            el.setAttribute('role', 'img');
            el.setAttribute('aria-label', `${card.rank} of ${card.suit}`);
            el.tabIndex = j === pile.length - 1 ? 0 : -1;
        }
    });
    updateEmptyPileFocus(foundationEl, pile.length === 0);
}

function renderTableau() {
    for (let i = 0; i < TABLEAU_COUNT; i++) {
        renderTableauColumn(i);
    }
}

function renderTableauColumn(i) {
    const tableauEl = document.getElementById(`tableau-${i}`);
    const pile = gameState.tableau[i];

    tableauEl.setAttribute('aria-label', `Tableau column ${i + 1}, ${pile.length} cards`);
    tableauEl.classList.toggle('empty', pile.length === 0);

    const tops = [];
    let y = 0;
    for (const card of pile) {
        tops.push(y);
        y += card.faceUp ? CARD_OFFSET : CARD_OFFSET_DOWN;
    }

    reconcilePile(tableauEl, pile, {
        faceUp: (card) => card.faceUp,
        update: (el, card, j) => {
            el.style.top = `${tops[j]}px`;
            el.style.zIndex = j;
            el.dataset.pile = `tableau-${i}`;
            el.dataset.index = j;
            el.setAttribute('role', 'img');
            el.setAttribute('aria-label', card.faceUp ? `${card.rank} of ${card.suit}` : 'Face down card');
            // Face-up tableau cards are playable (a whole run moves at once).
            el.tabIndex = card.faceUp ? 0 : -1;
        }
    });
    updateEmptyPileFocus(tableauEl, pile.length === 0);
}

// An empty pile is a legal drop target (aces / kings), so it must be reachable
// by keyboard even though it holds no focusable card.
function updateEmptyPileFocus(pileEl, isEmpty) {
    if (isEmpty) {
        pileEl.tabIndex = 0;
    } else {
        pileEl.removeAttribute('tabindex');
    }
}

function getPileFromEvent(e) {
    const target = e.target.closest('[data-pile]');
    if (!target) return null;
    
    const pileType = target.dataset.pile;
    const index = parseInt(target.dataset.index, 10);
    
    let pile;
    if (pileType === 'waste') {
        pile = { type: 'waste', pileIndex: 0, cards: gameState.waste, index };
    } else if (pileType.startsWith('foundation-')) {
        const fIndex = parseInt(pileType.split('-')[1], 10);
        pile = { type: 'foundation', pileIndex: fIndex, cards: gameState.foundations[fIndex], index };
    } else if (pileType.startsWith('tableau-')) {
        const tIndex = parseInt(pileType.split('-')[1], 10);
        pile = { type: 'tableau', pileIndex: tIndex, cards: gameState.tableau[tIndex], index };
    }
    
    return pile;
}



// Single source of truth for "may this card be picked up?".
// Every entry point (pointer, keyboard, double-click auto-move, drop
// highlights) must go through this — the keyboard path used to skip it and
// allowed illegal chunks to be lifted out of the middle of waste/foundation.
function canPickUp(pileInfo) {
    if (!pileInfo) return false;
    if (pileInfo.type !== 'waste' && pileInfo.type !== 'foundation' && pileInfo.type !== 'tableau') return false;
    if (pileInfo.index < 0 || pileInfo.index >= pileInfo.cards.length) return false;

    const card = pileInfo.cards[pileInfo.index];
    if (!card || !card.faceUp) return false;

    // Waste and foundations only ever release their top card.
    if ((pileInfo.type === 'waste' || pileInfo.type === 'foundation') &&
        pileInfo.index !== pileInfo.cards.length - 1) {
        return false;
    }
    return true;
}

// The stack that leaves the pile: a tableau run from the grabbed card down,
// otherwise the single top card.
function movingStackFrom(pileInfo) {
    return pileInfo.type === 'tableau'
        ? pileInfo.cards.slice(pileInfo.index)
        : [pileInfo.cards[pileInfo.index]];
}

// Kept as a fallback alongside the pointer double-tap detection in
// handlePointerClick: a native dblclick still fires when the two clicks land
// on different elements (a re-render between them swaps the card node), which
// breaks the lastTapKey match. Both funnel into tryAutoMove, and its guards
// make a double fire harmless — but keep them in sync.
function handleDoubleClick(e) {
    if (isBusy()) return;
    const cardEl = e.target.closest('.card');
    if (!cardEl || cardEl.classList.contains('face-down')) return;
    
    const pileInfo = getPileFromEvent(e);
    if (!pileInfo || !pileInfo.cards[pileInfo.index].faceUp) return;
    
    tryAutoMove(pileInfo, cardEl);
}

function tryAutoMove(pileInfo, cardEl) {
    if (autocollectActive) return false;
    if (!canPickUp(pileInfo)) return false;

    const movingCards = movingStackFrom(pileInfo);

    dragState.cards = movingCards;
    dragState.originPile = pileInfo;
    dragState.originIndex = pileInfo.index;

    // Foundations always; tableau columns only with the Auto-move setting on.
    const target = legalTargets(movingCards, pileInfo, { tableau: gameState.autoMove })[0];
    if (!target) return false;

    if (cardEl) {
        animateAutoMoveToTarget(cardEl, movingCards, target);
    } else {
        playPlaceSound();
        executeMove(target);
    }
    return true;
}

// Every pile the stack may legally land on, foundations first, in board order.
// Shared by auto-move (takes the first) and the drag highlights (shows all).
function legalTargets(movingCards, pileInfo, { foundations = true, tableau = true } = {}) {
    const targets = [];
    if (foundations) {
        for (let i = 0; i < FOUNDATION_COUNT; i++) {
            if (pileInfo.type === 'foundation' && pileInfo.pileIndex === i) continue;
            const target = { type: 'foundation', pileIndex: i, cards: gameState.foundations[i] };
            if (isValidMoveFor(movingCards, target)) targets.push(target);
        }
    }
    if (tableau) {
        for (let i = 0; i < TABLEAU_COUNT; i++) {
            if (pileInfo.type === 'tableau' && pileInfo.pileIndex === i) continue;
            const target = { type: 'tableau', pileIndex: i, cards: gameState.tableau[i] };
            if (isValidMoveFor(movingCards, target)) targets.push(target);
        }
    }
    return targets;
}

function animateAutoMoveToTarget(cardEl, movingCards, target) {
    if (autoMoveAnimating) return;
    const gen = dealGeneration;
    const targetEl = target.type === 'foundation'
        ? document.getElementById(`foundation-${target.pileIndex}`)
        : document.getElementById(`tableau-${target.pileIndex}`);
    if (!targetEl) {
        dragState.originPile = getPileFromEvent({ target: cardEl });
        dragState.originIndex = dragState.originPile ? dragState.originPile.index : 0;
        dragState.cards = movingCards;
        playPlaceSound();
        executeMove(target);
        return;
    }

    autoMoveAnimating = true;
    playPlaceSound();

    // collect the source card elements (cardEl + any tableau cards below it)
    const sourceEls = [cardEl];
    if (cardEl.parentElement && cardEl.dataset.pile && cardEl.dataset.pile.startsWith('tableau-')) {
        const startIdx = parseInt(cardEl.dataset.index, 10);
        const all = Array.from(cardEl.parentElement.querySelectorAll('.card'));
        sourceEls.length = 0;
        for (let i = startIdx; i < all.length; i++) sourceEls.push(all[i]);
    }

    const fromRect = cardEl.getBoundingClientRect();
    const toRect = targetEl.getBoundingClientRect();
    let targetTop = toRect.top;
    if (target.type === 'tableau') {
        for (const c of target.cards) {
            targetTop += c.faceUp ? CARD_OFFSET : CARD_OFFSET_DOWN;
        }
    }
    const dx = toRect.left - fromRect.left;
    const dy = targetTop - fromRect.top;

    sourceEls.forEach(el => el.classList.add('dragging'));
    const sourcePile = sourceEls[0] && sourceEls[0].parentElement;
    if (sourcePile) sourcePile.classList.add('dragging-source');

    requestAnimationFrame(() => {
        sourceEls.forEach(el => {
            el.style.setProperty('--drag-x', `${dx}px`);
            el.style.setProperty('--drag-y', `${dy}px`);
        });
    });

    let done = false;
    const onTransitionEnd = (e) => {
        if (e.propertyName !== 'transform') return;
        cardEl.removeEventListener('transitionend', onTransitionEnd);
        finish();
    };
    const finish = () => {
        if (done) return;
        done = true;
        cardEl.removeEventListener('transitionend', onTransitionEnd);
        // A New Game fired during the animation: the board was rebuilt, so this
        // stale completion must not move the old cards onto the fresh state.
        if (gen !== dealGeneration) { autoMoveAnimating = false; return; }
        const pi = getPileFromEvent({ target: cardEl });
        if (pi) {
            dragState.originPile = pi;
            dragState.originIndex = pi.index;
        }
        dragState.cards = movingCards;
        sourceEls.forEach(el => {
            el.style.removeProperty('--drag-x');
            el.style.removeProperty('--drag-y');
            el.classList.remove('dragging');
        });
        clearDragSource();
        executeMove(target);
        autoMoveAnimating = false;
    };
    cardEl.addEventListener('transitionend', onTransitionEnd);
    setTimeout(finish, 500);
}

// --- Autocollect: recursively move all foundation-eligible top cards ---

const AUTOCOLLECT_STAGGER_MS = 150;
const AUTOCOLLECT_ANIM_MS = 440;
let autocollectCount = 0;

function findAutocollectCandidates() {
    const candidates = [];
    if (gameState.waste.length > 0) {
        const card = gameState.waste[gameState.waste.length - 1];
        candidates.push({ card, sourceType: 'waste', sourceCol: 0, sourcePos: gameState.waste.length - 1 });
    }
    for (let i = 0; i < TABLEAU_COUNT; i++) {
        const pile = gameState.tableau[i];
        if (pile.length === 0) continue;
        const card = pile[pile.length - 1];
        if (!card.faceUp) continue;
        candidates.push({ card, sourceType: 'tableau', sourceCol: i, sourcePos: pile.length - 1 });
    }
    return candidates;
}

function autocollect() {
    if (isBusy()) return;
    autocollectActive = true;
    autocollectCount = 0;
    runAutocollectPass();
}

function runAutocollectPass() {
    if (!autocollectActive) return; // cancelled (e.g. New Game) — stop re-arming
    const raw = findAutocollectCandidates();
    if (raw.length === 0) {
        autocollectActive = false;
        return;
    }

    // Resolve targets via simulated foundation state so multiple aces in one
    // pass don't collide on the same empty foundation.
    const simFoundations = gameState.foundations.map(p => p.slice());
    const queued = [];
    for (const c of raw) {
        let targetIdx = -1;
        for (let i = 0; i < FOUNDATION_COUNT; i++) {
            if (isValidMoveFor([c.card], { type: 'foundation', pileIndex: i, cards: simFoundations[i] })) {
                targetIdx = i;
                break;
            }
        }
        if (targetIdx < 0) continue;

        const pileSelector = c.sourceType === 'waste' ? 'waste' : `tableau-${c.sourceCol}`;
        const sourceEl = document.querySelector(`[data-pile="${pileSelector}"][data-index="${c.sourcePos}"]`);
        const targetEl = document.getElementById(`foundation-${targetIdx}`);
        if (!sourceEl || !targetEl) continue;

        simFoundations[targetIdx].push(c.card);
        queued.push({
            card: c.card,
            sourceType: c.sourceType,
            sourceCol: c.sourceCol,
            sourcePos: c.sourcePos,
            targetIdx,
            fromRect: sourceEl.getBoundingClientRect(),
            toRect: targetEl.getBoundingClientRect()
        });
    }

    if (queued.length === 0) {
        autocollectActive = false;
        return;
    }

    queued.forEach((c, i) => {
        setTimeout(() => {
            if (commitCollect(c)) spawnCollectGhost(c);
        }, i * AUTOCOLLECT_STAGGER_MS);
    });

    const total = (queued.length - 1) * AUTOCOLLECT_STAGGER_MS + AUTOCOLLECT_ANIM_MS + 80;
    setTimeout(runAutocollectPass, total);
}

function commitCollect(c) {
    if (!autocollectActive) return false; // cancelled before this staggered commit fired
    // Defensive: only act if the captured card is still the live source top.
    // Guards should freeze input during autocollect, but never pop blindly —
    // a desynced pop would duplicate/lose cards and corrupt the pile.
    const sourcePile = c.sourceType === 'waste' ? gameState.waste : gameState.tableau[c.sourceCol];
    if (sourcePile[sourcePile.length - 1] !== c.card) return false;

    let flippedPileIdx = null;
    if (c.sourceType === 'waste') {
        gameState.waste.pop();
    } else {
        const pile = gameState.tableau[c.sourceCol];
        pile.pop();
        if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
            pile[pile.length - 1].faceUp = true;
            pile[pile.length - 1].justFlipped = true;
            flippedPileIdx = c.sourceCol;
        }
    }
    gameState.foundations[c.targetIdx].push(c.card);

    moveHistory.push({
        kind: 'move',
        cards: [c.card],
        origin: {
            type: c.sourceType,
            pileIndex: c.sourceType === 'waste' ? 0 : c.sourceCol,
            index: c.sourcePos
        },
        target: { type: 'foundation', pileIndex: c.targetIdx },
        flippedCard: flippedPileIdx !== null ? { pileIndex: flippedPileIdx } : null
    });

    if (c.sourceType === 'waste') renderWaste();
    else renderTableauColumn(c.sourceCol);
    renderFoundation(c.targetIdx);

    const foundationEl = document.getElementById(`foundation-${c.targetIdx}`);
    const newCardEl = foundationEl && foundationEl.lastElementChild;
    if (newCardEl) newCardEl.classList.add('deal-destination-hidden');

    bumpMoves(1);
    startTimer();
    updateUndoButton();
    autocollectCount++;
    lastMoveAnnouncement = `Collected ${autocollectCount} ${autocollectCount === 1 ? 'card' : 'cards'} to the foundations.`;
    updateGameStatus();
    return true;
}

function spawnCollectGhost(c) {
    const gen = dealGeneration;
    const ghost = document.createElement('div');
    ghost.className = 'deal-ghost';
    ghost.style.left = `${c.fromRect.left}px`;
    ghost.style.top = `${c.fromRect.top}px`;
    ghost.style.transform = 'translate(0px, 0px)';

    const cardEl = createCardElement(c.card, true);
    ghost.appendChild(cardEl);
    document.body.appendChild(ghost);

    playPlaceSound();

    const dx = c.toRect.left - c.fromRect.left;
    const dy = c.toRect.top - c.fromRect.top;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            ghost.style.transform = `translate(${dx}px, ${dy}px)`;
        });
    });

    setTimeout(() => {
        ghost.remove();
        // Abandoned by a New Game — the fresh board owns the DOM now.
        if (gen !== dealGeneration) return;
        const foundationEl = document.getElementById(`foundation-${c.targetIdx}`);
        if (foundationEl) {
            foundationEl.querySelectorAll('.deal-destination-hidden').forEach(el => {
                el.classList.remove('deal-destination-hidden');
            });
        }
        checkWin();
    }, AUTOCOLLECT_ANIM_MS + 60);
}

// Pointer-events drag pipeline. One code path for mouse and touch.
// Cards stay in their original DOM container; we apply a transform
// translate via CSS vars (--drag-x / --drag-y). Snap-back is just a
// CSS transition on transform when those vars return to 0.

let dropHighlightActive = false;
const DRAG_THRESHOLD_SQ = 16;
const SNAP_BACK_MS = 480;

let lastTapTime = 0;
let lastTapKey = null;

function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    // A pending (not yet moved) press also blocks a second pointer.
    if (isBusy() || pointerDrag) return;

    const cardEl = e.target.closest('.card');
    if (!cardEl || cardEl.classList.contains('face-down')) return;

    const pileInfo = getPileFromEvent({ target: cardEl });
    if (!canPickUp(pileInfo)) return;

    const cards = movingStackFrom(pileInfo);
    if (cards.length === 0 || cards.some(c => !c.faceUp)) return;

    // Collect DOM elements for the moving stack.
    const cardEls = [];
    if (pileInfo.type === 'tableau') {
        const pileEl = cardEl.parentElement;
        const allInPile = Array.from(pileEl.querySelectorAll('.card'));
        for (let i = pileInfo.index; i < allInPile.length; i++) cardEls.push(allInPile[i]);
    } else {
        cardEls.push(cardEl);
    }

    const rect = cardEl.getBoundingClientRect();
    pointerDrag = {
        active: false,
        pointerId: e.pointerId,
        pileInfo,
        cards,
        cardEls,
        cardEl,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        moved: false,
    };

    try { cardEl.setPointerCapture(e.pointerId); } catch (_) {}
}

function beginPointerDrag() {
    pointerDrag.active = true;
    dragState.isDragging = true;
    dragState.originPile = pointerDrag.pileInfo;
    dragState.originIndex = pointerDrag.pileInfo.index;
    dragState.cards = pointerDrag.cards;

    pointerDrag.cardEls.forEach(el => {
        el.classList.add('dragging', 'no-anim');
    });
    pointerDrag.sourcePileEl = pointerDrag.cardEls[0] && pointerDrag.cardEls[0].parentElement;
    if (pointerDrag.sourcePileEl) pointerDrag.sourcePileEl.classList.add('dragging-source');
    showDropHighlights(pointerDrag.pileInfo);
}

function clearDragSource() {
    document.querySelectorAll('.pile.dragging-source').forEach(el => el.classList.remove('dragging-source'));
}

function onPointerMove(e) {
    if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
    const dx = e.clientX - pointerDrag.startX;
    const dy = e.clientY - pointerDrag.startY;

    if (!pointerDrag.active) {
        if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
        beginPointerDrag();
    }

    pointerDrag.cardEls.forEach(el => {
        el.style.setProperty('--drag-x', `${dx}px`);
        el.style.setProperty('--drag-y', `${dy}px`);
    });
    e.preventDefault();
}

function onPointerUp(e) {
    if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
    const drag = pointerDrag;
    pointerDrag = null;

    try { drag.cardEl.releasePointerCapture(e.pointerId); } catch (_) {}

    if (!drag.active) {
        handlePointerClick(drag);
        return;
    }

    const pileEl = pileFromPoint(e.clientX, e.clientY);
    const target = pileEl ? getDropTargetInfo(pileEl) : null;

    // Sync dragState for legacy code (executeMove, isValidMove).
    dragState.cards = drag.cards;
    dragState.originPile = drag.pileInfo;
    dragState.originIndex = drag.pileInfo.index;

    if (target && isValidMove(target)) {
        // Valid drop: clear the inline drag offsets and let executeMove re-render.
        drag.cardEls.forEach(el => {
            el.style.removeProperty('--drag-x');
            el.style.removeProperty('--drag-y');
        });
        clearDropHighlights();
        dragState.isDragging = false;
        playPlaceSound();
        executeMove(target);
        clearDragSource();
    } else {
        snapBack(drag);
    }
}

function snapBack(drag) {
    clearDropHighlights();
    drag.cardEls.forEach(el => {
        el.classList.remove('no-anim');
        el.style.setProperty('--drag-x', '0px');
        el.style.setProperty('--drag-y', '0px');
    });
    const gen = dealGeneration;
    setTimeout(() => {
        if (gen !== dealGeneration) return; // deal() already reset the board
        // A new drag may have started inside the snap-back window, possibly
        // on these very cards: only undo what this drag set up.
        const live = pointerDrag && pointerDrag.active ? pointerDrag : null;
        drag.cardEls.forEach(el => {
            if (live && live.cardEls.includes(el)) return;
            el.classList.remove('dragging');
            el.style.removeProperty('--drag-x');
            el.style.removeProperty('--drag-y');
        });
        if (drag.sourcePileEl && !(live && live.sourcePileEl === drag.sourcePileEl)) {
            drag.sourcePileEl.classList.remove('dragging-source');
        }
        if (!live) dragState.isDragging = false;
    }, SNAP_BACK_MS);
}

// New Game mid-drag: drop the pointer without moving anything, and clear the
// drag/auto-move classes so a card element reused by the next deal is clean.
function cancelDrag() {
    if (pointerDrag) {
        try { pointerDrag.cardEl.releasePointerCapture(pointerDrag.pointerId); } catch (_) {}
        pointerDrag = null;
    }
    dragState.isDragging = false;
    document.querySelectorAll('.card.dragging, .card.no-anim').forEach(el => {
        el.classList.remove('dragging', 'no-anim');
        el.style.removeProperty('--drag-x');
        el.style.removeProperty('--drag-y');
    });
    clearDragSource();
    clearDropHighlights();
}

function onPointerCancel(e) {
    if (!pointerDrag || e.pointerId !== pointerDrag.pointerId) return;
    const drag = pointerDrag;
    pointerDrag = null;
    if (drag.active) snapBack(drag);
}

function handlePointerClick(drag) {
    const key = `${drag.pileInfo.type}-${drag.pileInfo.pileIndex}-${drag.pileInfo.index}`;
    const now = Date.now();
    const isDouble = lastTapKey === key && (now - lastTapTime) <= DOUBLE_CLICK_TIMEOUT;
    lastTapTime = now;
    lastTapKey = key;

    if (isDouble) {
        lastTapKey = null;
        const pile = drag.pileInfo;
        const isTop = pile.index === pile.cards.length - 1;
        if (isTop || pile.type === 'tableau') {
            tryAutoMove(pile, drag.cardEl);
        }
    }
}

function pileFromPoint(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
        if (el.classList && el.classList.contains('pile')) return el;
    }
    return null;
}

function getDropTargetInfo(pileEl) {
    if (pileEl.id.startsWith('foundation-')) {
        const fIndex = parseInt(pileEl.id.split('-')[1], 10);
        return { type: 'foundation', pileIndex: fIndex, cards: gameState.foundations[fIndex] };
    } else if (pileEl.id.startsWith('tableau-')) {
        const tIndex = parseInt(pileEl.id.split('-')[1], 10);
        return { type: 'tableau', pileIndex: tIndex, cards: gameState.tableau[tIndex] };
    }
    return null;
}

function isValidMove(target) {
    return isValidMoveFor(dragState.cards, target);
}

// A multi-card stack is only movable if it is itself a valid tableau run.
// The pointer path can only ever lift valid runs, but this keeps every other
// entry point (keyboard, future ones) honest.
function isValidSequence(cards) {
    for (let i = 1; i < cards.length; i++) {
        const prev = cards[i - 1];
        const cur = cards[i];
        if (!cur.faceUp) return false;
        if (prev.color === cur.color) return false;
        if (cur.value !== prev.value - 1) return false;
    }
    return true;
}

function isValidMoveFor(cards, target) {
    if (!cards || cards.length === 0) return false;
    if (!target) return false;
    const movingCard = cards[0];
    if (!movingCard || !movingCard.faceUp) return false;
    if (cards.length > 1 && !isValidSequence(cards)) return false;

    if (target.type === 'foundation') {
        if (cards.length > 1) return false;
        const foundationPile = target.cards;
        if (foundationPile.length === 0) {
            return movingCard.value === ACE_VALUE;
        } else {
            const topCard = foundationPile[foundationPile.length - 1];
            return topCard.suit === movingCard.suit && topCard.value === movingCard.value - 1;
        }
    }

    if (target.type === 'tableau') {
        const targetPile = target.cards;
        if (targetPile.length === 0) {
            return movingCard.value === KING_VALUE;
        } else {
            const topCard = targetPile[targetPile.length - 1];
            return topCard.color !== movingCard.color && movingCard.value === topCard.value - 1;
        }
    }

    return false;
}

function clearDropHighlights() {
    if (!dropHighlightActive) return;
    document.querySelectorAll('.pile.valid-drop').forEach(el => {
        el.classList.remove('valid-drop');
    });
    dropHighlightActive = false;
}

function showDropHighlights(pileInfo) {
    clearDropHighlights();
    if (!canPickUp(pileInfo)) return;

    for (const target of legalTargets(movingStackFrom(pileInfo), pileInfo)) {
        const el = document.getElementById(`${target.type}-${target.pileIndex}`);
        if (el) el.classList.add('valid-drop');
    }

    dropHighlightActive = true;
}

function executeMove(target) {
    const cardsToMove = [...dragState.cards];
    const origin = dragState.originPile;
    
    // History holds live card references — undo puts the very same objects back,
    // so identity stays stable across the whole board (autocollect's desync
    // guard compares by identity). Only the coordinates are snapshotted.
    moveHistory.push({
        kind: 'move',
        origin: { type: origin.type, pileIndex: origin.pileIndex, index: origin.index },
        target: { type: target.type, pileIndex: target.pileIndex },
        cards: cardsToMove,
        flippedCard: null
    });
    
    if (origin.type === 'waste') {
        gameState.waste.splice(gameState.waste.length - cardsToMove.length);
    } else if (origin.type === 'foundation') {

        gameState.foundations[origin.pileIndex].splice(origin.index);

    } else if (origin.type === 'tableau') {
        const wasFlipped = origin.cards[origin.index - 1] && !origin.cards[origin.index - 1].faceUp;
        gameState.tableau[origin.pileIndex].splice(origin.index);
        
        if (wasFlipped && gameState.tableau[origin.pileIndex].length > 0) {
            const topCard = gameState.tableau[origin.pileIndex][gameState.tableau[origin.pileIndex].length - 1];
            if (!topCard.faceUp) {
                topCard.faceUp = true;
                topCard.justFlipped = true;
                playFlipSound();
                moveHistory[moveHistory.length - 1].flippedCard = { pileIndex: origin.pileIndex };
            }
        }
    }
    
    if (target.type === 'foundation') {
        cardsToMove.forEach(card => {
            card.faceUp = true;
            gameState.foundations[target.pileIndex].push(card);
        });
    } else if (target.type === 'tableau') {
        cardsToMove.forEach(card => {
            card.faceUp = true;
            gameState.tableau[target.pileIndex].push(card);
        });
    }
    
    updateUndoButton();
    announceMove(cardsToMove, origin, target);
    renderPile(origin);
    renderPile(target);
    startTimer();
    bumpMoves(1);
    checkWin();
}

function undo() {
    if (isBusy()) return;
    if (moveHistory.length === 0) return;

    const lastMove = moveHistory.pop();

    if (lastMove.kind === 'stock') {
        undoStockEntry(lastMove);
        return;
    }

    const origin = lastMove.origin;
    const cards = lastMove.cards;
    
    if (origin.type === 'waste') {
        cards.forEach(card => {
            gameState.waste.push(card);
        });
    } else if (origin.type === 'foundation') {
        cards.forEach(card => {
            gameState.foundations[origin.pileIndex].push(card);
        });
    } else if (origin.type === 'tableau') {
        if (lastMove.flippedCard) {
            const pile = gameState.tableau[lastMove.flippedCard.pileIndex];
            if (pile.length > 0) {
                pile[pile.length - 1].faceUp = false;
            }
        }
        
        cards.forEach(card => {
            gameState.tableau[origin.pileIndex].push(card);
        });
    }
    
    const target = lastMove.target;
    if (target.type === 'foundation') {
        gameState.foundations[target.pileIndex].splice(-cards.length);
    } else if (target.type === 'tableau') {
        gameState.tableau[target.pileIndex].splice(-cards.length);
    }
    
    updateUndoButton();
    lastMoveAnnouncement = 'Move undone.';
    updateGameStatus();
    renderPile(origin);
    renderPile(target);
    bumpMoves(UNDO_PENALTY, true);
}

// Reverse a stock draw / waste recycle. Both are strict LIFO transfers, so
// popping the destination back restores the exact original order.
function undoStockEntry(entry) {
    const from = entry.op === 'draw' ? gameState.waste : gameState.stock;
    const to = entry.op === 'draw' ? gameState.stock : gameState.waste;
    const faceUp = entry.op !== 'draw';

    for (let i = 0; i < entry.count; i++) {
        const card = from.pop();
        if (!card) break;
        card.faceUp = faceUp;
        card.justFlipped = false;
        to.push(card);
    }

    updateUndoButton();
    lastMoveAnnouncement = 'Move undone.';
    updateGameStatus();
    renderStock();
    renderWaste();
    bumpMoves(UNDO_PENALTY, true);
}

function updateUndoButton() {
    const undoBtn = document.getElementById('undo-btn');
    undoBtn.disabled = moveHistory.length === 0;
}

function handleStockClick() {
    if (isBusy()) return;
    if (gameState.stock.length > 0) {
        const drawCount = Math.min(gameState.drawCount, gameState.stock.length);
        const drawnCards = [];
        
        const gen = dealGeneration;
        for (let i = 0; i < drawCount; i++) {
            const card = gameState.stock.pop();
            if (!card.faceUp) {
                card.faceUp = true;
                card.justFlipped = true;
                // Match the ghost stagger — firing all three the same tick
                // stacks the samples into one click and lags the visuals.
                const delay = i * DEAL_STAGGER_MS;
                if (delay === 0) playFlipSound();
                else setTimeout(() => { if (gen === dealGeneration) playFlipSound(); }, delay);
            }
            gameState.waste.push(card);
            drawnCards.push(card);
        }

        moveHistory.push({ kind: 'stock', op: 'draw', count: drawCount });
        startTimer();
        bumpMoves(1);
        updateUndoButton();
        const top = gameState.waste[gameState.waste.length - 1];
        lastMoveAnnouncement = drawCount === 1
            ? `Drew ${top.rank} of ${top.suit}.`
            : `Drew ${drawCount} cards, ${top.rank} of ${top.suit} on top.`;
        updateGameStatus();
        renderStock();
        renderWaste();
        animateStockToWaste(drawnCards);
        return;
    } else if (gameState.waste.length > 0) {
        const recycled = gameState.waste.length;
        while (gameState.waste.length > 0) {
            const card = gameState.waste.pop();
            card.faceUp = false;
            gameState.stock.push(card);
        }
        moveHistory.push({ kind: 'stock', op: 'recycle', count: recycled });
        startTimer();
        bumpMoves(1);
        updateUndoButton();
        lastMoveAnnouncement = `Recycled ${recycled} cards into the stock.`;
    }

    updateGameStatus();
    renderStock();
    renderWaste();
}

function animateStockToWaste(drawnCards) {
    if (!drawnCards || drawnCards.length === 0) return;

    const gen = dealGeneration;
    const stockEl = document.getElementById('stock');
    const wasteEl = document.getElementById('waste');
    if (!stockEl || !wasteEl) return;

    // Hide destination cards BEFORE any layout-flushing reads,
    // so iOS Safari doesn't paint a frame with them visible.
    const destEls = [];
    const hiddenEls = [];
    const startIndex = gameState.waste.length - drawnCards.length;
    for (let i = 0; i < drawnCards.length; i++) {
        const el = document.querySelector(`[data-pile="waste"][data-index="${startIndex + i}"]`);
        destEls.push(el);
        if (el) {
            el.classList.add('deal-destination-hidden');
            hiddenEls.push(el);
        }
    }

    const stockRect = stockEl.getBoundingClientRect();
    const wasteRect = wasteEl.getBoundingClientRect();
    // Each card flies to its own slot: draw-3 fans the waste, so a single
    // pile-level destination would drop the top card short of where it lands.
    const destRects = destEls.map(el => (el ? el.getBoundingClientRect() : wasteRect));

    const ghosts = [];
    drawnCards.forEach((card, i) => {
        const dx = destRects[i].left - stockRect.left;
        const dy = destRects[i].top - stockRect.top;

        const ghost = document.createElement('div');
        ghost.className = 'deal-ghost';
        ghost.style.left = `${stockRect.left}px`;
        ghost.style.top = `${stockRect.top}px`;
        ghost.style.transform = 'translate(0px, 0px) rotateY(180deg)';
        ghost.style.transitionDelay = `${i * DEAL_STAGGER_MS}ms`;

        const cardEl = createCardElement(card, true);
        ghost.appendChild(cardEl);
        document.body.appendChild(ghost);
        ghosts.push(ghost);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                ghost.style.transform = `translate(${dx}px, ${dy}px) rotateY(0deg)`;
            });
        });
    });

    // Single sync handoff: reveal real cards and remove all ghosts on the
    // same frame so no frame has neither visible.
    const totalDuration = 700 + (drawnCards.length - 1) * DEAL_STAGGER_MS;
    setTimeout(() => {
        requestAnimationFrame(() => {
            ghosts.forEach(g => g.remove());
            // Abandoned by a New Game — deal() already swept the ghosts and the
            // hidden elements belong to the old board.
            if (gen !== dealGeneration) return;
            hiddenEls.forEach(el => el.classList.remove('deal-destination-hidden'));
        });
    }, totalDuration);
}

function checkWin() {
    const totalInFoundations = gameState.foundations.reduce((sum, f) => sum + f.length, 0);
    
    if (totalInFoundations === TOTAL_CARDS) {
        startWinAnimation();
    }
}

// The one motion signal the game acts on. matchMedia is live, so a mid-session
// OS change takes effect without a reload.
function reducedMotionActive() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function showWinOverlay() {
    openModal(document.getElementById('win-overlay'), document.getElementById('win-new-game'));
    if (!reducedMotionActive()) confetti.celebrate();

    document.getElementById('win-moves').textContent = moveCount;
    document.getElementById('win-time').textContent = formatElapsed(timerStopMs - timerStartMs);
}

function hideWinOverlay() {
    closeModal(document.getElementById('win-overlay'));
}

// --- Modal dialogs (Info, win) -------------------------------------------------
// While one is open the rest of the page is inert: no focus, no clicks, no
// board shortcuts behind it. Focus moves into the dialog and comes back on close.
const MODAL_BACKGROUND = ['header', 'main', '#config-panel'];
let modalReturnFocus = null;

function activeModal() {
    return document.querySelector('.info-overlay:not(.hidden), .win-overlay:not(.hidden)');
}

function setBackgroundInert(inert) {
    for (const sel of MODAL_BACKGROUND) {
        const el = document.querySelector(sel);
        if (el) el.inert = inert;
    }
}

function openModal(overlay, focusEl) {
    if (!overlay.classList.contains('hidden')) return;
    setConfigOpen(false);
    if (!activeModal()) modalReturnFocus = document.activeElement;
    overlay.classList.remove('hidden');
    setBackgroundInert(true);
    if (focusEl) focusEl.focus();
}

function closeModal(overlay) {
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    if (activeModal()) return;
    setBackgroundInert(false);
    const back = modalReturnFocus;
    modalReturnFocus = null;
    if (back && back.isConnected && back !== document.body) back.focus();
}

// Cascade timing. The modal used to wait for all 52 cards to launch
// (52 × 250ms ≈ 13s of dead air); it now pops early and the cascade keeps
// running behind it.
const WIN_FLIGHT_MS = 3000;
const WIN_STAGGER_MS = 90;
const WIN_OVERLAY_DELAY_MS = 1800;

function animateCardFlyAway(cardsToAnimate, animLayer, gen) {
    // Abandoned by a New Game mid-cascade — don't read the old board or pop the
    // win overlay over the fresh deal.
    if (gen !== dealGeneration) return;
    const durationMs = WIN_FLIGHT_MS;
    if (cardsToAnimate.length === 0) {
        // Last card launched: retire the layer once its flight finishes,
        // instead of leaving 52 invisible clones parked until the next deal.
        setTimeout(() => {
            if (gen !== dealGeneration) return;
            animLayer.remove();
        }, durationMs);
        return;
    }

    const flyingCard = cardsToAnimate[cardsToAnimate.length - 1];
    const pileIndex = parseInt(flyingCard.dataset.pile.split('-')[1], 10);
    const card = gameState.foundations[pileIndex][flyingCard.dataset.index];
    const rect = flyingCard.getBoundingClientRect();
    const clone = createCardElement(card, true);
    clone.classList.add('win-fly-card');
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    
    const x = -window.innerWidth * (1.1 + Math.random() * 0.6);
    const y = -(window.innerHeight * 0.1) + Math.random() * (window.innerHeight * 0.9);
    const r = (Math.random() * 200 - 100);
    clone.style.setProperty('--win-x', `${x}px`);
    clone.style.setProperty('--win-y', `${y}px`);
    clone.style.setProperty('--win-r', `${r}deg`);
    clone.style.animationDuration = `${durationMs}ms`;
    animLayer.appendChild(clone);
    flyingCard.style.opacity = 0;

    setTimeout(() => {
        animateCardFlyAway(cardsToAnimate.slice(0, -1), animLayer, gen);
    }, WIN_STAGGER_MS);
}

function startWinAnimation() {
    if (winAnimating) return;
    winAnimating = true;
    stopTimer();
    document.querySelectorAll('.win-blast-layer').forEach(el => el.remove());

    // Reduced motion: no cascade, no confetti — go straight to the result.
    if (reducedMotionActive()) {
        showWinOverlay();
        return;
    }

    const cardsToAnimate = document.querySelectorAll(".foundations .card");
    const layer = document.createElement('div');
    layer.className = 'win-blast-layer';
    document.body.appendChild(layer);
    const gen = dealGeneration;
    animateCardFlyAway([...cardsToAnimate], layer, gen);

    // The modal is on its own clock, not the tail of the cascade.
    setTimeout(() => {
        if (gen !== dealGeneration) return;
        showWinOverlay();
    }, WIN_OVERLAY_DELAY_MS);
}

// Human-readable destination for the live region: "the hearts foundation",
// "column 3", "the waste".
function pileLabel(pileInfo) {
    if (!pileInfo) return 'the board';
    if (pileInfo.type === 'foundation') return `the ${SUITS[pileInfo.pileIndex]} foundation`;
    if (pileInfo.type === 'tableau') return `column ${pileInfo.pileIndex + 1}`;
    if (pileInfo.type === 'waste') return 'the waste';
    return 'the stock';
}

function announceMove(cards, origin, target) {
    if (!cards || cards.length === 0) return;
    const first = cards[0];
    const what = cards.length === 1
        ? `${first.rank} of ${first.suit}`
        : `${cards.length} cards from ${first.rank} of ${first.suit}`;
    lastMoveAnnouncement = `${what} to ${pileLabel(target)}.`;
    updateGameStatus();
}

function updateGameStatus() {
    const status = document.getElementById('game-status');
    const stockCount = gameState.stock.length;
    const wasteCount = gameState.waste.length;
    const foundationCount = gameState.foundations.reduce((sum, f) => sum + f.length, 0);

    const counts = `Stock: ${stockCount} cards. Waste: ${wasteCount} cards. Foundations: ${foundationCount}/${TOTAL_CARDS} cards.`;
    status.textContent = lastMoveAnnouncement ? `${lastMoveAnnouncement} ${counts}` : counts;
}

function handleConfigToggle() {
    setConfigOpen(document.getElementById('config-panel').classList.contains('hidden'));
}

function setConfigOpen(open) {
    const panel = document.getElementById('config-panel');
    panel.classList.toggle('hidden', !open);
    document.getElementById('config-btn').setAttribute('aria-expanded', String(open));
}

// Switching draw mode mid-game would change the rules under a game in
// progress (and is an easy way to cheat a draw-3 deal), so once a move has
// been made the new mode waits for the next deal.
function handleDrawCountChange(e) {
    const n = Number(e.target.value);
    if (n !== 1 && n !== 3) return;
    if (moveCount === 0) {
        gameState.drawCount = n;
        pendingDrawCount = null;
        renderWaste();
    } else {
        pendingDrawCount = n === gameState.drawCount ? null : n;
        if (pendingDrawCount !== null) {
            lastMoveAnnouncement = `Draw ${n} applies from the next game.`;
            updateGameStatus();
        }
    }
    updateDrawNote();
    saveSettings();
}

function updateDrawNote() {
    const note = document.getElementById('draw-note');
    if (note) note.hidden = pendingDrawCount === null;
}

function handleBgColorChange(e) {
    applyBgColor(e.target.value);
    saveSettings();
}

function handleAutoMoveChange(e) {
    gameState.autoMove = !!e.target.checked;
    saveSettings();
}

function applyBgColor(color) {
    // Only ever a #rrggbb from the colour input; anything else (a corrupt or
    // hand-edited setting) would land verbatim in a CSS custom property.
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) return;
    document.documentElement.style.setProperty('--bg-color', color);
    gameState.bgColor = color;
}

function saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            // The mode the player picked, even if it waits for the next deal.
            drawCount: pendingDrawCount ?? gameState.drawCount,
            bgColor: gameState.bgColor,
            autoMove: gameState.autoMove
        }));
    } catch (e) {
        console.warn('Could not save settings to localStorage');
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const settings = JSON.parse(saved);
            if (!settings || typeof settings !== 'object') return;
            const drawCount = Number(settings.drawCount);
            if (drawCount === 1 || drawCount === 3) {
                gameState.drawCount = drawCount;
                const radio = document.querySelector(`input[name="draw-count"][value="${drawCount}"]`);
                if (radio) {
                    radio.checked = true;
                }
            }
            applyBgColor(settings.bgColor);
            if (typeof settings.autoMove === 'boolean') {
                gameState.autoMove = settings.autoMove;
                const toggle = document.getElementById('automove-toggle');
                if (toggle) {
                    toggle.checked = settings.autoMove;
                }
            }
        }
    } catch (e) {
        console.warn('Could not load settings from localStorage');
    }
}

// Resolve whatever currently has focus to a pileInfo. Focus can sit on a card
// or — when a pile is empty, or on the stock — on the pile element itself.
function pileInfoFromFocus(el) {
    if (!el || !el.classList) return null;
    if (el.classList.contains('card')) return getPileFromEvent({ target: el });
    if (!el.classList.contains('pile')) return null;

    const id = el.id || '';
    if (id === 'stock') {
        return { type: 'stock', pileIndex: 0, cards: gameState.stock, index: gameState.stock.length - 1 };
    }
    if (id === 'waste') {
        return { type: 'waste', pileIndex: 0, cards: gameState.waste, index: gameState.waste.length - 1 };
    }
    if (id.startsWith('foundation-')) {
        const i = parseInt(id.split('-')[1], 10);
        return { type: 'foundation', pileIndex: i, cards: gameState.foundations[i], index: gameState.foundations[i].length - 1 };
    }
    if (id.startsWith('tableau-')) {
        const i = parseInt(id.split('-')[1], 10);
        return { type: 'tableau', pileIndex: i, cards: gameState.tableau[i], index: gameState.tableau[i].length - 1 };
    }
    return null;
}

function handleKeyboardNavigation(e) {
    // A dialog owns the keyboard. Esc closes the Info panel; the win dialog
    // is left with Play Again.
    const modal = activeModal();
    if (modal) {
        if (e.key === 'Escape' && modal.id === 'info-overlay') {
            closeInfo();
            e.preventDefault();
        }
        return;
    }

    const panel = document.getElementById('config-panel');
    if (e.key === 'Escape' && !panel.classList.contains('hidden')) {
        setConfigOpen(false);
        document.getElementById('config-btn').focus();
        e.preventDefault();
        return;
    }

    if (isBusy()) return;
    if (dragState.isDragging) return;

    // Undo is a global shortcut — it works wherever focus happens to be, as
    // the button's "Undo (Z)" tooltip has always advertised. Skipped while
    // typing into the config panel's inputs.
    const target = e.target;
    const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing) {
        clearSelection();
        undo();
        e.preventDefault();
        return;
    }

    const pileInfo = pileInfoFromFocus(document.activeElement);
    if (!pileInfo) return;

    if (pileInfo.type === 'stock' && (e.key === 'Enter' || e.key === ' ')) {
        clearSelection();
        handleStockClick();
        e.preventDefault();
        return;
    }

    let handled = false;

    switch (e.key) {
        case 'ArrowLeft':
            handled = moveKeyboardSelection(pileInfo, 'left');
            break;
        case 'ArrowRight':
            handled = moveKeyboardSelection(pileInfo, 'right');
            break;
        case 'ArrowUp':
            handled = moveKeyboardSelection(pileInfo, 'up');
            break;
        case 'ArrowDown':
            handled = moveKeyboardSelection(pileInfo, 'down');
            break;
        case 'Enter':
        case ' ':
            handled = handleKeyboardAction(pileInfo);
            break;
        case 'Escape':
            clearSelection();
            handled = true;
            break;
    }
    
    if (handled) {
        e.preventDefault();
    }
}

// The top row, left to right, and the tableau column each slot sits above
// (the gap between the waste and the first foundation is over column 3).
const TOP_ROW = [
    { type: 'stock', pileIndex: 0, column: 0 },
    { type: 'waste', pileIndex: 0, column: 1 },
    { type: 'foundation', pileIndex: 0, column: 3 },
    { type: 'foundation', pileIndex: 1, column: 4 },
    { type: 'foundation', pileIndex: 2, column: 5 },
    { type: 'foundation', pileIndex: 3, column: 6 },
];

function pileCards(type, pileIndex) {
    if (type === 'stock') return gameState.stock;
    if (type === 'waste') return gameState.waste;
    if (type === 'foundation') return gameState.foundations[pileIndex];
    return gameState.tableau[pileIndex];
}

// Arrow keys move spatially: along a column, between columns, and between the
// tableau and the pile above it in the top row.
function moveKeyboardSelection(pileInfo, direction) {
    if (pileInfo.type === 'tableau') {
        const col = pileInfo.pileIndex;
        const pile = gameState.tableau[col];

        if (direction === 'down' && pileInfo.index < pile.length - 1) {
            return focusSlot('tableau', col, pileInfo.index + 1);
        }
        if (direction === 'up' && pileInfo.index > 0) {
            return focusSlot('tableau', col, pileInfo.index - 1);
        }
        if (direction === 'up') {
            // Top of the column: the nearest top-row pile above it.
            const above = TOP_ROW.reduce((best, slot) =>
                Math.abs(slot.column - col) < Math.abs(best.column - col) ? slot : best);
            return focusSlot(above.type, above.pileIndex);
        }
        const nextCol = direction === 'left' ? col - 1 : direction === 'right' ? col + 1 : -1;
        if (nextCol < 0 || nextCol >= TABLEAU_COUNT) return false;
        const nextLen = gameState.tableau[nextCol].length;
        return focusSlot('tableau', nextCol, Math.max(0, Math.min(pileInfo.index, nextLen - 1)));
    }

    const slot = TOP_ROW.findIndex(t => t.type === pileInfo.type && t.pileIndex === pileInfo.pileIndex);
    if (slot < 0) return false;
    if (direction === 'left' && slot > 0) return focusSlot(TOP_ROW[slot - 1].type, TOP_ROW[slot - 1].pileIndex);
    if (direction === 'right' && slot < TOP_ROW.length - 1) return focusSlot(TOP_ROW[slot + 1].type, TOP_ROW[slot + 1].pileIndex);
    if (direction === 'down') {
        const col = TOP_ROW[slot].column;
        return focusSlot('tableau', col, gameState.tableau[col].length - 1);
    }
    return false;
}

// Focus a card by position, or the pile itself when it is the stock or empty
// (an empty pile is still a drop target). Top-row piles default to their top card.
function focusSlot(type, pileIndex, index) {
    const cards = pileCards(type, pileIndex);
    let el;
    if (type === 'stock' || cards.length === 0) {
        el = document.getElementById(type === 'stock' || type === 'waste' ? type : `${type}-${pileIndex}`);
    } else {
        el = document.querySelector(cardSelector({ type, pileIndex }, index ?? cards.length - 1));
    }
    if (!el) return false;
    el.focus();
    return true;
}

function cardSelector(pileInfo, index) {
    const pile = pileInfo.type === 'waste' ? 'waste' : `${pileInfo.type}-${pileInfo.pileIndex}`;
    return `[data-pile="${pile}"][data-index="${index}"]`;
}

function handleKeyboardAction(pileInfo) {
    if (selectedCard) {
        const origin = selectedCard;
        clearSelection();

        // The selection may be stale (New Game, autocollect, an undo since);
        // re-validate it against live state before touching the board.
        if (!canPickUp(origin)) return true;

        // A pile can't drop onto itself.
        if (origin.type === pileInfo.type && origin.pileIndex === pileInfo.pileIndex) return true;

        dragState.originPile = origin;
        dragState.originIndex = origin.index;
        dragState.cards = movingStackFrom(origin);

        if (isValidMove(pileInfo)) {
            playPlaceSound();
            executeMove(pileInfo);
            return true;
        }

        // Invalid target: put focus back on the card the player had armed.
        const originEl = document.querySelector(cardSelector(origin, origin.index));
        if (originEl) originEl.focus();
        return true;
    }

    // Nothing armed yet — arm this card, if it is legally movable.
    if (!canPickUp(pileInfo)) return false;

    selectedCard = pileInfo;
    for (let i = pileInfo.index; i < pileInfo.cards.length; i++) {
        const el = document.querySelector(cardSelector(pileInfo, i));
        if (el) el.classList.add('selected');
        if (pileInfo.type !== 'tableau') break;
    }
    return true;
}

function clearSelection() {
    document.querySelectorAll('.card.selected').forEach(el => {
        el.classList.remove('selected');
    });
    selectedCard = null;
}

function init() {
    const gameBoard = document.querySelector('.game-board');
    gameBoard.addEventListener('pointerdown', onPointerDown);
    gameBoard.addEventListener('pointermove', onPointerMove);
    gameBoard.addEventListener('pointerup', onPointerUp);
    gameBoard.addEventListener('pointercancel', onPointerCancel);
    gameBoard.addEventListener('dblclick', handleDoubleClick);
    
    document.getElementById('stock').addEventListener('click', handleStockClick);
    document.getElementById('new-game-btn').addEventListener('click', deal);
    document.getElementById('config-btn').addEventListener('click', handleConfigToggle);
    document.getElementById('win-new-game').addEventListener('click', deal);
    document.getElementById('undo-btn').addEventListener('click', undo);
    document.getElementById('autocollect-btn').addEventListener('click', autocollect);
    document.getElementById('info-btn').addEventListener('click', openInfo);
    document.getElementById('info-close').addEventListener('click', closeInfo);
    document.getElementById('info-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'info-overlay') closeInfo();
    });
    // The FPS probe costs a second of rAF sampling, so it runs only for
    // someone who opens the diagnostics.
    document.getElementById('device-info').addEventListener('toggle', (e) => {
        if (e.target.open && window.motionProps && window.motionProps.fps === null && window.remeasureFPS) {
            window.remeasureFPS();
        }
    });
    
    document.querySelectorAll('input[name="draw-count"]').forEach(radio => {
        radio.addEventListener('change', handleDrawCountChange);
    });

    const bgPicker = document.getElementById('bg-color-picker');
    if (bgPicker) {
        bgPicker.addEventListener('input', handleBgColorChange);
    }
    const autoMoveToggle = document.getElementById('automove-toggle');
    if (autoMoveToggle) {
        autoMoveToggle.addEventListener('change', handleAutoMoveChange);
    }
    
    document.addEventListener('keydown', handleKeyboardNavigation);
    
    document.addEventListener('click', (e) => {
        const configPanel = document.getElementById('config-panel');
        const configBtn = document.getElementById('config-btn');
        if (!configPanel.classList.contains('hidden') &&
            !configPanel.contains(e.target) &&
            !configBtn.contains(e.target)) {
            setConfigOpen(false);
        }
    });
    
    preloadAudio();
    const unlockOnce = () => {
        unlockAudio();
        window.removeEventListener('pointerdown', unlockOnce, true);
        window.removeEventListener('touchstart', unlockOnce, true);
        window.removeEventListener('keydown', unlockOnce, true);
    };
    window.addEventListener('pointerdown', unlockOnce, true);
    window.addEventListener('touchstart', unlockOnce, true);
    window.addEventListener('keydown', unlockOnce, true);
    loadSettings();
    if (bgPicker) {
        const current = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim();
        if (current) {
            bgPicker.value = current;
        }
    }
    if (autoMoveToggle) {
        autoMoveToggle.checked = gameState.autoMove;
    }
    deal();

    let resizeRaf = null;
    window.addEventListener('resize', () => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
            updateCardOffset();
            renderTableau();
        });
    });

    if (screen.orientation) {
        screen.orientation.addEventListener('change', renderMotionInfo);
    }
    renderMotionInfo();
}

// Device diagnostics, folded away under "Device info" in the How to play panel.
function updateMetaInfoDiv(el) {
    if (!el) return;
    const type = screen.orientation ? screen.orientation.type : '';
    const angle = screen.orientation ? screen.orientation.angle : 0;

    const p = window.motionProps || {};
    const fmt = (v) => v === null || v === undefined
        ? '—'
        : (typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
    const rows = [
        ['Viewport', getViewport()],
        ['Orientation', (type || '?') + ' / ' + angle + '°'],
        ['FPS', fmt(p.fps)],
        ['Reduced motion', fmt(p.prefersReducedMotion)],
        ['Monochrome', fmt(p.monochrome)],
        ['Monochrome depth (≤2)', fmt(p.monochromeDepth)],
        ['CPU cores', fmt(p.hardwareConcurrency)],
        ['Low power (≤2 cores)', fmt(p.lowPower)],
        ['Device memory (GB)', fmt(p.deviceMemory)],
        ['Low memory (≤2GB)', fmt(p.lowMemory)],
    ];
    const list = document.createElement('ul');
    list.className = 'motion-props';
    for (const [k, v] of rows) {
        const li = document.createElement('li');
        const key = document.createElement('span');
        key.className = 'mp-key';
        key.textContent = k;
        const val = document.createElement('span');
        val.className = 'mp-val';
        val.textContent = String(v);
        li.append(key, val);
        list.appendChild(li);
    }
    el.replaceChildren(list);
}

// Lets motion.js refresh the panel once async FPS lands.
function renderMotionInfo() {
    const el = document.getElementById('info-content');
    if (el) updateMetaInfoDiv(el);
}

function openInfo() {
    renderMotionInfo();
    openModal(document.getElementById('info-overlay'), document.getElementById('info-close'));
}

function closeInfo() {
    closeModal(document.getElementById('info-overlay'));
}

function getViewport() {
    return `${window.innerWidth}\u00d7${window.innerHeight}`;
}

const confettiCanvas = document.getElementById('confettiCanvas');
const confetti = new ConfettiEngine(confettiCanvas);


document.addEventListener('DOMContentLoaded', init);
