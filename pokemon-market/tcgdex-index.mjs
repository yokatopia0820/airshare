import { normalizeSearchText } from "./search-tools.mjs";

export const TCGDEX_JA_CARDS_URL = "https://api.tcgdex.net/v2/ja/cards";
const TCGDEX_ASSET_PREFIX = "https://assets.tcgdex.net/";
const MAX_INDEX_BYTES = 5 * 1024 * 1024;

export function buildTcgdexIndexPayload(rows, {
  generatedAt = new Date().toISOString(),
  minimumCount = 1000
} = {}) {
  const payload = {
    schemaVersion: 1,
    generatedAt,
    source: TCGDEX_JA_CARDS_URL,
    license: "MIT",
    cards: (Array.isArray(rows) ? rows : []).map(compactTcgdexBrief).filter(Boolean)
  };
  const validation = validateTcgdexIndexPayload(payload, { minimumCount });
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  return payload;
}

export function validateTcgdexIndexPayload(payload, {
  minimumCount = 1000,
  maximumCount = 50000,
  maximumBytes = MAX_INDEX_BYTES
} = {}) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, errors: ["索引のルートが不正です"] };
  }
  if (payload.schemaVersion !== 1) errors.push("schemaVersionは1である必要があります");
  if (payload.source !== TCGDEX_JA_CARDS_URL) errors.push("データ元URLが不正です");
  if (payload.license !== "MIT") errors.push("ライセンス表記が不正です");
  if (!isIsoDate(payload.generatedAt)) errors.push("生成日時が不正です");

  const rows = Array.isArray(payload.cards) ? payload.cards : [];
  if (rows.length < minimumCount || rows.length > maximumCount) {
    errors.push(`カード件数は${minimumCount}件以上${maximumCount}件以下である必要があります`);
  }

  const ids = new Set();
  rows.forEach((row, index) => {
    if (!validCompactRow(row)) {
      errors.push(`カード${index + 1}件目の形式が不正です`);
      return;
    }
    if (ids.has(row[0])) errors.push(`カードID ${row[0]} が重複しています`);
    ids.add(row[0]);
    if (row[3] && !row[3].startsWith(TCGDEX_ASSET_PREFIX)) {
      errors.push(`カードID ${row[0]} の画像URLが不正です`);
    }
  });

  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > maximumBytes) {
    errors.push("索引JSONが5MiBを超えています");
  }
  return { ok: errors.length === 0, errors };
}

export function searchTcgdexIndex(query, rows) {
  const terms = String(query ?? "")
    .normalize("NFKC")
    .trim()
    .split(/\s+/u)
    .map(normalizeSearchText)
    .filter(Boolean);
  if (terms.length === 0 || !Array.isArray(rows)) return [];
  return rows.filter(row => {
    if (!validCompactRow(row)) return false;
    const text = normalizeSearchText(row.join(" "));
    return terms.every(term => text.includes(term));
  });
}

export function tcgdexIndexRowToCard(row) {
  if (!validCompactRow(row)) return null;
  const [tcgdexId, displayName, localNumber, rawImage] = row;
  const setCode = setCodeFromId(tcgdexId);
  const image = imageUrl(rawImage);
  return {
    id: `tcgdex:${tcgdexId}`,
    tcgdexId,
    tcgdexLanguage: "ja",
    displayName,
    englishName: "",
    aliases: [tcgdexId, setCode, localNumber].filter(Boolean),
    setName: setCode,
    setCode,
    localNumber,
    language: "日本語",
    rarity: "レアリティ未登録",
    variant: {
      code: "standard",
      label: "通常",
      foil: "通常",
      mirrorPattern: "none"
    },
    image: {
      url: image,
      verification: image ? "exact" : "missing"
    },
    market: null,
    history: []
  };
}

function compactTcgdexBrief(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const id = String(row.id || "").trim();
  const name = String(row.name || "").trim();
  const localId = String(row.localId || "").trim();
  const image = String(row.image || "").replace(/\/$/u, "").trim();
  if (!id || !name || !localId) return null;
  return [id, name, localId, image];
}

function validCompactRow(row) {
  return Array.isArray(row)
    && row.length === 4
    && row.every(value => typeof value === "string")
    && Boolean(row[0] && row[1] && row[2]);
}

function setCodeFromId(id) {
  const separator = id.lastIndexOf("-");
  return separator > 0 ? id.slice(0, separator) : id;
}

function imageUrl(value) {
  const url = String(value || "").replace(/\/$/u, "");
  if (!url) return "";
  return /\.(?:avif|jpe?g|png|webp)$/iu.test(url) ? url : `${url}/high.webp`;
}

function isIsoDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}T/u.test(text) && Number.isFinite(Date.parse(text));
}
