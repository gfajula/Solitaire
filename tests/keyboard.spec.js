// Keyboard path coverage. The keyboard entry point historically bypassed the
// rules the pointer path enforces (top-card-only, valid runs) and could not
// reach the tableau at all — these pin both down.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

const card = (suit, rank, value, color, faceUp = true) =>
    ({ suit, rank, value, color, faceUp, rotate: 0 });

// Replace the whole board with a deterministic layout and render it.
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

test.describe('keyboard play', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);
    });

    test('buried foundation card cannot be lifted via the keyboard', async ({ page }) => {
        await setBoard(page, {
            stock: [],
            waste: [],
            foundations: [
                [card('hearts', 'A', 1, 'red'), card('hearts', '2', 2, 'red'),
                 card('hearts', '3', 3, 'red'), card('hearts', '4', 4, 'red'),
                 card('hearts', '5', 5, 'red')],
                [], [], [],
            ],
            tableau: [[card('spades', '4', 4, 'black')], [], [], [], [], [], []],
        });

        const r = await page.evaluate(() => {
            const found = gameState.foundations[0];
            const col0 = gameState.tableau[0];

            // Arm the buried 3 of hearts (index 2 of 5), then target the black 4.
            const armed = handleKeyboardAction({ type: 'foundation', pileIndex: 0, index: 2, cards: found });
            handleKeyboardAction({ type: 'tableau', pileIndex: 0, index: col0.length - 1, cards: col0 });

            return {
                armed,
                selected: selectedCard !== null,
                foundationLen: gameState.foundations[0].length,
                tableauLen: gameState.tableau[0].length,
                buriedTabIndex: document.querySelector('[data-pile="foundation-0"][data-index="2"]').tabIndex,
                topTabIndex: document.querySelector('[data-pile="foundation-0"][data-index="4"]').tabIndex,
            };
        });

        expect(r.armed).toBe(false);
        expect(r.foundationLen).toBe(5);   // nothing left the foundation
        expect(r.tableauLen).toBe(1);      // and nothing illegal landed on the 4♠
        expect(r.buriedTabIndex).toBe(-1); // buried cards are not tab-reachable
        expect(r.topTabIndex).toBe(0);
    });

    test('buried waste card cannot be lifted via the keyboard', async ({ page }) => {
        await setBoard(page, {
            stock: [],
            waste: [card('hearts', '5', 5, 'red'), card('clubs', 'K', 13, 'black')],
            foundations: [[], [], [], []],
            tableau: [[card('spades', '6', 6, 'black')], [], [], [], [], [], []],
        });

        const r = await page.evaluate(() => {
            const waste = gameState.waste;
            const col0 = gameState.tableau[0];
            const armed = handleKeyboardAction({ type: 'waste', pileIndex: 0, index: 0, cards: waste });
            handleKeyboardAction({ type: 'tableau', pileIndex: 0, index: col0.length - 1, cards: col0 });
            return {
                armed,
                wasteLen: gameState.waste.length,
                tableauLen: gameState.tableau[0].length,
                buriedTabIndex: document.querySelector('[data-pile="waste"][data-index="0"]').tabIndex,
                topTabIndex: document.querySelector('[data-pile="waste"][data-index="1"]').tabIndex,
            };
        });

        expect(r.armed).toBe(false);
        expect(r.wasteLen).toBe(2);
        expect(r.tableauLen).toBe(1);
        expect(r.buriedTabIndex).toBe(-1);
        expect(r.topTabIndex).toBe(0);
    });

    test('face-up tableau cards are tab-focusable, face-down are not', async ({ page }) => {
        const r = await page.evaluate(() => {
            const col6 = gameState.tableau[6];
            const top = document.querySelector(`[data-pile="tableau-6"][data-index="${col6.length - 1}"]`);
            const buried = document.querySelector('[data-pile="tableau-6"][data-index="0"]');
            top.focus();
            return {
                topTabIndex: top.tabIndex,
                buriedTabIndex: buried.tabIndex,
                focusReached: document.activeElement === top,
                stockTabIndex: document.getElementById('stock').tabIndex,
            };
        });

        expect(r.topTabIndex).toBe(0);      // face-up
        expect(r.buriedTabIndex).toBe(-1);  // face-down
        expect(r.focusReached).toBe(true);
        expect(r.stockTabIndex).toBe(0);
    });

    test('Enter selects then moves a card; a whole run moves to the tableau', async ({ page }) => {
        await setBoard(page, {
            stock: [],
            waste: [],
            foundations: [[], [], [], []],
            tableau: [
                [card('spades', '7', 7, 'black'), card('hearts', '6', 6, 'red'), card('spades', '5', 5, 'black')],
                [card('hearts', '8', 8, 'red')],
                [], [], [], [], [],
            ],
        });

        const r = await page.evaluate(() => {
            const col0 = gameState.tableau[0];
            const col1 = gameState.tableau[1];
            // Arm the 7♠ (head of a valid 3-card run) and drop it on the 8♥.
            handleKeyboardAction({ type: 'tableau', pileIndex: 0, index: 0, cards: col0 });
            const selectedEls = document.querySelectorAll('.card.selected').length;
            handleKeyboardAction({ type: 'tableau', pileIndex: 1, index: 0, cards: col1 });
            return {
                selectedEls,
                col0: gameState.tableau[0].length,
                col1: gameState.tableau[1].map(c => c.rank + c.suit[0]),
                stillSelected: document.querySelectorAll('.card.selected').length,
            };
        });

        expect(r.selectedEls).toBe(3);   // the whole run is highlighted
        expect(r.col0).toBe(0);
        expect(r.col1).toEqual(['8h', '7s', '6h', '5s']);
        expect(r.stillSelected).toBe(0); // no leaked .selected class
    });

    test('an invalid target clears the selection highlight', async ({ page }) => {
        await setBoard(page, {
            stock: [],
            waste: [],
            foundations: [[], [], [], []],
            tableau: [[card('spades', '7', 7, 'black')], [card('clubs', '9', 9, 'black')], [], [], [], [], []],
        });

        const r = await page.evaluate(() => {
            const col0 = gameState.tableau[0];
            const col1 = gameState.tableau[1];
            handleKeyboardAction({ type: 'tableau', pileIndex: 0, index: 0, cards: col0 });
            handleKeyboardAction({ type: 'tableau', pileIndex: 1, index: 0, cards: col1 }); // 7♠ on 9♣ — illegal
            return {
                col0: gameState.tableau[0].length,
                col1: gameState.tableau[1].length,
                leaked: document.querySelectorAll('.card.selected').length,
                selection: selectedCard,
            };
        });

        expect(r.col0).toBe(1);
        expect(r.col1).toBe(1);
        expect(r.leaked).toBe(0);
        expect(r.selection).toBeNull();
    });

    test('an empty tableau column is focusable and accepts a king', async ({ page }) => {
        await setBoard(page, {
            stock: [],
            waste: [card('clubs', 'K', 13, 'black')],
            foundations: [[], [], [], []],
            tableau: [[], [], [], [], [], [], []],
        });

        const r = await page.evaluate(() => {
            const pileEl = document.getElementById('tableau-0');
            pileEl.focus();
            const focusable = document.activeElement === pileEl;

            handleKeyboardAction({ type: 'waste', pileIndex: 0, index: 0, cards: gameState.waste });
            handleKeyboardAction(pileInfoFromFocus(pileEl));

            return { focusable, col0: gameState.tableau[0].length, waste: gameState.waste.length };
        });

        expect(r.focusable).toBe(true);
        expect(r.col0).toBe(1);
        expect(r.waste).toBe(0);
    });

    test('a focused buried card renders above the cards stacked on it', async ({ page }) => {
        await setBoard(page, {
            stock: [],
            waste: [],
            foundations: [[], [], [], []],
            tableau: [[card('spades', 'K', 13, 'black'), card('hearts', 'Q', 12, 'red'),
                       card('clubs', 'J', 11, 'black')], [], [], [], [], [], []],
        });

        // A key press first, so the programmatic focus counts as :focus-visible.
        await page.keyboard.press('Shift');
        const z = await page.evaluate(() => {
            const els = document.querySelectorAll('#tableau-0 .card');
            els[0].focus();
            return {
                visible: els[0].matches(':focus-visible'),
                focused: Number(getComputedStyle(els[0]).zIndex),
                above: Number(getComputedStyle(els[2]).zIndex),
            };
        });

        // Renderers set an inline z-index; the ring must not slide under it.
        expect(z.visible).toBe(true);
        expect(z.focused).toBeGreaterThan(z.above);
    });

    test('arrow keys reach the stock, waste and foundations from the tableau', async ({ page }) => {
        await setBoard(page, {
            stock: [card('clubs', '2', 2, 'black', false)],
            waste: [],
            foundations: [[], [], [], []],
            tableau: [[card('spades', '9', 9, 'black')], [], [], [card('hearts', '4', 4, 'red')], [], [], []],
        });
        const focused = () => page.evaluate(() => {
            const el = document.activeElement;
            return el.dataset.pile ? `${el.dataset.pile}:${el.dataset.index}` : el.id;
        });

        await page.focus('#tableau-0 .card');
        await page.keyboard.press('ArrowLeft');
        expect(await focused()).toBe('tableau-0:0'); // no wrap off the left edge
        await page.keyboard.press('ArrowUp');
        expect(await focused()).toBe('stock');
        await page.keyboard.press('ArrowRight');
        expect(await focused()).toBe('waste'); // empty pile: the pile itself
        await page.keyboard.press('ArrowRight');
        expect(await focused()).toBe('foundation-0');
        await page.keyboard.press('ArrowDown');
        expect(await focused()).toBe('tableau-3:0');
        await page.keyboard.press('ArrowUp');
        expect(await focused()).toBe('foundation-0');
    });

    test('Enter on the stock draws a card', async ({ page }) => {
        const r = await page.evaluate(() => {
            const stockEl = document.getElementById('stock');
            stockEl.focus();
            const before = gameState.waste.length;
            handleKeyboardNavigation({
                key: 'Enter', preventDefault() {},
            });
            return { before, after: gameState.waste.length };
        });

        expect(r.after).toBe(r.before + 1);
    });
});

