const API_ROOT = "./api/pricecharting";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function canUseLocalPriceApi(locationLike = globalThis.location) {
  return String(locationLike?.protocol || "").toLowerCase() === "http:"
    && LOOPBACK_HOSTS.has(String(locationLike?.hostname || "").toLowerCase());
}

export function buildPriceChartingQuery(card = {}) {
  const name = String(card.englishName || card.displayName || "").trim();
  const setName = String(card.setName || card.setCode || "").trim();
  const number = localNumber(card.localNumber);
  return [name, setName, number ? `#${number}` : ""].filter(Boolean).join(" ");
}

export function selectPriceChartingProduct(card, products) {
  const name = normalizeText(card?.englishName || card?.displayName);
  const setName = normalizeText(card?.setName || card?.setCode);
  const number = localNumber(card?.localNumber);
  if (!name || !setName || !number) return null;

  const matches = (Array.isArray(products) ? products : []).filter(product => {
    const productName = String(product?.name || "");
    const hasPrice = positivePrice(product?.ungradedUsd) || positivePrice(product?.psa10Usd);
    return hasPrice
      && productCardName(productName, number) === name
      && normalizeText(product?.setName) === setName
      && numberPattern(number).test(productName.normalize("NFKC"));
  });
  return matches.length === 1 ? matches[0] : null;
}

export function applyPriceChartingProduct(card, product, observedAt) {
  const ungradedUsd = positivePrice(product?.ungradedUsd) ? Number(product.ungradedUsd) : null;
  const psa10Usd = positivePrice(product?.psa10Usd) ? Number(product.psa10Usd) : null;
  if (!ungradedUsd) return card;

  const date = /^\d{4}-\d{2}-\d{2}$/u.test(String(observedAt || ""))
    ? String(observedAt)
    : new Date().toISOString().slice(0, 10);
  return {
    ...card,
    priceChartingId: String(product.id),
    market: {
      source: "PriceCharting",
      channel: "reference",
      currency: "USD",
      salePrice: ungradedUsd,
      buyerShipping: 0,
      condition: "Ungraded",
      sampleCount: null,
      observedAt: date,
      dataKind: "market-reference"
    },
    current: {
      ...(card.current || {}),
      currency: "USD",
      raw: ungradedUsd,
      psa10: psa10Usd,
      observedAt: date
    },
    history: [{ date, raw: ungradedUsd, psa10: psa10Usd }]
  };
}

export function shouldFetchPriceCharting(card, enabled) {
  return enabled === true
    && !card?.priceChartingId
    && Boolean(String(card?.englishName || "").trim())
    && Boolean(String(card?.setName || "").trim())
    && Boolean(localNumber(card?.localNumber));
}

export async function getPriceChartingStatus({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${API_ROOT}/status`, { headers: { Accept: "application/json" } });
  if (!response.ok) return { enabled: false };
  const payload = await response.json();
  return { enabled: payload?.enabled === true };
}

export async function fetchPriceChartingProduct(card, { fetchImpl = fetch } = {}) {
  const query = buildPriceChartingQuery(card);
  if (!query) return null;
  const response = await fetchImpl(`${API_ROOT}/search?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const product = selectPriceChartingProduct(card, payload?.products);
  return product ? applyPriceChartingProduct(card, product, String(payload.observedAt || "")) : null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function localNumber(value) {
  const match = String(value || "").normalize("NFKC").match(/\d+/u);
  return match ? String(Number(match[0])) : "";
}

function numberPattern(number) {
  return new RegExp(`(?:#|\\b)0*${escapeRegex(number)}(?:\\D|$)`, "iu");
}

function productCardName(value, number) {
  const numberToken = new RegExp(`(?:#|\\b)0*${escapeRegex(number)}(?:/\\d+)?\\b`, "iu");
  return normalizeText(String(value || "").normalize("NFKC").replace(numberToken, " "));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function positivePrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}
