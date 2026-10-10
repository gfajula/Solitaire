// Accessibility: the live region announces move results, pinch-zoom is not
// blocked, and focus is both visible and restricted to playable cards.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test.describe('accessibility', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);
    });

    test('pinch-zoom is not blocked', async ({ page }) => {
        const content = await page.evaluate(() =>
            document.querySelector('meta[name="viewport"]').getAttribute('content'));
        expect(content).not.toContain('user-scalable=no');
        expect(content).not.toContain('maximum-scale');
    });

    test('the live region names the card and its destination', async ({ page }) => {
        const r = await page.evaluate(() => {
            gameState.waste = [{ suit: 'hearts', rank: 'A', value: 1, color: 'red', faceUp: true, rotate: 0 }];
            gameState.foundations = [[], [], [], []];
            renderAll();

            handleKeyboardAction({ type: 'waste', pileIndex: 0, index: 0, cards: gameState.waste });
            handleKeyboardAction({ type: 'foundation', pileIndex: 0, index: -1, cards: gameState.foundations[0] });
            const afterMove = document.getElementById('game-status').textContent;

            undo();
            const afterUndo = document.getElementById('game-status').textContent;
            return { afterMove, afterUndo };
        });

        expect(r.afterMove).toContain('A of hearts to the hearts foundation.');
        // The counts are still there — the announcement is added, not swapped in.
        expect(r.afterMove).toMatch(/Foundations: \d+\/52 cards\./);
        expect(r.afterUndo).toContain('Move undone.');
    });

    test('a multi-card move is announced as a run', async ({ page }) => {
        const text = await page.evaluate(() => {
            gameState.tableau[0] = [
                { suit: 'spades', rank: '7', value: 7, color: 'black', faceUp: true, rotate: 0 },
                { suit: 'hearts', rank: '6', value: 6, color: 'red', faceUp: true, rotate: 0 },
            ];
            gameState.tableau[1] = [{ suit: 'hearts', rank: '8', value: 8, color: 'red', faceUp: true, rotate: 0 }];
            renderAll();

            handleKeyboardAction({ type: 'tableau', pileIndex: 0, index: 0, cards: gameState.tableau[0] });
            handleKeyboardAction({ type: 'tableau', pileIndex: 1, index: 0, cards: gameState.tableau[1] });
            return document.getElementById('game-status').textContent;
        });

        expect(text).toContain('2 cards from 7 of spades to column 2.');
    });

    test('a stock draw and recycle are announced', async ({ page }) => {
        const r = await page.evaluate(() => {
            handleStockClick();
            const draw = document.getElementById('game-status').textContent;
            while (gameState.stock.length > 0) handleStockClick();
            handleStockClick(); // recycle
            return { draw, recycle: document.getElementById('game-status').textContent };
        });

        expect(r.draw).toMatch(/^Drew .+ of .+\./);
        expect(r.recycle).toMatch(/^Recycled \d+ cards into the stock\./);
    });

    test('focus is visible and limited to playable cards', async ({ page }) => {
        const r = await page.evaluate(() => {
            const focusable = Array.from(document.querySelectorAll('.card'))
                .filter(el => el.tabIndex === 0);
            // One top card per non-empty tableau column on a fresh deal.
            const faceDownFocusable = focusable.filter(el => el.classList.contains('face-down')).length;

            // The focus ring must be a real rule, not the invisible UA default.
            const probe = document.querySelector('.card');
            probe.focus();
            const ring = getComputedStyle(probe, ':focus-visible').outlineWidth;
            return { count: focusable.length, faceDownFocusable, ring };
        });

        expect(r.faceDownFocusable).toBe(0);
        expect(r.count).toBe(7); // seven tableau tops, stock/waste/foundations empty
        expect(r.ring).not.toBe('0px');
    });
});

