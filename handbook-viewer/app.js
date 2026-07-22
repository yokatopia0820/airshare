(() => {
  const data = window.HANDBOOK_TECHNICAL_FEES;
  const searchInput = document.querySelector('#search-input');
  const resultList = document.querySelector('#result-list');
  const resultCount = document.querySelector('#result-count');
  const sourcePage = document.querySelector('#source-page');
  const pageLabel = document.querySelector('#page-label');
  const summary = document.querySelector('#selection-summary');
  const highlight = document.querySelector('#evidence-highlight');
  const filters = { mark: 'all', category: 'all' };
  let selectedKey = null;

  const normalize = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s,，円]/gu, '');
  const yen = (value) => `${Number(value).toLocaleString('ja-JP')}円`;
  const labelFor = (row) => `${row.mark === 'sharp' ? '＃' : '＄'}${row.rank}ランク`;
  const categoryLabel = (row) => row.category === 'aircon' ? 'エアコン' : row.category === 'sharp' ? '＃表・2人作業部品' : '一般製品';
  const matches = (row, query) => {
    if (!query) return true;
    const compact = normalize(query);
    const aliases = [row.rank, `${row.mark === 'sharp' ? '#' : '$'}${row.rank}`, `${row.minutes}分`, row.minutes / 60, row.xYen, row.tYen, row.standardYen]
      .map(normalize);
    return aliases.some((value) => value.includes(compact) || compact.includes(value));
  };
  const visibleRows = () => data.rows.filter((row) => (filters.mark === 'all' || row.mark === filters.mark)
    && (filters.category === 'all' || row.category === filters.category)
    && matches(row, searchInput.value));

  const rowPosition = (row) => {
    if (row.mark === 'sharp') {
      return { left: `${98 / 1323 * 100}%`, top: `${(211 + ((row.number - 1) * 28.15)) / 1871 * 100}%`, width: `${1125 / 1323 * 100}%`, height: `${28.15 / 1871 * 100}%` };
    }
    const left = row.number <= (row.category === 'general' ? 32 : 13) ? 95 : 682;
    const index = row.number <= (row.category === 'general' ? 32 : 13) ? row.number : row.number - (row.category === 'general' ? 32 : 13);
    const top = row.category === 'general' ? 203 + ((index - 1) * 31) : 1305 + ((index - 1) * 31);
    return { left: `${left / 1323 * 100}%`, top: `${top / 1871 * 100}%`, width: `${543 / 1323 * 100}%`, height: `${31 / 1871 * 100}%` };
  };
  const selectRow = (row, reveal = true) => {
    selectedKey = row.key;
    const position = rowPosition(row);
    const pdfPage = row.mark === 'sharp' ? 8 : 7;
    const printedPage = row.mark === 'sharp' ? 6 : 5;
    sourcePage.src = row.mark === 'sharp' ? './assets/fee-page-8.png' : './assets/fee-page-7.png';
    sourcePage.alt = `2026年2月サービスハンドブック PDF ${pdfPage}ページ 技術料一覧表`;
    pageLabel.textContent = `PDF ${pdfPage} / 印刷 ${printedPage}`;
    summary.textContent = `${labelFor(row)}・${categoryLabel(row)}・${row.minutes}分。原本の該当行を黄色で示しています。`;
    if (position) { Object.assign(highlight.style, position); highlight.hidden = false; }
    else highlight.hidden = true;
    render();
    if (reveal) document.querySelector('.evidence-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  };
  const render = () => {
    const rows = visibleRows();
    resultCount.value = `${rows.length} 件`;
    resultList.replaceChildren();
    if (!rows.length) { resultList.innerHTML = '<p class="empty">一致する技術料がありません。<br>ランク、時間、または金額を変えてください。</p>'; return; }
    rows.forEach((row) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `result-card${row.key === selectedKey ? ' is-selected' : ''}`;
      const fee3 = row.technicalFee3 ? `　技術料3（1人）${yen(row.technicalFee3.onePerson.standardYen)}` : '';
      button.innerHTML = `<span class="rank-badge">${labelFor(row)}</span><span><span class="result-name">${categoryLabel(row)} / ${row.minutes}分</span><span class="result-meta">無償・自己負担 ${yen(row.xYen)}　依頼元 ${yen(row.tYen)}${fee3}</span></span><span class="result-price">${yen(row.standardYen)}</span>`;
      button.addEventListener('click', () => selectRow(row));
      resultList.append(button);
    });
  };
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    const group = button.dataset.filter; filters[group] = button.dataset.value;
    document.querySelectorAll(`[data-filter="${group}"]`).forEach((item) => item.classList.toggle('is-active', item === button)); render();
  }));
  searchInput.addEventListener('input', render);
  searchInput.addEventListener('keydown', (event) => { if (event.key === 'Escape') { searchInput.value = ''; render(); searchInput.blur(); } });
  render();
  const initial = data.rows.find((row) => row.mark === 'dollar' && row.category === 'general' && row.rank === 'D');
  if (initial) selectRow(initial, false);
})();
