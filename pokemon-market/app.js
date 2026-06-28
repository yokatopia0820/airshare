import { calculateSourcingDecision, validatePurchasePrice } from "./core.mjs?v=8";
import {
  filterCatalogGroups,
  groupCatalogCards,
  japaneseCondition,
  marketActivityLabel,
  mergeCardCache,
  mergeCatalogGroups,
  shouldRefreshMarket,
  variantQuotesForGroup
} from "./catalog.mjs?v=8";
import { fetchTcgdexCard, searchTcgdexCards } from "./tcgdex.mjs?v=8";
import { fetchJpyRates } from "./fx.mjs?v=8";
import {
  fetchPriceChartingProduct,
  getPriceChartingStatus,
  shouldFetchPriceCharting
} from "./pricecharting.mjs?v=8";

const MAX_VISIBLE_RESULTS = 8;
const SEARCH_DELAY_MS = 450;
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
  visibleGroups: [],
  query: "",
  expandedGroupId: "",
  purchasePrice: "",
  settings: { ...DEFAULT_SETTINGS },
  fxDates: { USD: "", EUR: "" },
  fxSource: "初期値",
  searching: false,
  searchError: "",
  searchRequestId: 0,
  searchTimer: 0,
  searchController: null,
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
  await loadCatalog();
  renderLocalResults();
  void initializePriceCharting();
  void refreshFxRate();
  void registerServiceWorker();
}

