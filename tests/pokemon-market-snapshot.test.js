const assert = require("node:assert/strict");
const test = require("node:test");

let parseSnapshotText;
let validateSnapshot;

test.before(async () => {
  ({ parseSnapshotText, validateSnapshot } = await import("../pokemon-market/snapshot.mjs"));
});

function createValidSnapshot() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-06-27T09:00:00+09:00",
    usdJpyRate: 160,
    defaults: {
      feeRate: 0.15,
      internationalShippingJpy: 1200,
      packingCostJpy: 100,
      fxBufferRate: 0.03,
      targetProfitJpy: 1000,
      targetRoiRate: 0.3,
      maxAgeDays: 14,
      minimumSampleCount: 3
    },
    cards: [
      {
        id: "ebay:jp-sv2a:gengar-094:master-ball",
        displayName: "ゲンガー",
        englishName: "Gengar",
        aliases: ["ゲンガー", "gengar", "SV2a", "094", "master ball"],
        setName: "ポケモンカード151",
        setCode: "SV2a",
        localNumber: "094/165",
        language: "Japanese",
        rarity: "Rare",
        variant: {
          code: "master_ball_mirror",
          label: "マスターボールミラー",
          foil: "Reverse Holo",
          mirrorPattern: "Master Ball"
        },
        image: {
          url: "https://assets.tcgdex.net/ja/SV/SV2a/094/high.webp",
          verification: "base-art-with-variant-overlay",
          note: "正規ミラー実写画像としては未検証"
        },
        market: {
          source: "eBay sold research",
          sourceUrl: "https://www.ebay.com/",
          currency: "USD",
          salePrice: 12.5,
          buyerShipping: 2,
          condition: "Ungraded / Near Mint",
          sampleCount: 5,
          observedAt: "2026-06-27",
          dataKind: "sold-comparable"
        },
        history: [
          { date: "2026-06-27", raw: 12.5, psa10: null }
        ]
      }
    ]
  };
}

test("valid snapshot is accepted and normalized to known fields", () => {
  const input = createValidSnapshot();
  input.unknownRoot = true;
  input.defaults.unknownSetting = 1;
  input.cards[0].unknownCardField = true;
  input.cards[0].variant.unknownVariantField = true;
  input.cards[0].image.unknownImageField = true;
  input.cards[0].market.unknownMarketField = true;
  input.cards[0].history[0].unknownHistoryField = true;

  const result = validateSnapshot(input);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.snapshot.cards.length, 1);
  assert.deepEqual(Object.keys(result.snapshot), [
    "schemaVersion", "generatedAt", "usdJpyRate", "defaults", "cards"
  ]);
  assert.deepEqual(Object.keys(result.snapshot.defaults), [
    "feeRate", "internationalShippingJpy", "packingCostJpy", "fxBufferRate",
    "targetProfitJpy", "targetRoiRate", "maxAgeDays", "minimumSampleCount"
  ]);
  assert.deepEqual(Object.keys(result.snapshot.cards[0]), [
    "id", "displayName", "englishName", "aliases", "setName", "setCode",
    "localNumber", "language", "rarity", "variant", "image", "market", "history"
  ]);
  assert.deepEqual(Object.keys(result.snapshot.cards[0].variant), [
    "code", "label", "foil", "mirrorPattern"
  ]);
  assert.deepEqual(Object.keys(result.snapshot.cards[0].image), [
    "url", "verification", "note"
  ]);
  assert.deepEqual(Object.keys(result.snapshot.cards[0].market), [
    "source", "sourceUrl", "currency", "salePrice", "buyerShipping",
    "condition", "sampleCount", "observedAt", "dataKind"
  ]);
  assert.deepEqual(Object.keys(result.snapshot.cards[0].history[0]), [
    "date", "raw", "psa10"
  ]);
  assert.equal("unknownRoot" in result.snapshot, false);
});

