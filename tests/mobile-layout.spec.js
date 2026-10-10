// Header behavior: slim top bar + bottom action toolbar on mobile,
// classic top-right button group on desktop. Breakpoint is 768px.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test('header adapts: bottom action bar on mobile, top group on desktop', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined');

    const layout = await page.evaluate(() => {
        const bar = document.querySelector('.header-buttons');
        const barCs = getComputedStyle(bar);
        const barRect = bar.getBoundingClientRect();
        const h1Rect = document.querySelector('h1').getBoundingClientRect();
        const newText = getComputedStyle(document.querySelector('#new-game-btn .btn-text'));
        const newIcon = getComputedStyle(document.querySelector('#new-game-btn .btn-icon'));
        return {
            vw: window.innerWidth,
            vh: window.innerHeight,
            barPosition: barCs.position,
            barBottom: barRect.bottom,
            // Mobile hides the title visually but keeps it as the page heading.
            titleHidden: h1Rect.width <= 1 && h1Rect.height <= 1,
            newTextHidden: newText.display === 'none',
            newIconShown: newIcon.display !== 'none',
            buttonCount: bar.querySelectorAll('button').length,
        };
    });

    // All five actions live in one group regardless of viewport.
    expect(layout.buttonCount).toBe(5);

    if (layout.vw <= 768) {
        // Mobile: fixed toolbar pinned to the bottom, title hidden, New Game is icon-only.
        expect(layout.barPosition).toBe('fixed');
        expect(layout.barBottom).toBeGreaterThan(layout.vh * 0.85);
        expect(layout.titleHidden).toBe(true);
        expect(layout.newTextHidden).toBe(true);
        expect(layout.newIconShown).toBe(true);
    } else {
        // Desktop: in-flow top group, title visible, New Game shows its label.
        expect(layout.barPosition).not.toBe('fixed');
        expect(layout.titleHidden).toBe(false);
        expect(layout.newTextHidden).toBe(false);
    }
});

test('mobile toolbar: 44px touch targets, centred stats, cards clear of the bar', async ({ page }) => {
    await page.goto(indexUrl);
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length === 7);
    await page.waitForTimeout(600);

    const m = await page.evaluate(() => {
        const bar = document.querySelector('.header-buttons').getBoundingClientRect();
        const buttons = [...document.querySelectorAll('.header-buttons button')]
            .map(b => b.getBoundingClientRect())
            .map(r => ({ w: r.width, h: r.height, top: r.top }));
        const stats = document.querySelector('.stats').getBoundingClientRect();
        // Worst case: a full column of 7 face-up cards on top of 6 face-down.
        const col = gameState.tableau[6];
        col.forEach(c => { c.faceUp = true; });
        renderTableauColumn(6);
        const cards = document.querySelectorAll('#tableau-6 .card');
        const lowest = cards[cards.length - 1].getBoundingClientRect();
        return {
            vw: window.innerWidth,
            barTop: bar.top,
            buttons,
            statsCentre: stats.left + stats.width / 2,
            lowestBottom: lowest.bottom,
            docHeight: document.documentElement.scrollHeight,
            vh: window.innerHeight,
        };
    });

    test.skip(m.vw > 768, 'desktop keeps the header layout');

    for (const b of m.buttons) {
        expect(b.h).toBeGreaterThanOrEqual(44);
        expect(b.w).toBeGreaterThanOrEqual(44);
        // Every action, Info included, sits in the bar.
        expect(b.top).toBeGreaterThanOrEqual(m.barTop - 1);
    }
    expect(Math.abs(m.statsCentre - m.vw / 2)).toBeLessThanOrEqual(2);
    // Scrolled to the bottom, the lowest card ends above the toolbar.
    const scrolledBarTop = m.barTop + (m.docHeight - m.vh);
    expect(m.lowestBottom).toBeLessThanOrEqual(scrolledBarTop);
});
