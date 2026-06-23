"use strict";

const SOURCES = [
  {
    name: "PriceCharting",
    role: "主軸",
    url: "https://www.pricecharting.com/category/pokemon-cards",
    summary: "通常価格、PSA10、売買履歴、同名バリアントの分離に強い。APIは現行価格向けで、履歴は自前保存が必要。"
  },
  {
    name: "TCGdex",
    role: "カード識別",
    url: "https://tcgdex.dev/",
    summary: "日本語カードのID、セット、ローカル番号、画像URLを取得しやすい。相場は主用途ではない。"
  },
  {
    name: "PSA APR",
    role: "PSA検算",
    url: "https://www.psacard.com/auctionprices",
    summary: "PSA鑑定品のオークション実績確認に使う。通常価格は別ソースで確認する。"
  },
  {
    name: "magi / Card Rush / TCGPlayer",
    role: "地域検算",
    url: "https://en.magi.camp/categories/200/items",
    summary: "日本円の販売・買取や出品感を確認する補助。履歴・状態差・送料を混同しない。"
  }
];

const INITIAL_CARDS = [
  {
    id: "pc:pokemon-base-set:charizard-4:unlimited-holo",
    displayName: "Charizard",
    japaneseName: "リザードン",
    setName: "Pokemon Base Set",
    setCode: "base1",
    localNumber: "4/102",
    language: "English",
    rarity: "Holo Rare",
    variant: {
      code: "standard_holo",
      label: "通常ホロ",
      foil: "Holo",
      mirrorPattern: "none"
    },
    image: {
      url: "https://images.pokemontcg.io/base1/4_hires.png",
      verification: "exact",
      note: "Pokemon TCG APIのBase Set #4画像。"
    },
    priceSource: {
      name: "PriceCharting",
      productId: "pokemon-base-set/charizard-4",
      url: "https://www.pricecharting.com/game/pokemon-base-set/charizard-4"
    },
    current: {
      currency: "USD",
      raw: 356.75,
      psa10: 30100,
      observedAt: "2026-06-22"
    },
    history: [
      { date: "2025-05-14", raw: 665.00, psa10: 10000.00 },
      { date: "2025-09-26", raw: 765.00, psa10: 18000.00 },
      { date: "2026-03-24", raw: 420.00, psa10: 13900.00 },
      { date: "2026-06-15", raw: 419.00, psa10: null },
      { date: "2026-06-19", raw: 400.00, psa10: null },
      { date: "2026-06-21", raw: 330.00, psa10: null },
      { date: "2026-06-22", raw: 356.75, psa10: 30100.00 }
    ],
    notes: [
      "Base Set #4は状態差が大きく、通常価格はNear Mintだけではありません。",
      "PSA10は直近の売買点が少ないため、最新の現行値と過去売買を分けて見る必要があります。"
    ]
  },
  {
    id: "pc:jp-sv2a:gengar-094:rare",
    displayName: "ゲンガー",
    japaneseName: "Gengar",
    setName: "ポケモンカード151",
    setCode: "SV2a",
    localNumber: "094/165",
    language: "Japanese",
    rarity: "Rare",
    variant: {
      code: "standard_rare",
      label: "通常R",
      foil: "Rare",
      mirrorPattern: "none"
    },
    image: {
      url: "https://assets.tcgdex.net/ja/SV/SV2a/094/high.webp",
      verification: "exact",
      note: "TCGdexのSV2a-094画像。"
    },
    priceSource: {
      name: "PriceCharting",
      productId: "pokemon-japanese-scarlet-&-violet-151/gengar-94",
      url: "https://www.pricecharting.com/game/pokemon-japanese-scarlet-%26-violet-151/gengar-94"
    },
    current: {
      currency: "USD",
      raw: 3.56,
      psa10: 123.49,
      observedAt: "2026-06-22"
    },
    history: [
      { date: "2026-04-29", raw: 3.80, psa10: 108.00 },
      { date: "2026-05-08", raw: 4.70, psa10: 120.50 },
      { date: "2026-05-18", raw: 3.90, psa10: 124.48 },
      { date: "2026-05-28", raw: 4.00, psa10: null },
      { date: "2026-06-10", raw: 4.99, psa10: null },
      { date: "2026-06-18", raw: 3.99, psa10: null },
      { date: "2026-06-22", raw: 3.56, psa10: 123.49 }
    ],
    notes: [
      "同じ094/165でも、Poke Ball PatternやMaster Ball Patternとは別カードとして扱います。",
      "通常Rの売買履歴にミラー表記が混ざる場合は除外対象にします。"
    ]
  },
  {
    id: "pc:jp-sv2a:gengar-094:master-ball",
    displayName: "ゲンガー",
    japaneseName: "Gengar",
    setName: "ポケモンカード151",
    setCode: "SV2a",
    localNumber: "094/165",
    language: "Japanese",
    rarity: "Rare",
    variant: {
      code: "master_ball_mirror",
      label: "マスターボールミラー",
      foil: "Reverse Holo",
      mirrorPattern: "Master Ball"
    },
    image: {
      url: "https://assets.tcgdex.net/ja/SV/SV2a/094/high.webp",
      verification: "base-art-with-variant-overlay",
      note: "TCGdexの通常画像にUI上のMaster Ball表示を重ねた仮表示。量産時は相場元または権利確認済みの実写画像に差し替え。"
    },
    priceSource: {
      name: "PriceCharting",
      productId: "pokemon-japanese-scarlet-&-violet-151/gengar-master-ball-94",
      url: "https://www.pricecharting.com/game/pokemon-japanese-scarlet-%26-violet-151/gengar-master-ball-94"
    },
    current: {
      currency: "USD",
      raw: 580.00,
      psa10: 1075.00,
      observedAt: "2026-06-22"
    },
    history: [
      { date: "2026-04-19", raw: 496.90, psa10: 1075.00 },
      { date: "2026-04-24", raw: 455.00, psa10: 1150.00 },
      { date: "2026-05-07", raw: 500.00, psa10: 1100.00 },
      { date: "2026-05-14", raw: 616.00, psa10: 960.00 },
      { date: "2026-05-30", raw: 525.00, psa10: 910.00 },
      { date: "2026-06-11", raw: null, psa10: 1100.00 },
      { date: "2026-06-21", raw: 669.00, psa10: null },
      { date: "2026-06-22", raw: 580.00, psa10: 1075.00 }
    ],
    notes: [
      "PriceCharting上で通常ゲンガーとは別ページ、別Product IDです。",
      "画像は混同防止のためMaster Ballバッジを表示しますが、現時点では正規のミラー実写画像としては未検証です。"
    ]
  }
];