test("credential-shaped fields and credential-bearing URLs are rejected", () => {
  const secretField = createValidSnapshot();
  secretField.apiKey = "must-not-ship";
  const credentialUrl = createValidSnapshot();
  credentialUrl.cards[0].market.sourceUrl = "https://token@example.com/path";

  assert.match(validateSnapshot(secretField).errors.join("\n"), /秘密|資格情報/);
  assert.match(validateSnapshot(credentialUrl).errors.join("\n"), /資格情報|URL/);
});

test("schemaVersion must be exactly 1", () => {
  const snapshot = createValidSnapshot();
  snapshot.schemaVersion = 2;

  const result = validateSnapshot(snapshot);

  assert.equal(result.ok, false);
  assert.match(result.errors[0], /schemaVersion/);
});

test("card identity fields are required", () => {
  const missingId = createValidSnapshot();
  delete missingId.cards[0].id;
  const missingVariantCode = createValidSnapshot();
  delete missingVariantCode.cards[0].variant.code;

  assert.match(validateSnapshot(missingId).errors.join("\n"), /cards\[0\]\.id/);
  assert.match(validateSnapshot(missingVariantCode).errors.join("\n"), /variant\.code/);
});

test("duplicate card IDs are rejected", () => {
  const snapshot = createValidSnapshot();
  snapshot.cards.push(structuredClone(snapshot.cards[0]));

  const result = validateSnapshot(snapshot);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /duplicate.*id|id.*duplicate/i);
});

test("image and market URLs allow only HTTP or HTTPS", () => {
  const snapshot = createValidSnapshot();
  snapshot.cards[0].image.url = "data:text/html,unsafe";
  snapshot.cards[0].market.sourceUrl = "javascript:alert(1)";

  const result = validateSnapshot(snapshot);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /image\.url/);
  assert.match(result.errors.join("\n"), /market\.sourceUrl/);
});

test("settings must use finite values within their allowed ranges", () => {
  const cases = [
    ["usdJpyRate", Number.POSITIVE_INFINITY, /usdJpyRate/],
    ["feeRate", 1.01, /defaults\.feeRate/],
    ["internationalShippingJpy", -1, /defaults\.internationalShippingJpy/],
    ["packingCostJpy", Number.NaN, /defaults\.packingCostJpy/],
    ["fxBufferRate", -0.01, /defaults\.fxBufferRate/],
    ["targetProfitJpy", -1, /defaults\.targetProfitJpy/],
    ["targetRoiRate", -0.01, /defaults\.targetRoiRate/],
    ["maxAgeDays", 1.5, /defaults\.maxAgeDays/],
    ["minimumSampleCount", -1, /defaults\.minimumSampleCount/]
  ];

  for (const [field, value, expectedError] of cases) {
    const snapshot = createValidSnapshot();
    if (field === "usdJpyRate") {
      snapshot[field] = value;
    } else {
      snapshot.defaults[field] = value;
    }
    assert.match(validateSnapshot(snapshot).errors.join("\n"), expectedError, field);
  }
});

test("market numbers must be finite, non-negative, and integral where required", () => {
  const invalidSalePrice = createValidSnapshot();
  invalidSalePrice.cards[0].market.salePrice = Number.NaN;
  const invalidShipping = createValidSnapshot();
  invalidShipping.cards[0].market.buyerShipping = -1;
  const invalidSampleCount = createValidSnapshot();
  invalidSampleCount.cards[0].market.sampleCount = 1.5;

  assert.match(validateSnapshot(invalidSalePrice).errors.join("\n"), /market\.salePrice/);
  assert.match(validateSnapshot(invalidShipping).errors.join("\n"), /market\.buyerShipping/);
  assert.match(validateSnapshot(invalidSampleCount).errors.join("\n"), /market\.sampleCount/);
});

