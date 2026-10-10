// Win cascade timing. The modal used to wait for all 52 cards to launch
// (52 × 250ms ≈ 13s of dead air) and the blast layer was never retired.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

// Fill the foundations so startWinAnimation has 52 real cards to fling.
const WIN_STATE = () => {
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
    const COLORS = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };
    gameState.stock = [];
    gameState.waste = [];
    gameState.tableau = [[], [], [], [], [], [], []];
    gameState.foundations = SUITS.map(suit =>
        RANKS.map((rank, i) => ({ suit, rank, value: i + 1, color: COLORS[suit], faceUp: true, rotate: 0 })));
    renderAll();
};

test.describe('win cascade', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');
    });

    test('the modal appears while the cascade is still running', async ({ page }) => {
        await page.evaluate(WIN_STATE);
        await page.evaluate(() => startWinAnimation());

        // Not immediate...
        const atStart = await page.evaluate(() =>
            document.getElementById('win-overlay').classList.contains('hidden'));
        expect(atStart).toBe(true);

        // ...but well before the old ~13s wait.
        await page.waitForSelector('#win-overlay:not(.hidden)', { timeout: 4000 });

        const state = await page.evaluate(() => ({
            flying: document.querySelectorAll('.win-fly-card').length,
            layers: document.querySelectorAll('.win-blast-layer').length,
        }));
        // Cards are still launching behind the modal.
        expect(state.layers).toBe(1);
        expect(state.flying).toBeGreaterThan(0);
        expect(state.flying).toBeLessThan(52);
    });

    test('the modal renders above the flying cards', async ({ page }) => {
        const z = await page.evaluate(() => {
            const overlay = getComputedStyle(document.querySelector('.win-overlay')).zIndex;
            const layer = document.createElement('div');
            layer.className = 'win-blast-layer';
            document.body.appendChild(layer);
            const blast = getComputedStyle(layer).zIndex;
            layer.remove();
            return { overlay: parseInt(overlay, 10), blast: parseInt(blast, 10) };
        });
        expect(z.overlay).toBeGreaterThan(z.blast);
    });

    test('the blast layer is removed once the last card lands', async ({ page }) => {
        await page.evaluate(WIN_STATE);
        await page.evaluate(() => startWinAnimation());

        // 52 × 90ms stagger + a 3s flight ≈ 7.7s; allow headroom.
        await page.waitForFunction(
            () => document.querySelectorAll('.win-blast-layer').length === 0,
            null, { timeout: 15000 });

        const leftovers = await page.evaluate(() => document.querySelectorAll('.win-fly-card').length);
        expect(leftovers).toBe(0);
    });

    test('a New Game mid-cascade suppresses the modal and clears the layer', async ({ page }) => {
        await page.evaluate(WIN_STATE);
        await page.evaluate(() => startWinAnimation());
        await page.evaluate(() => deal());

        await page.waitForTimeout(2200); // past WIN_OVERLAY_DELAY_MS

        const r = await page.evaluate(() => ({
            hidden: document.getElementById('win-overlay').classList.contains('hidden'),
            layers: document.querySelectorAll('.win-blast-layer').length,
            winAnimating,
        }));
        expect(r.hidden).toBe(true);
        expect(r.layers).toBe(0);
        expect(r.winAnimating).toBe(false);
    });
});
