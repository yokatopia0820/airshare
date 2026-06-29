const test = require("node:test");
const assert = require("node:assert/strict");

let createSearchSession;

test.before(async () => {
  ({ createSearchSession } = await import("../pokemon-market/search-session.mjs"));
});

test("入力変更で進行中の検索を中止し旧応答を無効化する", () => {
  const session = createSearchSession();
  const first = session.begin();

  session.invalidate();

  assert.equal(first.signal.aborted, true);
  assert.equal(session.isCurrent(first.id), false);

  const second = session.begin();
  assert.equal(second.signal.aborted, false);
  assert.equal(session.isCurrent(second.id), true);
});
