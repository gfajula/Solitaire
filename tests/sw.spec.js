// Service worker logic that can be exercised without installing a worker.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SW_SRC = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');

// Pull isShellNavigation out of sw.js and run it against a fake registration.
function loadShellGuard(scope) {
    const start = SW_SRC.indexOf('function isShellNavigation');
    const end = SW_SRC.indexOf("self.addEventListener('fetch'");
    expect(start, 'isShellNavigation missing from sw.js').toBeGreaterThan(-1);
    const body = SW_SRC.slice(start, end);
    const fakeSelf = { registration: { scope } };
    // eslint-disable-next-line no-new-func
    const guard = new Function('self', 'URL', `${body}; return isShellNavigation;`)(fakeSelf, URL);
    return (url) => guard({ url });
}

// Pull versionedAsset out of sw.js with a stub fetch, and a fake cache that
// honours ignoreSearch the way the Cache API does.
function loadVersionedAsset(fetchImpl) {
    const start = SW_SRC.indexOf('async function versionedAsset');
    const end = SW_SRC.indexOf("self.addEventListener('fetch'");
    expect(start, 'versionedAsset missing from sw.js').toBeGreaterThan(-1);
    const body = SW_SRC.slice(start, end);
    // eslint-disable-next-line no-new-func
    return new Function('fetch', `${body}; return versionedAsset;`)(fetchImpl);
}

function fakeCache(entries = {}) {
    const store = new Map(Object.entries(entries));
    const base = (url) => url.split('?')[0];
    return {
        store,
        async match(req, opts = {}) {
            const url = typeof req === 'string' ? req : req.url;
            if (store.has(url)) return store.get(url);
            if (opts.ignoreSearch) {
                for (const [k, v] of store) if (base(k) === base(url)) return v;
            }
            return undefined;
        },
        async put(req, res) { store.set(req.url, res); },
    };
}

const response = (body) => ({ ok: true, body, clone() { return this; } });
const offline = async () => { throw new TypeError('Failed to fetch'); };
const ASSET = 'https://example.com/js/game.js';

test.describe('service worker: versioned assets', () => {
    test('a new ?v is fetched, not served from the old unversioned copy', async () => {
        const cache = fakeCache({ [ASSET]: response('old') });
        const handle = loadVersionedAsset(async () => response('new'));

        const res = await handle({ url: `${ASSET}?v0.26` }, cache);
        expect(res.body).toBe('new');
        // Cached under the versioned URL for next time.
        expect(cache.store.get(`${ASSET}?v0.26`).body).toBe('new');
    });

    test('an exact hit is served without touching the network', async () => {
        const cache = fakeCache({ [`${ASSET}?v0.26`]: response('cached') });
        let fetched = false;
        const handle = loadVersionedAsset(async () => { fetched = true; return response('net'); });

        const res = await handle({ url: `${ASSET}?v0.26` }, cache);
        expect(res.body).toBe('cached');
        expect(fetched).toBe(false);
    });

    test('offline, the unversioned precache still serves the asset', async () => {
        const cache = fakeCache({ [ASSET]: response('precached') });
        const res = await loadVersionedAsset(offline)({ url: `${ASSET}?v0.26` }, cache);
        expect(res.body).toBe('precached');
    });

    test('offline with nothing cached, the failure propagates', async () => {
        const handle = loadVersionedAsset(offline);
        await expect(handle({ url: `${ASSET}?v0.26` }, fakeCache())).rejects.toThrow('Failed to fetch');
    });
});

test.describe('service worker', () => {
    test('only the shell URL may overwrite the cached shell', () => {
        const isShell = loadShellGuard('https://example.com/aisolitaire/');

        expect(isShell('https://example.com/aisolitaire/')).toBe(true);
        expect(isShell('https://example.com/aisolitaire/index.html')).toBe(true);

        // A second HTML page under the scope must not poison ./index.html.
        expect(isShell('https://example.com/aisolitaire/about.html')).toBe(false);
        expect(isShell('https://example.com/aisolitaire/sub/index.html')).toBe(false);
        expect(isShell('https://evil.example/aisolitaire/index.html')).toBe(false);
    });

    test('the guard follows the scope, not a hardcoded path', () => {
        const isShell = loadShellGuard('https://example.com/');
        expect(isShell('https://example.com/')).toBe(true);
        expect(isShell('https://example.com/index.html')).toBe(true);
        expect(isShell('https://example.com/other.html')).toBe(false);
    });

    test('CACHE_VERSION is bumped whenever SHELL changes', () => {
        // Not a behavioural check — just a reminder that the two travel together.
        const version = SW_SRC.match(/CACHE_VERSION = '([^']+)'/);
        expect(version).not.toBeNull();
        expect(version[1]).toMatch(/^solitaire-v\d+$/);
    });
});
