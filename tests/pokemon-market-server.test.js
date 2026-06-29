const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const {
  ROOT,
  createPokemonMarketServer,
  normalizeRequestPath,
  isInsideRoot,
  isPriceApiAllowed,
  server
} = require("../pokemon-market/server.js");

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=18",
  "./app.js",
  "./app.js?v=18",
  "./core.mjs",
  "./catalog.mjs",
  "./tcgdex.mjs",
  "./fx.mjs",
  "./pricecharting.mjs",
  "./flow.mjs",
  "./search-tools.mjs",
  "./search-session.mjs",
  "./market-labels.mjs",
  "./storage.mjs",
  "./snapshot.mjs",
  "./data/latest.json",
  "./data/pokemon-names.json",
  "./data/search-supplements.json",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

test("pokemon market server maps root and prefixed paths to the viewer", () => {
  assert.equal(normalizeRequestPath("/"), "/index.html");
  assert.equal(normalizeRequestPath("/pokemon-market"), "/index.html");
  assert.equal(normalizeRequestPath("/pokemon-market/"), "/index.html");
  assert.equal(normalizeRequestPath("/pokemon-market/index.html"), "/index.html");
  assert.equal(normalizeRequestPath("/%E0%A4%A"), null);
});

test("pokemon market server keeps static paths inside pokemon-market", () => {
  assert.equal(isInsideRoot(path.join(ROOT, "index.html")), true);
  assert.equal(isInsideRoot(path.join(ROOT, "styles.css")), true);
  assert.equal(isInsideRoot(path.resolve(ROOT, "..", "AGENTS.md")), false);
});

test("PriceCharting APIは既定で同一端末からだけ利用できる", () => {
  assert.equal(isPriceApiAllowed("127.0.0.1"), true);
  assert.equal(isPriceApiAllowed("::1"), true);
  assert.equal(isPriceApiAllowed("::ffff:127.0.0.1"), true);
  assert.equal(isPriceApiAllowed("192.168.1.20"), false);
  assert.equal(isPriceApiAllowed("192.168.1.20", true), true);
});

test("PWA manifest declares standalone local icons with matching PNG dimensions", () => {
  const manifestPath = path.join(ROOT, "manifest.webmanifest");
  assert.equal(fs.existsSync(manifestPath), true, "manifest.webmanifest should exist");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#f7f8fa");
  assert.equal(manifest.theme_color, "#f7f8fa");

  for (const size of [192, 512]) {
    const source = `./icons/icon-${size}.png`;
    const icon = manifest.icons.find(candidate => candidate.src === source);
    assert.deepEqual(icon, {
      src: source,
      sizes: `${size}x${size}`,
      type: "image/png"
    });
    assert.deepEqual(readPngDimensions(path.join(ROOT, source)), {
      width: size,
      height: size
    });
  }
});

test("service worker versions the app shell and leaves cross-origin requests untouched", async () => {
  const serviceWorkerPath = path.join(ROOT, "sw.js");
  assert.equal(fs.existsSync(serviceWorkerPath), true, "sw.js should exist");

  const harness = loadServiceWorker(serviceWorkerPath);
  let installPromise;
  harness.listeners.install({ waitUntil(promise) { installPromise = promise; } });
  await installPromise;

  assert.match(harness.openedCacheNames[0], /^pokemon-market-v\d+$/);
  assert.deepEqual(harness.precachedUrls, APP_SHELL);

  const currentCache = harness.openedCacheNames[0];
  const oldCache = `${currentCache}-old`;
  harness.cacheNames.push(currentCache, oldCache, "unrelated-v1");
  let activatePromise;
  harness.listeners.activate({ waitUntil(promise) { activatePromise = promise; } });
  await activatePromise;
  assert.deepEqual(harness.deletedCacheNames, [oldCache]);
  assert.equal(harness.claimedClients, 1);
  harness.requestLog.length = 0;

  let crossOriginResponse;
  harness.listeners.fetch({
    request: { method: "GET", url: "https://images.example/card.png" },
    respondWith(response) { crossOriginResponse = response; }
  });
  assert.equal(crossOriginResponse, undefined);
  assert.equal(harness.requestLog.length, 0);

  let unknownResponse;
  harness.listeners.fetch({
    request: { method: "GET", url: "https://market.example/pokemon-market/private.json" },
    respondWith(response) { unknownResponse = response; }
  });
  assert.equal(unknownResponse, undefined);

  harness.cachedResponse = { source: "cache" };
  let staticResponse;
  harness.listeners.fetch({
    request: { method: "GET", url: "https://market.example/pokemon-market/styles.css" },
    respondWith(response) { staticResponse = response; }
  });
  assert.equal(await staticResponse, harness.cachedResponse);
  assert.deepEqual(harness.requestLog, ["open", "cache"]);

  harness.requestLog.length = 0;
  let dataResponse;
  harness.listeners.fetch({
    request: { method: "GET", url: "https://market.example/pokemon-market/data/latest.json" },
    respondWith(response) { dataResponse = response; }
  });
  assert.equal(await dataResponse, harness.networkResponse);
  assert.deepEqual(harness.requestLog.slice(0, 2), ["network", "open"]);

  harness.cachePutError = new Error("quota");
  let quotaResponse;
  harness.listeners.fetch({
    request: { method: "GET", url: "https://market.example/pokemon-market/data/latest.json" },
    respondWith(response) { quotaResponse = response; }
  });
  assert.equal(await quotaResponse, harness.networkResponse);
});

