import { calculateSourcingDecision, validatePurchasePrice } from "./core.mjs";
import {
  filterCatalogGroups,
  groupCatalogCards,
  japaneseCondition,
  japaneseLanguage,
  marketActivityLabel,
  mergeCardCache,
  mergeCatalogGroups,
  shouldRefreshMarket,
  variantQuotesForGroup
} from "./catalog.mjs";
import { fetchTcgdexCard, searchTcgdexCards } from "./tcgdex.mjs";
import { fetchJpyRates } from "./fx.mjs";
import {
  canUseLocalPriceApi,
  fetchPriceChartingProduct,
  getPriceChartingStatus,
  shouldFetchPriceCharting
} from "./pricecharting.mjs";
import {
  clearSourcingCard,
  createSourcingFlow,
  selectSourcingCard,
  setPurchasePrice
} from "./flow.mjs";
import {
  availableRarityFilters,
  filterGroupsByRarity,
  normalizeSearchText,
  paginateGroups,
  searchSupplementCards
} from "./search-tools.mjs";
import { createSearchSession } from "./search-session.mjs";
import {
  searchTcgdexIndex,
  tcgdexIndexRowToCard,
  validateTcgdexIndexPayload
} from "./tcgdex-index.mjs";
import {
  isCalculableMarket,
  isProfitEligibleMarket,
  isReferencePriceMarket,
  marketPriceLabel,
  marketSearchLinks
} from "./market-labels.mjs";

const SEARCH_DELAY_MS = 450;
const REMOTE_SEARCH_TIMEOUT_MS = 6000;
const RESULT_PAGE_SIZE = 24;
const DEFAULT_USD_JPY_RATE = 160;
const DEFAULT_EUR_JPY_RATE = 185;
const SETTINGS_KEY = "pokemon-market:store-settings:v2";
const FX_KEY = "pokemon-market:fx:v2";
const CARD_CACHE_KEY = "pokemon-market:tcgdex-cache:v1";

const DEFAULT_SETTINGS = {
  usdJpyRate: DEFAULT_USD_JPY_RATE,
  eurJpyRate: DEFAULT_EUR_JPY_RATE,
  feeRate: 0.15,
  internationalShippingJpy: 1200,
  packingCostJpy: 100,
  fxBufferRate: 0.03,
  targetProfitJpy: 1000,
  targetRoiRate: 0.3,
  maxAgeDays: 30,
  minimumSampleCount: 1
};

const state = {
  localCards: [],
  cachedCards: [],
  pokemonNames: {},
  tcgdexIndexRows: null,
  tcgdexIndexPromise: null,
  supplementCards: null,
  supplementCardsPromise: null,
  resultGroups: [],
  visibleGroups: [],
  resultLimit: RESULT_PAGE_SIZE,
  rarityFilter: "all",
  query: "",
  flow: createSourcingFlow(),
  settings: { ...DEFAULT_SETTINGS },
  fxDates: { USD: "", EUR: "" },
  fxSource: "初期値",
  searching: false,
  searchError: "",
  searchTimer: 0,
  searchSession: createSearchSession(),
  priceLoadingIds: new Set(),
  priceChartingEnabled: false
};

const elements = {};
let notificationTimer = 0;

document.addEventListener("DOMContentLoaded", () => {
  void initializeApp();
});

async function initializeApp() {
  cacheElements();
  loadSettings();
  loadFxCache();
  loadCardCache();
  bindEvents();
  renderSettings();
  renderFxStatus();
  await Promise.all([loadCatalog(), loadPokemonNames(), loadSearchSupplements()]);
  renderLocalResults();
  void loadTcgdexIndex().catch(() => {});
  if (canUseLocalPriceApi(window.location)) void initializePriceCharting();
  void refreshFxRate();
  void registerServiceWorker();
}