const state = {
  cards: INITIAL_CARDS,
  selectedId: INITIAL_CARDS[2].id,
  query: "",
  filter: "all"
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  renderSources();
  render();
});

function cacheElements() {
  elements.cardCount = document.getElementById("cardCount");
  elements.searchInput = document.getElementById("searchInput");
  elements.cardList = document.getElementById("cardList");
  elements.cardDetail = document.getElementById("cardDetail");
  elements.priceChart = document.getElementById("priceChart");
  elements.historyTable = document.getElementById("historyTable");
  elements.validationList = document.getElementById("validationList");
  elements.sourceList = document.getElementById("sourceList");
  elements.catalogImport = document.getElementById("catalogImport");
}

function bindEvents() {
  elements.searchInput.addEventListener("input", event => {
    state.query = event.target.value.trim().toLowerCase();
    renderList();
  });

  document.querySelectorAll(".filter-button").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-button").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      renderList();
    });
  });

  elements.catalogImport.addEventListener("change", importCatalog);
}

function render() {
  renderList();
  renderSelectedCard();
  renderValidation();
}

function renderList() {
  const cards = filteredCards();
  elements.cardCount.textContent = String(cards.length);
  elements.cardList.innerHTML = cards.length
    ? cards.map(cardButtonHtml).join("")
    : `<div class="empty-state">該当するカードがありません。</div>`;

  elements.cardList.querySelectorAll("button[data-card-id]").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.cardId;
      renderSelectedCard();
      renderList();
    });
  });
}

function filteredCards() {
  return state.cards.filter(card => {
    const queryTarget = [
      card.displayName,
      card.japaneseName,
      card.setName,
      card.setCode,
      card.localNumber,
      card.rarity,
      card.variant.label,
      card.variant.code,
      card.priceSource.productId
    ].join(" ").toLowerCase();
    const matchesQuery = !state.query || queryTarget.includes(state.query);
    const matchesFilter = state.filter === "all"
      || (state.filter === "standard" && card.variant.mirrorPattern === "none")
      || (state.filter === "mirror" && card.variant.mirrorPattern !== "none")
      || (state.filter === "psa" && Number.isFinite(card.current.psa10));
    return matchesQuery && matchesFilter;
  });
}

