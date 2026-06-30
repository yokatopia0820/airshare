const test = require("node:test");
const assert = require("node:assert/strict");

let cache;

test.before(async () => {
  cache = await import("../pokemon-market/card-cache.mjs");
});

test("migrates the legacy card array into a cache view", () => {
  const result = cache.readCardCacheEnvelope(JSON.stringify([
    { id: "SV2a-094", displayName: "ゲンガー" }
  ]), { now: Date.parse("2026-06-30T00:00:00.000Z") });

  assert.equal(result.migrated, true);
  assert.equal(result.cards.length, 1);
  assert.deepEqual(result.failures, {});
});

test("creates a bounded versioned envelope and reads fresh entries", () => {
  const now = Date.parse("2026-06-30T00:00:00.000Z");
  const payload = cache.createCardCacheEnvelope([
    { id: "old", displayName: "old" },
    { id: "new", displayName: "new" }
  ], { now, limit: 1, failures: { old: { reason: "network", failedAt: now } } });
  const result = cache.readCardCacheEnvelope(JSON.stringify(payload), { now });

  assert.equal(payload.schemaVersion, 2);
  assert.deepEqual(result.cards.map((card) => card.id), ["new"]);
  assert.equal(result.failures.old.reason, "network");
});

test("negative cache retries only after its TTL", () => {
  const failedAt = Date.parse("2026-06-30T00:00:00.000Z");
  const failures = { "SV2a-094": { reason: "not-found", failedAt } };

  assert.equal(cache.shouldRetryFailure(failures, "SV2a-094", {
    now: failedAt + (5 * 60 * 60 * 1000),
    ttlHours: 6
  }), false);
  assert.equal(cache.shouldRetryFailure(failures, "SV2a-094", {
    now: failedAt + (7 * 60 * 60 * 1000),
    ttlHours: 6
  }), true);
  assert.equal(cache.shouldRetryFailure(failures, "unknown", { now: failedAt }), true);
});

test("returns TCGdex high and low image candidates without foreign-card substitution", () => {
  assert.deepEqual(cache.tcgdexImageCandidates({
    image: { url: "https://assets.tcgdex.net/ja/SV/SV2a/094/high.webp" }
  }), [
    "https://assets.tcgdex.net/ja/SV/SV2a/094/high.webp",
    "https://assets.tcgdex.net/ja/SV/SV2a/094/low.webp"
  ]);
  assert.deepEqual(cache.tcgdexImageCandidates({
    image: { url: "https://images.example.com/card.jpg" }
  }), []);
  assert.deepEqual(cache.tcgdexImageCandidates({}), []);
});
