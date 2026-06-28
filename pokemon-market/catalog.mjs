import { normalizeSearchText, searchTextForCard } from "./core.mjs?v=11";

const DAY_MS = 24 * 60 * 60 * 1000;

export function groupCatalogCards(cards) {
  const groups = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card?.id || !card?.displayName) continue;
    const key = identityKey(card);
    const current = groups.get(key) || createGroup(key, card);
    current.cards.push(card);
    if (primaryScore(card) > primaryScore(current.primary)) current.primary = card;
    groups.set(key, current);
  }
  return [...groups.values()];
}

export function filterCatalogGroups(groups, query) {
  const terms = String(query ?? "")
    .normalize("NFKC")
    .trim()
    .split(/\s+/u)
    .map(normalizeSearchText)
    .filter(Boolean);
  if (terms.length === 0) return [...groups];

  return groups.filter(group => {
    const text = normalizeSearchText(group.cards.map(searchTextForCard).join(" "));
    return terms.every(term => text.includes(term));
  });
}

export function mergeCatalogGroups(localGroups, remoteCards) {
  const merged = new Map(localGroups.map(group => [group.key, group]));
  for (const group of groupCatalogCards(remoteCards)) {
    const existing = merged.get(group.key);
    if (existing) {
      const remotePrimary = group.primary;
      existing.primary = {
        ...existing.primary,
        setName: remotePrimary.setName && remotePrimary.setName !== remotePrimary.setCode
          ? remotePrimary.setName
          : existing.primary.setName || remotePrimary.setName,
        rarity: remotePrimary.rarity && !remotePrimary.rarity.includes("未登録")
          ? remotePrimary.rarity
          : existing.primary.rarity || remotePrimary.rarity,
        image: remotePrimary.image?.url ? remotePrimary.image : existing.primary.image,
        tcgdexId: remotePrimary.tcgdexId || existing.primary.tcgdexId
      };
    } else {
      merged.set(group.key, group);
    }
  }
  return [...merged.values()];
}

export function mergeCardCache(existingCards, incomingCards, limit = 200) {
  const cache = new Map((Array.isArray(existingCards) ? existingCards : []).map(card => [card.id, card]));
  for (const incoming of Array.isArray(incomingCards) ? incomingCards : []) {
    if (!incoming?.id || !incoming?.displayName) continue;
    const existing = cache.get(incoming.id);
    if (!existing) {
      cache.set(incoming.id, incoming);
      continue;
    }
    cache.set(incoming.id, {
      ...existing,
      ...incoming,
      setName: incoming.setName && incoming.setName !== incoming.setCode
        ? incoming.setName
        : existing.setName || incoming.setName,
      rarity: incoming.rarity && !incoming.rarity.includes("未登録")
        ? incoming.rarity
        : existing.rarity || incoming.rarity,
      market: incoming.market || existing.market || null,
      history: incoming.history?.length ? incoming.history : existing.history || []
    });
  }
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 200;
  return [...cache.values()].slice(-safeLimit);
}

export function variantQuotesForGroup(group) {
  const cards = Array.isArray(group?.cards) ? group.cards : [];
  const normalCard = cards.find(card => isPriced(card) && !isMirror(card)) || null;
  const mirrorCard = cards.find(card => isPriced(card) && isMirror(card)) || null;
  const psaCard = normalCard || cards.find(card => latestHistoryPrice(card, "psa10") !== null) || null;
  const psaPrice = latestHistoryPrice(psaCard, "psa10");

  return {
    normal: normalCard ? quoteFromCard("normal", "通常", normalCard) : null,
    mirror: mirrorCard ? quoteFromCard("mirror", "ミラー", mirrorCard) : null,
    psa10: psaCard && psaPrice !== null ? quoteFromPsaCard(psaCard, psaPrice) : null
  };
}

export function japaneseCondition(value) {
  const condition = String(value || "").toLocaleLowerCase("en-US");
  if (condition.includes("ungraded")) return "未鑑定";
  if (condition.includes("near mint")) return "美品相当";
  if (condition.includes("mixed")) return "状態混在";
  if (condition.includes("played")) return "使用感あり";
  if (condition.includes("graded")) return "鑑定済み";
  return "状態未登録";
}

export function japaneseLanguage(value) {
  const language = normalizeSearchText(value);
  if (["english", "英語", "en"].includes(language)) return "英語";
  if (["japanese", "日本語", "ja", "jp"].includes(language)) return "日本語";
  return String(value || "言語未登録");
}

export function marketActivityLabel(market = {}) {
  if (market.dataKind === "sold-comparable") {
    const count = Number(market.sampleCount);
    const displayCount = Number.isFinite(count) && count >= 0 ? Math.round(count).toLocaleString("ja-JP") : "0";
    return `直近1か月 ${displayCount}件売れています`;
  }
  if (market.dataKind === "market-average") return "直近30日平均の参考価格";
  return "市場参考価格";
}

export function shouldRefreshMarket(market, now = new Date().toISOString(), maxAgeDays = 2) {
  if (!market) return true;
  const observedAt = Date.parse(market.observedAt);
  const currentTime = Date.parse(now);
  if (!Number.isFinite(observedAt) || !Number.isFinite(currentTime)) return true;
  return currentTime - observedAt > maxAgeDays * DAY_MS;
}

function identityKey(card) {
  const setCode = normalizeSearchText(card.setCode || card.setName);
  const number = normalizeNumber(card.localNumber);
  const name = normalizeSearchText(card.displayName);
  const language = normalizeLanguage(card.language);
  return `${setCode}:${number}:${language}:${name}`;
}

function normalizeLanguage(value) {
  const language = normalizeSearchText(value);
  if (["japanese", "日本語", "ja", "jp"].includes(language)) return "ja";
  if (["english", "英語", "en"].includes(language)) return "en";
  return language || "unknown";
}

function normalizeNumber(value) {
  const first = String(value || "").normalize("NFKC").split("/")[0].replace(/\D+/gu, "");
  return first ? String(Number(first)) : normalizeSearchText(value);
}

function createGroup(key, card) {
  return { id: `group:${key}`, key, primary: card, cards: [] };
}

function primaryScore(card) {
  if (!card) return -1;
  return (card.market ? 4 : 0) + (!isMirror(card) ? 2 : 0) + (card.image?.url ? 1 : 0);
}

function isMirror(card) {
  const pattern = String(card?.variant?.mirrorPattern || "none").toLocaleLowerCase("en-US");
  return pattern !== "none" && pattern !== "通常";
}

function isPriced(card) {
  return Number.isFinite(card?.market?.salePrice) && Number.isFinite(card?.market?.buyerShipping);
}

function latestHistoryPrice(card, field) {
  const direct = field === "psa10" ? card?.current?.psa10 : null;
  if (Number.isFinite(direct)) return direct;
  const history = Array.isArray(card?.history) ? [...card.history].reverse() : [];
  const point = history.find(item => Number.isFinite(item?.[field]));
  return point ? point[field] : null;
}

function quoteFromCard(kind, label, card) {
  return { kind, label, card, market: { ...card.market } };
}

function quoteFromPsaCard(card, salePrice) {
  return {
    kind: "psa10",
    label: "PSA10",
    card,
    market: {
      ...card.market,
      salePrice,
      buyerShipping: 0,
      condition: "Graded PSA 10"
    }
  };
}
