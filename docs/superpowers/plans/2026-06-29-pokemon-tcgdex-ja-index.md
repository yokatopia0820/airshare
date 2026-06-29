# TCGdex Japanese Card Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and ship a compact TCGdex Japanese card index so mobile searches return the full available catalog immediately while preserving selection-first profit calculation.

**Architecture:** A pure `tcgdex-index.mjs` module validates, compacts, searches, and converts TCGdex brief rows. A Node build script fetches the public Japanese card list into a versioned static JSON artifact. The app merges local index matches with supplements and remote TCGdex results, while the service worker caches the index for repeat store use.

**Tech Stack:** Static HTML/CSS, browser ES modules, Node.js built-in modules and test runner, TCGdex REST API, GitHub Pages.

---

### Task 1: Index primitives and generator

**Files:**
- Create: `pokemon-market/tcgdex-index.mjs`
- Create: `pokemon-market/tools/build-tcgdex-ja-index.mjs`
- Create: `tests/pokemon-market-tcgdex-index.test.js`

- [ ] Write failing tests for compact row normalization, kana search, duplicate rejection, asset-domain validation, and card-model conversion.
- [ ] Run `node --test tests/pokemon-market-tcgdex-index.test.js`; expect missing-module failure.
- [ ] Implement `buildTcgdexIndexPayload(rows, generatedAt)`, `validateTcgdexIndexPayload(payload)`, `searchTcgdexIndex(query, rows)`, and `tcgdexIndexRowToCard(row)`.
- [ ] Implement the generator with injected fetch support, one GET to `https://api.tcgdex.net/v2/ja/cards`, validation, and UTF-8 JSON output.
- [ ] Re-run the focused test; expect all tests to pass.

### Task 2: Generate and validate the real index

**Files:**
- Create: `pokemon-market/data/tcgdex-ja-index.json`
- Modify: `pokemon-market/README.md`

- [ ] Run `node pokemon-market/tools/build-tcgdex-ja-index.mjs`; expect a validated index between 1,000 and 50,000 cards and below 5MiB.
- [ ] Add an artifact test that parses the real JSON, verifies unique IDs, rejects `pokemon-card.com` URLs, and confirms common searches return results.
- [ ] Document the update command, TCGdex source, MIT attribution, and the difference between search coverage and price coverage.
- [ ] Run the index tests again; expect all tests to pass.

### Task 3: Integrate local all-card search

**Files:**
- Modify: `pokemon-market/app.js`
- Modify: `pokemon-market/search-tools.mjs`
- Modify: `tests/pokemon-market-search-tools.test.js`

- [ ] Write failing tests showing multi-term kana search preserves order and returns compact-index cards.
- [ ] Add index state and `loadTcgdexIndex()`; begin loading during initialization without blocking the existing initial render.
- [ ] In `searchCards()`, search the local index and supplements before awaiting remote TCGdex, merge all sources, and retain request-session cancellation checks.
- [ ] Keep `resultLimit = 24` for new searches and rarity changes; show `さらに表示` only when more groups remain.
- [ ] Add a capture-phase image error handler that removes failed images and reveals the existing fixed-size `画像なし` fallback.
- [ ] Run search, flow, catalog, and index tests; expect all tests to pass.

### Task 4: Offline cache and browser verification

**Files:**
- Modify: `pokemon-market/sw.js`
- Modify: `pokemon-market/index.html`
- Modify: `pokemon-market/verify-browser.mjs`
- Modify: `tests/pokemon-market-server.test.js`

- [ ] Write failing service-worker expectations for `tcgdex-index.mjs`, `data/tcgdex-ja-index.json`, and cache version `v20`.
- [ ] Add exact URLs to the app shell and bump HTML, app, styles, and service-worker registration to `v20`.
- [ ] Extend browser verification to assert a broad search caps initial cards at 24 and exposes `さらに表示`.
- [ ] Run `node --test`, syntax checks, and local browser checks at 375, 390, 430, and 1365 pixels.

### Task 5: Review and publish

**Files:**
- Review all staged `pokemon-market/`, `tests/pokemon-market-*.test.js`, and the two TCGdex index documents.

- [ ] Scan for credentials, official-site copied assets, stale version URLs, oversized artifacts, and unrelated changes.
- [ ] Commit only the intended files with a conventional commit message.
- [ ] Push the fast-forward commit to `main` and wait for the Pages workflow to succeed.
- [ ] Run `pokemon-market/verify-browser.mjs` against `https://yokatopia0820.github.io/airshare/` at all four viewports; expect zero console/network errors.
