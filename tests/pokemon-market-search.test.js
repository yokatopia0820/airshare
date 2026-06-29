const test = require("node:test");
const assert = require("node:assert/strict");

let searchModule;
let catalogModule;
let fxModule;

test.before(async () => {
  searchModule = await import("../pokemon-market/tcgdex.mjs");
  catalogModule = await import("../pokemon-market/catalog.mjs");
  fxModule = await import("../pokemon-market/fx.mjs");
});

test("TCGdexの日本語検索URLを全件検索として安全に組み立てる", () => {
  const url = searchModule.buildTcgdexSearchUrl("ピカチュウ");
  const parsed = new URL(url);

  assert.equal(parsed.origin, "https://api.tcgdex.net");
  assert.equal(parsed.pathname, "/v2/ja/cards");
  assert.equal(parsed.searchParams.get("name"), "ピカチュウ");
  assert.equal(parsed.searchParams.get("pagination:page"), null);
  assert.equal(parsed.searchParams.get("pagination:itemsPerPage"), null);
});

test("TCGdexの一致カードを件数で切り捨てず全て返す", async () => {
  const sourceCards = Array.from({ length: 125 }, (_, index) => ({
    id: `set-${index + 1}`,
    localId: String(index + 1),
    name: "ピカチュウ"
  }));

  const cards = await searchModule.searchTcgdexCards("ピカチュウ", {
    fetchImpl: async () => ({ ok: true, json: async () => sourceCards })
  });

  assert.equal(cards.length, 125);
  assert.equal(cards.at(-1).tcgdexId, "set-125");
});

test("日本語ポケモン名を英語名へ展開し日英カードを統合する", async () => {
  const japaneseCards = Array.from({ length: 16 }, (_, index) => ({
    id: `ja-${index + 1}`,
    localId: String(index + 1),
    name: "ピカチュウ"
  }));
  const englishCards = Array.from({ length: 204 }, (_, index) => ({
    id: `en-${index + 1}`,
    localId: String(index + 1),
    name: "Pikachu"
  }));
  const requestedUrls = [];

  const cards = await searchModule.searchTcgdexCards("ピカチュウ", {
    pokemonNames: { "ピカチュウ": "Pikachu" },
    fetchImpl: async url => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        json: async () => String(url).includes("/v2/en/") ? englishCards : japaneseCards
      };
    }
  });

  assert.equal(cards.length, 220);
  assert.equal(cards.filter(card => card.language === "日本語").length, 16);
  assert.equal(cards.filter(card => card.language === "英語").length, 204);
  assert.equal(requestedUrls.some(url => url.includes("/v2/en/cards") && url.includes("name=Pikachu")), true);
});

test("TCGdexのカードを店頭画面用の日本語データへ変換する", () => {
  const card = searchModule.normalizeTcgdexCard({
    id: "SV2a-094",
    localId: "094",
    name: "ゲンガー",
    image: "https://assets.tcgdex.net/ja/SV/SV2a/094",
    rarity: "Rare",
    set: { id: "SV2a", name: "ポケモンカード151", cardCount: { official: 165 } }
  });

  assert.equal(card.id, "tcgdex:SV2a-094");
  assert.equal(card.displayName, "ゲンガー");
  assert.equal(card.localNumber, "094/165");
  assert.equal(card.language, "日本語");
  assert.equal(card.rarity, "レア");
  assert.equal(card.image.url, "https://assets.tcgdex.net/ja/SV/SV2a/094/high.webp");
  assert.equal(card.market, null);
});

test("TCGdexのCardmarket30日平均をEURの市場参考価格へ変換する", () => {
  const card = searchModule.normalizeTcgdexCard({
    id: "SV2a-025",
    localId: "025",
    name: "ピカチュウ",
    image: "https://assets.tcgdex.net/ja/SV/SV2a/025",
    variants: { normal: true, reverse: false, holo: false },
    set: { id: "SV2a", name: "ポケモンカード151", cardCount: { official: 165 } },
    pricing: {
      cardmarket: {
        updated: "2026-06-26T21:03:30.701Z",
        unit: "EUR",
        avg30: 0.29,
        trend: 0.46
      },
      tcgplayer: null
    }
  });

  assert.deepEqual(card.market, {
    source: "TCGdex Cardmarket",
    channel: "reference",
    currency: "EUR",
    salePrice: 0.29,
    buyerShipping: 0,
    condition: "Ungraded",
    sampleCount: null,
    observedAt: "2026-06-26",
    dataKind: "market-average"
  });
});

