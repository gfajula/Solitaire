// v0.2
const SUIT_SYMBOLS = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
};

const SUIT_NUMBER = {
    hearts: 1,
    diamonds: 3,
    clubs: 2,
    spades: 0
};

function createCardCenter(value, suit) {
    const symbol = SUIT_SYMBOLS[suit];
    const suitNumber = SUIT_NUMBER[suit];
    const center = document.createElement('div');
    center.className = 'card-center';

    if (value === 1) center.classList.add('ace');

    // Pip layout: the suit columns of a real playing card. Pips in the lower
    // half are inverted, as printed.
    const pip = (invert) => `<div class="card-suit-large${invert ? ' invert' : ''}">${symbol}</div>`;
    const col = (pips) => `<div class="card-suit-column">${pips}</div>`;

    let column = '';
    let html = '';
    if (value > 1 && value < 4) {
        for (let i = 0; i < value; i++) column += pip(i + 1 > Math.ceil(value / 2));
        html = col(column);
    } else if (value === 4 || value === 6) {
        for (let i = 0; i < value / 2; i++) column += pip(i + 1 > Math.ceil(value / 4));
        html = col(column) + col(column);
    } else if (value === 5) {
        for (let i = 0; i < 2; i++) column += pip(i > 0);
        html = col(column) + col(pip(false)) + col(column);
    } else if (value === 7 || value === 8) {
        for (let i = 0; i < 3; i++) column += pip(i > 1);
        let columnCenter = '';
        for (let i = 0; i < value - 6; i++) columnCenter += pip(i > 0);
        html = col(column) + col(columnCenter) + col(column);
    } else if (value === 9 || value === 10) {
        for (let i = 0; i < 4; i++) column += pip(i > 1);
        let columnCenter = '';
        for (let i = 0; i < value - 8; i++) columnCenter += pip(i > 0);
        html = col(column) + col(columnCenter) + col(column);
    } else if (value > 10) {
        // Decorative: the card's aria-label already names it.
        html = `<div class="card-court-face"><img src="./court-cards/${suitNumber}_${value}.svg" alt=""></div>`;
    } else {
        html = col(pip(false));
    }

    center.innerHTML = html;
    return center;
}

function createCardElement(card, faceUp) {
    const cardEl = document.createElement('div');
    cardEl.classList.add('card', card.color);
    if (!faceUp) cardEl.classList.add('face-down');
    if (card.value === 1) cardEl.classList.add('ace');
    cardEl.style.setProperty('--rotate', `${card.rotate}deg`);
    const front = document.createElement('div');
    front.className = 'card-front';

    const topLeft = document.createElement('div');
    topLeft.className = 'card-corner top-left';
    const bidigitClass = String(card.rank) === '10' ? ' bidigit' : '';
    topLeft.innerHTML = `
        <span class="card-rank${bidigitClass}">${card.rank}</span>
        <span class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</span>
    `;

    const center = createCardCenter(card.value, card.suit);

    const bottomRight = document.createElement('div');
    bottomRight.className = 'card-corner bottom-right';
    bottomRight.innerHTML = `
        <span class="card-rank${bidigitClass}">${card.rank}</span>
        <span class="card-suit-small">${SUIT_SYMBOLS[card.suit]}</span>
    `;
    
    front.appendChild(topLeft);
    front.appendChild(center);
    front.appendChild(bottomRight);
    
    const back = document.createElement('div');
    back.className = 'card-back';
    
    cardEl.appendChild(front);
    cardEl.appendChild(back);

    cardEl.dataset.key = `${card.suit}-${card.rank}`;

    return cardEl;
}
