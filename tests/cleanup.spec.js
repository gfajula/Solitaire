// Guards against removed dead code creeping back, plus the Z shortcut the
// undo button's tooltip advertises.
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test.describe('cleanup', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);
    });

    test('the pre-pointer #drag-container is gone', async ({ page }) => {
        const el = await page.evaluate(() => document.getElementById('drag-container'));
        expect(el).toBeNull();
    });

    test('the config panel toggles on the class alone, with no inline display', async ({ page }) => {
        const r = await page.evaluate(() => {
            const panel = document.getElementById('config-panel');
            const initial = { hidden: panel.classList.contains('hidden'), inline: panel.style.display };

            handleConfigToggle();
            const open = {
                hidden: panel.classList.contains('hidden'),
                inline: panel.style.display,
                visible: getComputedStyle(panel).display !== 'none',
            };

            handleConfigToggle();
            const closed = {
                hidden: panel.classList.contains('hidden'),
                visible: getComputedStyle(panel).display !== 'none',
            };
            return { initial, open, closed };
        });

        expect(r.initial.inline).toBe('');
        expect(r.open.hidden).toBe(false);
        expect(r.open.inline).toBe('');
        expect(r.open.visible).toBe(true);
        expect(r.closed.hidden).toBe(true);
        expect(r.closed.visible).toBe(false);
    });

    test('the Info panel reports a readable viewport', async ({ page }) => {
        const viewport = await page.evaluate(() => getViewport());
        // Was an array, which rendered as "1024,768".
        expect(typeof viewport).toBe('string');
        expect(viewport).toMatch(/^\d+×\d+$/);
    });

    test('Z undoes the last move from anywhere', async ({ page }) => {
        const r = await page.evaluate(() => {
            gameState.waste = [{ suit: 'hearts', rank: 'A', value: 1, color: 'red', faceUp: true, rotate: 0 }];
            gameState.foundations = [[], [], [], []];
            renderAll();

            handleKeyboardAction({ type: 'waste', pileIndex: 0, index: 0, cards: gameState.waste });
            handleKeyboardAction({ type: 'foundation', pileIndex: 0, index: -1, cards: gameState.foundations[0] });
            const moved = gameState.foundations[0].length;

            // Focus deliberately parked on a button, not a card.
            document.getElementById('new-game-btn').focus();
            handleKeyboardNavigation({ key: 'z', target: document.activeElement, preventDefault() {} });

            return { moved, foundation: gameState.foundations[0].length, waste: gameState.waste.length };
        });

        expect(r.moved).toBe(1);
        expect(r.foundation).toBe(0);
        expect(r.waste).toBe(1);
    });

    test('Z is ignored while typing and when modified', async ({ page }) => {
        const r = await page.evaluate(() => {
            gameState.waste = [{ suit: 'hearts', rank: 'A', value: 1, color: 'red', faceUp: true, rotate: 0 }];
            gameState.foundations = [[], [], [], []];
            renderAll();
            handleKeyboardAction({ type: 'waste', pileIndex: 0, index: 0, cards: gameState.waste });
            handleKeyboardAction({ type: 'foundation', pileIndex: 0, index: -1, cards: gameState.foundations[0] });

            const input = document.getElementById('bg-color-picker');
            handleKeyboardNavigation({ key: 'z', target: input, preventDefault() {} });
            const afterTyping = gameState.foundations[0].length;

            // Ctrl/Cmd+Z belongs to the browser, not the game.
            handleKeyboardNavigation({ key: 'z', ctrlKey: true, target: document.body, preventDefault() {} });
            return { afterTyping, afterCtrl: gameState.foundations[0].length };
        });

        expect(r.afterTyping).toBe(1);
        expect(r.afterCtrl).toBe(1);
    });

    test('dragState carries only the fields the move path reads', async ({ page }) => {
        const keys = await page.evaluate(() => Object.keys(dragState).sort());
        expect(keys).toEqual(['cards', 'isDragging', 'originIndex', 'originPile']);
    });
});
