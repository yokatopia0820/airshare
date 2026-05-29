const API_URL = getApiUrl();
const PUBLIC_BASE_URL = getPublicBaseUrl();
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const POLL_INTERVAL_MS = 1500;
const CLIENT_ID = getClientId();

let currentRoomId = "";
let currentFiles = [];
let currentMessages = [];
let selectedFile = null;
let pollTimer = null;
let scanStream = null;
let scanFrameId = null;
let apiOnline = false;
let isRoomCreator = false;
let lastClientCount = 0;

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  restoreTheme();
  bindEvents();
  await checkApi();
  applyRoomFromUrl();
  updateSyncStatus();
}

function getApiUrl() {
  const configured = window.AIRSHARE_API_URL || localStorage.getItem("airshare_api_url") || "";
  if (configured) return configured.replace(/\/$/, "");
  if (location.protocol.startsWith("http")) return `${location.origin}/api`;
  return "";
}

function getPublicBaseUrl() {
  return window.AIRSHARE_PUBLIC_BASE_URL || `${location.origin}${location.pathname}`;
}

function bindEvents() {
  $("btnTheme")?.addEventListener("click", () => {
    playClick();
    toggleTheme();
  });
  $("btnCreator")?.addEventListener("click", () => openModal("creatorModal"));
  $("btnCloseCreator")?.addEventListener("click", () => closeModal("creatorModal"));
  $("btnCreateRoom")?.addEventListener("click", createRoom);
  $("btnJoinRoom")?.addEventListener("click", joinFromInput);
  $("roomInput")?.addEventListener("input", formatRoomInput);
  $("roomInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") joinFromInput();
  });
  $("btnSetupCopyId")?.addEventListener("click", () => copyRoomId(currentRoomId));
  $("btnSetupShare")?.addEventListener("click", shareRoom);
  $("btnSetupCancelRoom")?.addEventListener("click", cancelRoomCreation);
  $("btnHeaderShowQR")?.addEventListener("click", showRoomQr);
  $("btnHeaderCopyRoom")?.addEventListener("click", () => copyRoomId(currentRoomId));
  $("btnLeaveRoom")?.addEventListener("click", leaveRoom);
  $("btnRefresh")?.addEventListener("click", pollRoom);
  $("btnClearAll")?.addEventListener("click", clearAllFiles);
  $("btnCloseQR")?.addEventListener("click", () => closeModal("qrModal"));
  $("btnCopyFromQR")?.addEventListener("click", () => copyRoomId(currentRoomId));
  $("btnOpenScanner")?.addEventListener("click", openScanner);
  $("btnCloseScan")?.addEventListener("click", closeScanner);
  $("btnClosePreview")?.addEventListener("click", closePreview);
  $("btnDownload")?.addEventListener("click", downloadSelectedFile);
  $("btnSendMessage")?.addEventListener("click", () => {
    playClick();
    sendChatMessage();
  });
  $("chatInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendChatMessage();
    }
  });

  $("fileInput")?.addEventListener("change", event => handleFiles([...event.target.files]));

  const dropZone = $("dropZone");
  if (dropZone) {
    ["dragenter", "dragover"].forEach(type => {
      dropZone.addEventListener(type, event => {
        event.preventDefault();
        dropZone.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach(type => {
      dropZone.addEventListener(type, event => {
        event.preventDefault();
        dropZone.classList.remove("drag-over");
      });
    });
    dropZone.addEventListener("drop", event => handleFiles([...event.dataTransfer.files]));
  }

  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) modal.style.display = "none";
    });
  });
}

