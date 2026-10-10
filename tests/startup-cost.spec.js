// Load-time work that Lighthouse counts as Total Blocking Time is deferred:
// no AudioContext until a user gesture, no full-screen confetti canvas until a win.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test('no AudioContext or sized confetti canvas before interaction', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
    const r = await page.evaluate(() => ({
        ctx: audioContext,
        canvasW: document.getElementById('confettiCanvas').width,
    }));
    expect(r.ctx).toBeNull();
    expect(r.canvasW).toBe(300);
});

// Sample decoding isn't asserted: fetch() can't read sounds over file://.
test('first gesture creates the AudioContext', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
    await page.mouse.click(5, 5);
    expect(await page.evaluate(() => audioContext !== null)).toBe(true);
});

test('celebrate sizes the confetti canvas to the viewport', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof confetti !== 'undefined');
    const w = await page.evaluate(() => { confetti.celebrate(); confetti.stop(); return confetti.w; });
    expect(w).toBe(page.viewportSize().width);
});
