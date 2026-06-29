const PREMIUM_RARITIES = new Set([
  "SR", "SAR", "UR", "HR", "SSR", "CSR", "MUR", "MA", "BWR"
]);

const ART_RARITIES = new Set(["AR", "CHR", "イラストレーションレア"]);
const RARE_RARITIES = new Set(["R", "RR", "レア", "ホロレア", "ダブルレア"]);
const COMMON_RARITIES = new Set(["C", "U", "UC", "コモン", "アンコモン"]);

export const RARITY_FILTERS = [
  { key: "all", label: "すべて", accessibleLabel: "すべてのレアリティ" },
  { key: "common", label: "C/U", accessibleLabel: "コモン、アンコモン" },
  { key: "rare", label: "R/RR", accessibleLabel: "レア、ダブルレア" },
  { key: "art", label: "AR", accessibleLabel: "アートレア" },
  { key: "premium", label: "SR以上", accessibleLabel: "スーパーレア以上" },
  { key: "other", label: "その他", accessibleLabel: "その他、レアリティ未登録" }
];

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\u3041-\u3096]/gu, character => (
      String.fromCodePoint(character.codePointAt(0) + 0x60)
    ))
    .toLocaleUpperCase("ja-JP");
}

export function searchSupplementCards(query, rows) {
  const needle = normalizeSearchText(query);
  if (!needle || !Array.isArray(rows)) return [];
  return rows
    .filter(row => supplementSearchText(row).includes(needle))
    .map(normalizeSupplementCard)
    .filter(Boolean);
}

export function normalizeSupplementCard(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const supplementId = String(row.id || "").trim();
  const displayName = String(row.displayName || "").trim();
  if (!supplementId || !displayName) return null;

  const setCode = String(row.setCode || "").trim();
  const imageUrl = safeHttpsUrl(row.imageUrl);
  return {
    id: `supplement:${supplementId}`,
    displayName,
    englishName: String(row.englishName || "").trim(),
    aliases: [...new Set([
      ...(Array.isArray(row.aliases) ? row.aliases : []),
      supplementId,
      setCode,
      row.localNumber
    ].map(value => String(value || "").trim()).filter(Boolean))],
    setName: String(row.setName || setCode || "日本語版").trim(),
    setCode,
    localNumber: String(row.localNumber || "").trim(),
    language: String(row.language || "日本語").trim(),
    rarity: japaneseRarity(row.rarity),
    variant: {
      code: "standard",
      label: "通常",
      foil: "通常",
      mirrorPattern: "none"
    },
    image: {
      url: imageUrl,
      verification: imageUrl ? "exact" : "missing"
    },
    sourceUrl: safeHttpsUrl(row.sourceUrl),
    market: null,
    history: []
  };
}

export function rarityBucket(value) {
  const rarity = String(value || "").normalize("NFKC").trim();
  const upper = rarity.toLocaleUpperCase("ja-JP");
  if (COMMON_RARITIES.has(upper) || COMMON_RARITIES.has(rarity)) return "common";
  if (RARE_RARITIES.has(upper) || RARE_RARITIES.has(rarity)) return "rare";
  if (ART_RARITIES.has(upper) || ART_RARITIES.has(rarity)) return "art";
  if (PREMIUM_RARITIES.has(upper)) return "premium";
  return "other";
}

export function filterGroupsByRarity(groups, filterKey) {
  const source = Array.isArray(groups) ? groups : [];
  if (!filterKey || filterKey === "all") return [...source];
  return source.filter(group => rarityBucket(group?.primary?.rarity) === filterKey);
}

export function availableRarityFilters(groups) {
  const source = Array.isArray(groups) ? groups : [];
  return source.length > 0 ? [...RARITY_FILTERS] : RARITY_FILTERS.slice(0, 1);
}

export function paginateGroups(groups, requestedLimit) {
  const source = Array.isArray(groups) ? groups : [];
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? requestedLimit
    : source.length;
  const visible = source.slice(0, limit);
  return {
    groups: visible,
    shownCount: visible.length,
    totalCount: source.length,
    hasMore: visible.length < source.length
  };
}

function supplementSearchText(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "";
  return normalizeSearchText([
    row.displayName,
    row.englishName,
    row.id,
    row.setName,
    row.setCode,
    row.localNumber,
    ...(Array.isArray(row.aliases) ? row.aliases : [])
  ].join(" "));
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function japaneseRarity(value) {
  const rarity = String(value || "").trim().toLocaleUpperCase("ja-JP");
  const labels = {
    C: "コモン",
    U: "アンコモン",
    UC: "アンコモン",
    R: "レア",
    RR: "ダブルレア"
  };
  return labels[rarity] || rarity || "レアリティ未登録";
}
