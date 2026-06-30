const CACHE_SCHEMA_VERSION = 2;
const DEFAULT_MAX_AGE_DAYS = 30;
const DEFAULT_LIMIT = 500;

function safeParse(payload) {
  if (typeof payload !== "string" || !payload.trim()) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function readCardCacheEnvelope(payload, options = {}) {
  const parsed = safeParse(payload);
  const now = Number(options.now) || Date.now();
  const maxAgeDays = Number(options.maxAgeDays) || DEFAULT_MAX_AGE_DAYS;
  const minimumUpdatedAt = now - (maxAgeDays * 24 * 60 * 60 * 1000);

  if (Array.isArray(parsed)) {
    return {
      cards: parsed.filter((card) => card && typeof card.id === "string"),
      failures: {},
      migrated: true
    };
  }

  if (!parsed || parsed.schemaVersion !== CACHE_SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
    return { cards: [], failures: {}, migrated: false };
  }

  const cards = parsed.entries
    .filter((entry) => {
      const updatedAt = Number(entry?.updatedAt);
      return entry?.card?.id && Number.isFinite(updatedAt) && updatedAt >= minimumUpdatedAt;
    })
    .map((entry) => entry.card);

  return {
    cards,
    failures: parsed.failures && typeof parsed.failures === "object" ? parsed.failures : {},
    migrated: false
  };
}

export function createCardCacheEnvelope(cards = [], options = {}) {
  const now = Number(options.now) || Date.now();
  const limit = Math.max(1, Number(options.limit) || DEFAULT_LIMIT);
  const unique = new Map();
  cards.forEach((card) => {
    if (card?.id) unique.set(card.id, card);
  });

  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    savedAt: now,
    entries: [...unique.values()].slice(-limit).map((card) => ({ updatedAt: now, card })),
    failures: options.failures && typeof options.failures === "object" ? options.failures : {}
  };
}

export function shouldRetryFailure(failures = {}, cardId, options = {}) {
  const failure = failures?.[cardId];
  if (!failure) return true;
  const now = Number(options.now) || Date.now();
  const ttlHours = Number(options.ttlHours) || 6;
  const failedAt = Number(failure.failedAt);
  return !Number.isFinite(failedAt) || now - failedAt >= ttlHours * 60 * 60 * 1000;
}

export function recordCacheFailure(failures = {}, cardId, reason, now = Date.now()) {
  return {
    ...failures,
    [cardId]: { reason: String(reason || "unknown"), failedAt: Number(now) }
  };
}

export function clearCacheFailure(failures = {}, cardId) {
  const next = { ...failures };
  delete next[cardId];
  return next;
}

export function tcgdexImageCandidates(card = {}) {
  const source = String(card?.image?.url || "").trim();
  if (!source) return [];

  let url;
  try {
    url = new URL(source);
  } catch {
    return [];
  }
  if (url.protocol !== "https:" || url.hostname !== "assets.tcgdex.net") return [];

  const high = url.toString().replace(/\/low\.webp(?:$|\?)/u, "/high.webp");
  const low = high.replace(/\/high\.webp(?:$|\?)/u, "/low.webp");
  return [...new Set([high, low])];
}
