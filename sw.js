// v0.11
// Service worker for Klondike Solitaire PWA.
// Bump CACHE_VERSION whenever any precached asset changes so clients refresh.
const CACHE_VERSION = 'solitaire-v11';

// App shell — must all cache or install fails.
const SHELL = [
  './',
  './index.html',
  './css/fonts.css',
  './css/styles.css',
  './css/cards.css',
  // Self-hosted fonts — precached so a first offline launch renders the suit
  // glyphs rather than whatever the OS substitutes.
  './fonts/outfit-latin.woff2',
  './fonts/lora-400-latin.woff2',
  './fonts/symbols-400.woff2',
  './js/cards.js',
  './js/game.js',
  './js/motion.js',
  './js/confetti.js',
  // Every face-down card renders this; without it offline shows blank backs.
  './court-cards/Back1Small.jpeg',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// Best-effort assets — a single 404 here won't abort install.
const courtRanks = [11, 12, 13];
const courtSuits = [0, 1, 2, 3];
const EXTRAS = [
  './sounds/contact1.wav',
  './sounds/554208__memes_hodachy__cardsound32562.mp3',
];
for (const s of courtSuits) {
  for (const r of courtRanks) EXTRAS.push(`./court-cards/${s}_${r}.svg`);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(SHELL);
    await Promise.allSettled(EXTRAS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// The scope root and ./index.html are the same document; anything else under
// the scope is a different page and must not be cached as the shell.
function isShellNavigation(req) {
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return false;
  return url.pathname === scope.pathname
    || url.pathname === scope.pathname + 'index.html';
}

// Static assets. The exact URL comes first, so a versioned request
// (game.js?v0.26) only ever matches the copy fetched for that version: new
// HTML can never be paired with an old script. A miss goes to the network and
// is cached under that URL. Offline, any cached copy of the asset (the
// unversioned precache) beats a failed load.
async function versionedAsset(req, cache) {
  const exact = await cache.match(req);
  if (exact) return exact;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const fallback = await cache.match(req, { ignoreSearch: true });
    if (fallback) return fallback;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Network-first for navigations so the HTML shell never goes stale.
    // Falls back to cached shell only when offline.
    if (req.mode === 'navigate') {
      try {
        const res = await fetch(req);
        // Only the shell's own URL may overwrite the cached shell. Caching any
        // successful navigation would silently poison it the day a second HTML
        // page lands under the scope.
        if (res && res.ok && isShellNavigation(req)) cache.put('./index.html', res.clone());
        return res;
      } catch (err) {
        const shell = await cache.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
        throw err;
      }
    }

    return versionedAsset(req, cache);
  })());
});
