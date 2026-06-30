const CACHE_NAME = "pokemon-market-v22";
const CACHE_PREFIX = "pokemon-market-";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=22",
  "./app.js",
  "./app.js?v=22",
  "./core.mjs",
  "./catalog.mjs",
  "./tcgdex.mjs",
  "./fx.mjs",
  "./pricecharting.mjs",
  "./flow.mjs",
  "./search-tools.mjs",
  "./search-session.mjs",
  "./tcgdex-index.mjs",
  "./market-labels.mjs",
  "./market-evidence.mjs",
  "./card-cache.mjs",
  "./storage.mjs",
  "./snapshot.mjs",
  "./data/latest.json",
  "./data/pokemon-names.json",
  "./data/search-supplements.json",
  "./data/tcgdex-ja-index.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
const DATA_URL = new URL("./data/latest.json", self.location.href).href;
const APP_SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.location.href).href));

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (requestUrl.href === DATA_URL) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (!APP_SHELL_URLS.has(requestUrl.href)) return;
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  await cacheSuccessfulResponse(request, response);
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    await cacheSuccessfulResponse(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheSuccessfulResponse(request, response) {
  if (!response || !response.ok || response.type !== "basic") return;

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // The network response is still useful when browser cache storage is full.
  }
}
