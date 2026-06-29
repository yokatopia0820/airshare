# Pokemon Search, Price Sources, and Rarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a mobile card search that finds the requested Japanese card names, supports kana-insensitive search and rarity filtering, and labels every price by its real market source.

**Architecture:** TCGdex is supplemented by a small independently maintained set of known search gaps. Pure search and market-label helpers keep normalization, rarity filtering, paging, and source naming testable without the DOM.

**Tech Stack:** Static HTML/CSS, browser ES modules, Node.js built-in test runner, GitHub Pages.

---

### Task 1: Search and rarity primitives

**Files:**
- Create: `pokemon-market/search-tools.mjs`
- Test: `tests/pokemon-market-search-tools.test.js`

- [x] Write failing tests for NFKC/kana normalization, supplement matching, rarity buckets, local rarity filtering, and paging.
- [ ] Run `node --test tests/pokemon-market-search-tools.test.js` and confirm the missing module failure.
- [x] Implement the smallest pure helpers that satisfy those tests.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Safe Japanese search supplement

**Files:**
- Create: `pokemon-market/data/search-supplements.json`
- Modify: `pokemon-market/sw.js`

- [x] Remove the generated official-site index and official image hotlinks after verifying the site's reuse policy.
- [x] Add only the requested known gaps with factual identifiers and text source links.
- [x] Cache the supplement in the service worker and bump the application cache version.

### Task 3: Integrate search and rarity UI

**Files:**
- Modify: `pokemon-market/app.js`
- Modify: `pokemon-market/index.html`
- Modify: `pokemon-market/styles.css`

- [x] Load the supplement without blocking TCGdex search.
- [x] Merge supplement and TCGdex results while retaining supplement-only cards with no fabricated price.
- [ ] Keep unfiltered and filtered result groups separately in state.
- [x] Render an accessible segmented rarity control beside the count and update `shown/total` text.
- [x] Limit initial rendering to 24 cards and add a clear continuation action.

### Task 4: Truthful price source presentation

**Files:**
- Create: `pokemon-market/market-labels.mjs`
- Modify: `pokemon-market/app.js`
- Test: `tests/pokemon-market-market-labels.test.js`

- [ ] Write failing tests for domestic, eBay, TCGplayer, Cardmarket, and generic overseas labels.
- [ ] Render the provider label before the yen amount.
- [ ] Add compact Yahoo!オークション落札相場 and eBay sold-search links for the selected card when direct prices are unavailable.
- [ ] Keep direct numeric domestic/eBay values absent unless the card data names that provider.

### Task 5: Verify and publish

**Files:**
- Modify: `pokemon-market/verify-browser.mjs` when assertions need the new controls.

- [ ] Run focused tests, then `node --test`.
- [ ] Check JavaScript syntax for every changed `.js` and `.mjs` file.
- [ ] Verify `カスミ` and `かすみ` at 390px, including both requested card names and rarity filtering.
- [ ] Check desktop width, console errors, missing assets, and horizontal overflow.
- [ ] Deploy through the existing GitHub Pages workflow and repeat the public checks.
