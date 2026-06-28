const PRICECHARTING_API = "https://www.pricecharting.com/api/products";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1000;

function createPriceChartingProvider({
  token = "",
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
} = {}) {
  const accessToken = String(token || "").trim();
  const cache = new Map();
  let lastRequestAt = 0;
  let queue = Promise.resolve();

  return {
    status() {
      return { enabled: Boolean(accessToken) };
    },

    async search(rawQuery) {
      const query = normalizeQuery(rawQuery);
      if (!accessToken) throw providerError("not-configured", "PriceCharting is not configured");

      const cached = cache.get(query);
      if (cached && cached.expiresAt > now()) {
        return { ...cached.value, cached: true };
      }

      const task = queue.then(async () => {
        const elapsed = now() - lastRequestAt;
        if (lastRequestAt > 0 && elapsed < MIN_REQUEST_INTERVAL_MS) {
          await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
        }
        lastRequestAt = now();
        const url = new URL(PRICECHARTING_API);
        url.searchParams.set("t", accessToken);
        url.searchParams.set("q", query);

        let response;
        try {
          response = await fetchImpl(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(10_000)
          });
        } catch {
          throw providerError("upstream-unavailable", "PriceCharting request failed");
        }
        if (!response?.ok) {
          throw providerError("upstream-error", `PriceCharting returned ${response?.status || "an error"}`);
        }

        const payload = await response.json();
        if (payload?.status !== "success" || !Array.isArray(payload.products)) {
          throw providerError("upstream-error", "PriceCharting returned an invalid response");
        }

        const value = {
          ok: true,
          query,
          products: payload.products.map(normalizePriceChartingProduct).filter(Boolean),
          cached: false
        };
        cache.set(query, { expiresAt: now() + CACHE_TTL_MS, value });
        return value;
      });
      queue = task.catch(() => {});
      return task;
    }
  };
}

function normalizePriceChartingProduct(product) {
  if (!product || typeof product !== "object") return null;
  const id = String(product.id || "").trim();
  const name = boundedString(product["product-name"], 160);
  const setName = boundedString(product["console-name"], 160);
  if (!id || !name || !setName) return null;

  return {
    id,
    name,
    setName,
    ungradedUsd: centsToUsd(product["loose-price"]),
    psa10Usd: centsToUsd(product["manual-only-price"]),
    salesVolumeYear: nonNegativeInteger(product["sales-volume"])
  };
}

function normalizeQuery(value) {
  const query = String(value || "").normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (query.length < 2 || query.length > 160 || /[\u0000-\u001f\u007f]/u.test(query)) {
    throw providerError("invalid-query", "PriceCharting query is invalid");
  }
  return query;
}

function centsToUsd(value) {
  const cents = Number(value);
  return Number.isInteger(cents) && cents > 0 ? cents / 100 : null;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function boundedString(value, maxLength) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : "";
}

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  createPriceChartingProvider,
  normalizePriceChartingProduct
};