function cacheElements() {
  elements.searchForm = document.getElementById("searchForm");
  elements.searchInput = document.getElementById("searchInput");
  elements.clearSearch = document.getElementById("clearSearch");
  elements.purchasePriceInput = document.getElementById("purchasePriceInput");
  elements.searchStatus = document.getElementById("searchStatus");
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
    state.query = event.target.value.trim();
    elements.clearSearch.hidden = !state.query;
    renderLocalResults();
    clearTimeout(state.searchTimer);
    if (state.query.length >= 2) {
      state.searchTimer = window.setTimeout(() => void searchCards(state.query), SEARCH_DELAY_MS);
    }
  });

  elements.clearSearch.addEventListener("click", () => {
    clearTimeout(state.searchTimer);
    state.searchController?.abort();
    state.query = "";
    state.searching = false;
    state.searchError = "";
    elements.searchInput.value = "";
    elements.clearSearch.hidden = true;
    renderLocalResults();
    elements.searchInput.focus();
  });

  elements.purchasePriceInput.addEventListener("input", event => {
    state.purchasePrice = event.target.value;
    renderResults();
  });

  elements.cardList.addEventListener("click", event => {
    const toggle = event.target.closest("button[data-group-id]");
    if (!toggle) return;
    toggleGroup(toggle.dataset.groupId);
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
  state.visibleGroups = filterCatalogGroups(localGroups, state.query).slice(0, MAX_VISIBLE_RESULTS);
  renderResults();
}

async function searchCards(rawQuery) {
  const query = String(rawQuery || "").normalize("NFKC").trim();
  state.query = query;
  elements.searchInput.value = query;
  elements.clearSearch.hidden = !query;
  if (!query) {
    renderLocalResults();
    return;
  }

  const requestId = ++state.searchRequestId;
  state.searchController?.abort();
  state.searchController = new AbortController();
  state.searching = true;
  state.searchError = "";
  renderResults();

  try {
    const remoteCards = await searchTcgdexCards(query, {
      signal: state.searchController.signal,
      limit: 24
    });
    if (requestId !== state.searchRequestId) return;
    rememberCards(remoteCards);

    const localMatches = filterCatalogGroups(groupCatalogCards([...state.localCards, ...state.cachedCards]), query);
    state.visibleGroups = mergeCatalogGroups(localMatches, remoteCards).slice(0, MAX_VISIBLE_RESULTS);
    if (!state.visibleGroups.some(group => group.id === state.expandedGroupId)) state.expandedGroupId = "";
  } catch (error) {
    if (error?.name === "AbortError") return;
    state.searchError = "通信できないため、端末内のカードだけ表示しています";
    const cachedGroups = groupCatalogCards([...state.localCards, ...state.cachedCards]);
    state.visibleGroups = filterCatalogGroups(cachedGroups, query).slice(0, MAX_VISIBLE_RESULTS);
  } finally {
    if (requestId === state.searchRequestId) {
      state.searching = false;
      renderResults();
      void hydrateVisiblePrices(requestId);
    }
  }
}

function renderResults() {
  if (state.searching && state.visibleGroups.length === 0) {
    elements.searchStatus.textContent = "検索中";
    elements.cardList.innerHTML = `<div class="loading-row"><span class="loading-dot"></span>カードを検索しています</div>`;
    return;
  }

  const count = state.visibleGroups.length;
  if (state.searchError) {
    elements.searchStatus.textContent = state.searchError;
  } else if (state.searching) {
    elements.searchStatus.textContent = `${count}件表示・検索中`;
  } else if (state.query) {
    elements.searchStatus.textContent = count ? `${count}件表示` : "一致するカードがありません";
  } else {
    elements.searchStatus.textContent = count ? "最近の価格データ" : "カードを検索してください";
  }

  elements.cardList.innerHTML = count
    ? state.visibleGroups.map(groupCardHtml).join("")
    : `<div class="empty-state">カード名または番号を変えて検索してください</div>`;
}

function groupCardHtml(group) {
  const card = group.primary;
  const expanded = group.id === state.expandedGroupId;
  const quotes = variantQuotesForGroup(group);
  const availableCount = Object.values(quotes).filter(Boolean).length;
  const loadingPrice = state.priceLoadingIds.has(group.id);
  const rarity = card.rarity && !card.rarity.includes("未登録") ? ` / ${escapeHtml(card.rarity)}` : "";
  return `
    <article class="result-card${expanded ? " expanded" : ""}" data-result-group="${escapeAttr(group.id)}">
      <button
        type="button"
        class="card-toggle"
        data-group-id="${escapeAttr(group.id)}"
        aria-expanded="${expanded}"
        aria-controls="calculator-${escapeAttr(group.id)}"
      >
        <span class="card-thumb">${cardImageHtml(card)}</span>
        <span class="card-copy">
          <span class="card-name">${escapeHtml(card.displayName)}</span>
          <span class="card-meta">${escapeHtml(card.setName || card.setCode)} ${escapeHtml(card.localNumber || "")}${rarity}</span>
          <span class="price-availability${availableCount ? "" : " none"}">${availableCount ? `${availableCount}種類の価格あり` : loadingPrice ? "価格を取得中" : "価格未登録"}</span>
        </span>
        <span class="toggle-mark" aria-hidden="true">⌄</span>
      </button>
      <div class="profit-strip" aria-label="種類別利益">
        ${profitCellsHtml(quotes)}
      </div>
      ${expanded ? marketDetailsHtml(group, quotes) : ""}
    </article>
  `;
}

function profitCellsHtml(quotes) {
  return ["normal", "mirror", "psa10"]
    .map(kind => profitCellHtml(kind, quotes[kind]))
    .join("");
}

function profitCellHtml(kind, quote) {
  const label = { normal: "通常", mirror: "ミラー", psa10: "PSA10" }[kind];
  if (!quote) {
    return `<div class="profit-cell unavailable" data-profit-kind="${kind}"><span>${label}</span><strong>価格未登録</strong></div>`;
  }
  const decision = calculateQuoteDecision(quote, state.purchasePrice);
  if (!decision?.ready) {
    return `<div class="profit-cell" data-profit-kind="${kind}"><span>${label}</span><strong>店頭価格を入力</strong></div>`;
  }
  const className = decision.profitJpy >= 0 ? "positive" : "negative";
  return `<div class="profit-cell ${className}" data-profit-kind="${kind}"><span>${label}</span><strong>利益 ${formatSignedYen(decision.profitJpy)}</strong></div>`;
}

function marketDetailsHtml(group, quotes) {
  return `
    <div id="calculator-${escapeAttr(group.id)}" class="card-calculator">
      <div class="variant-list" data-variant-results="${escapeAttr(group.id)}">
        ${variantDetailsHtml(quotes)}
      </div>
    </div>
  `;
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
        <span class="sale-line">販売 ${formatYen(saleJpy)}・${shippingText}</span>
        <span class="sold-line">${activityHtml}</span>
        <span class="condition-line">${escapeHtml(japaneseCondition(market.condition))}</span>
      </div>
    </div>
  `;
}

function calculateQuoteDecision(quote, purchaseValue) {
  const validation = validatePurchasePrice(purchaseValue);
  if (!quote || !validation.ok) return null;
  return calculateSourcingDecision({
    card: { ...quote.card, market: quote.market },
    purchasePriceJpy: validation.value,
    settings: state.settings,
    now: new Date().toISOString()
  });
}

function toggleGroup(groupId) {
  state.expandedGroupId = state.expandedGroupId === groupId ? "" : groupId;
  renderResults();
  const group = state.visibleGroups.find(item => item.id === groupId);
  if (state.expandedGroupId && needsPriceHydration(group)) {
    void hydrateGroup(group);
  }
}

async function hydrateVisiblePrices(requestId) {
  const queue = state.visibleGroups
    .filter(needsPriceHydration)
    .slice(0, 6);
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length && requestId === state.searchRequestId) {
      const group = queue[cursor++];
      await hydrateGroup(group, requestId);
    }
  };
  await Promise.all([worker(), worker()]);
}

async function hydrateGroup(group, requestId = state.searchRequestId) {
  if (state.priceLoadingIds.has(group.id)) return;
  state.priceLoadingIds.add(group.id);
  renderResults();
  try {
    let detail = group.primary;
    if (detail.tcgdexId && shouldRefreshMarket(detail.market)) {
      try {
        const tcgdexDetail = await fetchTcgdexCard(detail.tcgdexId, {
          signal: state.searchController?.signal
        });
        if (tcgdexDetail) detail = { ...detail, ...tcgdexDetail };
      } catch {
        // Brief search data remains usable when the detail request fails.
      }
    }
    if (requestId !== state.searchRequestId) return;

    if (shouldFetchPriceCharting(detail, state.priceChartingEnabled)) {
      try {
        detail = await fetchPriceChartingProduct(detail) || detail;
      } catch {
        // Existing market data remains usable when optional pricing fails.
      }
    }
    if (requestId !== state.searchRequestId) return;
    updateGroupCard(group, detail);
    rememberCards([detail]);
  } finally {
    state.priceLoadingIds.delete(group.id);
    if (requestId === state.searchRequestId) renderResults();
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
    if (status.enabled) void hydrateVisiblePrices(state.searchRequestId);
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
    ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(card.displayName)}" loading="lazy">`
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
    await navigator.serviceWorker.register("./sw.js?v=8");
  } catch {
    // The app remains usable online when service worker registration is unavailable.
  }
}