test("market currency must be USD for the yen conversion contract", () => {
  const snapshot = createValidSnapshot();
  snapshot.cards[0].market.currency = "JPY";

  assert.match(validateSnapshot(snapshot).errors.join("\n"), /currency.*USD/);
});

test("every required market field must be present", () => {
  const requiredFields = [
    "source", "sourceUrl", "currency", "salePrice", "buyerShipping",
    "condition", "sampleCount", "observedAt", "dataKind"
  ];

  for (const field of requiredFields) {
    const snapshot = createValidSnapshot();
    delete snapshot.cards[0].market[field];
    assert.match(validateSnapshot(snapshot).errors.join("\n"), new RegExp(`market\\.${field}`));
  }
});

test("dataKind must be one of the documented values", () => {
  const snapshot = createValidSnapshot();
  snapshot.cards[0].market.dataKind = "scraped-guess";

  const result = validateSnapshot(snapshot);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /dataKind/);
});

test("generated, observed, and history dates must be real ISO dates", () => {
  const invalidGeneratedAt = createValidSnapshot();
  invalidGeneratedAt.generatedAt = "2026-02-30T09:00:00+09:00";
  const invalidObservedAt = createValidSnapshot();
  invalidObservedAt.cards[0].market.observedAt = "2026-02-30";
  const invalidHistoryDate = createValidSnapshot();
  invalidHistoryDate.cards[0].history[0].date = "27/06/2026";

  assert.match(validateSnapshot(invalidGeneratedAt).errors.join("\n"), /generatedAt/);
  assert.match(validateSnapshot(invalidObservedAt).errors.join("\n"), /market\.observedAt/);
  assert.match(validateSnapshot(invalidHistoryDate).errors.join("\n"), /history\[0\]\.date/);
});

test("observed dates cannot be later than snapshot generation", () => {
  const snapshot = createValidSnapshot();
  snapshot.cards[0].market.observedAt = "2026-06-28";

  assert.match(validateSnapshot(snapshot).errors.join("\n"), /observedAt.*generatedAt/);
});

test("aliases, history, and strings use bounded per-card sizes", () => {
  const tooManyAliases = createValidSnapshot();
  tooManyAliases.cards[0].aliases = Array.from({ length: 51 }, (_, index) => `alias-${index}`);
  const tooMuchHistory = createValidSnapshot();
  tooMuchHistory.cards[0].history = Array.from({ length: 501 }, () => ({
    date: "2026-06-27",
    raw: 1,
    psa10: null
  }));
  const longName = createValidSnapshot();
  longName.cards[0].displayName = "x".repeat(501);

  assert.match(validateSnapshot(tooManyAliases).errors.join("\n"), /aliases.*50/);
  assert.match(validateSnapshot(tooMuchHistory).errors.join("\n"), /history.*500/);
  assert.match(validateSnapshot(longName).errors.join("\n"), /displayName.*500/);
});

test("card count cannot exceed 5000", () => {
  const snapshot = createValidSnapshot();
  const card = snapshot.cards[0];
  snapshot.cards = Array.from({ length: 5001 }, (_, index) => ({
    ...card,
    id: `card-${index}`
  }));

  const result = validateSnapshot(snapshot);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /5000/);
});

test("serialized input cannot exceed 5 MiB", () => {
  const snapshot = createValidSnapshot();
  snapshot.padding = "x".repeat(5 * 1024 * 1024);
  const text = JSON.stringify(snapshot);

  const result = parseSnapshotText(text);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /5 MiB/);
});

test("malformed JSON returns a validation result instead of throwing", () => {
  const result = parseSnapshotText("{broken");

  assert.equal(result.ok, false);
  assert.equal(result.snapshot, null);
  assert.match(result.errors.join("\n"), /JSON/);
});

test("valid JSON must contain an object at the root", () => {
  const result = parseSnapshotText("null");

  assert.equal(result.ok, false);
  assert.equal(result.snapshot, null);
  assert.match(result.errors.join("\n"), /オブジェクト/);
});
