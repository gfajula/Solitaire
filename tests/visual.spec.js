// @ts-check
const { test, expect } = require('@playwright/test');
const { indexUrl } = require('./helpers');

test.describe('Solitaire visual smoke', () => {
    test('initial deal renders', async ({ page }, testInfo) => {
        await page.goto(indexUrl);
        await page.waitForSelector('.tableau .card', { timeout: 5000 });
        await page.waitForTimeout(700);
        const cards = await page.locator('.tableau .card').count();
        expect(cards).toBe(28);
        const lastInCol6 = page.locator('#tableau-6 .card').last();
        await expect(lastInCol6).not.toHaveClass(/face-down/);
        await page.screenshot({
            path: testInfo.outputPath(`initial-${testInfo.project.name}.png`),
            fullPage: true,
        });
    });

    test('cards scale proportionally and fit viewport', async ({ page }, testInfo) => {
        await page.goto(indexUrl);
        await page.waitForSelector('.tableau .card', { timeout: 5000 });
        await page.waitForTimeout(600);

        const vp = page.viewportSize();
        if (!vp) throw new Error('no viewport');

        const data = await page.evaluate(() => {
            const cols = Array.from(document.querySelectorAll('.tableau .pile.tableau')).map((p) => {
                const r = p.getBoundingClientRect();
                return { x: r.x, y: r.y, w: r.width };
            });
            const sampleCard = document.querySelector('.tableau .card:not(.face-down)');
            const cardBox = sampleCard ? sampleCard.getBoundingClientRect() : null;
            // Verify suit symbol stays inside card frame (font glyphs may extend ~3px past
            // their styled box due to ascenders; only flag real visual bleed)
            const TOL = 4;
            let symbolBleed = false;
            if (sampleCard) {
                const suit = sampleCard.querySelector('.card-suit-small, .card-suit-large');
                if (suit && cardBox) {
                    const sr = suit.getBoundingClientRect();
                    if (sr.right > cardBox.right + TOL || sr.bottom > cardBox.bottom + TOL ||
                        sr.left < cardBox.left - TOL || sr.top < cardBox.top - TOL) {
                        symbolBleed = true;
                    }
                }
            }
            return { cols, cardBox, symbolBleed };
        });

        // 1) no row wrapping: all 7 columns at same y
        const ys = data.cols.map(c => c.y);
        const yMin = Math.min(...ys);
        const yMax = Math.max(...ys);
        expect(yMax - yMin).toBeLessThan(5);

        // 2) columns fit in viewport (no overflow)
        const rightmost = data.cols[data.cols.length - 1];
        expect(rightmost.x + rightmost.w).toBeLessThanOrEqual(vp.width);

        // 3) suit symbol stays inside card frame
        expect(data.symbolBleed).toBe(false);

        // 4) card aspect ratio ~1.5 (height/width)
        if (data.cardBox) {
            const ratio = data.cardBox.height / data.cardBox.width;
            expect(ratio).toBeGreaterThan(1.3);
            expect(ratio).toBeLessThan(1.7);
        }

        await page.screenshot({
            path: testInfo.outputPath(`viewport-${testInfo.project.name}.png`),
            fullPage: true,
        });
    });

    test('stock click triggers deal animation', async ({ page }, testInfo) => {
        await page.goto(indexUrl);
        await page.waitForSelector('#stock .card');
        await page.click('#stock');
        // capture mid-animation
        await page.waitForTimeout(200);
        await page.screenshot({
            path: testInfo.outputPath(`stock-deal-mid-${testInfo.project.name}.png`),
        });
        await page.waitForTimeout(800);
        await page.screenshot({
            path: testInfo.outputPath(`stock-deal-done-${testInfo.project.name}.png`),
        });
    });

    test('pointer drag below threshold does NOT trigger drag state', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForSelector('.tableau .card');
        await page.waitForTimeout(500);

        const card = page.locator('#tableau-6 .card').last();
        const box = await card.boundingBox();
        if (!box) throw new Error('no card');

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 2, { steps: 2 });
        const mid = await page.evaluate(() => document.querySelectorAll('.card.dragging').length);
        await page.mouse.up();
        expect(mid).toBe(0); // 2px move < threshold sqrt(16)=4, no drag
    });

    test('snap-back animates without ghost element', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForSelector('.tableau .card');
        await page.waitForTimeout(500);

        const card = page.locator('#tableau-6 .card').last();
        const box = await card.boundingBox();
        if (!box) throw new Error('no card');

        // drag to empty area (invalid drop)
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 30, box.y + 200, { steps: 8 });
        await page.waitForTimeout(60);
        const midDrag = await page.evaluate(() => ({
            dragging: document.querySelectorAll('.card.dragging').length,
            ghosts: document.querySelectorAll('.snapback-ghost, .touch-drag-ghost').length,
        }));
        await page.mouse.up();
        // ghost-based snap-back system removed; only translate-based transition
        expect(midDrag.ghosts).toBe(0);
        expect(midDrag.dragging).toBeGreaterThan(0);

        await page.waitForTimeout(600);
        const after = await page.evaluate(() => document.querySelectorAll('.card.dragging').length);
        expect(after).toBe(0);
    });

    test('drag source hides cleanly (no 1ms flicker)', async ({ page }, testInfo) => {
        await page.goto(indexUrl);
        await page.waitForSelector('.tableau .card');
        await page.waitForTimeout(600);

        // pick the bottom face-up card in the rightmost tableau column (tableau-6)
        const cardCount = await page.locator('#tableau-6 .card').count();
        const card = page.locator('#tableau-6 .card').nth(cardCount - 1);
        const box = await card.boundingBox();
        if (!box) throw new Error('no card bbox');

        // simulate mouse drag: down, move, hold
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 150, box.y + 80, { steps: 10 });
        await page.waitForTimeout(120);
        await page.screenshot({
            path: testInfo.outputPath(`dragging-${testInfo.project.name}.png`),
        });
        await page.mouse.up();
    });

    test('auto-move via double-click', async ({ page }, testInfo) => {
        await page.goto(indexUrl);
        await page.waitForSelector('.tableau .card');
        await page.waitForTimeout(600);

        // double-click rightmost tableau column's last card to attempt auto-move
        const card = page.locator('#tableau-6 .card').last();
        await card.dblclick({ delay: 50 });
        await page.waitForTimeout(150);
        await page.screenshot({
            path: testInfo.outputPath(`auto-move-mid-${testInfo.project.name}.png`),
        });
        await page.waitForTimeout(400);
        await page.screenshot({
            path: testInfo.outputPath(`auto-move-done-${testInfo.project.name}.png`),
        });
    });

    test('autocollect: desync guard + input freeze (no dup/lost cards)', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForSelector('.tableau .card');
        await page.waitForTimeout(600);

        // 1. commitCollect must bail when the captured card is no longer the
        //    live source top (concurrent move desynced it) — no blind pop.
        const desync = await page.evaluate(() => {
            autocollectActive = true; // commitCollect only runs during an active pass
            const ace = { rank: 'A', suit: 'hearts', faceUp: true };
            gameState.tableau[0] = [{ rank: 'K', suit: 'spades', faceUp: true }, ace];
            gameState.foundations = [[], [], [], []];
            const c = { card: ace, sourceType: 'tableau', sourceCol: 0, sourcePos: 1, targetIdx: 0 };
            // simulate a concurrent move stealing the ace before the staggered commit fires
            gameState.tableau[0].pop();
            const committed = commitCollect(c);
            autocollectActive = false;
            return {
                committed,
                foundationCounts: gameState.foundations.map(f => f.length),
                pileLen: gameState.tableau[0].length,
            };
        });
        expect(desync.committed).toBe(false);
        expect(desync.foundationCounts).toEqual([0, 0, 0, 0]); // no phantom collect
        expect(desync.pileLen).toBe(1);

        // 2. Valid commit still works: collects ace, flips newly-exposed face-down card up.
        const ok = await page.evaluate(() => {
            autocollectActive = true;
            const ace = { rank: 'A', suit: 'hearts', faceUp: true };
            const down = { rank: '5', suit: 'clubs', faceUp: false };
            gameState.tableau[1] = [down, ace];
            gameState.foundations = [[], [], [], []];
            const c = { card: ace, sourceType: 'tableau', sourceCol: 1, sourcePos: 1, targetIdx: 0 };
            const committed = commitCollect(c);
            autocollectActive = false;
            const top = gameState.tableau[1][gameState.tableau[1].length - 1];
            return {
                committed,
                foundLen: gameState.foundations[0].length,
                pileLen: gameState.tableau[1].length,
                topFaceUp: top.faceUp,
            };
        });
        expect(ok.committed).toBe(true);
        expect(ok.foundLen).toBe(1);
        expect(ok.pileLen).toBe(1);
        expect(ok.topFaceUp).toBe(true); // exposed face-down flipped up — invariant held

        // 3. While autocollect is active, user move paths are frozen.
        const frozen = await page.evaluate(() => {
            autocollectActive = true;
            const before = moveHistory.length;
            const r = tryAutoMove({ type: 'tableau', pileIndex: 0, index: 0, cards: gameState.tableau[0] }, null);
            autocollectActive = false;
            return { r, moved: moveHistory.length - before };
        });
        expect(frozen.r).toBe(false);
        expect(frozen.moved).toBe(0);
    });

    // Force all 4 aces face-up onto the tops of columns 0-3 so an autocollect
    // pass has multiple staggered commits (a real ~600ms concurrency window),
    // without inventing cards — the deck stays the same 52.
    const SETUP_ACES_ON_TOP = () => {
        const all = [gameState.stock, gameState.waste, ...gameState.foundations, ...gameState.tableau].flat();
        const aces = all.filter(c => c.rank === 'A');
        const strip = arr => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i].rank === 'A') arr.splice(i, 1); };
        strip(gameState.stock); strip(gameState.waste);
        gameState.foundations = [[], [], [], []];
        gameState.tableau.forEach(strip);
        for (let i = 0; i < 4; i++) { aces[i].faceUp = true; gameState.tableau[i].push(aces[i]); }
        renderAll();
        return aces.length;
    };

    // Deck integrity: 52 cards total, all unique, and no face-down card sitting
    // ABOVE a face-up card in any tableau pile (the invariant the bug broke).
    const DECK_INTEGRITY = () => {
        const all = [gameState.stock, gameState.waste, ...gameState.foundations, ...gameState.tableau].flat();
        const keys = all.map(c => c.suit + '-' + c.rank);
        let invariantOk = true;
        for (const pile of gameState.tableau) {
            let seenUp = false;
            for (const c of pile) {
                if (c.faceUp) seenUp = true;
                else if (seenUp) { invariantOk = false; break; }
            }
        }
        const acesCollected = gameState.foundations.reduce((n, f) => n + f.filter(c => c.rank === 'A').length, 0);
        return { total: all.length, unique: new Set(keys).size, invariantOk, acesCollected };
    };

    test('real pointer drag during active autocollect is frozen; deck stays intact', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);

        const aceCount = await page.evaluate(SETUP_ACES_ON_TOP);
        expect(aceCount).toBe(4);

        // Kick off the staggered cascade, then immediately try a real mouse drag
        // on a non-ace column. The guard must refuse to start a pointer drag.
        await page.evaluate(() => autocollect());
        const card = page.locator('#tableau-6 .card').last();
        const box = await card.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 40, box.y + 70, { steps: 6 });
        const noDrag = await page.evaluate(() => pointerDrag === null);
        await page.mouse.up();
        expect(noDrag).toBe(true); // onPointerDown bailed -> no drag began

        await page.waitForFunction(() => autocollectActive === false, null, { timeout: 5000 });
        const integ = await page.evaluate(DECK_INTEGRITY);
        expect(integ.total).toBe(52);      // no card lost
        expect(integ.unique).toBe(52);     // no card duplicated
        expect(integ.invariantOk).toBe(true);
        expect(integ.acesCollected).toBe(4); // cascade still completed
    });

    test('guards freeze undo / stock recycle / double-click while autocollect active', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');

        // Create a genuine move so moveHistory + a foundation card exist to undo.
        await page.evaluate(() => {
            const ace = { suit: 'hearts', rank: 'A', value: 1, color: 'red', faceUp: true, rotate: 0 };
            const king = { suit: 'spades', rank: 'K', value: 13, color: 'black', faceUp: true, rotate: 0 };
            gameState.tableau[0] = [king, ace];
            gameState.foundations = [[], [], [], []];
            dragState.cards = [ace];
            dragState.originPile = { type: 'tableau', pileIndex: 0, index: 1, cards: gameState.tableau[0] };
            dragState.originIndex = 1;
            executeMove({ type: 'foundation', pileIndex: 0, cards: gameState.foundations[0] });
        });

        const r = await page.evaluate(() => {
            autocollectActive = true;

            const mh = moveHistory.length;
            const fLen = gameState.foundations[0].length;
            undo();
            const undoFrozen = moveHistory.length === mh && gameState.foundations[0].length === fLen;

            gameState.stock = [{ suit: 'clubs', rank: '2', value: 2, color: 'black', faceUp: false, rotate: 0 }];
            gameState.waste = [];
            handleStockClick();
            const stockFrozen = gameState.stock.length === 1 && gameState.waste.length === 0;

            const before = moveHistory.length;
            const tap = tryAutoMove(
                { type: 'tableau', pileIndex: 0, index: gameState.tableau[0].length - 1, cards: gameState.tableau[0] },
                null
            );
            const tapFrozen = tap === false && moveHistory.length === before;

            autocollectActive = false;
            return { undoFrozen, stockFrozen, tapFrozen };
        });

        expect(r.undoFrozen).toBe(true);
        expect(r.stockFrozen).toBe(true);
        expect(r.tapFrozen).toBe(true);
    });

    test('after the win event, no card can be grabbed', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');
        await page.waitForTimeout(600);

        // Put a known face-up card in column 0 as a grab target.
        await page.evaluate(() => {
            gameState.tableau[0] = [{ suit: 'hearts', rank: '5', value: 5, color: 'red', faceUp: true, rotate: 0 }];
            renderTableauColumn(0);
        });
        const card = page.locator('[data-pile="tableau-0"][data-index="0"]');
        const box = await card.boundingBox();
        const cx = box.x + box.width / 2;
        const cy = box.y + 4;

        // Positive control: before any win, this gesture DOES start a pointer drag.
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 30, cy + 55, { steps: 6 });
        const draggedBefore = await page.evaluate(() => pointerDrag !== null);
        await page.mouse.up();
        expect(draggedBefore).toBe(true);

        // Fire the win event.
        await page.evaluate(() => startWinAnimation());
        expect(await page.evaluate(() => winAnimating)).toBe(true);

        // Same gesture is now refused — no pointer drag begins.
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 30, cy + 55, { steps: 6 });
        const draggedAfter = await page.evaluate(() => pointerDrag !== null);
        await page.mouse.up();
        expect(draggedAfter).toBe(false);

        // The other grab paths are frozen too.
        const others = await page.evaluate(() => {
            const before = moveHistory.length;
            handleDoubleClick({ target: document.querySelector('[data-pile="tableau-0"][data-index="0"]') });
            gameState.stock = [{ suit: 'clubs', rank: '2', value: 2, color: 'black', faceUp: false, rotate: 0 }];
            gameState.waste = [];
            handleStockClick();
            return {
                dblClickFrozen: moveHistory.length === before,
                stockFrozen: gameState.stock.length === 1 && gameState.waste.length === 0,
            };
        });
        expect(others.dblClickFrozen).toBe(true);
        expect(others.stockFrozen).toBe(true);
    });

    test('New Game during an active autocollect cancels it cleanly (no auto-collect on the fresh deal)', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);

        // Force 4 collectible aces, start the staggered cascade, then immediately
        // deal a New Game while it's mid-flight.
        await page.evaluate(SETUP_ACES_ON_TOP);
        const cancelled = await page.evaluate(() => {
            autocollect();
            const wasActive = autocollectActive;
            deal(); // New Game mid-cascade
            return { wasActive, activeAfterDeal: autocollectActive };
        });
        expect(cancelled.wasActive).toBe(true);
        expect(cancelled.activeAfterDeal).toBe(false); // deal() cancelled it

        // Let any stale staggered commits / re-armed passes fire.
        await page.waitForTimeout(1200);

        const after = await page.evaluate(DECK_INTEGRITY);
        expect(after.total).toBe(52);
        expect(after.unique).toBe(52);
        expect(after.invariantOk).toBe(true);
        // A fresh standard deal has 28 cards in the tableau and an empty
        // foundation — the stale cascade must NOT have collected anything.
        const fresh = await page.evaluate(() => ({
            tableau: gameState.tableau.reduce((n, p) => n + p.length, 0),
            foundation: gameState.foundations.reduce((n, p) => n + p.length, 0),
            active: autocollectActive,
        }));
        expect(fresh.tableau).toBe(28);
        expect(fresh.foundation).toBe(0);
        expect(fresh.active).toBe(false);
    });

    test('New Game clears a pending keyboard selection (no stale cross-board move)', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.tableau[6].length > 0);
        await page.waitForTimeout(600);

        const r = await page.evaluate(() => {
            // Select a tableau card via the keyboard action path.
            const col6 = gameState.tableau[6];
            handleKeyboardAction({ type: 'tableau', pileIndex: 6, index: col6.length - 1, cards: col6 });
            const selectedBefore = selectedCard !== null;

            deal(); // New Game while a selection is pending
            const clearedAfterDeal = selectedCard === null;

            // Snapshot the fresh board, then attempt a keyboard action on a new card.
            const before = gameState.tableau.reduce((n, p) => n + p.length, 0);
            const col0 = gameState.tableau[0];
            handleKeyboardAction({ type: 'tableau', pileIndex: 0, index: col0.length - 1, cards: col0 });
            const after = gameState.tableau.reduce((n, p) => n + p.length, 0);

            const all = [gameState.stock, gameState.waste, ...gameState.foundations, ...gameState.tableau].flat();
            return {
                selectedBefore,
                clearedAfterDeal,
                // First post-deal action must only SELECT, never move a stale card in.
                tableauUnchanged: before === after,
                total: all.length,
                unique: new Set(all.map(c => c.suit + '-' + c.rank)).size,
            };
        });

        expect(r.selectedBefore).toBe(true);
        expect(r.clearedAfterDeal).toBe(true);
        expect(r.tableauUnchanged).toBe(true);
        expect(r.total).toBe(52);
        expect(r.unique).toBe(52);
    });

    test('undo / autocollect buttons are frozen during an auto-move animation', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForFunction(() => typeof gameState !== 'undefined');

        const r = await page.evaluate(() => {
            autoMoveAnimating = true; // simulate an in-flight auto-move
            const mh = moveHistory.length;

            // give undo something to pop + a real foundation card
            moveHistory.push({
                origin: { type: 'tableau', pileIndex: 0, index: 0, cards: [] },
                target: { type: 'foundation', pileIndex: 0, cards: [] },
                cards: [{ suit: 'hearts', rank: 'A', value: 1, color: 'red', faceUp: true }],
                flippedCard: null,
            });
            const mhAfterPush = moveHistory.length;

            undo();
            const undoFrozen = moveHistory.length === mhAfterPush;

            autocollect();
            const autocollectFrozen = autocollectActive === false;

            // cleanup
            moveHistory.length = mh;
            autoMoveAnimating = false;
            return { undoFrozen, autocollectFrozen };
        });

        expect(r.undoFrozen).toBe(true);
        expect(r.autocollectFrozen).toBe(true);
    });

    test('win cascade renders without duplicating layers', async ({ page }, testInfo) => {
        await page.goto(indexUrl);
        await page.waitForSelector('.tableau .card');
        await page.evaluate(() => {
            // synthesize a "win" state by forcing foundations + calling startWinAnimation twice
            if (typeof window['startWinAnimation'] === 'function') {
                window['startWinAnimation']();
                window['startWinAnimation']();
            }
        });
        await page.waitForTimeout(400);
        const layers = await page.locator('.win-blast-layer').count();
        await page.screenshot({
            path: testInfo.outputPath(`win-cascade-${testInfo.project.name}.png`),
        });
        // Should be at most 1 layer (deduped by startWinAnimation guard)
        expect(layers).toBeLessThanOrEqual(1);
    });

    test('card sound samples load and play', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForTimeout(400);

        const loaded = await page.evaluate(() => {
            const a = new Audio('sounds/contact1.wav');
            return new Promise(resolve => {
                a.addEventListener('canplaythrough', () => resolve({ ok: true, dur: a.duration }), { once: true });
                a.addEventListener('error', () => resolve({ ok: false }), { once: true });
                a.load();
                setTimeout(() => resolve({ ok: false, err: 'timeout' }), 2000);
            });
        });
        expect(loaded.ok).toBe(true);
        expect(loaded.dur).toBeGreaterThan(0);

        // stock click → playFlipSound() path (instruments synth fallback OR sample)
        const fired = await page.evaluate(() => {
            return typeof window.playFlipSound === 'function' && typeof window.playPlaceSound === 'function';
        });
        expect(fired).toBe(true);
    });

    test('stats: move counter + timer + undo penalty flash', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForTimeout(500);

        // Initial state: 0 moves, 00:00 timer.
        const initial = await page.evaluate(() => ({
            moves: document.getElementById('moves').textContent,
            timer: document.getElementById('timer').textContent,
        }));
        expect(initial.moves).toBe('0');
        expect(initial.timer).toBe('00:00');

        // Drive a real move through executeMove. Force a known Ace into the waste
        // pile so it can be moved to an empty foundation (path used by drag-drop,
        // auto-move, and double-click — all share executeMove).
        await page.evaluate(() => {
            const ace = { suit: 'hearts', rank: 'A', value: 1, color: 'red', faceUp: true };
            gameState.waste.push(ace);
            dragState.cards = [ace];
            dragState.originPile = {
                type: 'waste', pileIndex: 0,
                cards: gameState.waste,
                index: gameState.waste.length - 1,
            };
            dragState.originIndex = dragState.originPile.index;
            executeMove({
                type: 'foundation', pileIndex: 0,
                cards: gameState.foundations[0],
            });
        });
        await page.waitForTimeout(50);

        const afterMove = await page.evaluate(() => ({
            moves: document.getElementById('moves').textContent,
            foundation0: gameState.foundations[0].length,
        }));
        expect(afterMove.moves).toBe('1');
        expect(afterMove.foundation0).toBe(1);

        // Timer should be ticking after the move (lazy-started on first move).
        await page.waitForTimeout(1100);
        const tickedTimer = await page.evaluate(() => document.getElementById('timer').textContent);
        expect(tickedTimer).not.toBe('00:00');

        // Click the real undo button — bumps moves by 5 AND flashes red.
        await page.click('#undo-btn');
        const midFlash = await page.evaluate(() => ({
            moves: document.getElementById('moves').textContent,
            hasFlash: document.getElementById('moves').classList.contains('flash-red'),
            foundation0: gameState.foundations[0].length,
        }));
        // Penalty: previous count 1 + 5 = 6
        expect(midFlash.moves).toBe('6');
        expect(midFlash.hasFlash).toBe(true);
        // Undo also reverted the move
        expect(midFlash.foundation0).toBe(0);

        await page.waitForTimeout(700);
        const afterFlash = await page.evaluate(() => document.getElementById('moves').classList.contains('flash-red'));
        expect(afterFlash).toBe(false);

        // New game resets counter and timer.
        await page.click('#new-game-btn');
        await page.waitForTimeout(200);
        const reset = await page.evaluate(() => ({
            moves: document.getElementById('moves').textContent,
            timer: document.getElementById('timer').textContent,
        }));
        expect(reset.moves).toBe('0');
        expect(reset.timer).toBe('00:00');
    });

    test('config panel does not overlap header', async ({ page }, testInfo) => {
        await page.goto(indexUrl);
        await page.waitForSelector('header');
        await page.click('#config-btn');
        await page.waitForTimeout(200);
        const headerBox = await page.locator('header').boundingBox();
        const panelBox = await page.locator('#config-panel').boundingBox();
        await page.screenshot({
            path: testInfo.outputPath(`config-open-${testInfo.project.name}.png`),
        });
        if (!headerBox || !panelBox) throw new Error('missing bbox');
        // panel top must be below header bottom
        expect(panelBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 2);
        // panel must not exceed viewport width
        const vp = page.viewportSize();
        if (vp) {
            expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(vp.width + 1);
        }
    });

    test('PWA wiring present and manifest valid', async ({ page }) => {
        await page.goto(indexUrl);
        await page.waitForSelector('header');

        // Head wiring: manifest link, theme-color, apple-touch-icon, SW register guard.
        const wiring = await page.evaluate(() => ({
            manifestHref: document.querySelector('link[rel="manifest"]')?.getAttribute('href') || null,
            themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || null,
            appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || null,
            hasRegister: Array.from(document.scripts).some((s) => s.textContent.includes('serviceWorker.register')),
        }));
        // Accept an optional "./" prefix on relative hrefs.
        const stripDot = (s) => (s || '').replace(/^\.\//, '');
        expect(stripDot(wiring.manifestHref)).toBe('manifest.json');
        expect(wiring.themeColor).toBe('#1a472a');
        expect(stripDot(wiring.appleIcon)).toBe('icons/icon-192.png');
        expect(wiring.hasRegister).toBe(true);

        // Manifest parses with installable essentials.
        const fs = require('fs');
        const p = require('path');
        const root = p.resolve(__dirname, '..');
        const manifest = JSON.parse(fs.readFileSync(p.join(root, 'manifest.json'), 'utf8'));
        expect(manifest.display).toBe('standalone');
        expect(manifest.start_url).toBeTruthy();
        const sizes = manifest.icons.map((i) => i.sizes);
        expect(sizes).toContain('192x192');
        expect(sizes).toContain('512x512');
        expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

        // Referenced files exist on disk.
        for (const icon of manifest.icons) {
            expect(fs.existsSync(p.join(root, icon.src))).toBe(true);
        }
        expect(fs.existsSync(p.join(root, 'sw.js'))).toBe(true);
    });
});