function cardButtonHtml(card) {
  const active = card.id === state.selectedId ? " active" : "";
  const master = card.variant.code.includes("master") ? " master" : "";
  return `
    <button type="button" class="card-button${active}" data-card-id="${escapeAttr(card.id)}">
      <span class="thumb">${thumbnailHtml(card)}</span>
      <span>
        <span class="card-title">${escapeHtml(card.displayName)}</span>
        <span class="card-meta">${escapeHtml(card.setCode)} ${escapeHtml(card.localNumber)} / ${escapeHtml(card.rarity)}</span>
        <span class="card-price-line">
          <span class="variant-pill${master}">${escapeHtml(card.variant.label)}</span>
          <span>通常 ${formatCurrency(card.current.raw, card.current.currency)}</span>
          <span>PSA10 ${formatCurrency(card.current.psa10, card.current.currency)}</span>
        </span>
      </span>
    </button>
  `;
}

function thumbnailHtml(card) {
  const imageUrl = safeUrl(card.image.url);
  if (!imageUrl) return "NO IMG";
  return `<img src="${escapeAttr(imageUrl)}" alt="" loading="lazy">`;
}

function renderSelectedCard() {
  const selected = state.cards.find(card => card.id === state.selectedId) || state.cards[0];
  if (!selected) {
    elements.cardDetail.innerHTML = `<div class="empty-state">表示できるカードがありません。</div>`;
    elements.priceChart.innerHTML = "";
    elements.historyTable.innerHTML = "";
    return;
  }
  state.selectedId = selected.id;
  renderDetail(selected);
  renderChart(selected);
  renderHistoryTable(selected);
}

function renderDetail(card) {
  const masterClass = card.variant.code.includes("master") ? " master" : "";
  const imageClass = card.variant.code.includes("master") ? " card-image foil-master" : " card-image";
  const imageUrl = safeUrl(card.image.url);
  const priceUrl = safeUrl(card.priceSource.url);
  elements.cardDetail.innerHTML = `
    <article class="card-overview">
      <div class="${imageClass.trim()}">
        ${imageUrl ? `<img id="mainCardImage" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(card.displayName)} ${escapeAttr(card.localNumber)}">` : ""}
        <div class="image-fallback">画像未設定</div>
        <span class="image-badge">${escapeHtml(card.image.note)}</span>
      </div>
      <div class="detail-main">
        <div class="title-row">
          <div>
            <h2 class="detail-title">${escapeHtml(card.displayName)}</h2>
            <p class="detail-subtitle">${escapeHtml(card.setName)} / ${escapeHtml(card.localNumber)} / ${escapeHtml(card.language)}</p>
          </div>
          <span class="variant-pill${masterClass}">${escapeHtml(card.variant.label)}</span>
        </div>

        <div class="price-grid">
          <div class="price-box">
            <p class="price-label">通常価格</p>
            <p class="price-value">${formatCurrency(card.current.raw, card.current.currency)}</p>
            <p class="small-copy">${escapeHtml(card.current.observedAt)} 時点 / ${escapeHtml(card.priceSource.name)}</p>
          </div>
          <div class="price-box">
            <p class="price-label">PSA10</p>
            <p class="price-value">${formatCurrency(card.current.psa10, card.current.currency)}</p>
            <p class="small-copy">${escapeHtml(card.current.observedAt)} 時点 / ${escapeHtml(card.priceSource.name)}</p>
          </div>
        </div>

        <div class="identity-grid">
          ${identityRow("正規キー", card.id)}
          ${identityRow("相場元ID", card.priceSource.productId)}
          ${identityRow("セット", `${card.setName} (${card.setCode})`)}
          ${identityRow("番号", card.localNumber)}
          ${identityRow("レアリティ", card.rarity)}
          ${identityRow("ミラー種別", card.variant.mirrorPattern)}
          ${identityRow("画像検証", card.image.verification)}
          ${identityRow("状態", card.variant.foil)}
        </div>

        <div class="notes">
          ${card.notes.map(note => `<p>${escapeHtml(note)}</p>`).join("")}
        </div>

        <div class="source-link-row">
          ${priceUrl ? `<a class="source-link" href="${escapeAttr(priceUrl)}" target="_blank" rel="noopener noreferrer">PriceChartingを開く</a>` : ""}
          ${imageUrl ? `<a class="source-link" href="${escapeAttr(imageUrl)}" target="_blank" rel="noopener noreferrer">画像URLを開く</a>` : ""}
        </div>
      </div>
    </article>
  `;

  const image = document.getElementById("mainCardImage");
  if (image) {
    image.addEventListener("error", () => {
      image.remove();
      const frame = elements.cardDetail.querySelector(".card-image");
      frame?.classList.add("image-missing");
    });
  }
}

function identityRow(label, value) {
  return `<div class="identity-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value || "-")}</span></div>`;
}

