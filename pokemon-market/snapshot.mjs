export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_SNAPSHOT_CARDS = 5000;
const MAX_ALIASES = 50;
const MAX_HISTORY_POINTS = 500;
const MAX_STRING_LENGTH = 500;
const CREDENTIAL_KEY_PATTERN = /(?:api.?key|access.?token|auth(?:orization)?|cookie|password|secret)/i;

const DATA_KINDS = new Set([
  "sold-comparable",
  "active-listing",
  "manual-reference"
]);

export function parseSnapshotText(text, options = {}) {
  if (typeof text !== "string") {
    return invalidResult("JSON入力は文字列である必要があります。");
  }

  const maxBytes = limitFrom(options.maxBytes, MAX_SNAPSHOT_BYTES);
  const byteLength = utf8ByteLength(text);
  if (byteLength > maxBytes) {
    return invalidResult(sizeError(maxBytes));
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return invalidResult("JSONを解析できません。");
  }

  return validateSnapshotValue(value, options, byteLength);
}

export function validateSnapshot(value, options = {}) {
  if (!isRecord(value)) {
    return invalidResult("スナップショットはオブジェクトである必要があります。");
  }

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return invalidResult("スナップショットをJSONとして検証できません。");
  }

  if (typeof serialized !== "string") {
    return invalidResult("スナップショットをJSONとして検証できません。");
  }

  return validateSnapshotValue(value, options, utf8ByteLength(serialized));
}

function validateSnapshotValue(value, options, byteLength) {
  if (!isRecord(value)) {
    return invalidResult("スナップショットはオブジェクトである必要があります。");
  }

  const errors = [];
  const maxBytes = limitFrom(options.maxBytes, MAX_SNAPSHOT_BYTES);
  const maxCards = limitFrom(options.maxCards, MAX_SNAPSHOT_CARDS);

  if (byteLength > maxBytes) {
    errors.push(sizeError(maxBytes));
  }
  if (containsCredentialKey(value)) {
    errors.push("秘密情報または資格情報に見えるフィールドは含められません。");
  }

  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== 1) {
    errors.push("schemaVersionは1である必要があります。");
  }

  const generatedAt = normalizeDateTime(value.generatedAt, "generatedAt", errors);
  const usdJpyRate = normalizeNumber(value.usdJpyRate, "usdJpyRate", errors, {
    exclusiveMin: 0
  });
  const defaults = normalizeDefaults(value.defaults, errors);
  const cards = normalizeCards(value.cards, errors, maxCards);
  const generatedDate = generatedAt ? generatedAt.slice(0, 10) : "";
  if (generatedDate) {
    cards.forEach((card, index) => {
      if (card.market.observedAt && card.market.observedAt > generatedDate) {
        errors.push(`cards[${index}].market.observedAtはgeneratedAt以前である必要があります。`);
      }
    });
  }
  const snapshot = {
    schemaVersion,
    generatedAt,
    usdJpyRate,
    defaults,
    cards
  };

  return errors.length === 0
    ? { ok: true, errors: [], snapshot }
    : { ok: false, errors, snapshot: null };
}

function normalizeDefaults(value, errors) {
  const path = "defaults";
  if (!isRecord(value)) {
    errors.push(`${path}はオブジェクトである必要があります。`);
    return emptyDefaults();
  }

  return {
    feeRate: normalizeNumber(value.feeRate, `${path}.feeRate`, errors, { min: 0, max: 1 }),
    internationalShippingJpy: normalizeNumber(
      value.internationalShippingJpy,
      `${path}.internationalShippingJpy`,
      errors,
      { min: 0 }
    ),
    packingCostJpy: normalizeNumber(value.packingCostJpy, `${path}.packingCostJpy`, errors, { min: 0 }),
    fxBufferRate: normalizeNumber(value.fxBufferRate, `${path}.fxBufferRate`, errors, { min: 0, max: 1 }),
    targetProfitJpy: normalizeNumber(value.targetProfitJpy, `${path}.targetProfitJpy`, errors, { min: 0 }),
    targetRoiRate: normalizeNumber(value.targetRoiRate, `${path}.targetRoiRate`, errors, { min: 0 }),
    maxAgeDays: normalizeNumber(value.maxAgeDays, `${path}.maxAgeDays`, errors, { min: 0, integer: true }),
    minimumSampleCount: normalizeNumber(
      value.minimumSampleCount,
      `${path}.minimumSampleCount`,
      errors,
      { min: 1, integer: true }
    )
  };
}