function cacheElements() {
  elements.searchForm = document.getElementById("searchForm");
  elements.searchInput = document.getElementById("searchInput");
  elements.clearSearch = document.getElementById("clearSearch");
  elements.selectionPanel = document.getElementById("selectionPanel");
  elements.selectedCardSummary = document.getElementById("selectedCardSummary");
  elements.selectedProfit = document.getElementById("selectedProfit");
  elements.selectedMarket = document.getElementById("selectedMarket");
  elements.chooseAnother = document.getElementById("chooseAnother");
  elements.purchasePriceInput = document.getElementById("purchasePriceInput");
  elements.searchStatus = document.getElementById("searchStatus");
  elements.rarityFilters = document.getElementById("rarityFilters");
  elements.cardList = document.getElementById("cardList");
  elements.fxStatus = document.getElementById("fxStatus");
  elements.notification = document.getElementById("notification");
  elements.settingsInputs = {
    feeRate: document.getElementById("feeRateInput"),
    internationalShippingJpy: document.getElementById("internationalShippingInput"),
    packingCostJpy: document.getElementById("packingCostInput"),
    fxBufferRate: document.getElementById("fxBufferRateInput"),
    targetProfitJpy: document.getElementById("targetProfitInput"),
    targetRoiRate: document.getElementById("targetRoiInput")
  };
}

function bindEvents() {
  elements.searchForm.addEventListener("submit", event => {
    event.preventDefault();
    clearTimeout(state.searchTimer);
    void searchCards(elements.searchInput.value);
  });

  elements.searchInput.addEventListener("input", event => {
    state.searchSession.invalidate();
    state.searching = false;
    state.searchError = "";
    resetSelection();
    state.query = event.target.value.trim();
    state.rarityFilter = "all";
    state.resultLimit = RESULT_PAGE_SIZE;
    elements.clearSearch.hidden = !state.query;
    renderLocalResults();
    clearTimeout(state.searchTimer);
    if (state.query.length >= 2) {
      state.searchTimer = window.setTimeout(() => void searchCards(state.query), SEARCH_DELAY_MS);
    }
  });

  elements.clearSearch.addEventListener("click", () => {
    clearTimeout(state.searchTimer);
    state.searchSession.invalidate();
    state.query = "";
    state.searching = false;
    state.searchError = "";
    state.rarityFilter = "all";
    state.resultLimit = RESULT_PAGE_SIZE;
    resetSelection();
    elements.searchInput.value = "";
    elements.clearSearch.hidden = true;
    renderLocalResults();
    elements.searchInput.focus();
  });

  elements.purchasePriceInput.addEventListener("input", event => {
    state.flow = setPurchasePrice(state.flow, event.target.value);
    renderSelectedCard();
  });

  elements.cardList.addEventListener("click", event => {
    const showMoreButton = event.target.closest("button[data-show-more]");
    if (showMoreButton) {
      state.resultLimit += RESULT_PAGE_SIZE;
      renderResults();
      return;
    }
    const resetButton = event.target.closest("button[data-reset-rarity]");
    if (resetButton) {
      setRarityFilter("all");
      return;
    }
    const selectButton = event.target.closest("button[data-select-group]");
    if (!selectButton) return;
    void selectGroup(selectButton.dataset.selectGroup);
  });

  document.addEventListener("error", event => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.matches("[data-card-image]")) image.remove();
  }, true);

  elements.rarityFilters.addEventListener("click", event => {
    const button = event.target.closest("button[data-rarity-filter]");
    if (!button) return;
    setRarityFilter(button.dataset.rarityFilter);
  });

  elements.chooseAnother.addEventListener("click", () => {
    const previousGroupId = state.flow.selectedGroupId;
    resetSelection();
    renderResults();
    const previousButton = elements.cardList.querySelector(`[data-select-group="${CSS.escape(previousGroupId)}"]`);
    previousButton?.focus();
  });

  Object.entries(elements.settingsInputs).forEach(([key, input]) => {
    input.addEventListener("input", () => updateSetting(key, input.value));
  });
}