test("pokemon market server serves webmanifest with the manifest MIME type", async () => {
  await listenOnLoopback(server);
  try {
    const response = await request(server.address().port, "/manifest.webmanifest");
    assert.equal(response.statusCode, 200);
    assert.equal(response.contentType, "application/manifest+json; charset=utf-8");
  } finally {
    await closeServer(server);
  }
});

test("pokemon market server serves ES modules as JavaScript", async () => {
  await listenOnLoopback(server);
  try {
    const response = await request(server.address().port, "/core.mjs");
    assert.equal(response.statusCode, 200);
    assert.equal(response.contentType, "text/javascript; charset=utf-8");
  } finally {
    await closeServer(server);
  }
});

test("pokemon market server rejects malformed encoded paths without stopping", async () => {
  await listenOnLoopback(server);
  try {
    const response = await request(server.address().port, "/%E0%A4%A");
    assert.equal(response.statusCode, 400);
  } finally {
    await closeServer(server);
  }
});

test("PriceCharting連携状態をトークンなしで安全に返す", async () => {
  const apiServer = createPokemonMarketServer({
    priceProvider: {
      status: () => ({ enabled: false }),
      search: async () => { throw new Error("must not be called"); }
    }
  });
  await listenOnLoopback(apiServer);
  try {
    const response = await request(apiServer.address().port, "/api/pricecharting/status");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { enabled: false });
  } finally {
    await closeServer(apiServer);
  }
});

test("PriceCharting検索APIは安全な候補だけを返す", async () => {
  const apiServer = createPokemonMarketServer({
    now: () => new Date("2026-06-28T00:00:00Z"),
    priceProvider: {
      status: () => ({ enabled: true }),
      search: async query => ({
        ok: true,
        query,
        products: [{ id: "123", name: "Charizard #4", setName: "Pokemon Base Set", ungradedUsd: 356.75, psa10Usd: 30100 }],
        cached: false
      })
    }
  });
  await listenOnLoopback(apiServer);
  try {
    const response = await request(apiServer.address().port, "/api/pricecharting/search?q=Charizard%20%234");
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.equal(payload.query, "Charizard #4");
    assert.equal(payload.observedAt, "2026-06-28");
    assert.equal(payload.products[0].ungradedUsd, 356.75);
    assert.doesNotMatch(response.body, /token|secret|authorization/i);
  } finally {
    await closeServer(apiServer);
  }
});

test("PriceCharting未設定エラーを秘密情報なしで503へ変換する", async () => {
  const error = new Error("not configured");
  error.code = "not-configured";
  const apiServer = createPokemonMarketServer({
    priceProvider: {
      status: () => ({ enabled: false }),
      search: async () => { throw error; }
    }
  });
  await listenOnLoopback(apiServer);
  try {
    const response = await request(apiServer.address().port, "/api/pricecharting/search?q=Charizard");
    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), { ok: false, code: "not-configured" });
  } finally {
    await closeServer(apiServer);
  }
});

function readPngDimensions(filePath) {
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(data.subarray(12, 16).toString("ascii"), "IHDR");
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20)
  };
}

function loadServiceWorker(filePath) {
  const listeners = {};
  const cacheNames = [];
  const deletedCacheNames = [];
  const openedCacheNames = [];
  const requestLog = [];
  const harness = {
    cacheNames,
    claimedClients: 0,
    deletedCacheNames,
    listeners,
    networkResponse: createNetworkResponse(),
    openedCacheNames,
    precachedUrls: [],
    requestLog,
    cachedResponse: undefined,
    cachePutError: null
  };
  const cache = {
    async addAll(urls) {
      harness.precachedUrls = Array.from(urls);
    },
    async match() {
      requestLog.push("cache");
      return harness.cachedResponse;
    },
    async put() {
      if (harness.cachePutError) throw harness.cachePutError;
    }
  };
  const caches = {
    async delete(name) {
      deletedCacheNames.push(name);
      return true;
    },
    async keys() {
      return cacheNames;
    },
    async match() {
      requestLog.push("cache");
      return harness.cachedResponse;
    },
    async open(name) {
      requestLog.push("open");
      openedCacheNames.push(name);
      return cache;
    }
  };
  const self = {
    clients: {
      async claim() {
        harness.claimedClients += 1;
      }
    },
    location: new URL("https://market.example/pokemon-market/sw.js"),
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    skipWaiting() {}
  };
  const fetch = async () => {
    requestLog.push("network");
    return harness.networkResponse;
  };

  vm.runInNewContext(fs.readFileSync(filePath, "utf8"), {
    caches,
    fetch,
    self,
    URL
  });
  return harness;
}

function createNetworkResponse() {
  const response = {
    ok: true,
    type: "basic",
    clone() {
      return response;
    }
  };
  return response;
}

function listenOnLoopback(targetServer) {
  return new Promise((resolve, reject) => {
    targetServer.once("error", reject);
    targetServer.listen(0, "127.0.0.1", resolve);
  });
}

function closeServer(targetServer) {
  return new Promise((resolve, reject) => {
    targetServer.close(error => error ? reject(error) : resolve());
  });
}

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const outgoing = http.get({ host: "127.0.0.1", port, path: pathname }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({
        statusCode: response.statusCode,
        contentType: response.headers["content-type"],
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    outgoing.on("error", reject);
  });
}
