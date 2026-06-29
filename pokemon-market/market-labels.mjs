const DOMESTIC_SOURCE_PATTERN = /(?:card\s*rush|cardrush|mercari|magi|yahoo!?\s*(?:auction|japan)|カードラッシュ|メルカリ|ヤフオク)/iu;

export function marketPriceLabel(market = {}) {
  const source = String(market?.source || "").trim();
  const channel = marketPriceChannel(market);
  if (channel === "domestic") return "国内価格";
  if (channel === "ebay") return "eBay価格";
  if (/tcgplayer/iu.test(source)) return "TCGplayer価格";
  if (/cardmarket/iu.test(source)) return "Cardmarket価格";
  return "海外参考価格";
}

export function marketPriceChannel(market = {}) {
  const explicit = String(market?.channel || "").trim().toLocaleLowerCase("en-US");
  if (["domestic", "ebay", "reference"].includes(explicit)) return explicit;

  const source = String(market?.source || "").trim();
  if (DOMESTIC_SOURCE_PATTERN.test(source)) return "domestic";
  if (/ebay/iu.test(source)) return "ebay";
  return "reference";
}

export function isProfitEligibleMarket(market = {}) {
  return marketPriceChannel(market) === "ebay" && market?.dataKind === "sold-comparable";
}

export function isReferencePriceMarket(market = {}) {
  return marketPriceChannel(market) === "reference"
    && ["market-reference", "market-average", "manual-reference"].includes(market?.dataKind);
}

export function isCalculableMarket(market = {}) {
  const salePrice = Number(market?.salePrice);
  const buyerShipping = Number(market?.buyerShipping);
  const hasUsablePrice = Number.isFinite(salePrice)
    && salePrice > 0
    && Number.isFinite(buyerShipping)
    && buyerShipping >= 0;
  return hasUsablePrice && (isProfitEligibleMarket(market) || isReferencePriceMarket(market));
}

export function marketSearchLinks(card = {}) {
  const displayName = String(card?.displayName || "").normalize("NFKC").trim();
  const setCode = String(card?.setCode || "").normalize("NFKC").trim();
  const query = [displayName, setCode].filter(Boolean).join(" ");

  const domestic = new URL("https://auctions.yahoo.co.jp/closedsearch/closedsearch");
  domestic.searchParams.set("p", query);
  domestic.searchParams.set("va", query);

  const ebay = new URL("https://www.ebay.com/sch/i.html");
  ebay.searchParams.set("_nkw", `${query} Japanese Pokemon card`.trim());
  ebay.searchParams.set("_sacat", "183454");
  ebay.searchParams.set("LH_Complete", "1");
  ebay.searchParams.set("LH_Sold", "1");

  return { domestic: domestic.toString(), ebay: ebay.toString() };
}