async function loadCatalog() {
  try {
    const response = await fetch("./data/latest.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    state.localCards = Array.isArray(snapshot.cards) ? snapshot.cards : [];
    applySnapshotDefaults(snapshot);
  } catch {
    state.localCards = [];
    state.searchError = "同梱価格データを読み込めませんでした";
  }
}

async function loadPokemonNames() {
  try {
    const response = await fetch("./data/pokemon-names.json", { cache: "force-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const names = await response.json();
    state.pokemonNames = names && typeof names === "object" ? names : {};
  } catch {
    state.pokemonNames = {};
  }
}

function applySnapshotDefaults(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return;
  const saved = readJson(SETTINGS_KEY, {});
  const defaults = snapshot.defaults || {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in saved) continue;
    const value = key === "usdJpyRate" ? snapshot.usdJpyRate : defaults[key];
    if (Number.isFinite(value)) state.settings[key] = value;
  }
  renderSettings();
}

function renderLocalResults() {
  const searchableCards = state.query ? [...state.localCards, ...state.cachedCards] : state.localCards;
  const localGroups = groupCatalogCards(searchableCards);
  state.resultGroups = filterCatalogGroups(localGroups, normalizeSearchText(state.query));
  applyRarityFilter();
  renderResults();
}

async function searchCards(rawQuery) {
  const query = String(rawQuery || "").normalize("NFKC").trim();
  resetSelection();
  state.rarityFilter = "all";
  state.resultLimit = RESULT_PAGE_SIZE;
  state.query = query;
  elements.searchInput.value = query;
  elements.clearSearch.hidden = !query;
  if (!query) {
    renderLocalResults();
    return;
  }

  const request = state.searchSession.begin();
  const remoteTimeout = window.setTimeout(request.abort, REMOTE_SEARCH_TIMEOUT_MS);
  state.searching = true;
  state.searchError = "";
  renderResults();

  try {
    const lookupQuery = normalizeSearchText(query);
    const tcgdexTask = searchTcgdexCards(lookupQuery, {
      signal: request.signal,
      pokemonNames: state.pokemonNames
    })
      .then(cards => ({ cards, error: null }))
      .catch(error => ({ cards: [], error }));

    const [indexResult, supplementResult] = await Promise.allSettled([
      loadTcgdexIndex(),
      loadSearchSupplements()
    ]);
    const indexedCards = indexResult.status === "fulfilled"
      ? searchTcgdexIndex(lookupQuery, indexResult.value).map(tcgdexIndexRowToCard).filter(Boolean)
      : [];
    const supplementCards = supplementResult.status === "fulfilled"
      ? searchSupplementCards(lookupQuery, supplementResult.value)
      : [];
    const localSearchCards = [...indexedCards, ...supplementCards];
    if (!state.searchSession.isCurrent(request.id)) return;
    applySearchResults(lookupQuery, localSearchCards, []);
    renderResults();

    const tcgdexResult = await tcgdexTask;
    if (!state.searchSession.isCurrent(request.id)) return;
    if (tcgdexResult.error && localSearchCards.length === 0) throw tcgdexResult.error;
    applySearchResults(
      lookupQuery,
      [...localSearchCards, ...tcgdexResult.cards],
      tcgdexResult.cards
    );
  } catch (error) {
    if (!state.searchSession.isCurrent(request.id)) return;
    state.searchError = "通信できないため、端末内のカードだけ表示しています";
    const cachedGroups = groupCatalogCards([...state.localCards, ...state.cachedCards]);
    state.resultGroups = filterCatalogGroups(cachedGroups, normalizeSearchText(query));
    applyRarityFilter();
  } finally {
    window.clearTimeout(remoteTimeout);
    if (state.searchSession.isCurrent(request.id)) {
      state.searching = false;
      renderResults();
    }
  }
}

function applySearchResults(lookupQuery, remoteCards, rememberedCards = remoteCards) {
  rememberCards(rememberedCards);
  const localMatches = filterCatalogGroups(
    groupCatalogCards([...state.localCards, ...state.cachedCards]),
    lookupQuery
  );
  state.resultGroups = mergeCatalogGroups(localMatches, remoteCards);
  applyRarityFilter();
}

function renderResults() {
  const selected = selectedGroup();
  elements.selectionPanel.hidden = !selected;
  elements.cardList.hidden = Boolean(selected);
  renderRarityFilters(Boolean(selected));

  if (selected) {
    elements.searchStatus.textContent = "1枚選択中";
    renderSelectedCard();
    return;
  }

  if (state.searching && state.resultGroups.length === 0) {
    elements.searchStatus.textContent = "検索中";
    elements.cardList.innerHTML = `<div class="loading-row"><span class="loading-dot"></span>カードを検索しています</div>`;
    return;
  }

  const page = paginateGroups(state.visibleGroups, state.resultLimit);
  const count = page.shownCount;
  const total = state.resultGroups.length;
  const filteredTotal = page.totalCount;
  const countLabel = count < filteredTotal
    ? `${count}/${filteredTotal}件表示`
    : state.rarityFilter === "all"
      ? `${count}件表示`
      : `${count}/${total}件表示`;
  if (state.searchError) {
    elements.searchStatus.textContent = state.searchError;
  } else if (state.searching) {
    elements.searchStatus.textContent = `${countLabel}・検索中`;
  } else if (state.query) {
    elements.searchStatus.textContent = total ? countLabel : "一致するカードがありません";
  } else {
    elements.searchStatus.textContent = count ? "最近の価格データ" : "カードを検索してください";
  }

  elements.cardList.innerHTML = count
    ? `${page.groups.map(searchResultHtml).join("")}${page.hasMore ? showMoreHtml(filteredTotal - count) : ""}`
    : total
      ? `<div class="empty-state">このレアリティのカードはありません<button class="empty-reset" type="button" data-reset-rarity>すべて表示</button></div>`
      : `<div class="empty-state">カード名または番号を変えて検索してください</div>`;
}

function renderRarityFilters(selected) {
  const filters = availableRarityFilters(state.resultGroups);
  const shouldShow = !selected && Boolean(state.query) && state.resultGroups.length > 0 && filters.length > 1;
  elements.rarityFilters.hidden = !shouldShow;
  if (!shouldShow) {
    elements.rarityFilters.innerHTML = "";
    return;
  }

  elements.rarityFilters.innerHTML = filters.map(filter => {
    const pressed = filter.key === state.rarityFilter;
    return `<button type="button" data-rarity-filter="${filter.key}" aria-pressed="${pressed}" aria-label="${escapeAttr(filter.accessibleLabel)}">${escapeHtml(filter.label)}</button>`;
  }).join("");
}

function setRarityFilter(filterKey) {
  const available = availableRarityFilters(state.resultGroups).some(filter => filter.key === filterKey);
  state.rarityFilter = available ? filterKey : "all";
  state.resultLimit = RESULT_PAGE_SIZE;
  applyRarityFilter();
  renderResults();
}

function applyRarityFilter() {
  state.visibleGroups = filterGroupsByRarity(state.resultGroups, state.rarityFilter);
}

function searchResultHtml(group) {
  const card = group.primary;
  const rarity = card.rarity && !card.rarity.includes("未登録") ? ` / ${escapeHtml(card.rarity)}` : "";
  return `
    <article class="result-card" data-result-group="${escapeAttr(group.id)}">
      <button
        type="button"
        class="card-select"
        data-select-group="${escapeAttr(group.id)}"
      >
        <span class="card-thumb">${cardImageHtml(card)}</span>
        <span class="card-copy">
          <span class="card-name">${escapeHtml(card.displayName)}</span>
          <span class="card-meta">${escapeHtml(card.setName || card.setCode)} ${escapeHtml(card.localNumber || "")}${rarity}・${escapeHtml(japaneseLanguage(card.language))}</span>
        </span>
        <span class="select-mark" aria-hidden="true">›</span>
      </button>
    </article>
  `;
}

function showMoreHtml(remainingCount) {
  return `<button class="show-more" type="button" data-show-more>さらに表示（残り${formatInteger(remainingCount)}件）</button>`;
}

function renderSelectedCard() {
  const group = selectedGroup();
  if (!group) return;
  const card = group.primary;
  const quotes = variantQuotesForGroup(group);
  const quoteValues = Object.values(quotes).filter(Boolean);
  const availableCount = quoteValues.length;
  const ebayCount = quoteValues.filter(quote => isProfitEligibleMarket(quote.market)).length;
  const loadingPrice = state.priceLoadingIds.has(group.id);
  const rarity = card.rarity && !card.rarity.includes("未登録") ? ` / ${escapeHtml(card.rarity)}` : "";
  const availability = ebayCount
    ? `${ebayCount}種類のeBay実売価格あり${loadingPrice ? "・更新中" : ""}`
    : availableCount
      ? `${availableCount}種類の海外参考価格あり${loadingPrice ? "・更新中" : ""}`
      : loadingPrice
        ? "価格を取得中"
        : "価格未取得";

  elements.selectedCardSummary.innerHTML = `
    <span class="selected-card-thumb">${cardImageHtml(card)}</span>
    <span class="card-copy">
      <span class="card-name">${escapeHtml(card.displayName)}</span>
      <span class="card-meta">${escapeHtml(card.setName || card.setCode)} ${escapeHtml(card.localNumber || "")}${rarity}・${escapeHtml(japaneseLanguage(card.language))}</span>
      <span class="price-availability${availableCount ? "" : " none"}">${availability}</span>
    </span>
  `;
  if (document.activeElement !== elements.purchasePriceInput) {
    elements.purchasePriceInput.value = state.flow.purchasePrice;
  }
  elements.selectedProfit.innerHTML = profitCellsHtml(quotes, loadingPrice);
  elements.selectedMarket.innerHTML = `
    <div class="variant-list" data-variant-results="${escapeAttr(group.id)}">
      ${variantDetailsHtml(quotes)}
    </div>
    ${marketLinksHtml(card)}
  `;
}

function profitCellsHtml(quotes, loadingPrice = false) {
  return ["normal", "mirror", "psa10"]
    .map(kind => profitCellHtml(kind, quotes[kind], loadingPrice))
    .join("");
}

function profitCellHtml(kind, quote, loadingPrice) {
  const label = { normal: "通常", mirror: "ミラー", psa10: "PSA10" }[kind];
  if (!quote) {
    const unavailableText = loadingPrice ? "価格取得中" : "価格未取得";
    return `<div class="profit-cell unavailable" data-profit-kind="${kind}"><span>${label}</span><strong>${unavailableText}</strong></div>`;
  }
  if (!isCalculableMarket(quote.market)) {
    return `<div class="profit-cell unavailable" data-profit-kind="${kind}"><span>${label}</span><strong>価格未取得</strong></div>`;
  }
  const decision = calculateQuoteDecision(quote, state.flow.purchasePrice);
  if (!decision?.ready) {
    return `<div class="profit-cell" data-profit-kind="${kind}"><span>${label}</span><strong>仕入れ金額を入力</strong></div>`;
  }
  const className = decision.profitJpy >= 0 ? "positive" : "negative";
  const roiText = Number.isFinite(decision.roiRate)
    ? `ROI ${(decision.roiRate * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`
    : "ROI -";
  const profitLabel = isReferencePriceMarket(quote.market) ? "参考利益" : "利益";
  return `<div class="profit-cell ${className}" data-profit-kind="${kind}"><span>${label}</span><strong>${profitLabel} ${formatSignedYen(decision.profitJpy)}</strong><small>${roiText}</small></div>`;
}

function variantDetailsHtml(quotes) {
  return ["normal", "mirror", "psa10"]
    .map(kind => variantDetailHtml(kind, quotes[kind]))
    .join("");
}

function variantDetailHtml(kind, quote) {
  const label = { normal: "通常", mirror: "ミラー", psa10: "PSA10" }[kind];
  if (!quote) {
    return `
      <div class="variant-row unavailable" data-variant="${kind}">
        <strong class="variant-name">${label}</strong>
        <span class="unavailable-copy">価格未登録</span>
      </div>
    `;
  }

  const market = quote.market;
  const saleJpy = toYen(market.salePrice, market.currency);
  const shippingJpy = toYen(market.buyerShipping, market.currency);
  const shippingText = ["market-average", "market-reference"].includes(market.dataKind)
    ? "送料収入なしで計算"
    : `送料 ${formatYen(shippingJpy)}`;
  const activityHtml = market.dataKind === "sold-comparable"
    ? `直近1か月 <strong>${formatInteger(market.sampleCount)}件</strong>売れています`
    : escapeHtml(marketActivityLabel(market));

  return `
    <div class="variant-row" data-variant="${kind}">
      <strong class="variant-name">${label}</strong>
      <div class="variant-facts">
        <span class="sale-line">${escapeHtml(marketPriceLabel(market))} ${formatYen(saleJpy)}・${shippingText}</span>
        <span class="sold-line">${activityHtml}</span>
        <span class="condition-line">${escapeHtml(japaneseCondition(market.condition))}</span>
      </div>
    </div>
  `;
}

function marketLinksHtml(card) {
  const links = marketSearchLinks(card);
  return `
    <div class="market-links" aria-label="価格を確認する">
      <a href="${escapeAttr(links.domestic)}" target="_blank" rel="noopener noreferrer">国内取引価格を確認</a>
      <a href="${escapeAttr(links.ebay)}" target="_blank" rel="noopener noreferrer">eBay実売価格を確認</a>
    </div>
  `;
}

function calculateQuoteDecision(quote, purchaseValue) {
  const validation = validatePurchasePrice(purchaseValue);
  if (!quote || !validation.ok || !isCalculableMarket(quote.market)) return null;
  return calculateSourcingDecision({
    card: { ...quote.card, market: quote.market },
    purchasePriceJpy: validation.value,
    settings: state.settings,
    now: new Date().toISOString()
  });
}

function selectedGroup() {
  return state.visibleGroups.find(group => group.id === state.flow.selectedGroupId) || null;
}

async function loadSearchSupplements() {
  if (state.supplementCards) return state.supplementCards;
  if (!state.supplementCardsPromise) {
    state.supplementCardsPromise = fetch("./data/search-supplements.json", { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(payload => {
        if (!Array.isArray(payload?.cards)) throw new Error("検索補完データが不正です");
        state.supplementCards = payload.cards;
        return state.supplementCards;
      })
      .catch(error => {
        state.supplementCardsPromise = null;
        throw error;
      });
  }
  return state.supplementCardsPromise;
}

async function loadTcgdexIndex() {
  if (state.tcgdexIndexRows) return state.tcgdexIndexRows;
  if (!state.tcgdexIndexPromise) {
    state.tcgdexIndexPromise = fetch("./data/tcgdex-ja-index.json", { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(payload => {
        const validation = validateTcgdexIndexPayload(payload);
        if (!validation.ok) throw new Error(validation.errors.join("\n"));
        state.tcgdexIndexRows = payload.cards;
        return state.tcgdexIndexRows;
      })
      .catch(error => {
        state.tcgdexIndexPromise = null;
        throw error;
      });
  }
  return state.tcgdexIndexPromise;
}

async function selectGroup(groupId) {
  const group = state.visibleGroups.find(item => item.id === groupId);
  if (!group) return;
  state.flow = selectSourcingCard(state.flow, groupId);
  elements.purchasePriceInput.value = "";
  renderResults();
  elements.purchasePriceInput.focus();
  if (needsPriceHydration(group)) await hydrateGroup(group);
}

function resetSelection() {
  state.flow = clearSourcingCard(state.flow);
  if (elements.purchasePriceInput) elements.purchasePriceInput.value = "";
}

async function hydrateGroup(group, requestId = state.searchSession.currentId()) {
  if (state.priceLoadingIds.has(group.id)) return;
  state.priceLoadingIds.add(group.id);
  renderResults();
  try {
    let detail = group.primary;
    if (detail.tcgdexId && shouldRefreshMarket(detail.market)) {
      try {
        const tcgdexDetail = await fetchTcgdexCard(detail.tcgdexId, {
          signal: state.searchSession.currentSignal(),
          language: detail.tcgdexLanguage || "ja"
        });
        if (tcgdexDetail) detail = mergeCardCache([detail], [tcgdexDetail], 1)[0] || detail;
      } catch {
        // Brief search data remains usable when the detail request fails.
      }
    }
    if (!state.searchSession.isCurrent(requestId)) return;

    if (shouldFetchPriceCharting(detail, state.priceChartingEnabled)) {
      try {
        detail = await fetchPriceChartingProduct(detail) || detail;
      } catch {
        // Existing market data remains usable when optional pricing fails.
      }
    }
    if (!state.searchSession.isCurrent(requestId)) return;
    updateGroupCard(group, detail);
    rememberCards([detail]);
  } finally {
    state.priceLoadingIds.delete(group.id);
    if (state.searchSession.isCurrent(requestId)) renderResults();
  }
}

function needsPriceHydration(group) {
  const card = group?.primary;
  return Boolean(
    card?.tcgdexId && shouldRefreshMarket(card.market)
    || shouldFetchPriceCharting(card, state.priceChartingEnabled)
  );
}

function updateGroupCard(group, card) {
  group.primary = card;
  const existingIndex = group.cards.findIndex(item => item.id === card.id);
  if (existingIndex >= 0) group.cards[existingIndex] = card;
  else group.cards.push(card);
}

async function initializePriceCharting() {
  try {
    const status = await getPriceChartingStatus();
    state.priceChartingEnabled = status.enabled;
  } catch {
    state.priceChartingEnabled = false;
  }
}

async function refreshFxRate() {
  try {
    const result = await fetchJpyRates();
    state.settings.usdJpyRate = result.USD.rate;
    state.settings.eurJpyRate = result.EUR.rate;
    state.fxDates = { USD: result.USD.date, EUR: result.EUR.date };
    state.fxSource = "自動取得";
    writeJson(FX_KEY, result);
    saveSettings();
    renderFxStatus();
    renderResults();
  } catch {
    state.fxSource = state.fxDate ? "保存レート" : "初期レート";
    renderFxStatus();
  }
}

function loadFxCache() {
  const cached = readJson(FX_KEY, null);
  if (!cached || !Number.isFinite(cached.USD?.rate) || !Number.isFinite(cached.EUR?.rate)) return;
  state.settings.usdJpyRate = cached.USD.rate;
  state.settings.eurJpyRate = cached.EUR.rate;
  state.fxDates = {
    USD: String(cached.USD.date || ""),
    EUR: String(cached.EUR.date || "")
  };
  state.fxSource = "保存レート";
}

function renderFxStatus() {
  const dates = [state.fxDates.USD, state.fxDates.EUR].filter(Boolean).sort();
  const dateLabel = dates.length ? `${formatDate(dates.at(-1))}更新` : state.fxSource;
  elements.fxStatus.textContent = `自動為替 USD/JPY ${formatRate(state.settings.usdJpyRate)}円・EUR/JPY ${formatRate(state.settings.eurJpyRate)}円（${dateLabel}）`;
}

function loadSettings() {
  const saved = readJson(SETTINGS_KEY, {});
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = Number(saved[key]);
    state.settings[key] = Number.isFinite(value) ? value : fallback;
  }
}

function renderSettings() {
  for (const [key, input] of Object.entries(elements.settingsInputs)) {
    const value = state.settings[key];
    input.value = String(key.endsWith("Rate") ? value * 100 : value);
  }
}

function updateSetting(key, rawValue) {
  let value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0) return;
  if (key.endsWith("Rate")) value /= 100;
  state.settings[key] = value;
  saveSettings();
  renderResults();
}

function saveSettings() {
  writeJson(SETTINGS_KEY, state.settings);
}

function loadCardCache() {
  const cached = readJson(CARD_CACHE_KEY, []);
  state.cachedCards = Array.isArray(cached) ? cached.filter(card => card?.id && card?.displayName).slice(0, 200) : [];
}

function rememberCards(cards) {
  state.cachedCards = mergeCardCache(state.cachedCards, cards, 200);
  writeJson(CARD_CACHE_KEY, state.cachedCards);
}

function cardImageHtml(card) {
  const url = safeImageUrl(card?.image?.url);
  return url
    ? `<span class="image-stack"><span>画像なし</span><img data-card-image src="${escapeAttr(url)}" alt="${escapeAttr(card.displayName)}" loading="lazy" referrerpolicy="no-referrer"></span>`
    : "画像なし";
}

function toYen(amount, currency) {
  if (!Number.isFinite(amount)) return null;
  if (currency === "JPY") return amount;
  if (currency === "USD") return amount * state.settings.usdJpyRate;
  if (currency === "EUR") return amount * state.settings.eurJpyRate;
  return null;
}

function formatYen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "未登録";
}

function formatSignedYen(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")}円` : "未計算";
}

function formatInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number).toLocaleString("ja-JP") : "0";
}

function formatRate(value) {
  return Number.isFinite(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits: 2 }) : "-";
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", timeZone: "UTC" }).format(date);
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showNotification("端末への保存容量が不足しています");
  }
}

function showNotification(message) {
  clearTimeout(notificationTimer);
  elements.notification.textContent = message;
  elements.notification.classList.add("visible");
  notificationTimer = window.setTimeout(() => elements.notification.classList.remove("visible"), 2600);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("./sw.js?v=20");
  } catch {
    // The app remains usable online when service worker registration is unavailable.
  }
}
