const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPriceChartingProvider,
  normalizePriceChartingProduct
} = require("../pokemon-market/pricecharting-proxy.js");

let clientModule;

test.before(async () => {
  clientModule = await import("../pokemon-market/pricecharting.mjs");
});

test("PriceChartingローカルAPIは同一端末のHTTPだけで有効にする", () => {
  assert.equal(clientModule.canUseLocalPriceApi(new URL("http://127.0.0.1:4174/")), true);
  assert.equal(clientModule.canUseLocalPriceApi(new URL("http://localhost:4174/")), true);
  assert.equal(clientModule.canUseLocalPriceApi(new URL("http://[::1]:4174/")), true);
  assert.equal(clientModule.canUseLocalPriceApi(new URL("http://192.168.1.20:4174/")), false);
  assert.equal(clientModule.canUseLocalPriceApi(new URL("https://example.github.io/app/")), false);
});

test("PriceChartingのセント価格を安全なUSD価格へ変換する", () => {
  assert.deepEqual(normalizePriceChartingProduct({
    id: "12345",
    "product-name": "Charizard #4",
    "console-name": "Pokemon Base Set",
    "loose-price": 35675,
    "manual-only-price": 3010000,
    "sales-volume": "42"
  }), {
    id: "12345",
    name: "Charizard #4",
    setName: "Pokemon Base Set",
    ungradedUsd: 356.75,
    psa10Usd: 30100,
    salesVolumeYear: 42
  });
});

test("不正な価格フィールドを0円として扱わない", () => {
  const product = normalizePriceChartingProduct({
    id: "10",
    "product-name": "Pikachu #25",
    "console-name": "Pokemon Japanese Scarlet & Violet 151",
    "loose-price": -1,
    "manual-only-price": "not-a-number"
  });

  assert.equal(product.ungradedUsd, null);
  assert.equal(product.psa10Usd, null);
});

test("トークン未設定時は外部通信せずnot-configuredを返す", async () => {
  let calls = 0;
  const provider = createPriceChartingProvider({
    token: "",
    fetchImpl: async () => { calls += 1; }
  });

  assert.deepEqual(provider.status(), { enabled: false });
  await assert.rejects(provider.search("charizard #4"), error => error.code === "not-configured");
  assert.equal(calls, 0);
});

test("検索結果を24時間キャッシュしトークンを結果へ含めない", async () => {
  let calls = 0;
  let requestedUrl = "";
  const provider = createPriceChartingProvider({
    token: "secret-token-value",
    now: () => Date.parse("2026-06-28T00:00:00Z"),
    fetchImpl: async url => {
      calls += 1;
      requestedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          status: "success",
          products: [{
            id: "12345",
            "product-name": "Charizard #4",
            "console-name": "Pokemon Base Set",
            "loose-price": 35675,
            "manual-only-price": 3010000
          }]
        })
      };
    }
  });

  const first = await provider.search("charizard #4");
  const second = await provider.search("charizard #4");

  assert.equal(calls, 1);
  assert.match(requestedUrl, /t=secret-token-value/);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.doesNotMatch(JSON.stringify(first), /secret-token-value/);
});

test("異なる検索は1秒間隔でPriceChartingへ送る", async () => {
  let currentTime = 1_000;
  const waits = [];
  const provider = createPriceChartingProvider({
    token: "token",
    now: () => currentTime,
    sleep: async milliseconds => {
      waits.push(milliseconds);
      currentTime += milliseconds;
    },
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: "success", products: [] }) })
  });

  await provider.search("charizard #4");
  await provider.search("pikachu #25");

  assert.deepEqual(waits, [1000]);
});

test("カード名・セット・番号が完全一致する候補だけ採用する", () => {
  const card = sampleCard();
  const products = [
    { id: "wrong-name", name: "Dark Charizard #4", setName: "Pokemon Base Set", ungradedUsd: 100, psa10Usd: 1000 },
    { id: "wrong-number", name: "Charizard #5", setName: "Pokemon Base Set", ungradedUsd: 100, psa10Usd: 1000 },
    { id: "wrong-set", name: "Charizard #4", setName: "Pokemon Base Set 2", ungradedUsd: 100, psa10Usd: 1000 },
    { id: "exact", name: "Charizard #4", setName: "Pokemon Base Set", ungradedUsd: 356.75, psa10Usd: 30100 }
  ];

  assert.equal(clientModule.selectPriceChartingProduct(card, products)?.id, "exact");
  assert.equal(clientModule.selectPriceChartingProduct(card, products.slice(0, 3)), null);
});

test("完全一致価格を通常とPSA10の共通カードデータへ反映する", () => {
  const enriched = clientModule.applyPriceChartingProduct(sampleCard(), {
    id: "exact",
    name: "Charizard #4",
    setName: "Pokemon Base Set",
    ungradedUsd: 356.75,
    psa10Usd: 30100,
    salesVolumeYear: 42
  }, "2026-06-28");

  assert.equal(enriched.market.salePrice, 356.75);
  assert.equal(enriched.market.channel, "reference");
  assert.equal(enriched.market.dataKind, "market-reference");
  assert.equal(enriched.history[0].psa10, 30100);
  assert.equal(enriched.priceChartingId, "exact");
});

test("PriceCharting検索は識別情報が揃った未取得カードだけを対象にする", () => {
  const card = sampleCard();
  assert.equal(clientModule.shouldFetchPriceCharting(card, true), true);
  assert.equal(clientModule.shouldFetchPriceCharting(card, false), false);
  assert.equal(clientModule.shouldFetchPriceCharting({ ...card, englishName: "" }, true), false);
  assert.equal(clientModule.shouldFetchPriceCharting({ ...card, priceChartingId: "exact" }, true), false);
});

function sampleCard() {
  return {
    id: "tcgdex:base1-4",
    displayName: "リザードン",
    englishName: "Charizard",
    setName: "Pokemon Base Set",
    setCode: "base1",
    localNumber: "4/102",
    language: "English",
    rarity: "Holo Rare",
    aliases: [],
    variant: { code: "standard", label: "通常", foil: "Holo", mirrorPattern: "none" },
    image: { url: "https://example.com/card.webp", verification: "exact" },
    market: null,
    history: []
  };
}
