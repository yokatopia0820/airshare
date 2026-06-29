import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const edgePath = process.env.EDGE_PATH
  || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const pageUrl = process.env.PAGE_URL || "http://127.0.0.1:4174/?verify=store-ui";
const screenshotDir = process.env.VERIFY_SCREENSHOT_DIR
  ? path.resolve(process.env.VERIFY_SCREENSHOT_DIR)
  : "";

const viewports = [
  { name: "mobile-375", width: 375, height: 812, mobile: true },
  { name: "mobile-390", width: 390, height: 844, mobile: true },
  { name: "mobile-430", width: 430, height: 932, mobile: true },
  { name: "desktop-1365", width: 1365, height: 768, mobile: false }
];

const unwantedSelectors = [
  "#catalogImport",
  ".filter-row",
  "#candidateNote",
  "#saveCandidate",
  ".candidate-section",
  ".chart-section",
  ".source-panel",
  ".advanced-settings"
];

async function main() {
  const requested = process.env.VERIFY_VIEWPORT;
  const active = requested ? viewports.filter(item => item.name === requested) : viewports;
  assert.ok(active.length > 0, `Unknown VERIFY_VIEWPORT: ${requested}`);

  const results = [];
  for (const viewport of active) {
    console.log(`[verify] ${viewport.name} ${viewport.width}x${viewport.height}`);
    const result = await runViewport(viewport);
    validateResult(result);
    results.push(result);
  }

  console.log(JSON.stringify(results, null, 2));
  console.log(`[verify] PASS (${results.length} viewports)`);
}

