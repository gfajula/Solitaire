// Settings persistence: the localStorage round-trip and the corrupt/hostile
// input paths. loadSettings runs on every boot, so a bad value must not brick
// the game.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

const KEY = 'solitaire-settings';

// Seed localStorage before the page scripts run, then load.
async function bootWith(page, value) {
    await page.goto(indexUrl);
    await page.evaluate(([k, v]) => {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
    }, [KEY, value]);
    await page.reload();
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
}

test.describe('settings persistence', () => {
    test('a full round-trip survives a reload', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');

        const stored = await page.evaluate(() => {
            gameState.drawCount = 3;
            gameState.autoMove = false;
            applyBgColor('#123456');
            saveSettings();
            return localStorage.getItem('solitaire-settings');
        });
        expect(JSON.parse(stored)).toEqual({ drawCount: 3, bgColor: '#123456', autoMove: false });

        await page.reload();
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);

        const restored = await page.evaluate(() => ({
            drawCount: gameState.drawCount,
            autoMove: gameState.autoMove,
            bgColor: gameState.bgColor,
            cssVar: document.documentElement.style.getPropertyValue('--bg-color').trim(),
            radio: document.querySelector('input[name="draw-count"]:checked').value,
            toggle: document.getElementById('automove-toggle').checked,
        }));

        expect(restored.drawCount).toBe(3);
        expect(restored.autoMove).toBe(false);
        expect(restored.bgColor).toBe('#123456');
        expect(restored.cssVar).toBe('#123456');
        // The UI controls must reflect the restored state, not their defaults.
        expect(restored.radio).toBe('3');
        expect(restored.toggle).toBe(false);
    });

    test('the config controls persist what the user picks', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');

        await page.click('#config-btn');
        await page.check('input[name="draw-count"][value="3"]');
        // The real checkbox is opacity:0 under the styled slider — click that.
        await page.click('.config-toggle .toggle-slider');

        await expect(page.locator('#automove-toggle')).not.toBeChecked();

        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('solitaire-settings')));
        expect(stored.drawCount).toBe(3);
        expect(stored.autoMove).toBe(false);
    });

    test('no stored settings leaves the defaults intact', async ({ page }) => {
        await bootWith(page, null);
        const r = await page.evaluate(() => ({
            drawCount: gameState.drawCount,
            autoMove: gameState.autoMove,
            bgColor: gameState.bgColor,
        }));
        expect(r).toEqual({ drawCount: 1, autoMove: true, bgColor: null });
    });

    test('corrupt JSON does not brick the boot', async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));

        await bootWith(page, '{not json at all');

        const r = await page.evaluate(() => ({
            drawCount: gameState.drawCount,
            autoMove: gameState.autoMove,
            cards: document.querySelectorAll('.tableau .card').length,
        }));
        // Defaults, a dealt board, and no uncaught error.
        expect(r.drawCount).toBe(1);
        expect(r.autoMove).toBe(true);
        expect(r.cards).toBe(28);
        expect(errors).toEqual([]);
    });

    test('hostile values are ignored rather than adopted', async ({ page }) => {
        await bootWith(page, JSON.stringify({ drawCount: null, bgColor: null, autoMove: 'yes please' }));

        const r = await page.evaluate(() => ({
            drawCount: gameState.drawCount,
            // autoMove is type-checked, so a non-boolean must not get through.
            autoMove: gameState.autoMove,
            autoMoveType: typeof gameState.autoMove,
            cards: document.querySelectorAll('.tableau .card').length,
        }));
        expect(r.drawCount).toBe(1);
        expect(r.autoMoveType).toBe('boolean');
        expect(r.autoMove).toBe(true);
        expect(r.cards).toBe(28);
    });

    for (const [label, drawCount] of [['negative', -1], ['a string', '3'], ['a selector breaker', '"]']]) {
        test(`a ${label} draw count is normalised, and the settings after it still load`, async ({ page }) => {
            await bootWith(page, JSON.stringify({ drawCount, bgColor: '#0a0a0a', autoMove: false }));
            const r = await page.evaluate(() => {
                const before = gameState.waste.length;
                handleStockClick();
                return {
                    drawCount: gameState.drawCount,
                    drew: gameState.waste.length - before,
                    bgColor: gameState.bgColor,
                    autoMove: gameState.autoMove,
                };
            });
            // '3' is a legitimate value in the wrong type; the others fall back to 1.
            const expected = drawCount === '3' ? 3 : 1;
            expect(r.drawCount).toBe(expected);
            expect(r.drew).toBe(expected);
            expect(r.bgColor).toBe('#0a0a0a');
            expect(r.autoMove).toBe(false);
        });
    }

    test('a stored background that is not a hex colour never reaches the CSS', async ({ page }) => {
        await bootWith(page, JSON.stringify({ drawCount: 1, bgColor: 'url(https://example.com/x.png)', autoMove: true }));
        const r = await page.evaluate(() => ({
            bgColor: gameState.bgColor,
            cssVar: document.documentElement.style.getPropertyValue('--bg-color'),
        }));
        expect(r.bgColor).toBeNull();
        expect(r.cssVar).toBe('');
    });

    test('a valid stored draw count of 1 round-trips too', async ({ page }) => {
        await bootWith(page, JSON.stringify({ drawCount: 1, bgColor: '#0a0a0a', autoMove: true }));
        const r = await page.evaluate(() => ({
            drawCount: gameState.drawCount,
            radio: document.querySelector('input[name="draw-count"]:checked').value,
            bgColor: gameState.bgColor,
        }));
        expect(r.drawCount).toBe(1);
        expect(r.radio).toBe('1');
        expect(r.bgColor).toBe('#0a0a0a');
    });
});
