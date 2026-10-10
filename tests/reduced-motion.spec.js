// prefers-reduced-motion is the one motion signal the game acts on. Under it
// the flip keyframes never run, so animationend never fires — the just-flipped
// class and card flag used to stick for the whole session.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test.describe('reduced motion', () => {
    test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
    });

    test('the reduced-motion class is applied', async ({ page }) => {
        const applied = await page.evaluate(() =>
            document.documentElement.classList.contains('reduced-motion'));
        expect(applied).toBe(true);
    });

    test('motion.js runs — no top-level identifier collision with game.js', async ({ page }) => {
        // Every script shares one global lexical scope; a duplicate top-level
        // const/function aborts the whole file silently apart from the console.
        const r = await page.evaluate(() => ({
            props: typeof window.motionProps,
            remeasure: typeof window.remeasureFPS,
        }));
        expect(r.props).toBe('object');
        expect(r.remeasure).toBe('function');
    });

    test('just-flipped settles instead of sticking forever', async ({ page }) => {
        await page.waitForTimeout(300);

        const afterDeal = await page.evaluate(() => {
            const all = [gameState.stock, gameState.waste, ...gameState.foundations, ...gameState.tableau].flat();
            return {
                classes: document.querySelectorAll('.card.just-flipped').length,
                flags: all.filter(c => c.justFlipped).length,
            };
        });
        expect(afterDeal.classes).toBe(0);
        expect(afterDeal.flags).toBe(0);

        // A stock draw flips cards too.
        await page.evaluate(() => handleStockClick());
        await page.waitForTimeout(300);

        const afterDraw = await page.evaluate(() => {
            const all = [gameState.stock, gameState.waste, ...gameState.foundations, ...gameState.tableau].flat();
            return {
                classes: document.querySelectorAll('.card.just-flipped').length,
                flags: all.filter(c => c.justFlipped).length,
            };
        });
        expect(afterDraw.classes).toBe(0);
        expect(afterDraw.flags).toBe(0);
    });

    test('the game is still playable with animations disabled', async ({ page }) => {
        const r = await page.evaluate(() => {
            gameState.waste = [{ suit: 'hearts', rank: 'A', value: 1, color: 'red', faceUp: true, rotate: 0 }];
            gameState.foundations = [[], [], [], []];
            renderAll();

            handleKeyboardAction({ type: 'waste', pileIndex: 0, index: 0, cards: gameState.waste });
            handleKeyboardAction({ type: 'foundation', pileIndex: 0, index: -1, cards: gameState.foundations[0] });

            const moved = gameState.foundations[0].length;
            undo();
            return { moved, undone: gameState.waste.length };
        });
        expect(r.moved).toBe(1);
        expect(r.undone).toBe(1);
    });

    test('the win goes straight to the modal — no cascade, no confetti', async ({ page }) => {
        await page.evaluate(() => {
            const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
            const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
            const COLORS = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };
            gameState.stock = [];
            gameState.waste = [];
            gameState.tableau = [[], [], [], [], [], [], []];
            gameState.foundations = SUITS.map(suit =>
                RANKS.map((rank, i) => ({ suit, rank, value: i + 1, color: COLORS[suit], faceUp: true, rotate: 0 })));
            renderAll();
            startWinAnimation();
        });

        const r = await page.evaluate(() => ({
            hidden: document.getElementById('win-overlay').classList.contains('hidden'),
            layers: document.querySelectorAll('.win-blast-layer').length,
            flying: document.querySelectorAll('.win-fly-card').length,
        }));
        // Synchronous — no 1.8s modal timer, no cascade layer.
        expect(r.hidden).toBe(false);
        expect(r.layers).toBe(0);
        expect(r.flying).toBe(0);
    });
});

test.describe('reduced motion follows the OS setting live', () => {
    test('toggling the preference mid-session updates the class both ways', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');
        const has = () => page.evaluate(() => document.documentElement.classList.contains('reduced-motion'));

        expect(await has()).toBe(false);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await expect.poll(has).toBe(true);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await expect.poll(has).toBe(false);
    });
});

test.describe('normal motion still animates', () => {
    test('the win cascade runs when motion is not reduced', async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');

        const r = await page.evaluate(() => {
            const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
            const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
            const COLORS = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };
            gameState.foundations = SUITS.map(suit =>
                RANKS.map((rank, i) => ({ suit, rank, value: i + 1, color: COLORS[suit], faceUp: true, rotate: 0 })));
            renderAll();
            startWinAnimation();
            return {
                hidden: document.getElementById('win-overlay').classList.contains('hidden'),
                layers: document.querySelectorAll('.win-blast-layer').length,
            };
        });
        expect(r.hidden).toBe(true);  // modal waits for its timer
        expect(r.layers).toBe(1);     // cascade layer exists
    });
});