async function checkApi() {
  if (!API_URL) {
    apiOnline = false;
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/health`, { cache: "no-store" });
    apiOnline = response.ok;
    return apiOnline;
  } catch {
    apiOnline = false;
    return false;
  }
}

function restoreTheme() {
  const theme = localStorage.getItem("airshare_theme") || "dark";
  document.documentElement.dataset.theme = theme;
  updateThemeIcon(theme);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("airshare_theme", next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = $("themeIcon");
  if (!icon) return;
  icon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
}

function getClientId() {
  return cryptoRandomId();
}

function deviceName() {
  return IS_IOS ? "Mobile" : "Desktop";
}

function applyRoomFromUrl() {
  const params = new URLSearchParams(location.search);
  const room = normalizeRoomId(params.get("room") || "");
  if (room) {
    isRoomCreator = false;
    $("roomInput").value = room;
    joinRoom(room);
  }
}

async function createRoom() {
  playClick();
  const roomId = generateRoomId();
  isRoomCreator = true;
  await joinRoom(roomId);
  showRoomQr();
}

function cancelRoomCreation() {
  currentRoomId = "";
  isRoomCreator = false;
  lastClientCount = 0;
  $("setupQrArea").style.display = "none";
}

function joinFromInput() {
  playClick();
  const roomId = normalizeRoomId($("roomInput").value);
  if (!roomId) {
    showJoinError("ルームIDを入力してください。");
    return;
  }
  isRoomCreator = false;
  joinRoom(roomId);
}

async function joinRoom(roomId) {
  currentRoomId = roomId;
  hideJoinError();
  await enterRoom(roomId);
}

async function enterRoom(roomId) {
  await ensureApiOnline();
  await touchRoom(roomId);

  $("setupScreen").classList.remove("active");
  $("mainScreen").classList.add("active");
  $("roomIdDisplay").textContent = roomId;
  const chatArea = $("chatArea");
  if (chatArea) chatArea.style.display = "flex";

  updateSyncStatus();
  await pollRoom();
  startPolling();
  history.replaceState(null, "", `${location.pathname}?room=${encodeURIComponent(roomId)}`);
  showToast("ルームに入りました", "success");
}

function leaveRoom() {
  playClick();
  stopPolling();
  currentRoomId = "";
  currentFiles = [];
  currentMessages = [];
  isRoomCreator = false;
  lastClientCount = 0;
  selectedFile = null;
  $("mainScreen").classList.remove("active");
  $("setupScreen").classList.add("active");
  $("fileList").innerHTML = "";
  $("roomIdDisplay").textContent = "";
  const chatArea = $("chatArea");
  const chatMessages = $("chatMessages");
  const chatInput = $("chatInput");
  if (chatArea) chatArea.style.display = "none";
  if (chatMessages) chatMessages.innerHTML = "";
  if (chatInput) chatInput.value = "";
  history.replaceState(null, "", location.pathname);
  updateSyncStatus();
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollRoom, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function pollRoom() {
  if (!currentRoomId || !apiOnline) return;
  try {
    const [status, files, messages] = await Promise.all([
      touchRoom(currentRoomId),
      apiRequest(`/rooms/${encodeURIComponent(currentRoomId)}/files`),
      apiRequest(`/rooms/${encodeURIComponent(currentRoomId)}/messages`)
    ]);
    lastClientCount = Number(status?.clientCount || 0);
    currentFiles = Array.isArray(files) ? files : [];
    currentMessages = Array.isArray(messages) ? messages : [];
    renderFileList();
    await renderChatMessages();
    handlePeerJoined();
    updateSyncStatus();
  } catch (error) {
    console.error("同期エラー:", error);
    apiOnline = false;
    updateSyncStatus();
  }
}

async function touchRoom(roomId) {
  return apiRequest(`/rooms/${encodeURIComponent(roomId)}`, {
    method: "POST",
    body: JSON.stringify({
      client_id: CLIENT_ID,
      sender: deviceName()
    })
  });
}

async function ensureApiOnline() {
  if (apiOnline || await checkApi()) return;
  updateSyncStatus();
  throw new Error("AirShare server is not running");
}

async function handleFiles(files) {
  if (!currentRoomId) {
    showToast("先にルームへ参加してください", "error");
    return;
  }

  try {
    await ensureApiOnline();
  } catch {
    showToast("Windows側でAirShareサーバーを起動してください。", "error");
    return;
  }

  const validFiles = files.filter(file => {
    if (file.size > MAX_FILE_SIZE) {
      showToast(`${file.name} は50MBを超えています`, "error");
      return false;
    }
    return true;
  });

  for (const file of validFiles) {
    await uploadFile(file);
  }

  $("fileInput").value = "";
  await pollRoom();
  if (validFiles.length) showToast(`${validFiles.length}件のファイルを共有しました`, "success");
}

async function uploadFile(file) {
  const payload = {
    id: cryptoRandomId(),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    data_url: await fileToDataUrl(file),
    sender: deviceName(),
    created_at: new Date().toISOString()
  };
  await apiRequest(`/rooms/${encodeURIComponent(currentRoomId)}/files`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

async function clearAllFiles() {
  if (!currentRoomId || !confirm("このルームのファイル一覧を削除しますか？")) return;
  await apiRequest(`/rooms/${encodeURIComponent(currentRoomId)}/files`, { method: "DELETE" });
  await pollRoom();
}

function renderFileList() {
  const container = $("fileList");
  container.innerHTML = currentFiles.map(file => `
    <div class="file-card" data-id="${escapeAttr(file.id)}">
      <div class="file-thumb">${thumbnailHtml(file)}</div>
      <div class="file-info">
        <div class="file-name" title="${escapeAttr(file.name)}">${escapeHtml(file.name)}</div>
        <div class="file-meta">
          <span>${formatBytes(Number(file.size) || 0)}</span>
          <span>${escapeHtml(file.sender || "Unknown")}</span>
          <span>${formatDate(file.created_at)}</span>
        </div>
      </div>
      <div class="file-actions">
        <button class="btn-icon" type="button" data-action="preview" title="プレビュー">
          <i class="fa-solid fa-eye"></i>
        </button>
        <button class="btn-icon" type="button" data-action="download" title="ダウンロード">
          <i class="fa-solid fa-download"></i>
        </button>
      </div>
    </div>
  `).join("");

  $("btnClearAll").style.display = currentFiles.length ? "inline-flex" : "none";

  container.querySelectorAll(".file-card").forEach(card => {
    card.addEventListener("click", event => {
      const action = event.target.closest("[data-action]")?.dataset.action || "preview";
      const file = currentFiles.find(item => item.id === card.dataset.id);
      if (!file) return;
      if (action === "download") downloadFile(file);
      else previewFile(file);
    });
  });
}

function thumbnailHtml(file) {
  if (file.type?.startsWith("image/")) {
    const source = file.data_url || file.content_url;
    if (source) return `<img src="${escapeAttr(source)}" alt="">`;
  }
  if (file.type?.startsWith("video/")) return `<i class="fa-solid fa-file-video"></i>`;
  if (file.type?.startsWith("audio/")) return `<i class="fa-solid fa-file-audio"></i>`;
  if (file.type?.includes("pdf")) return `<i class="fa-solid fa-file-pdf"></i>`;
  if (file.type?.startsWith("text/")) return `<i class="fa-solid fa-file-lines"></i>`;
  return `<i class="fa-solid fa-file"></i>`;
}

async function previewFile(file) {
  selectedFile = file;
  const content = $("previewContent");
  const source = await fileSource(file);
  if (file.type?.startsWith("image/")) {
    content.innerHTML = `<img src="${escapeAttr(source)}" alt="${escapeAttr(file.name)}">`;
  } else if (file.type?.startsWith("video/")) {
    content.innerHTML = `<video src="${escapeAttr(source)}" controls></video>`;
  } else if (file.type?.startsWith("audio/")) {
    content.innerHTML = `<audio src="${escapeAttr(source)}" controls></audio>`;
  } else if (file.type?.startsWith("text/") || /\.(txt|md|csv|json|log)$/i.test(file.name)) {
    content.innerHTML = `<pre>${escapeHtml(await fileToText(file))}</pre>`;
  } else {
    content.innerHTML = `<div><i class="fa-solid fa-file" style="font-size:3rem;color:var(--accent)"></i><p>${escapeHtml(file.name)}</p></div>`;
  }
  openModal("previewModal");
}

function closePreview() {
  selectedFile = null;
  closeModal("previewModal");
}

function downloadSelectedFile() {
  if (selectedFile) downloadFile(selectedFile);
}

function downloadFile(file) {
  const link = document.createElement("a");
  link.href = file.data_url || file.content_url;
  if (!link.href) {
    showToast("ダウンロードURLが見つかりませんでした", "error");
    return;
  }
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function sendChatMessage() {
  const input = $("chatInput");
  const msg = input.value.trim();
  if (!msg || !currentRoomId) return;

  try {
    await ensureApiOnline();
    await apiRequest(`/rooms/${encodeURIComponent(currentRoomId)}/messages`, {
      method: "POST",
      body: JSON.stringify({
        id: cryptoRandomId(),
        sender: deviceName(),
        message: msg,
        created_at: new Date().toISOString()
      })
    });
    input.value = "";
    await pollRoom();
  } catch (error) {
    console.error("チャット送信エラー:", error);
    showToast("メッセージを送信できませんでした", "error");
  }
}

async function renderChatMessages() {
  const container = $("chatMessages");
  if (!container) return;

  container.innerHTML = currentMessages.map(message => {
    const isOwn = message.sender === deviceName();
    return `
      <div class="chat-msg ${isOwn ? "self" : "other"}" data-message-id="${escapeAttr(message.id)}">
        <span class="chat-msg-text">${linkifyMessage(message.message)}</span>
        <button class="chat-copy-btn" type="button" title="コピー" aria-label="メッセージをコピー">
          <i class="fa-regular fa-copy"></i>
        </button>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".chat-copy-btn").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const id = button.closest(".chat-msg")?.dataset.messageId;
      const message = currentMessages.find(item => String(item.id) === String(id));
      if (message) copyText(message.message);
    });
  });

  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: options.body
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

