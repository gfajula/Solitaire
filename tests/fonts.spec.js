// Fonts are self-hosted: no third-party request on cold load, and a first
// offline launch renders the suit glyphs instead of an OS substitute.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test.describe('self-hosted fonts', () => {
    test('nothing is requested from a third-party host', async ({ page }) => {
        const external = [];
        page.on('request', req => {
            const url = req.url();
            if (!url.startsWith('file://') && !url.startsWith('data:')) external.push(url);
        });

        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');
        await page.waitForTimeout(500);

        expect(external).toEqual([]);
    });

    test('every declared face resolves from disk', async ({ page }) => {
        await page.goto(indexUrl);
        await page.evaluate(() => document.fonts.ready);

        // Faces load lazily — a family used only in the win modal is still
        // "unloaded" on the board. Force each one and check the file resolves.
        const r = await page.evaluate(async () => {
            const specs = [
                '400 1em Outfit',
                '500 1em Outfit',
                '600 1em Outfit',
                '700 1em Outfit',
                '400 1em Lora',
                '400 1em "Noto Sans Symbols 2"',
            ];
            const out = {};
            for (const spec of specs) {
                const text = spec.includes('Symbols') ? '♠♥♦♣' : 'Aa';
                const faces = await document.fonts.load(spec, text);
                out[spec] = faces.map(f => f.status);
            }
            return out;
        });

        for (const [spec, statuses] of Object.entries(r)) {
            expect(statuses, `${spec} matched no face`).not.toEqual([]);
            expect(statuses, `${spec} failed to load`).not.toContain('error');
            expect(statuses).toContain('loaded');
        }
    });

    test('Outfit is one variable face, so bold weights are real, not synthesized', async ({ page }) => {
        await page.goto(indexUrl);
        await page.evaluate(() => document.fonts.ready);

        const weights = await page.evaluate(() =>
            [...document.fonts].filter(f => f.family.replace(/["']/g, '') === 'Outfit').map(f => f.weight));

        expect(weights).toEqual(['100 900']);
    });

    test('the suit glyph renders from Noto Sans Symbols 2, not a fallback', async ({ page }) => {
        await page.goto(indexUrl);
        await page.evaluate(() => document.fonts.ready);

        const r = await page.evaluate(async () => {
            const available = await document.fonts.check('1em "Noto Sans Symbols 2"', '♠♥♦♣');
            // Measure a suit glyph in the real face vs. a deliberate miss.
            const measure = (family) => {
                const el = document.createElement('span');
                el.style.cssText = `position:absolute;visibility:hidden;font-size:100px;font-family:${family}`;
                el.textContent = '♠';
                document.body.appendChild(el);
                const w = el.getBoundingClientRect().width;
                el.remove();
                return w;
            };
            return {
                available,
                symbols: measure("'Noto Sans Symbols 2', monospace"),
                fallback: measure('monospace'),
            };
        });

        expect(r.available).toBe(true);
        expect(r.symbols).toBeGreaterThan(0);
        expect(r.symbols).not.toBeCloseTo(r.fallback, 0);
    });

    test('every precached font in sw.js exists on disk', async ({ page }) => {
        const fs = require('fs');
        const path = require('path');
        const root = path.resolve(__dirname, '..');
        const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

        const shell = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));
        const assets = [...shell.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]).filter(Boolean);

        const missing = assets.filter(rel => !fs.existsSync(path.join(root, rel)));
        expect(missing).toEqual([]);
        // The font files specifically must be listed.
        expect(assets).toContain('fonts/symbols-400.woff2');
        expect(assets).toContain('css/fonts.css');
    });
});
