# Market Evidence and Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** カード選択直後に価格・画像・推移・更新日時・取得元を理由付きで表示し、保存データを即表示しながらバックグラウンド更新する。

**Architecture:** 市場データの優先順位と状態を`market-evidence.mjs`へ分離し、`app.js`は生成された表示モデルを描画する。カード詳細キャッシュと画像候補は`card-cache.mjs`へ分離し、GitHub Pagesは日次でTCGdex索引を再生成する。

**Tech Stack:** Vanilla JavaScript ES modules, localStorage, Node.js built-in test runner, GitHub Actions, CDP browser verification

---

### Task 1: Market evidence model

**Files:**
- Create: `pokemon-market/market-evidence.mjs`
- Create: `tests/pokemon-market-market-evidence.test.js`

- [ ] **Step 1: Write failing tests**

eBay Sold、国内価格、海外参考価格を別レーンへ分類し、各価格がない場合に`not-configured`、`external-only`、`collecting`を返すテストを書く。有限履歴から30日騰落率とスパークライン座標を返すテストも書く。

- [ ] **Step 2: Verify RED**

Run: `node --test tests/pokemon-market-market-evidence.test.js`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement minimal pure functions**

`buildMarketEvidence(group, options)`、`trendFromHistory(history)`、`sparklinePoints(values)`を実装する。`card.market`と`card.markets[]`を読み、価格を生成しない。

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/pokemon-market-market-evidence.test.js`
Expected: PASS.

### Task 2: Cache and image fallback

**Files:**
- Create: `pokemon-market/card-cache.mjs`
- Create: `tests/pokemon-market-card-cache.test.js`
- Modify: `pokemon-market/app.js`

- [ ] **Step 1: Write failing tests**

旧配列キャッシュを移行できること、30日超のキャッシュを除外すること、失敗状態を6時間再試行しないこと、TCGdex画像候補が`high.webp`から`low.webp`になることをテストする。

- [ ] **Step 2: Verify RED**

Run: `node --test tests/pokemon-market-card-cache.test.js`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement cache helpers**

`readCardCacheEnvelope`、`createCardCacheEnvelope`、`shouldRetryFailure`、`tcgdexImageCandidates`を実装する。外部画像候補はHTTPSかつTCGdexホストだけに限定する。

- [ ] **Step 4: Integrate without deleting stale values**

`app.js`でv1キャッシュをv2へ移行し、選択時に保存価格を表示してから詳細を更新する。詳細API失敗時は保存価格を保持し、理由を状態マップへ記録する。画像エラー時は次候補へ切り替える。

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/pokemon-market-card-cache.test.js tests/pokemon-market-search.test.js`
Expected: PASS.

### Task 3: Evidence-first mobile UI

**Files:**
- Modify: `pokemon-market/index.html`
- Modify: `pokemon-market/app.js`
- Modify: `pokemon-market/styles.css`
- Modify: `pokemon-market/market-labels.mjs`
- Modify: `tests/pokemon-market-market-labels.test.js`
- Modify: `pokemon-market/verify-browser.mjs`

- [ ] **Step 1: Change browser expectations first**

選択カードが画像、eBay Sold、国内相場、海外参考価格、価格推移、最終更新、取得元、仕入れ計算の順になり、「価格なし」「価格未登録」を含まない期待値へ変更する。

- [ ] **Step 2: Verify RED**

Run: set `VERIFY_VIEWPORT=mobile-390` and execute `node pokemon-market/verify-browser.mjs`.
Expected: FAIL because the evidence lanes do not exist.

- [ ] **Step 3: Render evidence lanes**

`selectedMarket`を仕入れ入力より前へ移動し、eBay・国内・参考価格の状態、価格推移、更新日時、取得元を1列で描画する。国内確認リンクへYahoo!オークションとpokeca-chart、eBay確認リンクへSold検索を設定する。

- [ ] **Step 4: Replace ambiguous empty text**

選択後の価格領域では「価格なし」「価格未登録」「価格未取得」を使わず、`eBay Sold自動取得は未接続です`、`国内相場は外部サイトで確認できます`、`価格データを収集中です`へ置き換える。

- [ ] **Step 5: Verify responsive UI**

Run: `node pokemon-market/verify-browser.mjs`
Expected: 375px, 390px, 430px, 1365px all PASS with no horizontal overflow or console errors.

### Task 4: Daily index refresh and release

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `pokemon-market/index.html`
- Modify: `pokemon-market/sw.js`
- Modify: `pokemon-market/README.md`
- Modify: `tests/pokemon-market-server.test.js`

- [ ] **Step 1: Write workflow/cache expectations**

Pages workflowに日次scheduleとTCGdex索引生成コマンドがあり、Service Workerがv22資産を持つ期待値へ変更する。

- [ ] **Step 2: Verify RED**

Run: `node --test tests/pokemon-market-server.test.js`
Expected: FAIL with v21 and missing scheduled refresh.

- [ ] **Step 3: Implement refresh and v22 cache**

Pages workflowへ日次scheduleを追加し、scheduleまたはmanual実行時に索引生成器を実行する。HTMLとService Workerをv22へ更新する。

- [ ] **Step 4: Document source boundaries**

READMEへeBay制約、pokeca-chart許諾待ち、キャッシュ期間、理由別状態、画像フォールバックを記載する。

- [ ] **Step 5: Full verification and publish**

Run: `node --test`, `node .codex/scripts/workflow.mjs evaluate`, local browser verification, commit, push `HEAD:main`, wait for Pages success, then verify `https://yokatopia0820.github.io/airshare/?v=22` at four viewports.
