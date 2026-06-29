const assert = require("node:assert/strict");
const test = require("node:test");

let calculateSourcingDecision;
let marketPresentationForCard;
let normalizeSearchText;
let searchTextForCard;
let validatePurchasePrice;

test.before(async () => {
  ({
    calculateSourcingDecision,
    marketPresentationForCard,
    normalizeSearchText,
    searchTextForCard,
    validatePurchasePrice
  } = await import("../pokemon-market/core.mjs"));
});

const settings = {
  usdJpyRate: 160,
  eurJpyRate: 185,
  feeRate: 0.15,
  internationalShippingJpy: 1200,
  packingCostJpy: 100,
  fxBufferRate: 0.03,
  targetProfitJpy: 1000,
  targetRoiRate: 0.30,
  maxAgeDays: 14,
  minimumSampleCount: 3
};

const card = {
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
    verification: "exact"
  },
  market: {
    salePrice: 12.5,
    buyerShipping: 2,
    condition: "Ungraded / Near Mint",
    sampleCount: 5,
    observedAt: "2026-06-27",
    dataKind: "sold-comparable"
  }
};

function calculate(overrides = {}) {
  return calculateSourcingDecision({
    card,
    purchasePriceJpy: 500,
    settings,
    now: "2026-06-27",
    ...overrides
  });
}

test("search normalization folds width, case, spaces, and punctuation", () => {
  assert.equal(normalizeSearchText("０９４ マスター・ボール"), "094マスターボール");
  assert.equal(normalizeSearchText(" SV2A / Gengar "), "sv2agengar");
});

test("card search text includes names, set, number, and variant identifiers", () => {
  const searchText = searchTextForCard(card);

  assert.match(searchText, /gengar/);
  assert.match(searchText, /sv2a/);
  assert.match(searchText, /094165/);
  assert.match(searchText, /masterballmirror/);
});

test("purchase price validation rejects missing, negative, and non-finite values", () => {
  assert.deepEqual(validatePurchasePrice(""), {
    ok: false,
    message: "店頭価格を入力してください。"
  });
  assert.deepEqual(validatePurchasePrice("-1"), {
    ok: false,
    message: "0円以上で入力してください。"
  });
  assert.deepEqual(validatePurchasePrice("Infinity"), {
    ok: false,
    message: "有限の数値で入力してください。"
  });
  assert.deepEqual(validatePurchasePrice(Number.NaN), {
    ok: false,
    message: "有限の数値で入力してください。"
  });
});

test("purchase price validation accepts zero and finite positive values", () => {
  assert.deepEqual(validatePurchasePrice("0"), { ok: true, value: 0 });
  assert.deepEqual(validatePurchasePrice("500"), { ok: true, value: 500 });
});

test("sourcing calculation follows the exact fee and cost contract", () => {
  const result = calculate();

  assert.equal(result.ready, true);
  assert.equal(Math.round(result.grossSalesJpy), 2320);
  assert.equal(Math.round(result.marketplaceFeeJpy), 348);
  assert.equal(Math.round(result.fxBufferJpy), 70);
  assert.equal(Math.round(result.profitJpy), 102);
  assert.ok(Math.abs(result.roiRate - 102.4 / 500) < Number.EPSILON);
  assert.equal(result.status, "review");
  assert.equal(result.label, "確認");
  assert.ok(result.reasons.length >= 1);
});

test("EUR相場はEUR/JPYレートで利益計算する", () => {
  const result = calculate({
    card: {
      ...card,
      market: {
        ...card.market,
        currency: "EUR",
        salePrice: 10,
        buyerShipping: 0
      }
    },
    settings: {
      ...settings,
      feeRate: 0,
      internationalShippingJpy: 0,
      packingCostJpy: 0,
      fxBufferRate: 0
    }
  });

  assert.equal(result.grossSalesJpy, 1850);
  assert.equal(result.profitJpy, 1350);
  assert.equal(result.roiRate, 2.7);
});

test("decision is buy when profit and ROI targets are met without warnings", () => {
  const result = calculate({
    card: {
      ...card,
      market: { ...card.market, salePrice: 25 }
    }
  });

  assert.equal(result.status, "buy");
  assert.equal(result.label, "買い");
  assert.match(result.reasons.join(" "), /利益目標/);
});

