// Core game-logic coverage: move validation, undo, stock recycle.
// These exercise game.js rules directly in-page (globals are bare identifiers,
// not on window). Previously only covered by the orphaned node test.js.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

const card = (suit, rank, value, color, faceUp = true) =>
    ({ suit, rank, value, color, faceUp, rotate: 0 });

test.describe('move validation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');
    });

    test('foundation accepts only an Ace when empty', async ({ page }) => {
        const r = await page.evaluate((c) => ({
            ace: isValidMoveFor([c.aceH], { type: 'foundation', pileIndex: 0, cards: [] }),
            two: isValidMoveFor([c.twoH], { type: 'foundation', pileIndex: 0, cards: [] }),
        }), { aceH: card('hearts', 'A', 1, 'red'), twoH: card('hearts', '2', 2, 'red') });
        expect(r.ace).toBe(true);
        expect(r.two).toBe(false);
    });

    test('foundation builds up by suit, rejects wrong suit / non-sequential', async ({ page }) => {
        const r = await page.evaluate((c) => {
            const found = [c.aceH];
            return {
                sameSuitNext: isValidMoveFor([c.twoH], { type: 'foundation', pileIndex: 0, cards: found }),
                wrongSuit:    isValidMoveFor([c.twoD], { type: 'foundation', pileIndex: 0, cards: found }),
                skipRank:     isValidMoveFor([c.threeH], { type: 'foundation', pileIndex: 0, cards: found }),
            };
        }, {
            aceH: card('hearts', 'A', 1, 'red'),
            twoH: card('hearts', '2', 2, 'red'),
            twoD: card('diamonds', '2', 2, 'red'),
            threeH: card('hearts', '3', 3, 'red'),
        });
        expect(r.sameSuitNext).toBe(true);
        expect(r.wrongSuit).toBe(false);
        expect(r.skipRank).toBe(false);
    });

    test('foundation rejects multi-card stacks', async ({ page }) => {
        const r = await page.evaluate((c) =>
            isValidMoveFor([c.aceH, c.twoH], { type: 'foundation', pileIndex: 0, cards: [] }),
        { aceH: card('hearts', 'A', 1, 'red'), twoH: card('hearts', '2', 2, 'red') });
        expect(r).toBe(false);
    });

    test('empty tableau accepts only a King', async ({ page }) => {
        const r = await page.evaluate((c) => ({
            king: isValidMoveFor([c.kingS], { type: 'tableau', pileIndex: 0, cards: [] }),
            queen: isValidMoveFor([c.queenS], { type: 'tableau', pileIndex: 0, cards: [] }),
        }), { kingS: card('spades', 'K', 13, 'black'), queenS: card('spades', 'Q', 12, 'black') });
        expect(r.king).toBe(true);
        expect(r.queen).toBe(false);
    });

    test('tableau builds down by alternating color, rejects same color / wrong rank', async ({ page }) => {
        const r = await page.evaluate((c) => {
            const pile = [c.sevenS]; // black 7
            return {
                altColorDown: isValidMoveFor([c.sixH], { type: 'tableau', pileIndex: 0, cards: pile }), // red 6 ✓
                sameColor:    isValidMoveFor([c.sixC], { type: 'tableau', pileIndex: 0, cards: pile }), // black 6 ✗
                wrongRank:    isValidMoveFor([c.fiveH], { type: 'tableau', pileIndex: 0, cards: pile }), // red 5 ✗
            };
        }, {
            sevenS: card('spades', '7', 7, 'black'),
            sixH: card('hearts', '6', 6, 'red'),
            sixC: card('clubs', '6', 6, 'black'),
            fiveH: card('hearts', '5', 5, 'red'),
        });
        expect(r.altColorDown).toBe(true);
        expect(r.sameColor).toBe(false);
        expect(r.wrongRank).toBe(false);
    });
});

test('undo restores moved card, re-hides auto-flipped card, applies +5 penalty', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined');

    const r = await page.evaluate(() => {
        // Column 0: face-down 5S under face-up 4H. Column 1: face-up 5C.
        gameState.stock = []; gameState.waste = [];
        gameState.foundations = [[], [], [], []];
        gameState.tableau = [[], [], [], [], [], [], []];
        gameState.tableau[0] = [
            { suit: 'spades', rank: '5', value: 5, color: 'black', faceUp: false, rotate: 0 },
            { suit: 'hearts', rank: '4', value: 4, color: 'red',   faceUp: true,  rotate: 0 },
        ];
        gameState.tableau[1] = [
            { suit: 'clubs', rank: '5', value: 5, color: 'black', faceUp: true, rotate: 0 },
        ];
        moveHistory = [];
        renderAll();
        resetStats();

        // Move 4H from col0 -> col1. Should auto-flip the 5S beneath.
        dragState.originPile = { type: 'tableau', pileIndex: 0, cards: gameState.tableau[0], index: 1 };
        dragState.originIndex = 1;
        dragState.cards = [gameState.tableau[0][1]];
        executeMove({ type: 'tableau', pileIndex: 1, cards: gameState.tableau[1] });

        const afterMove = {
            col0Len: gameState.tableau[0].length,
            col0TopFaceUp: gameState.tableau[0][0].faceUp,
            col1Len: gameState.tableau[1].length,
            moves: moveCount,
        };

        undo();

        const afterUndo = {
            col0Len: gameState.tableau[0].length,
            col0TopFaceUp: gameState.tableau[0][0].faceUp, // 5S re-hidden
            col1Len: gameState.tableau[1].length,
            moves: moveCount, // 1 (move) + 5 (undo penalty)
        };
        return { afterMove, afterUndo };
    });

    expect(r.afterMove.col0Len).toBe(1);
    expect(r.afterMove.col0TopFaceUp).toBe(true);
    expect(r.afterMove.col1Len).toBe(2);
    expect(r.afterMove.moves).toBe(1);

    expect(r.afterUndo.col0Len).toBe(2);
    expect(r.afterUndo.col0TopFaceUp).toBe(false);
    expect(r.afterUndo.col1Len).toBe(1);
    expect(r.afterUndo.moves).toBe(6);
});

test('clicking empty stock recycles the waste back face-down', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined');

    const r = await page.evaluate(() => {
        gameState.stock = [];
        gameState.waste = [
            { suit: 'hearts', rank: '4', value: 4, color: 'red',   faceUp: true, rotate: 0 },
            { suit: 'clubs',  rank: '7', value: 7, color: 'black', faceUp: true, rotate: 0 },
        ];
        renderAll();
        handleStockClick(); // stock empty -> recycle waste
        return {
            stockLen: gameState.stock.length,
            wasteLen: gameState.waste.length,
            allFaceDown: gameState.stock.every(c => !c.faceUp),
        };
    });

    expect(r.stockLen).toBe(2);
    expect(r.wasteLen).toBe(0);
    expect(r.allFaceDown).toBe(true);
});
