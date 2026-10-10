const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test('autocollect button moves all eligible cards to foundations', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined');

    // Set up: aces of all suits on top of tableau columns 0-3
    await page.evaluate(() => {
        gameState.stock = [];
        gameState.waste = [];
        gameState.foundations = [[], [], [], []];
        gameState.tableau = [
            [{ suit: 'hearts',   rank: 'A', value: 1, color: 'red',   faceUp: true,  rotate: 0 }],
            [{ suit: 'diamonds', rank: 'A', value: 1, color: 'red',   faceUp: true,  rotate: 0 }],
            [{ suit: 'clubs',    rank: 'A', value: 1, color: 'black', faceUp: true,  rotate: 0 }],
            [{ suit: 'spades',   rank: 'A', value: 1, color: 'black', faceUp: true,  rotate: 0 }],
            [], [], []
        ];
        renderAll();
    });

    await page.locator('#autocollect-btn').click();

    // Wait for all animations to settle (4 cards, 150ms stagger, ~440ms anim, + buffer)
    await page.waitForFunction(() => !autocollectActive, null, { timeout: 5000 });

    const foundationCounts = await page.evaluate(() =>
        gameState.foundations.map(p => p.length)
    );
    expect(foundationCounts).toEqual([1, 1, 1, 1]);

    const tableauCounts = await page.evaluate(() =>
        gameState.tableau.map(p => p.length)
    );
    expect(tableauCounts.slice(0, 4)).toEqual([0, 0, 0, 0]);
});

test('info button: floats bottom-left on desktop, sits in the bottom bar on mobile', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined');

    const info = await page.locator('#info-btn').evaluate(el => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
            position: cs.position,
            bottom: r.bottom,
            left: r.left,
            inBar: !!el.closest('.header-buttons'),
            viewportH: window.innerHeight,
            viewportW: window.innerWidth,
        };
    });

    // Always low on the screen (bottom-left float on desktop, bottom toolbar on mobile).
    expect(info.bottom).toBeGreaterThan(info.viewportH * 0.7);

    if (info.viewportW > 768) {
        // Desktop: detached float in the bottom-left corner.
        expect(info.position).toBe('fixed');
        expect(info.left).toBeLessThan(100);
    } else {
        // Mobile: part of the fixed bottom action bar, in flow with the
        // other buttons rather than floating over them.
        expect(info.inBar).toBe(true);
        expect(info.position).toBe('static');
    }
});