function emptyDefaults() {
  return {
    feeRate: 0,
    internationalShippingJpy: 0,
    packingCostJpy: 0,
    fxBufferRate: 0,
    targetProfitJpy: 0,
    targetRoiRate: 0,
    maxAgeDays: 0,
    minimumSampleCount: 0
  };
}

function normalizeCards(value, errors, maxCards) {
  if (!Array.isArray(value)) {
    errors.push("cardsは配列である必要があります。");
    return [];
  }

  if (value.length > maxCards) {
    errors.push(`cardsは${maxCards}件以下である必要があります。`);
  }

  const seenIds = new Set();
  return value.slice(0, maxCards).map((card, index) => {
    const normalized = normalizeCard(card, index, errors);
    if (normalized.id) {
      if (seenIds.has(normalized.id)) {
        errors.push(`cards[${index}].idがduplicateです。`);
      }
      seenIds.add(normalized.id);
    }
    return normalized;
  });
}

function normalizeCard(value, index, errors) {
  const path = `cards[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path}はオブジェクトである必要があります。`);
    return emptyCard();
  }

  return {
    id: normalizeString(value.id, `${path}.id`, errors),
    displayName: normalizeString(value.displayName, `${path}.displayName`, errors),
    englishName: normalizeString(value.englishName, `${path}.englishName`, errors),
    aliases: normalizeStringArray(value.aliases, `${path}.aliases`, errors),
    setName: normalizeString(value.setName, `${path}.setName`, errors),
    setCode: normalizeString(value.setCode, `${path}.setCode`, errors),
    localNumber: normalizeString(value.localNumber, `${path}.localNumber`, errors),
    language: normalizeString(value.language, `${path}.language`, errors),
    rarity: normalizeString(value.rarity, `${path}.rarity`, errors),
    variant: normalizeVariant(value.variant, `${path}.variant`, errors),
    image: normalizeImage(value.image, `${path}.image`, errors),
    market: normalizeMarket(value.market, `${path}.market`, errors),
    history: normalizeHistory(value.history, `${path}.history`, errors)
  };
}

function emptyCard() {
  return {
    id: "",
    displayName: "",
    englishName: "",
    aliases: [],
    setName: "",
    setCode: "",
    localNumber: "",
    language: "",
    rarity: "",
    variant: emptyVariant(),
    image: { url: "", verification: "", note: "" },
    market: emptyMarket(),
    history: []
  };
}

function normalizeVariant(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(`${path}はオブジェクトである必要があります。`);
    return emptyVariant();
  }

  return {
    code: normalizeString(value.code, `${path}.code`, errors),
    label: normalizeString(value.label, `${path}.label`, errors),
    foil: normalizeString(value.foil, `${path}.foil`, errors),
    mirrorPattern: normalizeString(value.mirrorPattern, `${path}.mirrorPattern`, errors)
  };
}

function emptyVariant() {
  return { code: "", label: "", foil: "", mirrorPattern: "" };
}

function normalizeImage(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(`${path}はオブジェクトである必要があります。`);
    return { url: "", verification: "", note: "" };
  }

  return {
    url: normalizeHttpUrl(value.url, `${path}.url`, errors),
    verification: normalizeString(value.verification, `${path}.verification`, errors),
    note: normalizeString(value.note, `${path}.note`, errors)
  };
}

function normalizeMarket(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(`${path}はオブジェクトである必要があります。`);
    return emptyMarket();
  }

  const dataKind = normalizeString(value.dataKind, `${path}.dataKind`, errors);
  if (dataKind && !DATA_KINDS.has(dataKind)) {
    errors.push(`${path}.dataKindが許可されていません。`);
  }

  const currency = normalizeString(value.currency, `${path}.currency`, errors).toUpperCase();
  if (currency && currency !== "USD") {
    errors.push(`${path}.currencyはUSDである必要があります。`);
  }

  return {
    source: normalizeString(value.source, `${path}.source`, errors),
    sourceUrl: normalizeHttpUrl(value.sourceUrl, `${path}.sourceUrl`, errors),
    currency,
    salePrice: normalizeNumber(value.salePrice, `${path}.salePrice`, errors, { min: 0 }),
    buyerShipping: normalizeNumber(value.buyerShipping, `${path}.buyerShipping`, errors, { min: 0 }),
    condition: normalizeString(value.condition, `${path}.condition`, errors),
    sampleCount: normalizeNumber(value.sampleCount, `${path}.sampleCount`, errors, { min: 0, integer: true }),
    observedAt: normalizeDate(value.observedAt, `${path}.observedAt`, errors),
    dataKind
  };
}