test.describe('move validation — stack sequence', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');
    });

    test('a stack that is not an alternating descending run is rejected', async ({ page }) => {
        const r = await page.evaluate((c) => ({
            validRun:   isValidMoveFor([c.sixH, c.fiveS], { type: 'tableau', pileIndex: 0, cards: [c.sevenS] }),
            sameColor:  isValidMoveFor([c.sixH, c.fiveH], { type: 'tableau', pileIndex: 0, cards: [c.sevenS] }),
            ascending:  isValidMoveFor([c.sixH, c.sevenS], { type: 'tableau', pileIndex: 0, cards: [c.sevenS] }),
        }), {
            sevenS: card('spades', '7', 7, 'black'),
            sixH: card('hearts', '6', 6, 'red'),
            fiveS: card('spades', '5', 5, 'black'),
            fiveH: card('hearts', '5', 5, 'red'),
        });

        expect(r.validRun).toBe(true);
        expect(r.sameColor).toBe(false);
        expect(r.ascending).toBe(false);
    });
});

test.describe('undo across stock interaction', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);
    });

    test('a stock draw is undoable and restores the waste order', async ({ page }) => {
        await setBoard(page, {
            stock: [card('clubs', '9', 9, 'black', false), card('clubs', '8', 8, 'black', false)],
            waste: [card('hearts', 'A', 1, 'red')],
            foundations: [[], [], [], []],
            tableau: [[], [], [], [], [], [], []],
        });

        const r = await page.evaluate(() => {
            // Move the waste ace to a foundation, then draw, then undo twice.
            handleKeyboardAction({ type: 'waste', pileIndex: 0, index: 0, cards: gameState.waste });
            handleKeyboardAction({ type: 'foundation', pileIndex: 0, index: -1, cards: gameState.foundations[0] });
            const afterMove = { waste: gameState.waste.length, foundation: gameState.foundations[0].length };

            handleStockClick();
            const afterDraw = { waste: gameState.waste.length, stock: gameState.stock.length };

            undo(); // undoes the draw
            const afterUndo1 = { waste: gameState.waste.length, stock: gameState.stock.length };

            undo(); // undoes the foundation move
            return {
                afterMove,
                afterDraw,
                afterUndo1,
                waste: gameState.waste.map(c => c.rank + c.suit[0]),
                foundation: gameState.foundations[0].length,
                stockFaceUp: gameState.stock.some(c => c.faceUp),
            };
        });

        expect(r.afterMove).toEqual({ waste: 0, foundation: 1 });
        expect(r.afterDraw).toEqual({ waste: 1, stock: 1 });
        expect(r.afterUndo1).toEqual({ waste: 0, stock: 2 });
        // The ace returns to the waste, not stranded above a later-drawn card.
        expect(r.waste).toEqual(['Ah']);
        expect(r.foundation).toBe(0);
        expect(r.stockFaceUp).toBe(false);
    });

    test('undo returns the same card objects, not clones', async ({ page }) => {
        await setBoard(page, {
            stock: [],
            waste: [card('hearts', 'A', 1, 'red')],
            foundations: [[], [], [], []],
            tableau: [[], [], [], [], [], [], []],
        });

        const r = await page.evaluate(() => {
            const original = gameState.waste[0];
            handleKeyboardAction({ type: 'waste', pileIndex: 0, index: 0, cards: gameState.waste });
            handleKeyboardAction({ type: 'foundation', pileIndex: 0, index: -1, cards: gameState.foundations[0] });
            const onFoundation = gameState.foundations[0][0] === original;
            undo();
            return { onFoundation, backInWaste: gameState.waste[0] === original };
        });

        expect(r.onFoundation).toBe(true);
        expect(r.backInWaste).toBe(true);
    });
});