async function runViewport(viewport) {
  const port = await reservePort();
  const userDataDir = path.join(tmpdir(), `pokemon-market-store-${process.pid}-${viewport.name}`);
  let browser;
  let client;

  await rm(userDataDir, { recursive: true, force: true });
  try {
    browser = spawn(edgePath, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--window-size=${viewport.width},${viewport.height}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ], { stdio: ["ignore", "ignore", "ignore"] });
    browser.unref();

    const wsUrl = await waitForWebSocket(port);
    client = await createCdpClient(wsUrl);
    await enableDomains(client);
    await emulateViewport(client, viewport);
    await navigate(client, pageUrl);
    await waitForCondition(client, "document.querySelectorAll('.result-card').length >= 2", 8_000, "initial cards");

    await submitSearch(client, "かすみ");
    await waitForCondition(client, "document.querySelectorAll('.result-card').length >= 2", 10_000, "hiragana card results");
    const kasumi = await inspectKasumiResults(client);
    if (screenshotDir) await captureScreenshot(client, `${viewport.name}-kasumi-results`);

    await client.evaluate(`document.querySelector('[data-rarity-filter="premium"]').click()`);
    await waitForCondition(client, "document.querySelector('#searchStatus').textContent.includes('/')", 3_000, "rarity filter");
    const rarityStatus = await client.evaluate(`document.querySelector('#searchStatus').textContent`);
    await client.evaluate(`document.querySelector('[data-rarity-filter="all"]').click()`);

    await client.evaluate(`(() => {
      const card = [...document.querySelectorAll('.result-card')]
        .find(item => item.querySelector('.card-name')?.textContent === 'カスミのおねがい');
      card?.querySelector('.card-select')?.click();
    })()`);
    await waitForCondition(client, "!document.querySelector('#selectionPanel').hidden", 3_000, "selected Kasumi card");
    await setPurchasePrice(client, "500");
    const selectedKasumi = await inspectSelectedCard(client);

    await submitSearch(client, "ゲンガー 094");
    await waitForCondition(client, "document.querySelectorAll('.result-card').length === 1", 5_000, "reference price card");
    await client.evaluate(`document.querySelector('.result-card .card-select').click()`);
    await waitForCondition(client, "!document.querySelector('#selectionPanel').hidden", 3_000, "selected reference card");
    await waitForCondition(client, "document.querySelector('.card-calculator').textContent.includes('海外参考価格')", 5_000, "reference price label");
    await setPurchasePrice(client, "500");

    const result = await inspectPage(client, viewport);
    result.kasumi = kasumi;
    result.rarityStatus = rarityStatus;
    result.selectedKasumi = selectedKasumi;
    result.screenshotPath = await captureScreenshot(client, viewport.name);
    result.errors = [...new Set([
      ...client.diagnostics.errors,
      ...client.diagnostics.sameOriginFailures
    ])];
    return result;
  } finally {
    if (client) await client.close();
    await stopBrowser(browser);
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function inspectPage(client, viewport) {
  const unwanted = JSON.stringify(unwantedSelectors);
  return client.evaluate(`(() => {
    const root = document.documentElement;
    const selected = document.querySelector("#selectionPanel");
    const profits = [...selected.querySelectorAll("[data-profit-kind]")].map(item => ({
      kind: item.dataset.profitKind,
      text: item.textContent.replace(/\\s+/g, " ").trim()
    }));
    const visibleTargets = [...document.querySelectorAll("button, input, summary")]
      .filter(item => item.getClientRects().length > 0)
      .map(item => ({
        label: item.getAttribute("aria-label") || item.textContent.trim() || item.id,
        width: item.getBoundingClientRect().width,
        height: item.getBoundingClientRect().height
      }));
    const footer = document.querySelector(".app-footer");
    const main = document.querySelector(".app-main");
    const detailsText = document.querySelector(".card-calculator").textContent.replace(/\\s+/g, " ").trim();
    return {
      name: ${JSON.stringify(viewport.name)},
      viewport: [innerWidth, innerHeight],
      expectedViewport: [${viewport.width}, ${viewport.height}],
      overflowX: root.scrollWidth > root.clientWidth + 1,
      selectedText: selected.textContent.replace(/\\s+/g, " ").trim(),
      profits,
      detailsText,
      unwantedPresent: ${unwanted}.filter(selector => document.querySelector(selector)),
      bannedEnglishPresent: [
        "Ungraded", "Near Mint", "Mixed conditions", "Reverse Holo",
        "market snapshot", "manual-reference", "画像を要確認", "状態を要確認",
        "実売比較以外の価格データ"
      ].filter(text => document.body.textContent.includes(text)),
      fxText: footer.textContent.trim(),
      fxPosition: getComputedStyle(footer).position,
      footerAfterMain: Boolean(main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING),
      minimumTargetHeight: Math.min(...visibleTargets.map(item => item.height)),
      narrowTargets: visibleTargets.filter(item => item.height < 44),
      errors: []
    };
  })()`);
}

async function inspectKasumiResults(client) {
  return client.evaluate(`(() => ({
    count: document.querySelectorAll('.result-card').length,
    status: document.querySelector('#searchStatus').textContent,
    names: [...document.querySelectorAll('.card-name')].map(item => item.textContent),
    filters: [...document.querySelectorAll('[data-rarity-filter]')].map(item => ({
      label: item.textContent,
      pressed: item.getAttribute('aria-pressed')
    }))
  }))()`);
}

async function inspectSelectedCard(client) {
  return client.evaluate(`(() => ({
    text: document.querySelector('#selectionPanel').textContent.replace(/\\s+/g, ' ').trim(),
    profits: [...document.querySelectorAll('[data-profit-kind]')].map(item => item.textContent.replace(/\\s+/g, ' ').trim()),
    links: [...document.querySelectorAll('.market-links a')].map(item => ({ text: item.textContent, href: item.href }))
  }))()`);
}

async function submitSearch(client, query) {
  await client.evaluate(`(() => {
    const search = document.querySelector('#searchInput');
    search.value = ${JSON.stringify(query)};
    search.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#searchForm').requestSubmit();
  })()`);
}

async function setPurchasePrice(client, value) {
  await client.evaluate(`(() => {
    const purchase = document.querySelector('#purchasePriceInput');
    purchase.value = ${JSON.stringify(value)};
    purchase.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

function validateResult(result) {
  assert.deepEqual(result.viewport, result.expectedViewport, `${result.name}: viewport`);
  assert.equal(result.overflowX, false, `${result.name}: horizontal overflow`);
  assert.ok(result.kasumi.count >= 2, `${result.name}: Kasumi result count ${result.kasumi.count}`);
  assert.ok(result.kasumi.count <= 24, `${result.name}: Kasumi initial result cap ${result.kasumi.count}`);
  assert.match(result.kasumi.status, /\d+件表示/u);
  assert.ok(result.kasumi.names.includes("カスミのおねがい"), `${result.name}: Misty's Favor`);
  assert.ok(result.kasumi.names.includes("カスミの元気"), `${result.name}: Misty's Energy`);
  assert.deepEqual(result.kasumi.filters.map(item => item.label), ["すべて", "C/U", "R/RR", "AR", "SR以上", "その他"]);
  assert.equal(result.kasumi.filters.filter(item => item.pressed === "true").length, 1);
  assert.match(result.rarityStatus, /^\d+\/\d+件表示(?:・検索中)?$/u, `${result.name}: rarity count`);
  assert.match(result.selectedKasumi.text, /カスミのおねがい/u);
  assert.ok(result.selectedKasumi.profits.every(text => text.includes("eBay価格未取得")));
  assert.equal(new URL(result.selectedKasumi.links[0].href).hostname, "auctions.yahoo.co.jp");
  assert.equal(new URL(result.selectedKasumi.links[1].href).hostname, "www.ebay.com");
  assert.match(result.selectedText, /ゲンガー/u, `${result.name}: card name`);
  assert.match(result.selectedText, /094\/165/u, `${result.name}: card number`);
  assert.deepEqual(result.profits.map(item => item.kind).sort(), ["mirror", "normal", "psa10"]);
  for (const profit of result.profits) {
    assert.match(profit.text, /eBay価格未取得/u, `${result.name}: ${profit.kind} eBay unavailable`);
    assert.doesNotMatch(profit.text, /NaN|Infinity/u, `${result.name}: ${profit.kind} finite`);
  }
  assert.match(result.detailsText, /海外参考価格/u);
  assert.match(result.detailsText, /送料/u);
  assert.match(result.detailsText, /国内取引価格を確認/u);
  assert.match(result.detailsText, /eBay実売価格を確認/u);
  assert.deepEqual(result.unwantedPresent, [], `${result.name}: unwanted UI`);
  assert.deepEqual(result.bannedEnglishPresent, [], `${result.name}: Japanese-only condition UI`);
  assert.equal(result.footerAfterMain, true, `${result.name}: FX footer order`);
  assert.ok(["static", "relative"].includes(result.fxPosition), `${result.name}: FX footer position`);
  assert.match(result.fxText, /USD\/JPY\s[\d,.]+円/u, `${result.name}: FX rate`);
  assert.match(result.fxText, /EUR\/JPY\s[\d,.]+円/u, `${result.name}: EUR FX rate`);
  assert.ok(
    result.minimumTargetHeight >= 44,
    `${result.name}: minimum target height ${result.minimumTargetHeight} ${JSON.stringify(result.narrowTargets)}`
  );
  assert.deepEqual(result.errors, [], `${result.name}: browser errors`);
}

async function enableDomains(client) {
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Page.enable");
  await client.send("Network.enable");
}

async function emulateViewport(client, viewport) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile
  });
  await client.send("Emulation.setTouchEmulationEnabled", {
    enabled: viewport.mobile,
    maxTouchPoints: viewport.mobile ? 5 : 1
  });
}

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  await waitForCondition(client, "document.readyState === 'complete'", 10_000, "page load");
}