function emptyMarket() {
  return {
    source: "",
    sourceUrl: "",
    currency: "",
    salePrice: 0,
    buyerShipping: 0,
    condition: "",
    sampleCount: 0,
    observedAt: "",
    dataKind: ""
  };
}

function normalizeHistory(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path}は配列である必要があります。`);
    return [];
  }

  if (value.length > MAX_HISTORY_POINTS) {
    errors.push(`${path}は${MAX_HISTORY_POINTS}件以下である必要があります。`);
  }

  return value
    .slice(0, MAX_HISTORY_POINTS)
    .map((point, index) => normalizeHistoryPoint(point, `${path}[${index}]`, errors));
}

function normalizeHistoryPoint(value, path, errors) {
  if (!isRecord(value)) {
    errors.push(`${path}はオブジェクトである必要があります。`);
    return { date: "", raw: null, psa10: null };
  }

  return {
    date: normalizeDate(value.date, `${path}.date`, errors),
    raw: normalizeNullableNumber(value.raw, `${path}.raw`, errors),
    psa10: normalizeNullableNumber(value.psa10, `${path}.psa10`, errors)
  };
}

function normalizeString(value, path, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path}は空でない文字列である必要があります。`);
    return "";
  }
  const normalized = value.trim();
  if (normalized.length > MAX_STRING_LENGTH) {
    errors.push(`${path}は${MAX_STRING_LENGTH}文字以下である必要があります。`);
  }
  return normalized.slice(0, MAX_STRING_LENGTH);
}

function normalizeStringArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path}は文字列配列である必要があります。`);
    return [];
  }

  if (value.length > MAX_ALIASES) {
    errors.push(`${path}は${MAX_ALIASES}件以下である必要があります。`);
  }

  return value
    .slice(0, MAX_ALIASES)
    .map((item, index) => normalizeString(item, `${path}[${index}]`, errors));
}

function normalizeNumber(value, path, errors, rules = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${path}は有限数である必要があります。`);
    return 0;
  }
  if (rules.integer && !Number.isInteger(value)) {
    errors.push(`${path}は整数である必要があります。`);
  }
  if (rules.min !== undefined && value < rules.min) {
    errors.push(`${path}は${rules.min}以上である必要があります。`);
  }
  if (rules.exclusiveMin !== undefined && value <= rules.exclusiveMin) {
    errors.push(`${path}は${rules.exclusiveMin}より大きい必要があります。`);
  }
  if (rules.max !== undefined && value > rules.max) {
    errors.push(`${path}は${rules.max}以下である必要があります。`);
  }
  return value;
}

function normalizeNullableNumber(value, path, errors) {
  if (value === null) {
    return null;
  }
  return normalizeNumber(value, path, errors, { min: 0 });
}

function normalizeHttpUrl(value, path, errors) {
  const text = normalizeString(value, path, errors);
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsafe protocol");
    }
    if (url.username || url.password) {
      errors.push(`${path}に資格情報を含めることはできません。`);
      return "";
    }
    return url.href;
  } catch {
    errors.push(`${path}はHTTP(S) URLである必要があります。`);
    return "";
  }
}

function normalizeDate(value, path, errors) {
  if (typeof value !== "string" || !isValidDate(value)) {
    errors.push(`${path}は有効なYYYY-MM-DD形式である必要があります。`);
    return "";
  }
  return value;
}

function normalizeDateTime(value, path, errors) {
  if (typeof value !== "string" || !isValidDateTime(value)) {
    errors.push(`${path}はタイムゾーン付きISO日時である必要があります。`);
    return "";
  }
  return value;
}

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidDateTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !isValidDate(match[1])) {
    return false;
  }

  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  const zone = match[5];
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      return false;
    }
  }

  return Number.isFinite(Date.parse(value));
}

function limitFrom(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function sizeError(maxBytes) {
  return maxBytes === MAX_SNAPSHOT_BYTES
    ? "JSON入力は5 MiB以下である必要があります。"
    : `JSON入力は${maxBytes}バイト以下である必要があります。`;
}

function invalidResult(error) {
  return { ok: false, errors: [error], snapshot: null };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsCredentialKey(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);

  for (const [key, nested] of Object.entries(value)) {
    if (CREDENTIAL_KEY_PATTERN.test(key)) return true;
    if (containsCredentialKey(nested, seen)) return true;
  }
  return false;
}
