export const USD_JPY_ENDPOINT = "https://api.frankfurter.dev/v2/rate/USD/JPY";
export const EUR_JPY_ENDPOINT = "https://api.frankfurter.dev/v2/rate/EUR/JPY";

export async function fetchUsdJpyRate({ fetchImpl = fetch, signal } = {}) {
  return fetchJpyRate("USD", { fetchImpl, signal });
}

export async function fetchJpyRates({ fetchImpl = fetch, signal } = {}) {
  const [USD, EUR] = await Promise.all([
    fetchJpyRate("USD", { fetchImpl, signal }),
    fetchJpyRate("EUR", { fetchImpl, signal })
  ]);
  return { USD, EUR };
}

async function fetchJpyRate(base, { fetchImpl, signal }) {
  const endpoint = base === "EUR" ? EUR_JPY_ENDPOINT : USD_JPY_ENDPOINT;
  const response = await fetchImpl(endpoint, {
    headers: { Accept: "application/json" },
    signal
  });
  if (!response.ok) throw new Error(`為替レートの取得に失敗しました (${response.status})`);

  const payload = await response.json();
  const rate = Number(payload?.rate);
  const date = String(payload?.date || "");
  if (!Number.isFinite(rate) || rate < 50 || rate > 300 || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error("為替レートの応答が不正です。");
  }
  return { rate, date };
}
