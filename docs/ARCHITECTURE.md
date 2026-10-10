# Architecture

This document explains how the game is put together, for anyone reading or
changing the code. The README covers what it does and how to run it.

## No framework, no build

The browser loads the source files as they are. `index.html` pulls in three
stylesheets and four classic `<script>` tags, in this order:

```
css/fonts.css  css/styles.css  css/cards.css
js/confetti.js → js/cards.js → js/game.js → js/motion.js
```

`game.js` ends with `document.addEventListener('DOMContentLoaded', init)`, and
`init()` is the single entry point: it wires the listeners, loads settings,
fetches the sound bytes and deals.

Classic scripts share one global lexical scope. Two top-level `const` or
`function` declarations with the same name, in any two files, are a
`SyntaxError` that silently stops the later file from running. Grep all four
files before adding a top-level name. `tests/reduced-motion.spec.js` checks
that `motion.js` actually ran, which catches the usual way this goes wrong.

| File | Role |
|---|---|
| `js/game.js` | State, rules, rendering, pointer and keyboard input, animation, audio, dialogs, settings. |
| `js/cards.js` | `createCardElement(card, faceUp)`: builds one card's DOM (corner indices, pip layout, court-card art). Holds no state. |
| `js/confetti.js` | `ConfettiEngine`, a canvas particle system for the win. Sizes its canvas only when a celebration starts. |
| `js/motion.js` | Capability flags on `window.motionProps`, the live `.reduced-motion` class, and an on-demand FPS probe. |
| `sw.js` | Service worker for offline play. |

## State

```js
gameState = {
    stock, waste,            // arrays of card objects, top card last
    foundations: [[], [], [], []],             // hearts, diamonds, clubs, spades
    tableau: [[], [], [], [], [], [], []],
    drawCount: 1 | 3,
    bgColor: null | '#rrggbb',
    autoMove: boolean,
};
// card: { suit, rank, value, color, faceUp, rotate, justFlipped? }
```

`gameState` is the source of truth. Every action mutates it and then asks the
renderer to update the affected piles; nothing reads game state back out of
the DOM.

`moveHistory` drives undo. An entry is either
`{ kind: 'move', origin, target, cards, flippedCard }` or
`{ kind: 'stock', op: 'draw' | 'recycle', count }`. Entries hold the live card
objects, so undo puts the very same objects back and identity stays stable;
autocollect relies on that to check that a card it queued is still where it
expects. Undo costs 5 moves on the counter.

`dealGeneration` goes up by one on every deal. Anything deferred (animation
callbacks, ghost cleanup, staggered autocollect steps, the snap-back timer)
captures it when scheduled and does nothing if it has changed by the time it
runs. A New Game in the middle of an animation therefore can't let the old
game's completion touch the new board.

## Rendering

`renderAll()` calls one renderer per pile. The stock only ever shows its top
card, so it is simply rebuilt. The waste, foundation and tableau renderers go
through `reconcilePile(pileEl, cards, options)`, a small keyed diff: the child
at index *i* is kept if its `data-key` (`suit-rank`) still matches, and
replaced otherwise. A card that didn't change keeps its DOM node, and with it
keyboard focus and any transition in progress. The per-card `update` callback
sets position, stacking order, `data-pile` / `data-index`, the ARIA label and
`tabIndex`.

Tableau spacing comes from CSS. `updateCardOffset()` measures a hidden probe
sized `var(--card-stack-offset)` and derives the face-up and face-down offsets
from it. It runs on deal and on resize. Cards are sized in `em`, and the body
font size is a `clamp()` of the viewport, so the whole board scales as one
piece.

## Rules

A small set of shared functions holds every rule, and every input path goes
through them:

- `canPickUp(pileInfo)`: whether this card may be lifted. It has to be face up;
  from the waste or a foundation, only the top card.
- `movingStackFrom(pileInfo)`: the stack that leaves (a tableau run from the
  grabbed card down, otherwise one card).
- `isValidMoveFor(cards, target)`: Klondike placement. Foundations go up by
  suit from the ace; tableau columns go down in alternating colours, and only a
  king can go on an empty column. Multi-card stacks must also be a valid run
  (`isValidSequence`).
- `legalTargets(cards, pileInfo)`: every pile the stack could land on.
  Double-click auto-move takes the first one; the drag highlight shows them all.

## Pointer input

Mouse, pen and touch share one Pointer Events pipeline. The HTML5 drag-and-drop
API is not used.

1. `pointerdown` finds the card, checks `canPickUp`, records the start point and
   calls `setPointerCapture`.
2. `pointermove` does nothing until the pointer has travelled 4px. Then
   `beginPointerDrag` marks the stack `.dragging .no-anim` and highlights legal
   targets. Each move writes `--drag-x` / `--drag-y` on the moving cards.
