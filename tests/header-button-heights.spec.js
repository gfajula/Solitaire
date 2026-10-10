const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test('header buttons share identical height', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined');

    const heights = await page.evaluate(() => {
        const buttons = document.querySelectorAll('.header-buttons button');
        return Array.from(buttons).map(b => ({
            id: b.id || b.className,
            height: b.getBoundingClientRect().height
        }));
    });

    expect(heights.length).toBeGreaterThan(0);
    const first = heights[0].height;
    for (const h of heights) {
        expect(Math.abs(h.height - first)).toBeLessThanOrEqual(0.5);
    }
});
