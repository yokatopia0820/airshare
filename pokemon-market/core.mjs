const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const DECISION_LABELS = {
  pending: "店頭価格を入力",
  buy: "買い",
  review: "確認",
  skip: "見送り"
};

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[\p{Separator}\p{Punctuation}\p{Symbol}]+/gu, "");
}

export function searchTextForCard(card) {
  const variant = card?.variant ?? {};
  const values = [
    card?.id,
    card?.displayName,
    card?.englishName,
    card?.setName,
    card?.setCode,
    card?.localNumber,
    card?.language,
    card?.rarity,
    variant.code,
    variant.label,
    variant.foil,
    variant.mirrorPattern,
    ...(Array.isArray(card?.aliases) ? card.aliases : [])
  ];

  return normalizeSearchText(values.filter(Boolean).join(" "));
}

export function marketPresentationForCard(card = {}, fallback = {}) {
  const market = card.market ?? {};
  const fallbackSource = fallback.priceSource ?? {};
  const cardSource = card.priceSource ?? {};
  const fallbackCurrent = fallback.current ?? {};
  const cardCurrent = card.current ?? {};
  const hasMarketSource = typeof market.source === "string" && market.source.trim() !== "";

  return {
    priceSource: {
      ...fallbackSource,
      ...cardSource,
      name: market.source || cardSource.name || fallbackSource.name || "Market snapshot",
      productId: cardSource.productId
        || (hasMarketSource ? card.id : fallbackSource.productId)
        || card.id
        || fallback.id
        || "",
      url: market.sourceUrl || cardSource.url || fallbackSource.url || ""
    },
    current: {
      ...fallbackCurrent,
      ...cardCurrent,
      currency: market.currency || cardCurrent.currency || fallbackCurrent.currency || "USD",
      raw: Number.isFinite(market.salePrice)
        ? market.salePrice
        : cardCurrent.raw ?? fallbackCurrent.raw ?? null,
      psa10: cardCurrent.psa10 ?? fallbackCurrent.psa10 ?? null,
      observedAt: market.observedAt || cardCurrent.observedAt || fallbackCurrent.observedAt || ""
    }
  };
}

export function validatePurchasePrice(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return { ok: false, message: "店頭価格を入力してください。" };
  }

  const purchasePriceJpy = Number(value);
  if (!Number.isFinite(purchasePriceJpy)) {
    return { ok: false, message: "有限の数値で入力してください。" };
  }
  if (purchasePriceJpy < 0) {
    return { ok: false, message: "0円以上で入力してください。" };
  }

  return { ok: true, value: purchasePriceJpy };
}

export function calculateSourcingDecision({ card, purchasePriceJpy, settings, now }) {
  const validation = validatePurchasePrice(purchasePriceJpy);
  if (!validation.ok) {
    return pendingDecision(validation.message);
  }

  const market = card.market;
  const grossSalesJpy = (market.salePrice + market.buyerShipping) * settings.usdJpyRate;
  const marketplaceFeeJpy = grossSalesJpy * settings.feeRate;
  const fxBufferJpy = grossSalesJpy * settings.fxBufferRate;
  const profitJpy = grossSalesJpy
    - marketplaceFeeJpy
    - settings.internationalShippingJpy
    - settings.packingCostJpy
    - fxBufferJpy
    - validation.value;
  const roiRate = validation.value > 0 ? profitJpy / validation.value : null;
  const derivedValues = [grossSalesJpy, marketplaceFeeJpy, fxBufferJpy, profitJpy];
  if (!derivedValues.every(Number.isFinite) || (roiRate !== null && !Number.isFinite(roiRate))) {
    return pendingDecision("価格データを確認してください。");
  }
  const reasons = decisionReasons({ card, profitJpy, roiRate, settings, now });
  const status = decisionStatus({ profitJpy, roiRate, settings, reasons });

  return {
    ready: true,
    status,
    label: DECISION_LABELS[status],
    reasons: reasons.length > 0 ? reasons : ["利益目標とROI目標を達成"],
    grossSalesJpy,
    marketplaceFeeJpy,
    fxBufferJpy,
    profitJpy,
    roiRate
  };
}

function pendingDecision(message) {
  return {
    ready: false,
    status: "pending",
    label: DECISION_LABELS.pending,
    reasons: [message],
    grossSalesJpy: null,
    marketplaceFeeJpy: null,
    fxBufferJpy: null,
    profitJpy: null,
    roiRate: null
  };
}

function decisionStatus({ profitJpy, roiRate, settings, reasons }) {
  if (profitJpy <= 0 || (roiRate !== null && roiRate <= 0)) {
    return "skip";
  }

  const targetsMet = profitJpy >= settings.targetProfitJpy
    && roiRate !== null
    && roiRate >= settings.targetRoiRate;
  return targetsMet && reasons.length === 0 ? "buy" : "review";
}

function decisionReasons({ card, profitJpy, roiRate, settings, now }) {
  if (profitJpy <= 0 || (roiRate !== null && roiRate <= 0)) {
    return skipReasons(profitJpy, roiRate);
  }

  const reasons = marketWarningReasons(card, settings, now);
  if (profitJpy < settings.targetProfitJpy) {
    reasons.push("利益目標未達");
  }
  if (roiRate === null) {
    reasons.push("仕入価格0円のためROIを算出できません");
  } else if (roiRate < settings.targetRoiRate) {
    reasons.push("ROI目標未達");
  }
  return reasons;
}

function skipReasons(profitJpy, roiRate) {
  const reasons = [];
  if (profitJpy <= 0) {
    reasons.push("利益が0円以下");
  }
  if (roiRate !== null && roiRate <= 0) {
    reasons.push("ROIが0以下");
  }
  return reasons;
}

function marketWarningReasons(card, settings, now) {
  const reasons = [];
  const market = card.market;

  if (isStale(market.observedAt, now, settings.maxAgeDays)) {
    reasons.push(`取得から${settings.maxAgeDays}日超過`);
  }
  if (market.sampleCount < settings.minimumSampleCount) {
    reasons.push(`実売${settings.minimumSampleCount}件未満`);
  }
  if (market.dataKind !== "sold-comparable") {
    reasons.push("実売比較以外の価格データ");
  }
  if (card.image?.verification !== "exact") {
    reasons.push("画像を要確認");
  }
  if (market.condition !== "Ungraded / Near Mint") {
    reasons.push("状態を要確認");
  }

  return reasons;
}

function isStale(observedAt, now, maxAgeDays) {
  const observedTime = Date.parse(observedAt);
  const nowTime = Date.parse(now);
  if (!Number.isFinite(observedTime) || !Number.isFinite(nowTime)) {
    return true;
  }

  return (nowTime - observedTime) / DAY_IN_MILLISECONDS > maxAgeDays;
}