3. `pointerup` hit-tests with `document.elementsFromPoint()`. This works because
   `.card.dragging` has `pointer-events: none`, so the hit test sees the pile
   underneath the dragged cards. A legal drop calls `executeMove`. Anything
   else snaps back: remove `.no-anim`, reset the variables to 0, and the
   ordinary CSS transform transition carries the cards home.
4. A press without movement counts as a click. Two clicks on the same card
   within 300ms count as a double-click and trigger auto-move.

Cards never leave their pile's DOM subtree while dragged; they are only
translated. Every card's transform is
`translate(var(--drag-x), var(--drag-y)) rotate(var(--rotate))`, so code sets
those variables and never writes `transform` directly.

`isBusy()` is true while an animation runs or a drag is active. The stock,
undo, autocollect, keyboard and double-click handlers check it first; without
it, a second finger could change a pile while the first was dragging from it.

## Keyboard

Focus follows playability. A face-up tableau card, the top card of the waste
and of each foundation, the stock and any empty pile have `tabIndex = 0`.
Buried cards have `-1`, so Tab skips them but the arrow keys can still reach
them.

- Arrow keys move spatially: up and down a column, across columns, and between
  a column and the pile above it (`TOP_ROW` maps each top-row pile to the
  column it sits over).
- Enter or Space picks up the focused card and then drops it on the next
  focused pile; on the stock it draws. Escape cancels; Z undoes.

The keyboard path goes through the same `canPickUp` / `isValidMoveFor` /
`executeMove` functions as the pointer path. The live region (`#game-status`)
announces each result, for example "A of hearts to the hearts foundation."

## Animation

| Effect | How |
|---|---|
| Drag, snap-back, auto-move | The real cards, moved by the `--drag-*` variables and the `.card` transform transition. |
| Stock to waste | `.deal-ghost` clones fly from the stock to each card's slot; the real cards stay hidden until the ghosts land. |
| Autocollect | `.deal-ghost` clones again, one per card, staggered. |
| Win | `.win-fly-card` clones on a fixed layer; the dialog opens on its own timer while the cascade plays. |
| Card flip | `@keyframes flip-reveal` on `.just-flipped`, with a timeout as a fallback in case `animationend` never fires. |

Clones are used only where a card has to travel between two piles' DOM
subtrees. Each ghost captures `dealGeneration`, and `deal()` sweeps leftovers.

With `prefers-reduced-motion: reduce`, the `.reduced-motion` class switches off
CSS animations and transitions, and the win skips the cascade and the confetti.
`motion.js` follows the media query live, so the setting can change mid-session.

## Audio

The Web Audio API, with no `AudioContext` at load. Creating one costs real
main-thread time on slow devices. `preloadAudio()` fetches the raw bytes; the
first pointer or key press creates the context, plays one silent sample (iOS
needs that to unlock output) and decodes the samples. Every sound call fails
silently if audio isn't available.

## Dialogs and settings

The How to play and win dialogs use `openModal` / `closeModal`. While one is
open, `header` and `main` are `inert`, focus moves into the dialog, and it
returns to where it was on close. The settings panel is a popover with
`aria-expanded` on its button.

Settings live in `localStorage` under `solitaire-settings`. On load, each value
is checked before it is used: `drawCount` must be 1 or 3, `bgColor` a
`#rrggbb`, and `autoMove` a boolean. Anything else falls back to the default.
A draw-mode change after the first move waits for the next deal.

## Offline

`sw.js` precaches the app shell: the HTML, CSS, JS, fonts, card back and icons.
It also tries to cache the sounds and court-card SVGs, but a failure there
doesn't block install.

- Navigations go network-first, falling back to the cached shell offline.
  Only the shell's own URL may overwrite it.
- Assets match their exact URL first. `index.html` requests scripts and
  stylesheets with a version query (`game.js?v0.26`), so a new deploy can never
  pair new HTML with an old cached script. A miss goes to the network and is
  cached; offline, the unversioned precached copy is used.

Bump `CACHE_VERSION` when an unversioned asset changes (fonts, images,
sounds) or when the precache list changes. Versioned CSS and JS refresh on
their own.

### Version numbers

Every CSS and JS file starts with a version comment (`/* v0.15 */`,
`// v0.26`). The matching `?v` query in `index.html` is bumped with it. The
query is what busts the browser and service-worker caches; the comment says
which version a file is.

## Tests

[Playwright](https://playwright.dev), Chromium only, across 10 viewport widths
from 320 to 1920 px: 119 tests, 1,190 runs. Tests open `index.html` over
`file://`, so no server is needed (the service worker is skipped there and has
its own unit tests).

The game's globals are top-level `let`/`const`, so they are not on `window`.
Tests reach them with bare names inside `page.evaluate`. Most tests build an
exact board instead of relying on a random deal, and they check structure
(counts, classes, computed boxes) rather than comparing screenshots, because
every card has a random tilt.

CI runs each viewport as its own job. `tests/ci.spec.js` fails if the workflow's
matrix and the Playwright projects get out of step.
