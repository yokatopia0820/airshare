# Pokemon Reference Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TCGplayer/Cardmarketの取得済み価格を円換算し、eBay実売と区別した参考利益を公開画面へ表示する。

**Architecture:** `market-labels.mjs`に計算可否と表示種別の純粋関数を置き、`app.js`はその結果で利益セルを描画する。既存の`calculateSourcingDecision`を再利用し、為替・手数料・送料の計算式は変更しない。

**Tech Stack:** Vanilla JavaScript ES modules, Node.js built-in test runner, CDP browser verifier, GitHub Pages

---

### Task 1: Price eligibility contract

**Files:**
- Modify: `tests/pokemon-market-market-labels.test.js`
- Modify: `pokemon-market/market-labels.mjs`

- [ ] **Step 1: Write the failing test**

TCGplayer/Cardmarketは参考利益計算が可能、eBay sold-comparableは確定利益計算が可能、価格なしは不可という期待値を追加する。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pokemon-market-market-labels.test.js`
Expected: FAIL because `isReferencePriceMarket` and `isCalculableMarket` are missing.

- [ ] **Step 3: Write minimal implementation**

`isReferencePriceMarket(market)`と`isCalculableMarket(market)`を追加する。後者は正の`salePrice`、0以上の`buyerShipping`、eBay実売またはreference channelを要求する。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pokemon-market-market-labels.test.js`
Expected: PASS.

### Task 2: Reference profit UI

**Files:**
- Modify: `pokemon-market/verify-browser.mjs`
- Modify: `pokemon-market/app.js`

- [ ] **Step 1: Change browser expectation first**

ゲンガー094の通常セルに`参考利益`と有限の円額、詳細欄に`海外参考価格`が表示される期待値へ変更する。価格のないミラーとPSA10は`価格未取得`を期待する。

- [ ] **Step 2: Run browser verification to observe failure**

Run: `VERIFY_VIEWPORT=mobile-390 node pokemon-market/verify-browser.mjs`
Expected: FAIL because the current UI still says `eBay価格未取得`.

- [ ] **Step 3: Implement minimal rendering change**

`profitCellHtml`と`calculateQuoteDecision`でreference価格も計算対象にし、reference channelは`参考利益`、eBay sold-comparableは`利益`と表示する。価格がない種類は`価格未取得`と表示する。

- [ ] **Step 4: Run narrow and full checks**

Run: `node --test tests/pokemon-market-market-labels.test.js`
Run: `node --test`
Run: `node pokemon-market/verify-browser.mjs`
Expected: all tests and four viewports PASS without console errors or horizontal overflow.

### Task 3: Cache version and release

**Files:**
- Modify: `pokemon-market/index.html`
- Modify: `pokemon-market/sw.js`
- Modify: `pokemon-market/README.md`

- [ ] **Step 1: Update asset/cache version**

CSS/JS query version and service-worker cache nameをv21へ更新し、公開後に旧画面が残らないようにする。

- [ ] **Step 2: Document price semantics**

TCGplayer/Cardmarketは参考利益、eBay sold-comparableだけが確定利益表示になることをREADMEへ記載する。

- [ ] **Step 3: Verify and publish**

Run: `node .codex/scripts/workflow.mjs evaluate`
Commit changed files, push `HEAD:main`, wait for Pages success, then run the browser verifier against `https://yokatopia0820.github.io/airshare/?v=21`.
