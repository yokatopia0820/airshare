import { marketPriceChannel } from "./market-labels.mjs";

const STATUS_MESSAGES = Object.freeze({
  collecting: "価格データを収集中です",
  "no-results": "取引履歴を確認できませんでした",
  "external-only": "国内相場は外部サイトで確認できます",
  unavailable: "価格サービスに接続できませんでした",
  "not-configured": "価格の自動取得は未接続です"
});

function numericPrice(market) {
  const price = Number(market?.salePrice);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function observedTime(market) {
  const timestamp = Date.parse(String(market?.observedAt || market?.updatedAt || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function latestMarket(markets, channel) {
  return markets
    .filter((market) => marketPriceChannel(market) === channel && numericPrice(market) !== null)
    .sort((left, right) => observedTime(right) - observedTime(left))[0] || null;
}

function sourceDisplayName(market) {
  const source = String(market?.source || "").trim();
  if (/pricecharting/iu.test(source)) return "PriceCharting";
  if (/tcgplayer/iu.test(source)) return "TCGplayer";
  if (/cardmarket/iu.test(source)) return "Cardmarket";
  return source;
}

function laneFor(market, status, message) {
  if (market) return { status: "available", message: "", market };
  return {
    status,
    message: message || STATUS_MESSAGES[status] || STATUS_MESSAGES.collecting,
    market: null
  };
}

function allMarkets(group) {
  return (Array.isArray(group?.cards) ? group.cards : [])
    .flatMap((card) => [
      ...(Array.isArray(card?.markets) ? card.markets : []),
      ...(card?.market ? [card.market] : [])
    ])
    .filter(Boolean);
}

function historyForMarkets(group, markets) {
  const cards = Array.isArray(group?.cards) ? group.cards : [];
  for (const market of markets.filter(Boolean)) {
    if (Array.isArray(market.history) && market.history.length) return market.history;
    const owner = cards.find((card) => card?.market === market || card?.markets?.includes(market));
    if (Array.isArray(owner?.marketHistory) && owner.marketHistory.length) return owner.marketHistory;
    if (Array.isArray(owner?.history) && owner.history.length) return owner.history;
  }
  return [];
}

export function buildMarketEvidence(group = {}, options = {}) {
  const markets = allMarkets(group);
  const loading = Boolean(options.loading);
  const providerState = options.providerState || {};
  const ebay = latestMarket(markets, "ebay");
  const domestic = latestMarket(markets, "domestic");
  const reference = latestMarket(markets, "reference");
  const referenceFallback = loading ? "collecting" : null;
  const observed = markets
    .map((market) => String(market?.observedAt || market?.updatedAt || ""))
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));

  return {
    lanes: {
      ebay: laneFor(
        ebay,
        providerState.ebay || "not-configured",
        providerState.ebay === "collecting" ? STATUS_MESSAGES.collecting : "eBay Sold自動取得は未接続です"
      ),
      domestic: laneFor(
        domestic,
        providerState.domestic || "external-only",
        STATUS_MESSAGES[providerState.domestic || "external-only"]
      ),
      reference: laneFor(
        reference,
        referenceFallback || providerState.reference || "no-results",
        referenceFallback ? STATUS_MESSAGES.collecting : (
          providerState.reference === "unavailable"
            ? STATUS_MESSAGES.unavailable
            : "価格データを収集中です"
        )
      )
    },
    trend: trendFromHistory(historyForMarkets(group, [ebay, domestic, reference])),
    updatedAt: observed[0] || "",
    sources: [...new Set([ebay, domestic, reference]
      .map(sourceDisplayName)
      .filter(Boolean))]
  };
}

export function trendFromHistory(history = []) {
  const points = history
    .map((entry) => ({
      date: String(entry?.date || entry?.observedAt || entry?.updatedAt || ""),
      price: Number(entry?.price ?? entry?.salePrice ?? entry?.raw)
    }))
    .filter((entry) => Number.isFinite(Date.parse(entry.date)) && Number.isFinite(entry.price) && entry.price > 0)
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  if (points.length < 2) {
    return {
      status: "collecting",
      message: "価格推移を収集中です",
      changeRate: null,
      values: points.map((entry) => entry.price)
    };
  }

  const first = points[0].price;
  const last = points.at(-1).price;
  return {
    status: "available",
    message: "",
    changeRate: Number(((last - first) / first).toFixed(4)),
    values: points.map((entry) => entry.price)
  };
}

export function sparklinePoints(values = [], options = {}) {
  const width = Number(options.width) || 120;
  const height = Number(options.height) || 46;
  const padding = Number(options.padding) || 2;
  const usable = values.map(Number).filter(Number.isFinite);
  if (!usable.length) return "";

  const minimum = Math.min(...usable);
  const maximum = Math.max(...usable);
  const range = maximum - minimum;
  const xSpan = width - (padding * 2);
  const ySpan = height - (padding * 2);
  return usable.map((value, index) => {
    const x = usable.length === 1 ? padding : padding + ((xSpan * index) / (usable.length - 1));
    const y = range === 0 ? height / 2 : (height - padding) - (((value - minimum) / range) * ySpan);
    return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
  }).join(" ");
}