function showRoomQr() {
  if (!currentRoomId) return;
  $("qrRoomId").textContent = currentRoomId;
  drawQr("qrCanvas", roomUrl(currentRoomId));
  openModal("qrModal");
}

function handlePeerJoined() {
  if (!isRoomCreator || lastClientCount < 2) return;
  const qrModal = $("qrModal");
  const setupQrArea = $("setupQrArea");
  const qrIsOpen = qrModal?.style.display !== "none" || setupQrArea?.style.display !== "none";
  if (!qrIsOpen) return;

  closeModal("qrModal");
  if (setupQrArea) setupQrArea.style.display = "none";
  showToast("相手が参加しました。ファイルとメッセージを共有できます。", "success");
}

async function shareRoom() {
  const url = roomUrl(currentRoomId);
  if (navigator.share) {
    try {
      await navigator.share({ title: "AirShare", text: `AirShare ルーム ${currentRoomId}`, url });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  showSharePanel(url);
}

function showSharePanel(url) {
  document.querySelector(".share-panel")?.remove();
  const panel = document.createElement("div");
  panel.className = "share-panel";
  panel.innerHTML = `
    <div class="share-panel-header"><i class="fa-solid fa-link"></i>共有リンク</div>
    <div class="share-panel-url">${escapeHtml(url)}</div>
    <div class="share-panel-actions">
      <button class="share-btn-copy" type="button">コピー</button>
      <button class="share-btn-close" type="button">閉じる</button>
    </div>
  `;
  panel.querySelector(".share-btn-copy").addEventListener("click", () => copyText(url));
  panel.querySelector(".share-btn-close").addEventListener("click", () => panel.remove());
  document.body.appendChild(panel);
}

async function copyRoomId(roomId) {
  if (!roomId) return;
  await copyText(roomId);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("コピーしました", "success");
  } catch {
    showToast("コピーできませんでした", "error");
  }
}

async function openScanner() {
  if (!navigator.mediaDevices?.getUserMedia || !window.jsQR) {
    showToast("このブラウザではQRスキャンを利用できません", "error");
    return;
  }

  try {
    openModal("scanModal");
    const video = $("scanVideo");
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = scanStream;
    await video.play();
    scanLoop();
  } catch (error) {
    console.error(error);
    showToast("カメラを起動できませんでした", "error");
    closeScanner();
  }
}

function scanLoop() {
  const video = $("scanVideo");
  const canvas = $("scanCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code?.data) {
      const roomId = extractRoomId(code.data);
      if (roomId) {
        closeScanner();
        $("roomInput").value = roomId;
        joinRoom(roomId);
        return;
      }
    }
  }

  scanFrameId = requestAnimationFrame(scanLoop);
}