async function captureScreenshot(client, name) {
  if (!screenshotDir) return "";
  await mkdir(screenshotDir, { recursive: true });
  const response = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const outputPath = path.join(screenshotDir, `${name}.png`);
  await writeFile(outputPath, Buffer.from(response.data, "base64"));
  return outputPath;
}

async function createCdpClient(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const diagnostics = { errors: [], sameOriginFailures: [] };
  const requestUrls = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result || {});
      return;
    }

    const { method, params = {} } = message;
    if (method === "Runtime.exceptionThrown") {
      diagnostics.errors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "JavaScript exception");
    }
    if (method === "Runtime.consoleAPICalled" && params.type === "error") {
      diagnostics.errors.push((params.args || []).map(item => item.value ?? item.description ?? "").join(" "));
    }
    if (method === "Log.entryAdded" && params.entry?.level === "error" && params.entry.source !== "network") {
      diagnostics.errors.push(params.entry.text);
    }
    if (method === "Network.requestWillBeSent") {
      requestUrls.set(params.requestId, params.request?.url || "");
    }
    if (method === "Network.responseReceived") {
      const url = params.response?.url || requestUrls.get(params.requestId) || "";
      if (sameOrigin(url) && params.response?.status >= 400) {
        diagnostics.sameOriginFailures.push(`${params.response.status}: ${url}`);
      }
    }
  });

  const send = (method, params = {}, timeout = 10_000) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method}: timed out`));
    }, timeout);
    pending.set(id, { method, resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async expression => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result?.value;
  };

  const close = async () => {
    if (socket.readyState === WebSocket.OPEN) {
      try { await send("Browser.close", {}, 1500); } catch { socket.close(); }
    }
  };

  return { send, evaluate, close, diagnostics };
}

async function waitForCondition(client, expression, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await client.evaluate(`Boolean(${expression})`)) return;
    } catch {
      // Retry until the page finishes loading.
    }
    await sleep(100);
  }
  throw new Error(`${label} timed out after ${timeout}ms`);
}

async function waitForWebSocket(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
      const pages = await response.json();
      const page = pages.find(item => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Edge DevTools endpoint did not start on ${port}`);
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function sameOrigin(url) {
  try { return new URL(url).origin === new URL(pageUrl).origin; } catch { return false; }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function stopBrowser(browser) {
  if (!browser || browser.exitCode !== null) return;
  browser.kill();
  await Promise.race([
    new Promise(resolve => browser.once("exit", resolve)),
    sleep(1500)
  ]);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
