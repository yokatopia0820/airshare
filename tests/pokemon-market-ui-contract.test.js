const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("selected card follows evidence-first sourcing order", () => {
  const html = fs.readFileSync(path.join(root, "pokemon-market", "index.html"), "utf8");
  const summary = html.indexOf('id="selectedCardSummary"');
  const market = html.indexOf('id="selectedMarket"');
  const purchase = html.indexOf('class="store-price-row"');
  const profit = html.indexOf('id="selectedProfit"');

  assert.ok(summary >= 0);
  assert.ok(summary < market);
  assert.ok(market < purchase);
  assert.ok(purchase < profit);
});

test("selected-card UI avoids ambiguous missing-price wording", () => {
  const app = fs.readFileSync(path.join(root, "pokemon-market", "app.js"), "utf8");
  const evidence = fs.readFileSync(path.join(root, "pokemon-market", "market-evidence.mjs"), "utf8");
  const viewCode = `${app}\n${evidence}`;
  assert.doesNotMatch(viewCode, /価格なし|価格未取得|価格未登録/u);
  assert.match(viewCode, /eBay Sold自動取得は未接続です/u);
  assert.match(viewCode, /国内相場は外部サイトで確認できます/u);
  assert.match(viewCode, /価格サービスに接続できませんでした/u);
});

test("market evidence is rendered in the requested order", () => {
  const app = fs.readFileSync(path.join(root, "pokemon-market", "app.js"), "utf8");
  const start = app.indexOf('function marketEvidenceHtml');
  const end = app.indexOf('function marketEvidenceLaneHtml');
  const renderer = app.slice(start, end);

  assert.ok(renderer.indexOf('"eBay Sold価格"') < renderer.indexOf('"国内相場"'));
  assert.ok(renderer.indexOf('"国内相場"') < renderer.indexOf('"海外参考価格"'));
  assert.ok(renderer.indexOf('価格推移') < renderer.indexOf('最終更新'));
  assert.ok(renderer.indexOf('最終更新') < renderer.indexOf('取得元'));
});
