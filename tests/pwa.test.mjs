import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const workerCode = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const pwaCode = await readFile(new URL('../pwa.js', import.meta.url), 'utf8');
const scope = 'https://example.github.io/drum_machine/';

function workerFixture({ networkFails = false, failPath } = {}) {
  const handlers = new Map();
  const stores = new Map();
  const downloads = [];
  let activations = 0;
  let claims = 0;
  const keyOf = request => typeof request === 'string' ? request : request.url ?? request.href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(request, response) { store.set(keyOf(request), response); },
        async match(request, options = {}) {
          const url = new URL(keyOf(request));
          if (options.ignoreSearch) url.search = '';
          return store.get(url.href);
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    registration: { scope }, location: { origin: new URL(scope).origin },
    clients: { async claim() { claims++; } },
    async skipWaiting() { activations++; },
    addEventListener(type, handler) { handlers.set(type, handler); },
  };
  vm.runInNewContext(workerCode, {
    URL, caches, self,
    fetch: async (request, options) => {
      const url = keyOf(request);
      downloads.push({ url, options });
      if (networkFails || (failPath && url.includes(failPath))) throw new Error('Network unavailable');
      return { ok: true, url, cached: true };
    },
  });
  async function dispatch(type, extra = {}) {
    const waits = [];
    let response;
    handlers.get(type)({ ...extra, waitUntil(promise) { waits.push(promise); }, respondWith(promise) { response = promise; } });
    await Promise.all(waits);
    return response;
  }
  async function repair() {
    let response;
    await dispatch('message', { data: { type: 'ENSURE_OFFLINE' }, ports: [{ postMessage(value) { response = value; } }] });
    return response.ready;
  }
  return {
    dispatch, repair, stores, downloads,
    setOffline(value) { networkFails = value; },
    activations: () => activations, claims: () => claims,
  };
}

test('the complete app is cached under the GitHub project path without stale HTTP cache', async () => {
  const worker = workerFixture();
  await worker.dispatch('install');
  assert.ok(worker.downloads.length >= 8);
  assert.ok(worker.downloads.every(({ url, options }) => url.startsWith(scope) && new URL(url).searchParams.has('release') && options.cache === 'reload'));
  const entries = [...worker.stores.values()][0];
  assert.ok(entries.has(`${scope}index.html`));
  assert.ok(entries.has(`${scope}pwa.js`));
  assert.ok([...entries.keys()].every(url => !new URL(url).search), 'cache keys stay canonical');
  assert.equal(worker.activations(), 0, 'installing an update never skips waiting');
});

test('only an explicit update request activates a waiting worker', async () => {
  const worker = workerFixture();
  await worker.dispatch('install');
  await worker.repair();
  assert.equal(worker.activations(), 0);
  await worker.dispatch('message', { data: { type: 'ACTIVATE_UPDATE' } });
  assert.equal(worker.activations(), 1);
});

test('activation cleans only this app and scope’s obsolete caches', async () => {
  const worker = workerFixture();
  worker.stores.set('drum-machine:/drum_machine/:old', new Map());
  worker.stores.set('drum-machine:/other/:old', new Map());
  worker.stores.set('still-whitenoise-v18', new Map());
  await worker.dispatch('install');
  await worker.dispatch('activate');
  assert.equal(worker.stores.has('drum-machine:/drum_machine/:old'), false);
  assert.equal(worker.stores.has('drum-machine:/other/:old'), true);
  assert.equal(worker.stores.has('still-whitenoise-v18'), true);
  assert.equal(worker.claims(), 1);
});

test('cached assets and navigation work offline; other apps and mutations are untouched', async () => {
  const worker = workerFixture();
  await worker.dispatch('install');
  worker.setOffline(true);
  const cached = await worker.dispatch('fetch', { request: { url: `${scope}app.js?cache=ignored`, method: 'GET' } });
  assert.ok(cached.cached);
  const page = await worker.dispatch('fetch', { request: { url: `${scope}unknown`, method: 'GET', mode: 'navigate' } });
  assert.equal(new URL(page.url).pathname, '/drum_machine/index.html');
  for (const request of [
    { url: 'https://example.github.io/whitenoise/', method: 'GET' },
    { url: 'https://elsewhere.example/', method: 'GET' },
    { url: `${scope}upload`, method: 'POST' },
  ]) assert.equal(await worker.dispatch('fetch', { request }), undefined);
});