test("TCGplayer市場価格をCardmarketより優先する", () => {
  const card = searchModule.normalizeTcgdexCard({
    id: "sv3-125",
    localId: "125",
    name: "ピカチュウ",
    pricing: {
      tcgplayer: {
        updated: "2026-06-27T08:00:00.000Z",
        unit: "USD",
        normal: { marketPrice: 4.25 }
      },
      cardmarket: {
        updated: "2026-06-26T21:00:00.000Z",
        unit: "EUR",
        avg30: 3.1
      }
    }
  });

  assert.equal(card.market.source, "TCGdex TCGplayer");
  assert.equal(card.market.channel, "reference");
  assert.equal(card.market.currency, "USD");
  assert.equal(card.market.salePrice, 4.25);
  assert.equal(card.market.dataKind, "market-reference");
});

test("同じカードの通常とミラーを1件へまとめ、PSA10価格を取り出す", () => {
  const cards = [
    pricedCard({ id: "normal", code: "standard", mirrorPattern: "none", salePrice: 4, psa10: 120 }),
    pricedCard({ id: "mirror", code: "master_ball", mirrorPattern: "Master Ball", salePrice: 580, psa10: 1075 })
  ];

  const [group] = catalogModule.groupCatalogCards(cards);
  const quotes = catalogModule.variantQuotesForGroup(group);

  assert.equal(group.cards.length, 2);
  assert.equal(quotes.normal.market.salePrice, 4);
  assert.equal(quotes.mirror.market.salePrice, 580);
  assert.equal(quotes.psa10.market.salePrice, 120);
  assert.equal(quotes.psa10.label, "PSA10");
});

test("価格未登録の種類を0円として扱わない", () => {
  const [group] = catalogModule.groupCatalogCards([
    pricedCard({ id: "normal", code: "standard", mirrorPattern: "none", salePrice: 4, psa10: null })
  ]);
  const quotes = catalogModule.variantQuotesForGroup(group);

  assert.equal(quotes.normal.market.salePrice, 4);
  assert.equal(quotes.mirror, null);
  assert.equal(quotes.psa10, null);
});

test("USD/JPYの日次レートを検証して返す", async () => {
  const result = await fxModule.fetchUsdJpyRate({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ date: "2026-06-26", base: "USD", quote: "JPY", rate: 161.44 })
    })
  });

  assert.deepEqual(result, { rate: 161.44, date: "2026-06-26" });
});

test("不正な為替レスポンスは拒否する", async () => {
  await assert.rejects(
    () => fxModule.fetchUsdJpyRate({
      fetchImpl: async () => ({ ok: true, json: async () => ({ rate: 0 }) })
    }),
    /為替レート/
  );
});

test("USDとEURの日次円換算レートをまとめて取得する", async () => {
  const responses = {
    USD: { date: "2026-06-26", base: "USD", quote: "JPY", rate: 161.44 },
    EUR: { date: "2026-06-26", base: "EUR", quote: "JPY", rate: 184.52 }
  };
  const result = await fxModule.fetchJpyRates({
    fetchImpl: async url => {
      const base = new URL(url).pathname.split("/").at(-2);
      return { ok: true, json: async () => responses[base] };
    }
  });

  assert.deepEqual(result, {
    USD: { rate: 161.44, date: "2026-06-26" },
    EUR: { rate: 184.52, date: "2026-06-26" }
  });
});

test("市場平均と実売件数の表示を混同しない", () => {
  assert.equal(catalogModule.marketActivityLabel({ dataKind: "sold-comparable", sampleCount: 4 }), "直近1か月 4件売れています");
  assert.equal(catalogModule.marketActivityLabel({ dataKind: "market-average" }), "直近30日平均の参考価格");
  assert.equal(catalogModule.marketActivityLabel({ dataKind: "manual-reference" }), "市場参考価格");
});

