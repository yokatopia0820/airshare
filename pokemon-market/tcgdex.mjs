const API_ROOT = "https://api.tcgdex.net/v2/ja";
const DEFAULT_LIMIT = 24;

const RARITY_LABELS = new Map([
  ["common", "コモン"],
  ["uncommon", "アンコモン"],
  ["rare", "レア"],
  ["double rare", "ダブルレア"],
  ["ultra rare", "ウルトラレア"],
  ["secret rare", "シークレットレア"],
  ["illustration rare", "イラストレーションレア"],
  ["special illustration rare", "スペシャルイラストレーションレア"],
  ["promo", "プロモ"]
]);

export function buildTcgdexSearchUrl(query, limit = DEFAULT_LIMIT) {
  const normalizedQuery = String(query ?? "").normalize("NFKC").trim();
  if (!normalizedQuery) throw new Error("検索語を入力してください。");

  const url = new URL(`${API_ROOT}/cards`);
  if (/^\d{1,4}$/u.test(normalizedQuery)) {
    url.searchParams.set("localId", normalizedQuery.padStart(3, "0"));
  } else {
    url.searchParams.set("name", normalizedQuery);
  }
  url.searchParams.set("pagination:page", "1");
  url.searchParams.set("pagination:itemsPerPage", String(clampLimit(limit)));
  return url.toString();
}

export async function searchTcgdexCards(query, { fetchImpl = fetch, signal, limit = DEFAULT_LIMIT } = {}) {
  const directId = tcgdexIdFromQuery(query);
  if (directId) {
    const card = await fetchTcgdexCard(directId, { fetchImpl, signal });
    return card ? [card] : [];
  }

  const response = await fetchImpl(buildTcgdexSearchUrl(query, limit), {
    headers: { Accept: "application/json" },
    signal
  });
  if (!response.ok) throw new Error(`カード検索に失敗しました (${response.status})`);

  const cards = await response.json();
  if (!Array.isArray(cards)) throw new Error("カード検索の応答形式が不正です。");
  return cards.slice(0, clampLimit(limit)).map(normalizeTcgdexCard).filter(Boolean);
}

export async function fetchTcgdexCard(id, { fetchImpl = fetch, signal } = {}) {
  const safeId = String(id ?? "").trim();
  if (!/^[a-z0-9-]+$/iu.test(safeId)) return null;

  const response = await fetchImpl(`${API_ROOT}/cards/${encodeURIComponent(safeId)}`, {
    headers: { Accept: "application/json" },
    signal
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`カード情報の取得に失敗しました (${response.status})`);
  return normalizeTcgdexCard(await response.json());
}

export function normalizeTcgdexCard(card) {
  if (!card || typeof card !== "object" || !card.id || !card.name) return null;

  const setCode = String(card.set?.id || String(card.id).split("-")[0] || "").trim();
  const officialCount = Number(card.set?.cardCount?.official);
  const localId = String(card.localId || String(card.id).split("-").at(-1) || "").trim();
  const localNumber = Number.isFinite(officialCount) && officialCount > 0
    ? `${localId}/${officialCount}`
    : localId;
  const market = marketFromPricing(card);

  return {
    id: `tcgdex:${card.id}`,
    tcgdexId: String(card.id),
    displayName: String(card.name),
    englishName: "",
    aliases: [String(card.id), setCode, localId].filter(Boolean),
    setName: String(card.set?.name || setCode),
    setCode,
    localNumber,
    language: "日本語",
    rarity: japaneseRarity(card.rarity),
    variant: {
      code: "standard",
      label: "通常",
      foil: "通常",
      mirrorPattern: "none"
    },
    image: {
      url: imageUrl(card.image),
      verification: card.image ? "exact" : "missing"
    },
    market,
    history: market ? [{ date: market.observedAt, raw: market.salePrice, psa10: null }] : []
  };
}

function marketFromPricing(card) {
  const tcgplayer = card.pricing?.tcgplayer;
  const tcgplayerPrice = preferredTcgplayerPrice(tcgplayer, card.variants);
  if (tcgplayerPrice !== null) {
    return marketValue({
      source: "TCGdex TCGplayer",
      currency: tcgplayer.unit,
      salePrice: tcgplayerPrice,
      updated: tcgplayer.updated,
      dataKind: "market-reference"
    });
  }

  const cardmarket = card.pricing?.cardmarket;
  const cardmarketPrice = preferredCardmarketPrice(cardmarket, card.variants);
  if (cardmarketPrice !== null) {
    return marketValue({
      source: "TCGdex Cardmarket",
      currency: cardmarket.unit,
      salePrice: cardmarketPrice,
      updated: cardmarket.updated,
      dataKind: "market-average"
    });
  }
  return null;
}

function preferredTcgplayerPrice(pricing, variants = {}) {
  if (!pricing || typeof pricing !== "object") return null;
  const candidates = [
    pricing.normal,
    variants.holo ? pricing.holofoil : null,
    variants.reverse ? pricing["reverse-holofoil"] || pricing.reverse : null
  ];
  for (const variant of candidates) {
    const value = positiveNumber(variant?.marketPrice) ?? positiveNumber(variant?.midPrice);
    if (value !== null) return value;
  }
  return null;
}

function preferredCardmarketPrice(pricing, variants = {}) {
  if (!pricing || typeof pricing !== "object") return null;
  const normal = positiveNumber(pricing.avg30)
    ?? positiveNumber(pricing.trend)
    ?? positiveNumber(pricing.avg);
  if (normal !== null) return normal;
  if (!variants.holo && !variants.reverse) return null;
  return positiveNumber(pricing["avg30-holo"])
    ?? positiveNumber(pricing["trend-holo"])
    ?? positiveNumber(pricing["avg-holo"]);
}

function marketValue({ source, currency, salePrice, updated, dataKind }) {
  const observedAt = isoDate(updated);
  const unit = String(currency || "").toUpperCase();
  if (!observedAt || !["USD", "EUR", "JPY"].includes(unit)) return null;
  return {
    source,
    currency: unit,
    salePrice,
    buyerShipping: 0,
    condition: "Ungraded",
    sampleCount: null,
    observedAt,
    dataKind
  };
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function isoDate(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/u);
  return match ? match[1] : "";
}

function tcgdexIdFromQuery(query) {
  const match = String(query ?? "").normalize("NFKC").trim().match(/^([a-z][a-z0-9]*)[\s#/_-]+(\d{1,4})$/iu);
  return match ? `${match[1]}-${match[2].padStart(3, "0")}` : "";
}

function japaneseRarity(value) {
  const rarity = String(value || "").trim();
  return RARITY_LABELS.get(rarity.toLocaleLowerCase("en-US")) || rarity || "レアリティ未登録";
}

function imageUrl(value) {
  const url = String(value || "").replace(/\/$/u, "");
  if (!url) return "";
  return /\.(?:avif|jpe?g|png|webp)$/iu.test(url) ? url : `${url}/high.webp`;
}

function clampLimit(value) {
  const limit = Number(value);
  return Number.isInteger(limit) ? Math.min(50, Math.max(1, limit)) : DEFAULT_LIMIT;
}
