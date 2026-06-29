const assert = require("node:assert/strict");
const test = require("node:test");

let flowModule;

test.before(async () => {
  flowModule = await import("../pokemon-market/flow.mjs");
});

test("カード未選択では仕入れ金額を保持しない", () => {
  const initial = flowModule.createSourcingFlow();
  const updated = flowModule.setPurchasePrice(initial, "500");

  assert.deepEqual(updated, { selectedGroupId: "", purchasePrice: "" });
});

test("カードを選択してから仕入れ金額を保持する", () => {
  const selected = flowModule.selectSourcingCard(flowModule.createSourcingFlow(), "group:sv2a-025");
  const updated = flowModule.setPurchasePrice(selected, "500");

  assert.deepEqual(updated, {
    selectedGroupId: "group:sv2a-025",
    purchasePrice: "500"
  });
});

test("別カードの選択と選び直しで仕入れ金額をリセットする", () => {
  const first = flowModule.setPurchasePrice(
    flowModule.selectSourcingCard(flowModule.createSourcingFlow(), "group:first"),
    "500"
  );
  const second = flowModule.selectSourcingCard(first, "group:second");
  const cleared = flowModule.clearSourcingCard(second);

  assert.deepEqual(second, { selectedGroupId: "group:second", purchasePrice: "" });
  assert.deepEqual(cleared, { selectedGroupId: "", purchasePrice: "" });
});