test("未鑑定を鑑定済みと誤訳しない", () => {
  assert.equal(catalogModule.japaneseCondition("Ungraded"), "未鑑定");
  assert.equal(catalogModule.japaneseCondition("Graded PSA 10"), "鑑定済み");
});

test("カード言語を日本語表記へ統一する", () => {
  assert.equal(catalogModule.japaneseLanguage("English"), "英語");
  assert.equal(catalogModule.japaneseLanguage("Japanese"), "日本語");
  assert.equal(catalogModule.japaneseLanguage("日本語"), "日本語");
});

test("価格キャッシュは2日を超えたら再取得する", () => {
  assert.equal(catalogModule.shouldRefreshMarket(null, "2026-06-28T00:00:00Z"), true);
  assert.equal(catalogModule.shouldRefreshMarket({ observedAt: "2026-06-27" }, "2026-06-28T00:00:00Z"), false);
  assert.equal(catalogModule.shouldRefreshMarket({ observedAt: "2026-06-24" }, "2026-06-28T00:00:00Z"), true);
});

test("同じ番号でも言語が違うカードは混同しない", () => {
  const japanese = pricedCard({ id: "ja", code: "standard", mirrorPattern: "none", salePrice: 4, psa10: null });
  const japaneseLabel = { ...japanese, id: "ja-label", language: "日本語" };
  const english = { ...japanese, id: "en", language: "English" };

  assert.equal(catalogModule.groupCatalogCards([japanese, japaneseLabel]).length, 1);
  assert.equal(catalogModule.groupCatalogCards([japanese, english]).length, 2);
});

test("一覧の簡易データで保存済み詳細価格を上書きしない", () => {
  const detailed = pricedCard({ id: "tcgdex:SV2a-025", code: "standard", mirrorPattern: "none", salePrice: 0.29, psa10: null });
  detailed.setName = "ポケモンカード151";
  detailed.setCode = "SV2a";
  detailed.rarity = "コモン";
  const brief = {
    ...detailed,
    setName: "SV2a",
    rarity: "レアリティ未登録",
    market: null,
    history: []
  };

  const [merged] = catalogModule.mergeCardCache([detailed], [brief]);
  assert.equal(merged.market.salePrice, 0.29);
  assert.equal(merged.setName, "ポケモンカード151");
  assert.equal(merged.rarity, "コモン");
});

test("検索一覧の簡易データで詳細セット名とレアリティを上書きしない", () => {
  const detailed = pricedCard({ id: "tcgdex:SV2a-025", code: "standard", mirrorPattern: "none", salePrice: 0.29, psa10: null });
  detailed.displayName = "ピカチュウ";
  detailed.setName = "ポケモンカード151";
  detailed.setCode = "SV2a";
  detailed.localNumber = "025/165";
  detailed.language = "日本語";
  detailed.rarity = "コモン";
  detailed.tcgdexId = "SV2a-025";
  const [localGroup] = catalogModule.groupCatalogCards([detailed]);
  const brief = {
    ...detailed,
    setName: "SV2a",
    localNumber: "025",
    rarity: "レアリティ未登録",
    market: null,
    history: []
  };

  const [mergedGroup] = catalogModule.mergeCatalogGroups([localGroup], [brief]);

  assert.equal(mergedGroup.primary.setName, "ポケモンカード151");
  assert.equal(mergedGroup.primary.rarity, "コモン");
  assert.equal(mergedGroup.primary.market.salePrice, 0.29);
});

function pricedCard({ id, code, mirrorPattern, salePrice, psa10 }) {
  return {
    id,
    displayName: "ゲンガー",
    setName: "ポケモンカード151",
    setCode: "SV2a",
    localNumber: "094/165",
    language: "Japanese",
    rarity: "Rare",
    aliases: [],
    image: { url: "https://example.com/card.webp", verification: "exact" },
    variant: { code, label: code, foil: "None", mirrorPattern },
    market: {
      source: "Market",
      currency: "USD",
      salePrice,
      buyerShipping: 0,
      condition: "Ungraded / Near Mint",
      sampleCount: 3,
      observedAt: "2026-06-26",
      dataKind: "sold-comparable"
    },
    history: [{ date: "2026-06-26", raw: salePrice, psa10 }]
  };
}