function closeScanner() {
  if (scanFrameId) cancelAnimationFrame(scanFrameId);
  scanFrameId = null;
  if (scanStream) scanStream.getTracks().forEach(track => track.stop());
  scanStream = null;
  closeModal("scanModal");
}

function drawQr(canvasId, text) {
  const canvas = $(canvasId);
  if (!canvas) return;
  canvas.width = 220;
  canvas.height = 220;

  if (window.qrcode) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const cell = Math.floor(190 / count);
    const size = cell * count;
    const offset = Math.floor((220 - size) / 2);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 220, 220);
    ctx.fillStyle = "#111";
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
      }
    }
    return;
  }

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 220, 220);
  ctx.fillStyle = "#111";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(currentRoomId, 110, 112);
}

function roomUrl(roomId) {
  const url = new URL(PUBLIC_BASE_URL);
  url.search = "";
  url.searchParams.set("room", roomId);
  return url.toString();
}

function extractRoomId(value) {
  try {
    const url = new URL(value);
    return normalizeRoomId(url.searchParams.get("room") || value);
  } catch {
    return normalizeRoomId(value);
  }
}

function formatRoomInput(event) {
  event.target.value = normalizeRoomId(event.target.value);
}

function normalizeRoomId(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^(.{3})(.+)$/, "$1-$2")
    .slice(0, 11);
}

function generateRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chars = Array.from({ length: 7 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]);
  return `${chars.slice(0, 3).join("")}-${chars.slice(3).join("")}`;
}

function updateSyncStatus() {
  let status = $("syncStatus");
  if (!status) {
    status = document.createElement("div");
    status.id = "syncStatus";
    status.className = "sync-status";
  }
  const setupCard = document.querySelector("#setupScreen.active .setup-card");
  const mainScreen = $("mainScreen");
  const target = setupCard || (mainScreen?.classList.contains("active") ? mainScreen : null);
  if (target && status.parentElement !== target) {
    if (setupCard) {
      const note = setupCard.querySelector(".setup-note");
      setupCard.insertBefore(status, note || null);
    } else {
      target.prepend(status);
    }
  }

  if (apiOnline) {
    status.className = "sync-status connected";
    const peerText = currentRoomId
      ? (lastClientCount > 1 ? "相手が参加済みです。ファイルとメッセージを共有できます。" : "相手の参加待ちです。QRコードかリンクを開いてもらってください。")
      : "同じWi-Fiの端末と共有できます。";
    status.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>AirShareサーバー接続中。${peerText}</span>`;
    return;
  }

  status.className = "sync-status disconnected";
  status.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>Windows側でAirShareサーバーを起動してください。</span>`;
}

function showJoinError(message) {
  const error = $("joinError");
  error.textContent = message;
  error.style.display = "block";
}

function hideJoinError() {
  const error = $("joinError");
  error.textContent = "";
  error.style.display = "none";
}

function openModal(id) {
  const modal = $(id);
  if (modal) modal.style.display = "flex";
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.style.display = "none";
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $("toastContainer").appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function playClick() {
  if (navigator.vibrate) navigator.vibrate(10);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function dataUrlToText(dataUrl) {
  const response = await fetch(dataUrl);
  return response.text();
}

async function fileSource(file) {
  if (file.data_url) return file.data_url;
  if (file.content_url) return file.content_url;
  throw new Error("File source is missing");
}

async function fileToText(file) {
  if (file.data_url) return dataUrlToText(file.data_url);
  if (!file.content_url) return "";
  const response = await fetch(file.content_url);
  if (!response.ok) throw new Error("File text fetch failed");
  return response.text();
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return String(text ?? "").replace(/[&<>"']/g, char => map[char]);
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/`/g, "&#096;");
}

function linkifyMessage(text) {
  const value = String(text ?? "");
  const urlPattern = /\bhttps?:\/\/[^\s<]+/g;
  let html = "";
  let lastIndex = 0;
  for (const match of value.matchAll(urlPattern)) {
    const url = match[0];
    const start = match.index;
    const cleanUrl = url.replace(/[.,!?;:)]+$/g, "");
    const suffix = url.slice(cleanUrl.length);
    html += escapeHtml(value.slice(lastIndex, start));
    html += `<a href="${escapeAttr(cleanUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanUrl)}</a>`;
    html += escapeHtml(suffix);
    lastIndex = start + url.length;
  }
  html += escapeHtml(value.slice(lastIndex));
  return html;
}

function cryptoRandomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
