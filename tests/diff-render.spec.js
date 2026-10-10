const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test('diff renderer preserves unchanged card DOM nodes in waste', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined');

    // Stash existing waste card refs on window, draw, verify identity preserved.
    const result = await page.evaluate(() => {
        document.getElementById('stock').click();
        const before = Array.from(document.querySelectorAll('[data-pile="waste"]'));
        window.__beforeKeys = before.map(el => el.dataset.key);
        window.__beforeRefs = before;

        document.getElementById('stock').click();

        const after = Array.from(document.querySelectorAll('[data-pile="waste"]'));
        const afterKeys = after.map(el => el.dataset.key);

        const preserved = window.__beforeRefs.filter(oldEl =>
            after.includes(oldEl)
        ).length;

        return {
            beforeKeys: window.__beforeKeys,
            afterKeys,
            preserved,
            beforeLen: before.length
        };
    });

    expect(result.afterKeys.length).toBeGreaterThanOrEqual(result.beforeLen);
    expect(result.preserved).toBe(result.beforeLen);
});

test('diff renderer preserves tableau cards when revealing top after move', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined');

    // Force a known tableau state: leave one face-down card under one face-up.
    const result = await page.evaluate(() => {
        gameState.tableau[0] = [
            { suit: 'spades',   rank: '5', value: 5,  color: 'black', faceUp: false, rotate: 0 },
            { suit: 'hearts',   rank: '4', value: 4,  color: 'red',   faceUp: true,  rotate: 0 }
        ];
        gameState.tableau[1] = [
            { suit: 'clubs',    rank: '5', value: 5,  color: 'black', faceUp: true,  rotate: 0 }
        ];
        renderAll();

        const beforeBottom = document.querySelector('[data-pile="tableau-0"][data-index="0"]');
        window.__bottomRef = beforeBottom;

        // Move the 4H off — bottom should remain in DOM, get face-up, get just-flipped.
        dragState.originPile = { type: 'tableau', pileIndex: 0, cards: gameState.tableau[0], index: 1 };
        dragState.originIndex = 1;
        dragState.cards = [gameState.tableau[0][1]];
        executeMove({ type: 'tableau', pileIndex: 1, cards: gameState.tableau[1] });

        const afterBottom = document.querySelector('[data-pile="tableau-0"][data-index="0"]');
        return {
            sameRef: window.__bottomRef === afterBottom,
            isFaceUp: afterBottom && !afterBottom.classList.contains('face-down'),
            key: afterBottom && afterBottom.dataset.key
        };
    });

    expect(result.sameRef).toBe(true);
    expect(result.isFaceUp).toBe(true);
    expect(result.key).toBe('spades-5');
});
