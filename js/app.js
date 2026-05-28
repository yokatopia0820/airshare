const API_URL = getConfiguredApiUrl();
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const POLL_INTERVAL_MS = 4000;

let currentRoomId = "";
let currentFiles = [];
let selectedFile = null;
let pollTimer = null;
let scanStream = null;
let scanFrameId = null;

const $ = id => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

function getConfiguredApiUrl() {
  const params = new URLSearchParams(window.location.search);
  return (
    window.AIRSHARE_API_URL ||
    params.get("api") ||
    localStorage.getItem("airshare_api_url") ||
    ""
  ).trim().replace(/\/$/, "");
}

function persistApiUrlFromQuery() {
  if (!API_URL) return;
  localStorage.setItem("airshare_api_url", API_URL);
}

function hasSyncBackend() {
  return Boolean(API_URL);
}

function init() {
  persistApiUrlFromQuery();
  restoreTheme();
  bindEvents();
  applyRoomFromUrl();
  updateSyncStatus();
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
  $("btnRefresh")?.addEventListener("click", pollFiles);
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

  const fileInput = $("fileInput");
  fileInput?.addEventListener("change", event => handleFiles([...event.target.files]));

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

function applyRoomFromUrl() {
  const params = new URLSearchParams(location.search);
  const room = normalizeRoomId(params.get("room") || "");
  if (room) {
    $("roomInput").value = room;
    joinRoom(room);
  }
}

async function createRoom() {
  playClick();
  currentRoomId = generateRoomId();
  await enterRoom(currentRoomId);
  showRoomQr();
  showToast("ルームに入りました", "success");
}

function cancelRoomCreation() {
  currentRoomId = "";
  $("setupQrArea").style.display = "none";
}

function joinFromInput() {
  playClick();
  const roomId = normalizeRoomId($("roomInput").value);
  if (!roomId) {
    showJoinError("ルームIDを入力してください。");
    return;
  }
  joinRoom(roomId);
}

async function joinRoom(roomId) {
  currentRoomId = roomId;
  hideJoinError();
  await enterRoom(roomId);
}

async function enterRoom(roomId) {
  $("setupScreen").classList.remove("active");
  $("mainScreen").classList.add("active");
  $("roomIdDisplay").textContent = roomId;
  updateSyncStatus();
  const chatArea = $("chatArea");
  if (chatArea) chatArea.style.display = "flex";
  await pollFiles();
  startPolling();
  history.replaceState(null, "", `${location.pathname}?room=${encodeURIComponent(roomId)}`);
}

function leaveRoom() {
  playClick();
  stopPolling();
  currentRoomId = "";
  currentFiles = [];
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
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(pollFiles, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function pollFiles() {
  if (!currentRoomId) return;
  currentFiles = await listRoomFiles(currentRoomId);
  renderFileList();
  await renderChatMessages();
}

async function handleFiles(files) {
  if (!currentRoomId) {
    showToast("先にルームへ参加してください", "error");
    return;
  }
  if (!hasSyncBackend()) {
    showSyncSetupError();
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
    try {
      await saveRoomFile(currentRoomId, file);
    } catch (error) {
      console.error("ファイル保存エラー:", error);
      showToast("同期サーバーへ保存できませんでした", "error");
      return;
    }
  }

  $("fileInput").value = "";
  await pollFiles();
  if (validFiles.length) showToast(`${validFiles.length}件のファイルを追加しました`, "success");
}

async function listRoomFiles(roomId) {
  if (!hasSyncBackend()) return [];

  if (API_URL) {
    try {
      const files = await apiRequest({
        table: "files",
        action: "query",
        filters: { room_id: roomId },
        limit: 200,
        sort: "created_at DESC"
      });
      if (Array.isArray(files)) return files;
    } catch (error) {
      console.warn("APIファイル取得に失敗しました。", error);
      showToast("同期サーバーから取得できませんでした", "error");
    }
  }
  return [];
}

async function saveRoomFile(roomId, file) {
  if (!hasSyncBackend()) throw new Error("Sync backend is not configured");

  const fileRecord = {
    id: crypto.randomUUID(),
    room_id: roomId,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    data_url: await fileToDataUrl(file),
    sender: IS_IOS ? "Mobile" : "Desktop",
    created_at: new Date().toISOString()
  };

  if (API_URL) {
    try {
      await apiRequest({ table: "files", action: "insert", data: fileRecord });
      return;
    } catch (error) {
      console.warn("API保存に失敗しました。", error);
      throw error;
    }
  }
}

async function clearAllFiles() {
  if (!currentRoomId || !confirm("このルームのファイル一覧を削除しますか？")) return;
  if (!hasSyncBackend()) {
    showSyncSetupError();
    return;
  }
  showToast("一括削除はバックエンド側のdelete対応後に有効化します", "info");
  await pollFiles();
}

async function readLocalFiles(roomId) {
  try {
    return JSON.parse(localStorage.getItem(localFileKey(roomId)) || "[]");
  } catch {
    return [];
  }
}

function localFileKey(roomId) {
  return `airshare_files_${roomId}`;
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
  if (file.type?.startsWith("image/")) return `<img src="${escapeAttr(file.data_url)}" alt="">`;
  if (file.type?.startsWith("video/")) return `<i class="fa-solid fa-file-video"></i>`;
  if (file.type?.startsWith("audio/")) return `<i class="fa-solid fa-file-audio"></i>`;
  if (file.type?.includes("pdf")) return `<i class="fa-solid fa-file-pdf"></i>`;
  if (file.type?.startsWith("text/")) return `<i class="fa-solid fa-file-lines"></i>`;
  return `<i class="fa-solid fa-file"></i>`;
}

async function previewFile(file) {
  selectedFile = file;
  const content = $("previewContent");
  if (file.type?.startsWith("image/")) {
    content.innerHTML = `<img src="${escapeAttr(file.data_url)}" alt="${escapeAttr(file.name)}">`;
  } else if (file.type?.startsWith("video/")) {
    content.innerHTML = `<video src="${escapeAttr(file.data_url)}" controls></video>`;
  } else if (file.type?.startsWith("audio/")) {
    content.innerHTML = `<audio src="${escapeAttr(file.data_url)}" controls></audio>`;
  } else if (file.type?.startsWith("text/") || /\.(txt|md|csv|json|log)$/i.test(file.name)) {
    content.innerHTML = `<pre>${escapeHtml(await dataUrlToText(file.data_url))}</pre>`;
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
  link.href = file.data_url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function sendChatMessage() {
  const input = $("chatInput");
  const msg = input.value.trim();
  if (!msg || !currentRoomId) return;
  if (!hasSyncBackend()) {
    showSyncSetupError();
    return;
  }

  const record = {
    id: crypto.randomUUID(),
    room_id: currentRoomId,
    sender: IS_IOS ? "Mobile" : "Desktop",
    message: msg,
    created_at: new Date().toISOString()
  };

  try {
    await apiRequest({ table: "chat_messages", action: "insert", data: record });
    input.value = "";
    await renderChatMessages();
  } catch (error) {
    console.error("チャット送信エラー:", error);
    showToast("メッセージを送信できませんでした", "error");
  }
}

async function renderChatMessages() {
  if (!currentRoomId) return;
  const container = $("chatMessages");
  if (!container) return;

  try {
    if (!hasSyncBackend()) {
      container.innerHTML = "";
      return;
    }
    const messages = API_URL
      ? await apiRequest({
          table: "chat_messages",
          action: "query",
          filters: { room_id: currentRoomId },
          limit: 200,
          sort: "created_at ASC"
        })
      : [];

    container.innerHTML = messages.map(message => {
      const isOwn = message.sender === (IS_IOS ? "Mobile" : "Desktop");
      return `<div class="chat-msg ${isOwn ? "self" : "other"}">${escapeHtml(message.message)}</div>`;
    }).join("");

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  } catch (error) {
    console.error("チャット取得エラー:", error);
  }
}

function readLocalMessages(roomId) {
  try {
    return JSON.parse(localStorage.getItem(localChatKey(roomId)) || "[]");
  } catch {
    return [];
  }
}

function localChatKey(roomId) {
  return `airshare_chat_${roomId}`;
}

async function apiRequest(payload) {
  if (!API_URL) throw new Error("API_URL is not configured");

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
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
  ctx.fillText("QR library loading...", 110, 104);
  ctx.fillText(currentRoomId, 110, 126);
}

function roomUrl(roomId) {
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("room", roomId);
  if (API_URL && !window.AIRSHARE_API_URL) url.searchParams.set("api", API_URL);
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
  const input = event.target;
  input.value = normalizeRoomId(input.value);
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

function showJoinError(message) {
  const error = $("joinError");
  error.textContent = message;
  error.style.display = "block";
}

function updateSyncStatus() {
  let status = $("syncStatus");
  if (!status) {
    status = document.createElement("div");
    status.id = "syncStatus";
    status.className = "sync-status";
  }
  const target = document.querySelector(".screen.active") || $("setupScreen") || $("mainScreen");
  if (target && status.parentElement !== target) target.prepend(status);

  if (hasSyncBackend()) {
    status.className = "sync-status connected";
    status.innerHTML = `<i class="fa-solid fa-cloud"></i><span>同期サーバー接続中</span>`;
    return;
  }

  status.className = "sync-status disconnected";
  status.innerHTML = `
    <i class="fa-solid fa-triangle-exclamation"></i>
    <span>同期サーバー未設定: この状態では別端末とのファイル共有・チャットは反映されません。</span>
  `;
}

function showSyncSetupError() {
  updateSyncStatus();
  showToast("同期サーバー未設定です。GitHub Pagesだけでは端末間同期できません。", "error");
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
  if (!navigator.vibrate) return;
  navigator.vibrate(10);
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
