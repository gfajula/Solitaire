// Animation ghosts (.deal-ghost) outlive the pile they came from. A New Game
// mid-flight used to leave old-board ghosts sailing over the fresh deal.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test.describe('ghost lifecycle', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);
    });

    test('New Game sweeps in-flight stock-deal ghosts', async ({ page }) => {
        const during = await page.evaluate(() => {
            handleStockClick();
            return document.querySelectorAll('.deal-ghost').length;
        });
        expect(during).toBeGreaterThan(0);

        const afterDeal = await page.evaluate(() => {
            deal();
            return document.querySelectorAll('.deal-ghost').length;
        });
        expect(afterDeal).toBe(0);

        // And the abandoned cleanup timer must not resurrect anything.
        await page.waitForTimeout(1000);
        const settled = await page.evaluate(() => ({
            ghosts: document.querySelectorAll('.deal-ghost').length,
            hidden: document.querySelectorAll('.deal-destination-hidden').length,
        }));
        expect(settled.ghosts).toBe(0);
        expect(settled.hidden).toBe(0);
    });

    test('a normal draw cleans up its own ghosts', async ({ page }) => {
        await page.evaluate(() => handleStockClick());
        await page.waitForFunction(() => document.querySelectorAll('.deal-ghost').length === 0,
            null, { timeout: 4000 });

        const r = await page.evaluate(() => ({
            hidden: document.querySelectorAll('.deal-destination-hidden').length,
            waste: gameState.waste.length,
        }));
        expect(r.hidden).toBe(0);
        expect(r.waste).toBe(1);
    });

    test('autocollect ghosts do not touch a board dealt underneath them', async ({ page }) => {
        // Put an ace on top of column 0 so autocollect has work to do.
        await page.evaluate(() => {
            const all = [gameState.stock, gameState.waste, ...gameState.foundations, ...gameState.tableau].flat();
            const ace = all.find(c => c.rank === 'A');
            const strip = arr => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] === ace) arr.splice(i, 1); };
            strip(gameState.stock); strip(gameState.waste);
            gameState.tableau.forEach(strip);
            gameState.foundations.forEach(strip);
            ace.faceUp = true;
            gameState.tableau[0].push(ace);
            renderAll();
            autocollect();
        });

        await page.evaluate(() => deal());
        await page.waitForTimeout(900);

        const r = await page.evaluate(() => {
            const all = [gameState.stock, gameState.waste, ...gameState.foundations, ...gameState.tableau].flat();
            return {
                ghosts: document.querySelectorAll('.deal-ghost').length,
                hidden: document.querySelectorAll('.deal-destination-hidden').length,
                total: all.length,
                unique: new Set(all.map(c => c.suit + '-' + c.rank)).size,
                foundations: gameState.foundations.reduce((n, f) => n + f.length, 0),
            };
        });
        expect(r.ghosts).toBe(0);
        expect(r.hidden).toBe(0);
        expect(r.total).toBe(52);
        expect(r.unique).toBe(52);
        expect(r.foundations).toBe(0); // fresh deal untouched by the old pass
    });
});
