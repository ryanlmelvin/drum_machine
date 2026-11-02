// Generated VERSION and ASSETS: run node scripts/version-service-worker.mjs.
const VERSION = 'c5767f76589a5742';
const ASSETS = ["./","./LICENSE","./THIRD_PARTY_NOTICES.md","./app.js","./assets/audio/LICENSE-CC0.txt","./assets/audio/hihat-closed.wav","./assets/audio/hihat-open.wav","./assets/audio/hihat-pedal.wav","./assets/audio/kick.wav","./assets/audio/ride.wav","./assets/audio/rim.wav","./assets/audio/snare.wav","./assets/audio/sources.json","./audio.js","./icons/apple-touch-icon.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/icon.svg","./index.html","./manifest.webmanifest","./pwa.js","./rhythm.js","./styles.css"];
const CACHE_PREFIX = `drum-machine:${new URL(self.registration.scope).pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const assetURLs = ASSETS.map(path => new URL(path, self.registration.scope).href);
let repairTask;

async function download(cache, urls) {
  await Promise.all(urls.map(async canonical => {
    const url = new URL(canonical);
    url.searchParams.set('release', VERSION);
    const response = await fetch(url.href, { cache: 'reload' });
    if (!response.ok) throw new Error(`Could not cache ${url.pathname}: ${response.status}`);
    await cache.put(canonical, response);
  }));
}
async function missingAssets(cache) {
  const matches = await Promise.all(assetURLs.map(url => cache.match(url)));
  return assetURLs.filter((_, index) => !matches[index]);
}
function ensureOffline() {
  if (!repairTask) repairTask = (async () => {
    const cache = await caches.open(CACHE_NAME);
    await download(cache, await missingAssets(cache));
    return (await missingAssets(cache)).length === 0;
  })().catch(() => false).finally(() => { repairTask = null; });
  return repairTask;
}
self.addEventListener('install', event => {
  // The first worker activates normally; later versions wait for the Reload button.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => download(cache, assetURLs)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'ENSURE_OFFLINE') event.waitUntil((async () => {
    event.ports?.[0]?.postMessage({ ready: await ensureOffline() });
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match(new URL('./index.html', self.registration.scope).href);
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