test('a failed install rejects, and incomplete offline data can be repaired without activation', async () => {
  const failed = workerFixture({ failPath: '/styles.css' });
  await assert.rejects(failed.dispatch('install'), /Network unavailable/);
  assert.equal(failed.activations(), 0);
  const worker = workerFixture();
  await worker.dispatch('install');
  const store = [...worker.stores.values()][0];
  store.delete(`${scope}styles.css`);
  worker.setOffline(true);
  assert.equal(await worker.repair(), false);
  worker.setOffline(false);
  const before = worker.downloads.length;
  assert.deepEqual(await Promise.all([worker.repair(), worker.repair()]), [true, true]);
  assert.equal(worker.downloads.length, before + 1, 'concurrent repairs download the missing file once');
  assert.ok(store.has(`${scope}styles.css`));
  assert.equal(worker.activations(), 0);
});

function eventTarget(properties = {}) {
  const handlers = new Map();
  return {
    ...properties,
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(handler);
    },
    async emit(type, event = {}) { await Promise.all((handlers.get(type) ?? []).map(handler => handler(event))); },
  };
}

async function clientFixture({ controlled = true } = {}) {
  const nodes = Object.fromEntries(['update-banner', 'update-button', 'install-button'].map(id => [id, eventTarget({ hidden: true, textContent: 'Reload' })]));
  const registration = eventTarget({ active: null, installing: null, waiting: null, async update() {} });
  const serviceWorker = eventTarget({ controller: controlled ? {} : null, async register() { return registration; } });
  const document = eventTarget({ visibilityState: 'visible', getElementById(id) { return nodes[id] ?? null; } });
  const window = eventTarget({ isSecureContext: true, matchMedia() { return eventTarget({ matches: false }); } });
  let reloads = 0;
  let stops = 0;
  const context = {
    document, window, navigator: { serviceWorker, onLine: true, userAgent: 'test', platform: 'test' },
    location: { reload() { reloads++; } },
    setInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
    MessageChannel, Date,
    beforeReload() { stops++; },
  };
  vm.runInNewContext(`${pwaCode.replace('export function initPwa', 'function initPwa')}\ninitPwa({beforeReload});`, context);
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, registration, serviceWorker, reloads: () => reloads, stops: () => stops };
}

test('first activation does not show an update or reload the app', async () => {
  const client = await clientFixture({ controlled: false });
  client.serviceWorker.controller = {};
  await client.serviceWorker.emit('controllerchange');
  assert.equal(client.nodes['update-banner'].hidden, true);
  assert.equal(client.reloads(), 0);
  assert.equal(client.stops(), 0);
});

test('an update accepted in another tab preserves playback until this tab explicitly reloads', async () => {
  const client = await clientFixture();
  await client.serviceWorker.emit('controllerchange');
  assert.equal(client.nodes['update-banner'].hidden, false);
  assert.equal(client.reloads(), 0);
  assert.equal(client.stops(), 0);
  await client.nodes['update-button'].emit('click');
  assert.equal(client.stops(), 1);
  assert.equal(client.reloads(), 1);
});

test('a pending update is user initiated and stops audio before worker activation', async () => {
  const client = await clientFixture();
  let requested;
  client.registration.waiting = {
    postMessage(message) {
      assert.equal(client.stops(), 1);
      requested = message.type;
    },
  };
  await client.nodes['update-button'].emit('click');
  assert.equal(requested, 'ACTIVATE_UPDATE');
  assert.equal(client.reloads(), 0);
  await client.serviceWorker.emit('controllerchange');
  assert.equal(client.reloads(), 1);
  await client.serviceWorker.emit('controllerchange');
  assert.equal(client.reloads(), 1);
});
