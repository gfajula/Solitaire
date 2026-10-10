// Draw-3 mode: draw/recycle semantics, waste ordering, and the fan that keeps
// the two buried cards visible. Nothing covered draw-3 before.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test.describe('draw 3', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);
        await page.evaluate(() => { gameState.drawCount = 3; });
    });

    test('a draw moves three cards and keeps stock order', async ({ page }) => {
        const r = await page.evaluate(() => {
            const expected = gameState.stock.slice(-3).reverse().map(c => c.suit + '-' + c.rank);
            const stockBefore = gameState.stock.length;
            handleStockClick();
            return {
                stockBefore,
                stock: gameState.stock.length,
                waste: gameState.waste.map(c => c.suit + '-' + c.rank),
                expected,
                allFaceUp: gameState.waste.every(c => c.faceUp),
            };
        });

        expect(r.stock).toBe(r.stockBefore - 3);
        expect(r.waste).toEqual(r.expected);
        expect(r.allFaceUp).toBe(true);
    });

    test('the last three waste cards are fanned, the rest are flush', async ({ page }) => {
        await page.evaluate(() => { handleStockClick(); handleStockClick(); });
        await page.waitForTimeout(1200);

        // offsetLeft is the layout position — immune to the card transform.
        const lefts = await page.evaluate(() =>
            Array.from(document.querySelectorAll('#waste .card')).map(el => el.offsetLeft));

        expect(lefts.length).toBe(6);
        // First three sit flush on the pile.
        expect(lefts.slice(0, 3)).toEqual([0, 0, 0]);
        // Last three step to the right, strictly increasing.
        expect(lefts[3]).toBe(0);
        expect(lefts[4]).toBeGreaterThan(lefts[3]);
        expect(lefts[5]).toBeGreaterThan(lefts[4]);
    });

    test('draw 1 leaves the waste flush', async ({ page }) => {
        const lefts = await page.evaluate(() => {
            gameState.drawCount = 1;
            handleStockClick();
            handleStockClick();
            handleStockClick();
            return Array.from(document.querySelectorAll('#waste .card')).map(el => el.offsetLeft);
        });
        expect(lefts).toEqual([0, 0, 0]);
    });

    test('only the top waste card can be picked up when fanned', async ({ page }) => {
        await page.evaluate(() => handleStockClick());
        await page.waitForTimeout(800);

        const r = await page.evaluate(() => ({
            buried: canPickUp({ type: 'waste', pileIndex: 0, index: 0, cards: gameState.waste }),
            top: canPickUp({ type: 'waste', pileIndex: 0, index: gameState.waste.length - 1, cards: gameState.waste }),
        }));
        expect(r.buried).toBe(false);
        expect(r.top).toBe(true);
    });

    test('recycling the waste restores the stock in reverse and is undoable', async ({ page }) => {
        const r = await page.evaluate(() => {
            // Draw the whole stock into the waste.
            while (gameState.stock.length > 0) handleStockClick();
            const wasteOrder = gameState.waste.map(c => c.suit + '-' + c.rank);
            const drawn = gameState.waste.length;

            handleStockClick(); // recycle
            const afterRecycle = {
                stock: gameState.stock.length,
                waste: gameState.waste.length,
                anyFaceUp: gameState.stock.some(c => c.faceUp),
                // Recycling reverses the pile, so the stock top is the oldest card.
                order: gameState.stock.slice().reverse().map(c => c.suit + '-' + c.rank),
            };

            undo(); // undo the recycle
            return {
                drawn,
                wasteOrder,
                afterRecycle,
                restored: gameState.waste.map(c => c.suit + '-' + c.rank),
                stockAfterUndo: gameState.stock.length,
            };
        });

        expect(r.afterRecycle.stock).toBe(r.drawn);
        expect(r.afterRecycle.waste).toBe(0);
        expect(r.afterRecycle.anyFaceUp).toBe(false);
        expect(r.afterRecycle.order).toEqual(r.wasteOrder);
        // Undo puts the waste back exactly as it was.
        expect(r.restored).toEqual(r.wasteOrder);
        expect(r.stockAfterUndo).toBe(0);
    });

    test('a short final draw takes only what is left', async ({ page }) => {
        const r = await page.evaluate(() => {
            // Leave exactly 2 cards in the stock.
            const extra = gameState.stock.splice(0, gameState.stock.length - 2);
            gameState.waste.push(...extra.map(c => ({ ...c, faceUp: true })));
            renderAll();
            const wasteBefore = gameState.waste.length;
            handleStockClick();
            return { stock: gameState.stock.length, drew: gameState.waste.length - wasteBefore };
        });
        expect(r.drew).toBe(2);
        expect(r.stock).toBe(0);
    });
});
