const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let indexModule;
let generatorModule;

test.before(async () => {
  indexModule = await import("../pokemon-market/tcgdex-index.mjs");
  generatorModule = await import("../pokemon-market/tools/build-tcgdex-ja-index.mjs");
});

test("TCGdex一覧を検索用の小さな配列へ正規化する", () => {
  const payload = indexModule.buildTcgdexIndexPayload([
    { id: "sm11-85", name: "カスミのおねがい", localId: "085", image: "https://assets.tcgdex.net/ja/sm/sm11/085" },
    { id: "sv2a-25", name: "ピカチュウ", localId: "025" }
  ], {
    generatedAt: "2026-06-29T00:00:00.000Z",
    minimumCount: 2
  });

  assert.deepEqual(payload, {
    schemaVersion: 1,
    generatedAt: "2026-06-29T00:00:00.000Z",
    source: "https://api.tcgdex.net/v2/ja/cards",
    license: "MIT",
    cards: [
      ["sm11-85", "カスミのおねがい", "085", "https://assets.tcgdex.net/ja/sm/sm11/085"],
      ["sv2a-25", "ピカチュウ", "025", ""]
    ]
  });
});

test("ひらがなと番号の複数語で索引をAND検索する", () => {
  const rows = [
    ["sm11-85", "カスミのおねがい", "085", ""],
    ["m5-75", "カスミの元気", "075", ""],
    ["sv2a-25", "ピカチュウ", "025", ""]
  ];

  assert.deepEqual(
    indexModule.searchTcgdexIndex("かすみ 085", rows),
    [rows[0]]
  );
  assert.deepEqual(
    indexModule.searchTcgdexIndex("カスミ", rows),
    rows.slice(0, 2)
  );
});

test("重複IDとTCGdex以外の画像URLを拒否する", () => {
  const duplicate = indexModule.validateTcgdexIndexPayload({
    schemaVersion: 1,
    generatedAt: "2026-06-29T00:00:00.000Z",
    source: "https://api.tcgdex.net/v2/ja/cards",
    license: "MIT",
    cards: [
      ["same-1", "カードA", "001", ""],
      ["same-1", "カードB", "002", ""]
    ]
  }, { minimumCount: 2 });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join("\n"), /重複/u);

  const externalImage = indexModule.validateTcgdexIndexPayload({
    schemaVersion: 1,
    generatedAt: "2026-06-29T00:00:00.000Z",
    source: "https://api.tcgdex.net/v2/ja/cards",
    license: "MIT",
    cards: [["safe-1", "カード", "001", "https://www.pokemon-card.com/card.jpg"]]
  }, { minimumCount: 1 });
  assert.equal(externalImage.ok, false);
  assert.match(externalImage.errors.join("\n"), /画像URL/u);
});

test("索引行を既存の日本語カードモデルへ変換する", () => {
  const card = indexModule.tcgdexIndexRowToCard([
    "sm11-85",
    "カスミのおねがい",
    "085",
    "https://assets.tcgdex.net/ja/sm/sm11/085"
  ]);

  assert.equal(card.id, "tcgdex:sm11-85");
  assert.equal(card.tcgdexId, "sm11-85");
  assert.equal(card.displayName, "カスミのおねがい");
  assert.equal(card.setCode, "sm11");
  assert.equal(card.localNumber, "085");
  assert.equal(card.language, "日本語");
  assert.equal(card.rarity, "レアリティ未登録");
  assert.equal(card.image.url, "https://assets.tcgdex.net/ja/sm/sm11/085/high.webp");
  assert.equal(card.market, null);
});

test("生成器はTCGdex全件APIを1回取得して検証済み索引を返す", async () => {
  const calls = [];
  const payload = await generatorModule.fetchTcgdexJapaneseIndex({
    minimumCount: 1,
    generatedAt: "2026-06-29T00:00:00.000Z",
    fetchImpl: async url => {
      calls.push(url);
      return {
        ok: true,
        async json() {
          return [{ id: "sv2a-25", name: "ピカチュウ", localId: "025" }];
        }
      };
    }
  });

  assert.deepEqual(calls, ["https://api.tcgdex.net/v2/ja/cards"]);
  assert.equal(payload.cards.length, 1);
  assert.equal(payload.cards[0][1], "ピカチュウ");
});

test("同梱する実索引は十分な件数があり安全なTCGdexデータだけを含む", () => {
  const filePath = path.join(__dirname, "../pokemon-market/data/tcgdex-ja-index.json");
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const validation = indexModule.validateTcgdexIndexPayload(payload);
  const ids = payload.cards.map(row => row[0]);

  assert.deepEqual(validation, { ok: true, errors: [] });
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(JSON.stringify(payload).includes("pokemon-card.com"), false);
  assert.ok(indexModule.searchTcgdexIndex("カスミ", payload.cards).length >= 8);
  assert.ok(indexModule.searchTcgdexIndex("ピカチュウ", payload.cards).length >= 10);
});