test.describe('dialogs and controls', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);
    });

    const inertState = (page) => page.evaluate(() => ({
        header: document.querySelector('header').inert,
        main: document.querySelector('main').inert,
    }));

    test('the How to play dialog takes focus, blocks the board and gives focus back', async ({ page }) => {
        await page.evaluate(() => handleStockClick());
        await page.focus('#info-btn');
        await page.keyboard.press('Enter');

        expect(await page.evaluate(() => document.activeElement.id)).toBe('info-close');
        expect(await inertState(page)).toEqual({ header: true, main: true });

        // Board shortcuts are off while it is open: Z must not undo the draw.
        await page.keyboard.press('z');
        expect(await page.evaluate(() => moveHistory.length)).toBe(1);

        await page.keyboard.press('Escape');
        const r = await page.evaluate(() => ({
            hidden: document.getElementById('info-overlay').classList.contains('hidden'),
            focus: document.activeElement.id,
        }));
        expect(r).toEqual({ hidden: true, focus: 'info-btn' });
        expect(await inertState(page)).toEqual({ header: false, main: false });
    });

    test('the device diagnostics are folded away, but present', async ({ page }) => {
        await page.click('#info-btn');
        const r = await page.evaluate(() => ({
            open: document.getElementById('device-info').open,
            text: document.getElementById('info-content').textContent,
        }));
        expect(r.open).toBe(false);
        expect(r.text).toContain('Viewport');
    });

    test('the win dialog focuses Play Again and makes the board inert', async ({ page }) => {
        await page.evaluate(() => showWinOverlay());
        expect(await page.evaluate(() => document.activeElement.id)).toBe('win-new-game');
        expect(await inertState(page)).toEqual({ header: true, main: true });

        await page.keyboard.press('Enter');
        const hidden = await page.evaluate(() => document.getElementById('win-overlay').classList.contains('hidden'));
        expect(hidden).toBe(true);
        expect(await inertState(page)).toEqual({ header: false, main: false });
    });

    test('the settings button reports its state; Escape closes the panel', async ({ page }) => {
        const expanded = () => page.getAttribute('#config-btn', 'aria-expanded');
        expect(await expanded()).toBe('false');
        await page.click('#config-btn');
        expect(await expanded()).toBe('true');

        await page.focus('input[name="draw-count"][value="1"]');
        await page.keyboard.press('Escape');
        const r = await page.evaluate(() => ({
            hidden: document.getElementById('config-panel').classList.contains('hidden'),
            focus: document.activeElement.id,
        }));
        expect(r).toEqual({ hidden: true, focus: 'config-btn' });
        expect(await expanded()).toBe('false');
    });

    test('decorative graphics are hidden from assistive tech; the draw radios are grouped', async ({ page }) => {
        const r = await page.evaluate(() => {
            gameState.tableau[0] = [{ suit: 'spades', rank: 'K', value: 13, color: 'black', faceUp: true, rotate: 0 }];
            renderTableauColumn(0);
            const radios = [...document.querySelectorAll('input[name="draw-count"]')];
            return {
                iconsExposed: [...document.querySelectorAll('button svg')].filter(s => s.getAttribute('aria-hidden') !== 'true').length,
                canvasHidden: document.getElementById('confettiCanvas').getAttribute('aria-hidden'),
                courtAlt: document.querySelector('#tableau-0 .card-court-face img').getAttribute('alt'),
                legend: radios.every(r => r.closest('fieldset')) && radios[0].closest('fieldset').querySelector('legend').textContent,
            };
        });
        expect(r.iconsExposed).toBe(0);
        expect(r.canvasHidden).toBe('true');
        expect(r.courtAlt).toBe('');
        expect(r.legend).toBe('Draw mode');
    });

    test('autocollect announces what it moved', async ({ page }) => {
        await page.evaluate(() => {
            const ace = { suit: 'hearts', rank: 'A', value: 1, color: 'red', faceUp: true, rotate: 0 };
            gameState.waste = [ace];
            gameState.foundations = [[], [], [], []];
            gameState.tableau = [[], [], [], [], [], [], []];
            renderAll();
            autocollect();
        });
        await expect.poll(() => page.evaluate(() => autocollectActive), { timeout: 3000 }).toBe(false);
        const status = await page.evaluate(() => document.getElementById('game-status').textContent);
        expect(status).toContain('Collected 1 card to the foundations.');
    });
});