test("decision is review when market data is stale", () => {
  const result = calculate({
    card: {
      ...card,
      market: { ...card.market, salePrice: 25, observedAt: "2026-06-12" }
    }
  });

  assert.equal(result.status, "review");
  assert.match(result.reasons.join(" "), /取得から14日超過/);
});

test("decision is review when sold sample count is too low", () => {
  const result = calculate({
    card: {
      ...card,
      market: { ...card.market, salePrice: 25, sampleCount: 2 }
    }
  });

  assert.equal(result.status, "review");
  assert.match(result.reasons.join(" "), /実売3件未満/);
});

test("decision is review for active listings", () => {
  const result = calculate({
    card: {
      ...card,
      market: { ...card.market, salePrice: 25, dataKind: "active-listing" }
    }
  });

  assert.equal(result.status, "review");
  assert.match(result.reasons.join(" "), /実売比較以外/);
});

test("decision is review when the image is not exactly verified", () => {
  const result = calculate({
    card: {
      ...card,
      image: { verification: "base-art-with-variant-overlay" },
      market: { ...card.market, salePrice: 25 }
    }
  });

  assert.equal(result.status, "review");
  assert.match(result.reasons.join(" "), /画像を要確認/);
});

test("decision is review when card condition needs confirmation", () => {
  const result = calculate({
    card: {
      ...card,
      market: { ...card.market, salePrice: 25, condition: "Played" }
    }
  });

  assert.equal(result.status, "review");
  assert.match(result.reasons.join(" "), /状態を要確認/);
});

test("decision is skip when profit is non-positive", () => {
  const result = calculate({
    card: {
      ...card,
      market: { ...card.market, salePrice: 8 }
    }
  });

  assert.equal(result.status, "skip");
  assert.equal(result.label, "見送り");
  assert.match(result.reasons.join(" "), /利益が0円以下/);
});

test("decision stays pending until a valid purchase price is entered", () => {
  const missing = calculate({ purchasePriceJpy: "" });
  const nonFinite = calculate({ purchasePriceJpy: "Infinity" });

  for (const result of [missing, nonFinite]) {
    assert.equal(result.ready, false);
    assert.equal(result.status, "pending");
    assert.equal(result.label, "店頭価格を入力");
    assert.equal(result.grossSalesJpy, null);
    assert.equal(result.profitJpy, null);
    assert.equal(result.roiRate, null);
    assert.ok(result.reasons.length >= 1);
  }
});

test("zero purchase price is valid and returns a null ROI", () => {
  const result = calculate({ purchasePriceJpy: 0 });

  assert.equal(result.ready, true);
  assert.equal(result.roiRate, null);
  assert.equal(result.status, "review");
  assert.match(result.reasons.join(" "), /ROIを算出できません/);
});

test("calculation rejects derived non-finite amounts", () => {
  const result = calculate({
    card: {
      ...card,
      market: { ...card.market, salePrice: Number.MAX_VALUE }
    }
  });

  assert.equal(result.ready, false);
  assert.equal(result.status, "pending");
  assert.equal(result.profitJpy, null);
  assert.match(result.reasons.join(" "), /価格データ/);
});

test("market snapshot presentation overrides stale fallback prices and sources", () => {
  const presentation = marketPresentationForCard({
    id: "card-1",
    market: {
      source: "eBay sold research",
      sourceUrl: "https://www.ebay.com/itm/123",
      currency: "USD",
      salePrice: 25,
      observedAt: "2026-06-27"
    }
  }, {
    priceSource: {
      name: "PriceCharting",
      productId: "old-product",
      url: "https://www.pricecharting.com/old"
    },
    current: {
      currency: "USD",
      raw: 580,
      psa10: 1075,
      observedAt: "2026-06-22"
    }
  });

  assert.equal(presentation.priceSource.name, "eBay sold research");
  assert.equal(presentation.priceSource.url, "https://www.ebay.com/itm/123");
  assert.equal(presentation.priceSource.productId, "card-1");
  assert.equal(presentation.current.raw, 25);
  assert.equal(presentation.current.psa10, 1075);
  assert.equal(presentation.current.observedAt, "2026-06-27");
});
