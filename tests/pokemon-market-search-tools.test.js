const test = require("node:test");
const assert = require("node:assert/strict");

let searchTools;

test.before(async () => {
  searchTools = await import("../pokemon-market/search-tools.mjs");
});

test("ひらがなと半角カナを同じ検索キーへ正規化する", () => {
  assert.equal(searchTools.normalizeSearchText("かすみ"), "カスミ");
  assert.equal(searchTools.normalizeSearchText("ｶｽﾐ"), "カスミ");
});

test("検索補完カードをひらがなの部分一致で検索する", () => {
  const catalog = [
    {
      id: "jp-50294",
      displayName: "カスミの元気",
      aliases: ["カスミ", "かすみ"],
      setCode: "M5",
      localNumber: "075/081",
      rarity: "アンコモン",
      sourceUrl: "https://www.pokemon-card.com/card-search/details.php/card/50294/regu/all"
    },
    {
      id: "jp-36832",
      displayName: "カスミのおねがい",
      aliases: ["カスミ", "かすみ"],
      setCode: "SM11",
      localNumber: "085/094",
      sourceUrl: "https://www.pokemon-card.com/card-search/details.php/card/36832"
    },
    { id: "jp-99999", displayName: "タケシの元気", aliases: ["タケシ"] }
  ];

  const results = searchTools.searchSupplementCards("かすみ", catalog);

  assert.deepEqual(results.map(card => card.displayName), [
    "カスミの元気",
    "カスミのおねがい"
  ]);
  assert.equal(results[0].id, "supplement:jp-50294");
  assert.equal(results[0].image.url, "");
  assert.equal(results[0].image.verification, "missing");
  assert.equal(results[0].sourceUrl, catalog[0].sourceUrl);
});

test("レアリティをスマホ用の5区分へまとめる", () => {
  assert.equal(searchTools.rarityBucket("C"), "common");
  assert.equal(searchTools.rarityBucket("アンコモン"), "common");
  assert.equal(searchTools.rarityBucket("RR"), "rare");
  assert.equal(searchTools.rarityBucket("イラストレーションレア"), "art");
  assert.equal(searchTools.rarityBucket("SAR"), "premium");
  assert.equal(searchTools.rarityBucket("レアリティ未登録"), "other");
});

test("指定レアリティだけを元の並び順で返す", () => {
  const groups = [
    group("c", "C"),
    group("rr", "RR"),
    group("ar", "AR"),
    group("sr", "SR"),
    group("unknown", "レアリティ未登録")
  ];

  assert.deepEqual(
    searchTools.filterGroupsByRarity(groups, "premium").map(item => item.id),
    ["sr"]
  );
  assert.deepEqual(
    searchTools.filterGroupsByRarity(groups, "all").map(item => item.id),
    ["c", "rr", "ar", "sr", "unknown"]
  );
});

test("検索結果がある場合は全レアリティボタンを常に返す", () => {
  assert.deepEqual(
    searchTools.availableRarityFilters([group("unknown", "レアリティ未登録")])
      .map(filter => filter.key),
    ["all", "common", "rare", "art", "premium", "other"]
  );
});

test("検索結果を指定件数まで切り出し総件数と続きの有無を返す", () => {
  const groups = Array.from({ length: 95 }, (_, index) => group(String(index), "C"));

  assert.deepEqual(searchTools.paginateGroups(groups, 24), {
    groups: groups.slice(0, 24),
    shownCount: 24,
    totalCount: 95,
    hasMore: true
  });
  assert.deepEqual(searchTools.paginateGroups(groups, 120), {
    groups,
    shownCount: 95,
    totalCount: 95,
    hasMore: false
  });
});

function group(id, rarity) {
  return { id, primary: { rarity } };
}
