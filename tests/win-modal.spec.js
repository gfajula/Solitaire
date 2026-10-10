const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test('win modal displays correctly with new design', async ({ page }, testInfo) => {
    await page.goto(indexUrl);

    // Wait for game to load
    await page.waitForFunction(() => {
        return typeof gameState !== 'undefined';
    });

    // Programmatically win the game by filling all foundations
    await page.evaluate(() => {
        // Set up a winning state
        gameState.stock = [];
        gameState.waste = [];
        gameState.tableau = [[], [], [], [], [], [], []];
        gameState.foundations = [
            Array(13).fill(null).map((_, i) => ({ rank: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][i], suit: 'hearts' })),
            Array(13).fill(null).map((_, i) => ({ rank: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][i], suit: 'diamonds' })),
            Array(13).fill(null).map((_, i) => ({ rank: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][i], suit: 'clubs' })),
            Array(13).fill(null).map((_, i) => ({ rank: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][i], suit: 'spades' }))
        ];
        moveCount = 5;
        timerStartMs = Date.now() - 5000; // 5 seconds elapsed
        timerStopMs = Date.now();

        // Render and show win overlay
        renderAll();
        showWinOverlay();
    });

    // Wait for the win overlay to be visible
    await page.waitForSelector('#win-overlay:not(.hidden)', { timeout: 5000 });

    // Check that the win modal has the new structure
    const winLabel = await page.locator('.win-label').textContent();
    expect(winLabel).toBe('YOU WON');

    const winTitle = await page.locator('#win-title').textContent();
    expect(winTitle).toBe('Beautifully played.');

    const winMoves = await page.locator('#win-moves').textContent();
    expect(winMoves).toBe('5');

    const winTime = await page.locator('#win-time').textContent();
    expect(winTime.match(/\d{2}:\d{2}/)).toBeTruthy();

    // Verify button text
    const btnText = await page.locator('#win-new-game').textContent();
    expect(btnText).toBe('Play Again');

    // Take a screenshot of the win modal
    await page.screenshot({ path: testInfo.outputPath('win-modal.png'), fullPage: true });
});