function renderChart(card) {
  const rawSeries = card.history.filter(point => Number.isFinite(point.raw));
  const psaSeries = card.history.filter(point => Number.isFinite(point.psa10));
  if (rawSeries.length < 2 && psaSeries.length < 2) {
    elements.priceChart.innerHTML = `<div class="empty-state">線グラフに必要な履歴が不足しています。</div>`;
    return;
  }

  const width = 820;
  const height = 320;
  const pad = { top: 24, right: 82, bottom: 48, left: 82 };
  const plot = {
    x1: pad.left,
    x2: width - pad.right,
    y1: pad.top,
    y2: height - pad.bottom
  };

  const allDates = card.history.map(point => new Date(`${point.date}T00:00:00`).getTime());
  const minDate = Math.min(...allDates);
  const maxDate = Math.max(...allDates);
  const rawDomain = valueDomain(rawSeries.map(point => point.raw));
  const psaDomain = valueDomain(psaSeries.map(point => point.psa10));

  const scaleX = date => {
    if (maxDate === minDate) return (plot.x1 + plot.x2) / 2;
    return plot.x1 + ((new Date(`${date}T00:00:00`).getTime() - minDate) / (maxDate - minDate)) * (plot.x2 - plot.x1);
  };
  const scaleRawY = value => scaleY(value, rawDomain, plot);
  const scalePsaY = value => scaleY(value, psaDomain, plot);

  const rawPath = linePath(rawSeries, scaleX, point => scaleRawY(point.raw));
  const psaPath = linePath(psaSeries, scaleX, point => scalePsaY(point.psa10));
  const xTicks = dateTicks(card.history);

  elements.priceChart.innerHTML = `
    <svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(card.displayName)}の通常価格とPSA10価格推移">
      ${[0, .25, .5, .75, 1].map(step => {
        const y = plot.y2 - step * (plot.y2 - plot.y1);
        const rawValue = rawDomain.min + step * (rawDomain.max - rawDomain.min);
        const psaValue = psaDomain.min + step * (psaDomain.max - psaDomain.min);
        return `
          <line class="grid-line" x1="${plot.x1}" y1="${y}" x2="${plot.x2}" y2="${y}"></line>
          <text class="tick-label" x="${plot.x1 - 10}" y="${y + 4}" text-anchor="end">${escapeHtml(formatCompact(rawValue, card.current.currency))}</text>
          <text class="tick-label" x="${plot.x2 + 10}" y="${y + 4}">${escapeHtml(formatCompact(psaValue, card.current.currency))}</text>
        `;
      }).join("")}
      <line class="axis-line" x1="${plot.x1}" y1="${plot.y1}" x2="${plot.x1}" y2="${plot.y2}"></line>
      <line class="axis-line" x1="${plot.x2}" y1="${plot.y1}" x2="${plot.x2}" y2="${plot.y2}"></line>
      <line class="axis-line" x1="${plot.x1}" y1="${plot.y2}" x2="${plot.x2}" y2="${plot.y2}"></line>
      ${xTicks.map(point => {
        const x = scaleX(point.date);
        return `<text class="tick-label" x="${x}" y="${height - 18}" text-anchor="middle">${escapeHtml(shortDate(point.date))}</text>`;
      }).join("")}
      <text class="axis-label" x="${plot.x1}" y="18">通常価格</text>
      <text class="axis-label" x="${plot.x2}" y="18" text-anchor="end">PSA10</text>
      <path class="line-raw" d="${rawPath}"></path>
      <path class="line-psa" d="${psaPath}"></path>
      ${rawSeries.map(point => `<circle class="point-raw" cx="${scaleX(point.date)}" cy="${scaleRawY(point.raw)}" r="4"><title>${point.date} 通常 ${formatCurrency(point.raw, card.current.currency)}</title></circle>`).join("")}
      ${psaSeries.map(point => `<circle class="point-psa" cx="${scaleX(point.date)}" cy="${scalePsaY(point.psa10)}" r="4"><title>${point.date} PSA10 ${formatCurrency(point.psa10, card.current.currency)}</title></circle>`).join("")}
    </svg>
  `;
}

