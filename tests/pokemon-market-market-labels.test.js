const test = require("node:test");
const assert = require("node:assert/strict");

let labels;

test.before(async () => {
  labels = await import("../pokemon-market/market-labels.mjs");
});

test("価格を実際の市場ソース名で表示する", () => {
  assert.equal(labels.marketPriceLabel({ source: "CardRush" }), "国内価格");
  assert.equal(labels.marketPriceLabel({ source: "Mercari sold" }), "国内価格");
  assert.equal(labels.marketPriceLabel({ source: "eBay Product Research" }), "eBay価格");
  assert.equal(labels.marketPriceLabel({ source: "TCGdex TCGplayer" }), "TCGplayer価格");
  assert.equal(labels.marketPriceLabel({ source: "TCGdex Cardmarket" }), "Cardmarket価格");
  assert.equal(labels.marketPriceLabel({ source: "PriceCharting" }), "海外参考価格");
  assert.equal(labels.marketPriceChannel({ source: "Yahoo! Auction sold" }), "domestic");
  assert.equal(labels.marketPriceChannel({ source: "eBay Product Research" }), "ebay");
  assert.equal(labels.marketPriceChannel({ source: "TCGdex TCGplayer" }), "reference");
  assert.equal(labels.isProfitEligibleMarket({ source: "eBay Product Research", dataKind: "sold-comparable" }), true);
  assert.equal(labels.isProfitEligibleMarket({ source: "TCGdex TCGplayer", dataKind: "market-reference" }), false);
  assert.equal(labels.isReferencePriceMarket({ channel: "reference", dataKind: "market-reference" }), true);
  assert.equal(labels.isReferencePriceMarket({ source: "PriceCharting market reference", dataKind: "manual-reference" }), true);
  assert.equal(labels.isReferencePriceMarket({ channel: "ebay", dataKind: "sold-comparable" }), false);
  assert.equal(labels.isCalculableMarket({
    channel: "reference",
    dataKind: "market-reference",
    salePrice: 10,
    buyerShipping: 0
  }), true);
  assert.equal(labels.isCalculableMarket({
    channel: "reference",
    dataKind: "market-reference",
    salePrice: null,
    buyerShipping: 0
  }), false);
});

test("国内とeBayの確認URLをカード名から安全に組み立てる", () => {
  const links = labels.marketSearchLinks({ displayName: "カスミのおねがい", setCode: "SM11" });

  assert.equal(new URL(links.domestic).hostname, "auctions.yahoo.co.jp");
  assert.equal(new URL(links.domestic).pathname, "/closedsearch/closedsearch");
  assert.match(decodeURIComponent(links.domestic), /カスミのおねがい/u);
  assert.equal(new URL(links.ebay).hostname, "www.ebay.com");
  assert.equal(new URL(links.ebay).searchParams.get("LH_Sold"), "1");
});
