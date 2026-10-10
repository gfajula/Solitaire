// Input that arrives while the board is owned by something else: a second
// finger during a drag, a quick re-grab inside the snap-back window, New Game
// mid-drag, and a draw-mode change mid-game.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

const card = (suit, rank, value, color, faceUp = true) =>
    ({ suit, rank, value, color, faceUp, rotate: 0 });

async function setBoard(page, build) {
    await page.evaluate((b) => {
        gameState.stock = b.stock;
        gameState.waste = b.waste;
        gameState.foundations = b.foundations;
        gameState.tableau = b.tableau;
        moveHistory = [];
        clearSelection();
        renderAll();
    }, build);
}

// Two columns with a lone face-up card each, and a stock to draw from.
const BOARD = {
    stock: [card('clubs', '2', 2, 'black', false), card('clubs', '3', 3, 'black', false)],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[card('spades', '9', 9, 'black')], [card('hearts', '4', 4, 'red')], [], [], [], [], []],
};

async function centreOf(page, selector) {
    const box = await page.locator(selector).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Press on a card and move past the drag threshold, leaving the button down.
async function startDrag(page, selector) {
    const p = await centreOf(page, selector);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 30, p.y + 40, { steps: 4 });
    return p;
}

test.describe('input during a drag', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);
        await setBoard(page, BOARD);
    });

    test('a stock tap, undo or autocollect mid-drag is ignored', async ({ page }) => {
        // One draw first, so undo has something it could wrongly revert.
        await page.evaluate(() => handleStockClick());
        await startDrag(page, '#tableau-0 .card');
        const r = await page.evaluate(() => {
            const piles = () => ({ stock: gameState.stock.length, waste: gameState.waste.length, history: moveHistory.length });
            // What a second finger on the stock / undo / autocollect would call.
            const before = piles();
            handleStockClick();
            const afterStock = piles();
            undo();
            const afterUndo = piles();
            autocollect();
            return {
                active: !!(pointerDrag && pointerDrag.active),
                before, afterStock, afterUndo,
                autocollecting: autocollectActive,
            };
        });
        await page.mouse.up();

        expect(r.active).toBe(true);
        expect(r.afterStock).toEqual(r.before);
        expect(r.afterUndo).toEqual(r.before);
        expect(r.autocollecting).toBe(false);
    });

    test('New Game mid-drag cancels the drag and leaves no drag classes behind', async ({ page }) => {
        await startDrag(page, '#tableau-0 .card');
        await page.evaluate(() => deal());
        await page.mouse.up();
        await page.waitForTimeout(100);

        const r = await page.evaluate(() => ({
            pointerDrag,
            isDragging: dragState.isDragging,
            dragging: document.querySelectorAll('.card.dragging, .card.no-anim').length,
            sources: document.querySelectorAll('.pile.dragging-source').length,
            highlights: document.querySelectorAll('.pile.valid-drop').length,
            tableau: gameState.tableau.reduce((n, p) => n + p.length, 0),
            stock: gameState.stock.length,
        }));

        expect(r.pointerDrag).toBeNull();
        expect(r.isDragging).toBe(false);
        expect(r.dragging).toBe(0);
        expect(r.sources).toBe(0);
        expect(r.highlights).toBe(0);
        expect(r.tableau).toBe(28);
        expect(r.stock).toBe(24);
    });

    test('a second drag inside the snap-back window keeps its own drag state', async ({ page }) => {
        // Drop the 9 on an empty column: illegal, so it snaps back (480ms).
        await startDrag(page, '#tableau-0 .card');
        const empty = await centreOf(page, '#tableau-4');
        await page.mouse.move(empty.x, empty.y, { steps: 4 });
        await page.mouse.up();

        // Grab the 4 of hearts straight away and hold it past the snap-back timer.
        await startDrag(page, '#tableau-1 .card');
        await page.waitForTimeout(650);

        const r = await page.evaluate(() => ({
            sourceKept: document.getElementById('tableau-1').classList.contains('dragging-source'),
            cardKept: document.querySelector('#tableau-1 .card').classList.contains('dragging'),
            firstCleared: !document.getElementById('tableau-0').classList.contains('dragging-source'),
            isDragging: dragState.isDragging,
        }));
        await page.mouse.up();

        expect(r.sourceKept).toBe(true);
        expect(r.cardKept).toBe(true);
        expect(r.firstCleared).toBe(true);
        expect(r.isDragging).toBe(true);
    });
});

test.describe('stock draws and draw mode', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);
    });

    test('a draw counts as a move and starts the clock', async ({ page }) => {
        const r = await page.evaluate(() => {
            handleStockClick();
            return { moves: document.getElementById('moves').textContent, started: timerStartMs > 0 };
        });
        expect(r).toEqual({ moves: '1', started: true });
    });

    test('a draw-mode change applies at once before the first move', async ({ page }) => {
        await page.click('#config-btn');
        await page.check('input[name="draw-count"][value="3"]');
        const r = await page.evaluate(() => ({
            drawCount: gameState.drawCount,
            noteHidden: document.getElementById('draw-note').hidden,
        }));
        expect(r).toEqual({ drawCount: 3, noteHidden: true });
    });

    test('mid-game, a draw-mode change waits for the next deal', async ({ page }) => {
        await page.evaluate(() => handleStockClick());
        await page.click('#config-btn');
        await page.check('input[name="draw-count"][value="3"]');

        const during = await page.evaluate(() => ({
            drawCount: gameState.drawCount,
            noteHidden: document.getElementById('draw-note').hidden,
            stored: JSON.parse(localStorage.getItem('solitaire-settings')).drawCount,
            status: document.getElementById('game-status').textContent,
        }));
        expect(during.drawCount).toBe(1);
        expect(during.noteHidden).toBe(false);
        expect(during.stored).toBe(3);
        expect(during.status).toContain('Draw 3 applies from the next game.');

        const after = await page.evaluate(() => {
            deal();
            return { drawCount: gameState.drawCount, noteHidden: document.getElementById('draw-note').hidden };
        });
        expect(after).toEqual({ drawCount: 3, noteHidden: true });
    });
});
