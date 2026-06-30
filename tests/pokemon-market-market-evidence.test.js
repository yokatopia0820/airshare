const test = require("node:test");
const assert = require("node:assert/strict");

let evidence;

test.before(async () => {
  evidence = await import("../pokemon-market/market-evidence.mjs");
});

test("separates sold, domestic, and reference evidence without inventing prices", () => {
  const result = evidence.buildMarketEvidence({
    cards: [{
      market: {
        channel: "reference",
        source: "TCGdex TCGplayer",
        dataKind: "market-reference",
        salePrice: 12.5,
        buyerShipping: 0,
        currency: "USD",
        observedAt: "2026-06-30T00:00:00.000Z"
      },
      history: [
        { date: "2026-06-01", raw: 10 },
        { date: "2026-06-30", raw: 12.5 }
      ],
      markets: [{
        channel: "ebay",
        source: "eBay Product Research",
        dataKind: "sold-comparable",
        salePrice: 18,
        buyerShipping: 2,
        currency: "USD",
        observedAt: "2026-06-29T00:00:00.000Z"
      }, {
        channel: "domestic",
        source: "Authorized domestic feed",
        dataKind: "sold-comparable",
        salePrice: 2100,
        buyerShipping: 0,
        currency: "JPY",
        observedAt: "2026-06-28T00:00:00.000Z"
      }]
    }]
  });

  assert.equal(result.lanes.ebay.status, "available");
  assert.equal(result.lanes.ebay.market.salePrice, 18);
  assert.equal(result.lanes.domestic.status, "available");
  assert.equal(result.lanes.domestic.market.salePrice, 2100);
  assert.equal(result.lanes.reference.status, "available");
  assert.equal(result.lanes.reference.market.salePrice, 12.5);
  assert.equal(result.trend.status, "available");
  assert.equal(result.trend.changeRate, 0.25);
  assert.equal(result.updatedAt, "2026-06-30T00:00:00.000Z");
  assert.deepEqual(result.sources, [
    "eBay Product Research",
    "Authorized domestic feed",
    "TCGplayer"
  ]);
});

test("returns actionable reason states when price channels have no value", () => {
  const result = evidence.buildMarketEvidence({ cards: [] }, {
    loading: false,
    providerState: { reference: "unavailable" }
  });

  assert.deepEqual(result.lanes.ebay, {
    status: "not-configured",
    message: "eBay Sold自動取得は未接続です",
    market: null
  });
  assert.deepEqual(result.lanes.domestic, {
    status: "external-only",
    message: "国内相場は外部サイトで確認できます",
    market: null
  });
  assert.equal(result.lanes.reference.status, "unavailable");
  assert.equal(result.lanes.reference.message, "価格サービスに接続できませんでした");
});

test("loading applies only to the connected reference channel", () => {
  const result = evidence.buildMarketEvidence({ cards: [] }, { loading: true });

  assert.equal(result.lanes.ebay.status, "not-configured");
  assert.equal(result.lanes.domestic.status, "external-only");
  assert.equal(result.lanes.reference.status, "collecting");
  assert.equal(result.lanes.reference.message, "価格データを収集中です");
});

test("calculates trend and stable sparkline coordinates", () => {
  const trend = evidence.trendFromHistory([
    { date: "2026-06-01", price: 1000 },
    { date: "2026-06-15", price: 1200 },
    { date: "2026-06-30", price: 900 }
  ]);

  assert.equal(trend.status, "available");
  assert.equal(trend.changeRate, -0.1);
  assert.deepEqual(trend.values, [1000, 1200, 900]);
  assert.equal(evidence.sparklinePoints([1000, 1200, 900]), "2,30 60,2 118,44");
  assert.equal(evidence.sparklinePoints([1000]), "2,23");
});
