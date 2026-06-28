const ENVELOPE_VERSION = 1;

const QUOTA_ERROR_NAMES = new Set([
  "QuotaExceededError",
  "NS_ERROR_DOM_QUOTA_REACHED"
]);

const UNIT_RATE_SETTINGS = new Set(["feeRate", "fxBufferRate"]);
const INTEGER_SETTINGS = new Set(["maxAgeDays", "minimumSampleCount"]);
const CANDIDATE_STATUSES = new Set(["buy", "review", "skip"]);

export const STORAGE_KEYS = Object.freeze({
  settings: "pokemon-market:settings:v1",
  candidates: "pokemon-market:candidates:v1",
  snapshot: "pokemon-market:snapshot:v1"
});

export function createStorage(storage) {
  const resolvedStorage = storage === undefined ? getDefaultStorage() : storage;
  const loadSettings = () => loadRegion(resolvedStorage, STORAGE_KEYS.settings, () => ({}), isSettings);
  const loadCandidates = () => loadRegion(resolvedStorage, STORAGE_KEYS.candidates, () => [], isCandidateList);
  const loadSnapshot = () => loadRegion(resolvedStorage, STORAGE_KEYS.snapshot, () => null, isSnapshot);

  const saveSettings = (value) => saveRegion(resolvedStorage, STORAGE_KEYS.settings, value, isSettings);
  const saveCandidates = (value) => saveRegion(resolvedStorage, STORAGE_KEYS.candidates, value, isCandidateList);
  const saveSnapshot = (value) => saveRegion(resolvedStorage, STORAGE_KEYS.snapshot, value, isSnapshot);

  function upsertCandidate(candidate) {
    if (!hasCardId(candidate)) {
      return invalidCandidateResult();
    }

    const candidates = loadCandidates().value;
    const existingIndex = candidates.findIndex(({ cardId }) => cardId === candidate.cardId);
    const nextCandidates = [...candidates];

    if (existingIndex === -1) {
      nextCandidates.push(candidate);
    } else {
      nextCandidates[existingIndex] = candidate;
    }

    return saveCandidates(nextCandidates);
  }

  function removeCandidate(cardId) {
    if (typeof cardId !== "string" || cardId.trim() === "") {
      return invalidCandidateResult();
    }

    const candidates = loadCandidates().value;
    return saveCandidates(candidates.filter((candidate) => candidate.cardId !== cardId));
  }

  return {
    loadSettings,
    saveSettings,
    loadCandidates,
    saveCandidates,
    upsertCandidate,
    removeCandidate,
    loadSnapshot,
    saveSnapshot
  };
}

function loadRegion(storage, key, createDefault, isValidValue) {
  if (!storage || typeof storage.getItem !== "function") {
    return recoveredValue(createDefault);
  }

  let rawValue;
  try {
    rawValue = storage.getItem(key);
  } catch {
    return recoveredValue(createDefault);
  }

  if (rawValue === null) {
    return { value: createDefault(), recovered: false };
  }

  try {
    const envelope = JSON.parse(rawValue);
    if (isEnvelope(envelope) && isValidValue(envelope.value)) {
      return { value: envelope.value, recovered: false };
    }
  } catch {
    // Broken data is reset below so later reads can start cleanly.
  }

  removeBrokenValue(storage, key);
  return recoveredValue(createDefault);
}

function saveRegion(storage, key, value, isValidValue) {
  if (!isValidValue(value)) {
    return {
      ok: false,
      message: "保存データの形式が正しくありません。"
    };
  }

  if (!storage || typeof storage.setItem !== "function") {
    return storageUnavailableResult();
  }

  try {
    storage.setItem(key, JSON.stringify({ version: ENVELOPE_VERSION, value }));
    return { ok: true };
  } catch (error) {
    if (isQuotaError(error)) {
      return {
        ok: false,
        message: "端末の保存容量が不足しています。保存候補やスナップショットを減らしてください。"
      };
    }

    return storageUnavailableResult();
  }
}

function isEnvelope(value) {
  return isRecord(value)
    && value.version === ENVELOPE_VERSION
    && Object.prototype.hasOwnProperty.call(value, "value");
}

function isSettings(value) {
  return isRecord(value)
    && Object.entries(value).every(([name, setting]) => isSettingInRange(name, setting));
}

function isSettingInRange(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    return false;
  }
  if (name === "usdJpyRate" && value <= 0) {
    return false;
  }
  if (UNIT_RATE_SETTINGS.has(name) && value > 1) {
    return false;
  }
  if (INTEGER_SETTINGS.has(name) && !Number.isInteger(value)) {
    return false;
  }
  if (name === "minimumSampleCount" && value < 1) {
    return false;
  }
  return true;
}

function isCandidateList(value) {
  if (!Array.isArray(value) || !value.every(isCandidate)) return false;
  return new Set(value.map(({ cardId }) => cardId)).size === value.length;
}

function isSnapshot(value) {
  return isRecord(value);
}

function hasCardId(value) {
  return isRecord(value)
    && typeof value.cardId === "string"
    && value.cardId.trim() !== "";
}

function isCandidate(value) {
  return hasCardId(value)
    && isRecord(value.market)
    && isNonNegativeFinite(value.market.salePrice)
    && isNonNegativeFinite(value.market.buyerShipping)
    && Number.isFinite(Date.parse(value.market.observedAt))
    && typeof value.market.dataKind === "string"
    && isNonNegativeFinite(value.purchasePriceJpy)
    && isRecord(value.calculation)
    && Number.isFinite(value.calculation.profitJpy)
    && (value.calculation.roiRate === null || Number.isFinite(value.calculation.roiRate))
    && CANDIDATE_STATUSES.has(value.status)
    && Number.isFinite(Date.parse(value.savedAt))
    && (value.note === undefined || typeof value.note === "string");
}

function isNonNegativeFinite(value) {
  return Number.isFinite(value) && value >= 0;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isQuotaError(error) {
  return QUOTA_ERROR_NAMES.has(error?.name) || error?.code === 22 || error?.code === 1014;
}

function removeBrokenValue(storage, key) {
  try {
    storage.removeItem?.(key);
  } catch {
    // Recovery must not fail because storage cleanup is unavailable.
  }
}

function recoveredValue(createDefault) {
  return { value: createDefault(), recovered: true };
}

function invalidCandidateResult() {
  return {
    ok: false,
    message: "候補を保存できません。カードIDを確認してください。"
  };
}

function storageUnavailableResult() {
  return {
    ok: false,
    message: "端末内へ保存できませんでした。ブラウザの保存設定を確認してください。"
  };
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
