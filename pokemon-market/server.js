const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createPriceChartingProvider } = require("./pricecharting-proxy.js");

const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function createPokemonMarketServer({
  priceProvider = createPriceChartingProvider({ token: process.env.PRICECHARTING_TOKEN }),
  now = () => new Date(),
  allowLanPriceApi = process.env.POKEMON_MARKET_ALLOW_LAN_PRICE_API === "true"
} = {}) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${PORT}`}`);

    if (url.pathname === "/health") {
      sendJson(response, {
        ok: true,
        localUrl: `http://127.0.0.1:${PORT}/`,
        phoneUrls: getLanAddresses().map(address => `http://${address}:${PORT}/`)
      });
      return;
    }

    if (url.pathname.startsWith("/api/pricecharting/")) {
      if (!isPriceApiAllowed(request.socket?.remoteAddress, allowLanPriceApi)) {
        sendJson(response, { ok: false, code: "local-only" }, 403);
        return;
      }
      void handlePriceChartingRequest(request, response, url, priceProvider, now);
      return;
    }

    serveStatic(response, url.pathname);
  });
}

const server = createPokemonMarketServer();

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Pokemon Market local: http://127.0.0.1:${PORT}/`);
    for (const address of getLanAddresses()) {
      console.log(`Pokemon Market phone: http://${address}:${PORT}/`);
    }
  });
}

function serveStatic(response, pathname) {
  const requestPath = normalizeRequestPath(pathname);
  if (requestPath === null) {
    sendText(response, "Bad request", "text/plain; charset=utf-8", 400);
    return;
  }
  const filePath = path.normalize(path.join(ROOT, requestPath));
  if (!isInsideRoot(filePath)) {
    sendText(response, "Forbidden", "text/plain; charset=utf-8", 403);
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(response, "Not found", "text/plain; charset=utf-8", 404);
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}

async function handlePriceChartingRequest(request, response, url, priceProvider, now) {
  if (request.method !== "GET") {
    sendJson(response, { ok: false, code: "method-not-allowed" }, 405);
    return;
  }

  if (url.pathname === "/api/pricecharting/status") {
    sendJson(response, priceProvider.status());
    return;
  }

  if (url.pathname !== "/api/pricecharting/search") {
    sendJson(response, { ok: false, code: "not-found" }, 404);
    return;
  }

  try {
    const result = await priceProvider.search(url.searchParams.get("q"));
    sendJson(response, {
      ...result,
      observedAt: now().toISOString().slice(0, 10)
    });
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "internal-error";
    sendJson(response, { ok: false, code }, statusForProviderError(code));
  }
}

function statusForProviderError(code) {
  if (code === "invalid-query") return 400;
  if (code === "not-configured") return 503;
  if (code === "upstream-unavailable" || code === "upstream-error") return 502;
  return 500;
}

function normalizeRequestPath(pathname) {
  let requested;
  try {
    requested = decodeURIComponent(pathname || "/");
  } catch {
    return null;
  }
  if (requested.includes("\0")) return null;
  if (requested === "/" || requested === "") return "/index.html";
  if (requested.startsWith("/pokemon-market/")) requested = requested.slice("/pokemon-market".length);
  if (requested === "/pokemon-market" || requested === "/") return "/index.html";
  return requested;
}

function isInsideRoot(filePath) {
  const relative = path.relative(ROOT, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function getLanAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses.length ? addresses : ["127.0.0.1"];
}

function isPriceApiAllowed(remoteAddress, allowLan = false) {
  if (allowLan) return true;
  const address = String(remoteAddress || "").toLowerCase();
  return address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
}

function sendJson(response, data, status = 200) {
  sendText(response, JSON.stringify(data, null, 2), "application/json; charset=utf-8", status);
}

function sendText(response, text, contentType, status = 200) {
  response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  response.end(text);
}

module.exports = {
  ROOT,
  createPokemonMarketServer,
  normalizeRequestPath,
  isInsideRoot,
  isPriceApiAllowed,
  getLanAddresses,
  server
};
