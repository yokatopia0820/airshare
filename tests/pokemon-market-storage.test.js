const assert = require("node:assert/strict");
const test = require("node:test");

let STORAGE_KEYS;
let createStorage;

test.before(async () => {
  ({ STORAGE_KEYS, createStorage } = await import("../pokemon-market/storage.mjs"));
});

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test("settings use a version 1 envelope and round-trip", () => {
  const memoryStorage = createMemoryStorage();
  const store = createStorage(memoryStorage);
  const settings = { usdJpyRate: 160, feeRate: 0.15 };

  assert.deepEqual(store.saveSettings(settings), { ok: true });
  assert.deepEqual(JSON.parse(memoryStorage.getItem(STORAGE_KEYS.settings)), {
    version: 1,
    value: settings
  });
  assert.deepEqual(store.loadSettings(), {
    value: settings,
    recovered: false
  });
});

test("missing values load their region defaults", () => {
  const store = createStorage(createMemoryStorage());

  assert.deepEqual(store.loadSettings(), { value: {}, recovered: false });
  assert.deepEqual(store.loadCandidates(), { value: [], recovered: false });
  assert.deepEqual(store.loadSnapshot(), { value: null, recovered: false });
});

test("broken JSON recovers only the affected candidate region", () => {
  const memoryStorage = createMemoryStorage();
  const store = createStorage(memoryStorage);
  store.saveSettings({ usdJpyRate: 160 });
  memoryStorage.setItem(STORAGE_KEYS.candidates, "{broken");

  assert.deepEqual(store.loadCandidates(), { value: [], recovered: true });
  assert.deepEqual(store.loadSettings(), {
    value: { usdJpyRate: 160 },
    recovered: false
  });
});

test("unknown envelope versions and invalid region values recover safely", () => {
  const memoryStorage = createMemoryStorage();
  const store = createStorage(memoryStorage);
  memoryStorage.setItem(STORAGE_KEYS.snapshot, JSON.stringify({
    version: 2,
    value: { schemaVersion: 1 }
  }));
  memoryStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
    version: 1,
    value: null
  }));

  assert.deepEqual(store.loadSnapshot(), { value: null, recovered: true });
  assert.deepEqual(store.loadSettings(), { value: {}, recovered: true });
});

test("out-of-range stored settings recover to defaults", () => {
  const invalidSettings = [
    { usdJpyRate: 0 },
    { feeRate: 1.01 },
    { fxBufferRate: 1.01 },
    { maxAgeDays: 1.5 },
    { minimumSampleCount: 1.5 },
    { minimumSampleCount: 0 }
  ];

  for (const settings of invalidSettings) {
    const memoryStorage = createMemoryStorage();
    memoryStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({
      version: 1,
      value: settings
    }));

    assert.deepEqual(createStorage(memoryStorage).loadSettings(), {
      value: {},
      recovered: true
    });
  }
});

test("candidates can be saved, upserted by card ID, and removed", () => {
  const store = createStorage(createMemoryStorage());
  const first = candidate({ cardId: "card-1", note: "first" });
  const second = candidate({ cardId: "card-2", note: "second" });

  assert.deepEqual(store.saveCandidates([first]), { ok: true });
  assert.deepEqual(store.upsertCandidate(second), { ok: true });
  const updatedFirst = { ...first, note: "updated" };
  assert.deepEqual(store.upsertCandidate(updatedFirst), { ok: true });
  assert.deepEqual(store.loadCandidates(), {
    value: [updatedFirst, second],
    recovered: false
  });

  assert.deepEqual(store.removeCandidate("card-1"), { ok: true });
  assert.deepEqual(store.loadCandidates(), {
    value: [second],
    recovered: false
  });
});

test("candidate persistence rejects missing decision evidence and duplicate IDs", () => {
  const store = createStorage(createMemoryStorage());
  const valid = candidate({ cardId: "card-1" });

  assert.equal(store.saveCandidates([{ cardId: "card-1" }]).ok, false);
  assert.equal(store.saveCandidates([valid, { ...valid }]).ok, false);
  assert.equal(store.upsertCandidate({ cardId: "card-2" }).ok, false);
});

test("snapshot data round-trips independently", () => {
  const store = createStorage(createMemoryStorage());
  const snapshot = {
    schemaVersion: 1,
    generatedAt: "2026-06-27T09:00:00+09:00",
    cards: [{ id: "card-1" }]
  };

  assert.deepEqual(store.saveSnapshot(snapshot), { ok: true });
  assert.deepEqual(store.loadSnapshot(), {
    value: snapshot,
    recovered: false
  });
});

test("quota errors return a Japanese message without escaping", () => {
  const quotaStorage = createMemoryStorage();
  quotaStorage.setItem = () => {
    const error = new Error("Quota exceeded");
    error.name = "QuotaExceededError";
    throw error;
  };
  const store = createStorage(quotaStorage);

  const result = store.saveSettings({ usdJpyRate: 160 });

  assert.equal(result.ok, false);
  assert.match(result.message, /保存容量/);
});

test("default storage access recovers when the browser blocks localStorage", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    }
  });

  try {
    assert.deepEqual(createStorage().loadSettings(), {
      value: {},
      recovered: true
    });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

function candidate(overrides = {}) {
  return {
    cardId: "card-1",
    market: {
      salePrice: 12.5,
      buyerShipping: 2,
      observedAt: "2026-06-27",
      dataKind: "sold-comparable"
    },
    purchasePriceJpy: 500,
    calculation: {
      profitJpy: 102.4,
      roiRate: 0.2048
    },
    status: "review",
    savedAt: "2026-06-27T09:00:00.000Z",
    note: "",
    ...overrides
  };
}