function renderHistoryTable(card) {
  const rows = [...card.history].sort((a, b) => b.date.localeCompare(a.date));
  elements.historyTable.innerHTML = `
    <table class="history-table">
      <thead>
        <tr>
          <th>日付</th>
          <th>通常価格</th>
          <th>PSA10</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(point => `
          <tr>
            <td>${escapeHtml(point.date)}</td>
            <td>${formatCurrency(point.raw, card.current.currency)}</td>
            <td>${formatCurrency(point.psa10, card.current.currency)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function valueDomain(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { min: 0, max: 1 };
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    min = Math.max(0, min - 1);
    max += 1;
  }
  const padding = (max - min) * .12;
  return { min: Math.max(0, min - padding), max: max + padding };
}

function scaleY(value, domain, plot) {
  return plot.y2 - ((value - domain.min) / (domain.max - domain.min)) * (plot.y2 - plot.y1);
}

function linePath(series, scaleX, scaleYForPoint) {
  return series
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${scaleX(point.date).toFixed(1)} ${scaleYForPoint(point).toFixed(1)}`;
    })
    .join(" ");
}

function dateTicks(history) {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length <= 3) return sorted;
  return [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
}

function renderValidation() {
  const results = validateCards(state.cards);
  elements.validationList.innerHTML = results.map(item => `
    <div class="validation-item ${item.level}">
      <div class="validation-title">${escapeHtml(item.title)}</div>
      <div class="validation-copy">${escapeHtml(item.copy)}</div>
    </div>
  `).join("");
}

function validateCards(cards) {
  const results = [];
  const ids = new Set();
  const identityKeys = new Set();
  let duplicateIdCount = 0;
  let duplicateIdentityCount = 0;
  let imageWarnings = 0;
  let missingHistory = 0;

  cards.forEach(card => {
    if (ids.has(card.id)) duplicateIdCount += 1;
    ids.add(card.id);

    const identityKey = [
      card.setCode,
      card.localNumber,
      card.language,
      card.rarity,
      card.variant?.code,
      card.priceSource?.productId
    ].join("|");
    if (identityKeys.has(identityKey)) duplicateIdentityCount += 1;
    identityKeys.add(identityKey);

    if (!card.image?.url || card.image.verification !== "exact") imageWarnings += 1;
    if (!Array.isArray(card.history) || card.history.length < 2) missingHistory += 1;
  });

  results.push({
    level: duplicateIdCount ? "warn" : "good",
    title: "正規キー重複",
    copy: duplicateIdCount ? `${duplicateIdCount}件のID重複があります。` : "ID重複はありません。"
  });
  results.push({
    level: duplicateIdentityCount ? "warn" : "good",
    title: "バリアント分類",
    copy: duplicateIdentityCount ? `${duplicateIdentityCount}件の分類衝突があります。` : "セット、番号、言語、レアリティ、ミラー種別、相場元IDで分離済みです。"
  });
  results.push({
    level: imageWarnings ? "warn" : "good",
    title: "画像検証",
    copy: imageWarnings ? `${imageWarnings}件は完全な実写/ミラー画像として未検証です。` : "全カードの画像がexact扱いです。"
  });
  results.push({
    level: missingHistory ? "warn" : "good",
    title: "履歴データ",
    copy: missingHistory ? `${missingHistory}件は線グラフに必要な履歴が不足しています。` : "全カードに複数時点の履歴があります。"
  });

  return results;
}

function renderSources() {
  elements.sourceList.innerHTML = SOURCES.map(source => `
    <div class="source-card">
      <div>
        <h3>${escapeHtml(source.name)} <span class="status-pill">${escapeHtml(source.role)}</span></h3>
        <div class="source-copy">${escapeHtml(source.summary)}</div>
      </div>
      <a href="${escapeAttr(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">開く</a>
    </div>
  `).join("");
}

async function importCatalog(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const cards = Array.isArray(parsed) ? parsed : parsed.cards;
    if (!Array.isArray(cards)) {
      throw new Error("JSONは配列、または { cards: [...] } 形式にしてください。");
    }
    state.cards = cards;
    state.selectedId = cards[0]?.id || "";
    state.query = "";
    elements.searchInput.value = "";
    render();
  } catch (error) {
    alert(`読み込みに失敗しました: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function formatCurrency(value, currency) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(value);
}

function formatCompact(value, currency) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function shortDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit" }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""), location.href);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return "";
  }
  return "";
}
