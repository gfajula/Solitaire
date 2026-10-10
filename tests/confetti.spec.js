// The confetti loop used to run on setInterval: no vsync, and it kept ticking
// in a hidden tab. It now drives itself off requestAnimationFrame.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test.describe('confetti engine', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof confetti !== 'undefined');
    });

    test('the loop uses requestAnimationFrame, not setInterval', async ({ page }) => {
        const r = await page.evaluate(async () => {
            let intervals = 0;
            let rafs = 0;
            const realInterval = window.setInterval;
            const realRaf = window.requestAnimationFrame;
            window.setInterval = function (...args) { intervals++; return realInterval.apply(window, args); };
            window.requestAnimationFrame = function (...args) { rafs++; return realRaf.apply(window, args); };

            confetti.burst(100, 100, { count: 5 });
            await new Promise(res => realRaf(() => realRaf(res)));

            window.setInterval = realInterval;
            window.requestAnimationFrame = realRaf;
            confetti.stop();
            return { intervals, rafs };
        });

        expect(r.intervals).toBe(0);
        expect(r.rafs).toBeGreaterThan(0);
    });

    test('stop() halts the loop and clears the particles', async ({ page }) => {
        const r = await page.evaluate(async () => {
            confetti.celebrate();
            const during = { running: confetti.running, particles: confetti.particles.length };
            confetti.stop();
            const after = { running: confetti.running, particles: confetti.particles.length };

            // A burst queued by the cancelled show must not repopulate it.
            await new Promise(res => setTimeout(res, 700));
            return { during, after, later: confetti.particles.length };
        });

        expect(r.during.running).toBe(true);
        expect(r.during.particles).toBeGreaterThan(0);
        expect(r.after.running).toBe(false);
        expect(r.after.particles).toBe(0);
        expect(r.later).toBe(0);
    });

    test('New Game stops a celebration in progress', async ({ page }) => {
        await page.waitForFunction(() => gameState.tableau[6].length > 0);
        const r = await page.evaluate(async () => {
            confetti.celebrate();
            const before = confetti.particles.length;
            deal();
            const after = confetti.particles.length;
            await new Promise(res => setTimeout(res, 700));
            return { before, after, later: confetti.particles.length };
        });

        expect(r.before).toBeGreaterThan(0);
        expect(r.after).toBe(0);
        expect(r.later).toBe(0);
    });
});
