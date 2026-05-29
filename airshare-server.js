const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const HOST = "0.0.0.0";
const ROOT = process.cwd();
const MAX_BODY_BYTES = 75 * 1024 * 1024;
const CLIENT_TTL_MS = 15 * 1000;

const rooms = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".sql": "text/plain; charset=utf-8"
};

const server = http.createServer(async (request, response) => {
  try {
    setCors(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (url.pathname === "/js/runtime-config.js") {
      sendText(response, runtimeConfig(request), "text/javascript; charset=utf-8");
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, { error: error.message }, 500);
  }
});

server.listen(PORT, HOST, () => {
  const local = `http://127.0.0.1:${PORT}/index.html`;
  const lan = `http://${getLanAddress()}:${PORT}/index.html`;
  console.log(`AirShare local: ${local}`);
  console.log(`AirShare phone: ${lan}`);
});

async function handleApi(request, response, url) {
  if (url.pathname === "/api/health") {
    sendJson(response, { ok: true, publicBaseUrl: publicBaseUrl(request) });
    return;
  }

  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(files|messages))?$/);
  if (!match) {
    sendJson(response, { error: "Not found" }, 404);
    return;
  }

  const roomId = normalizeRoomId(match[1]);
  const resource = match[2];
  const room = getRoom(roomId);

  if (!resource && request.method === "GET") {
    sendJson(response, roomStatus(roomId, room));
    return;
  }

  if (!resource && request.method === "POST") {
    const body = await readJson(request);
    touchClient(room, body);
    sendJson(response, { ok: true, ...roomStatus(roomId, room) });
    return;
  }

  if (resource === "files" && request.method === "GET") {
    sendJson(response, room.files);
    return;
  }

  if (resource === "files" && request.method === "POST") {
    const body = await readJson(request);
    const file = {
      id: body.id || cryptoRandomId(),
      room_id: roomId,
      name: String(body.name || "file"),
      type: String(body.type || "application/octet-stream"),
      size: Number(body.size || 0),
      data_url: String(body.data_url || ""),
      sender: String(body.sender || "Device"),
      created_at: body.created_at || new Date().toISOString()
    };
    room.files.unshift(file);
    room.updatedAt = Date.now();
    sendJson(response, { ok: true, file });
    return;
  }

  if (resource === "files" && request.method === "DELETE") {
    room.files = [];
    room.updatedAt = Date.now();
    sendJson(response, { ok: true });
    return;
  }

  if (resource === "messages" && request.method === "GET") {
    sendJson(response, room.messages);
    return;
  }

  if (resource === "messages" && request.method === "POST") {
    const body = await readJson(request);
    const message = {
      id: body.id || cryptoRandomId(),
      room_id: roomId,
      sender: String(body.sender || "Device"),
      message: String(body.message || ""),
      created_at: body.created_at || new Date().toISOString()
    };
    room.messages.push(message);
    room.messages = room.messages.slice(-200);
    room.updatedAt = Date.now();
    sendJson(response, { ok: true, message });
    return;
  }

  sendJson(response, { error: "Method not allowed" }, 405);
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { files: [], messages: [], clients: new Map(), updatedAt: Date.now() });
  }
  return rooms.get(roomId);
}

function touchClient(room, body = {}) {
  const clientId = String(body.client_id || "").slice(0, 80);
  if (!clientId) return;
  room.clients.set(clientId, {
    id: clientId,
    name: String(body.sender || "Device").slice(0, 40),
    lastSeen: Date.now()
  });
}

function activeClients(room) {
  const now = Date.now();
  for (const [id, client] of room.clients.entries()) {
    if (now - client.lastSeen > CLIENT_TTL_MS) room.clients.delete(id);
  }
  return [...room.clients.values()];
}

function roomStatus(roomId, room) {
  const clients = activeClients(room);
  return {
    roomId,
    clientCount: clients.length,
    clients: clients.map(client => ({
      id: client.id,
      name: client.name,
      lastSeen: client.lastSeen
    })),
    updatedAt: room.updatedAt
  };
}

function normalizeRoomId(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);
}

function runtimeConfig(request) {
  const baseUrl = publicBaseUrl(request);
  return [
    `window.AIRSHARE_API_URL = ${JSON.stringify(`${baseUrl}/api`)};`,
    `window.AIRSHARE_PUBLIC_BASE_URL = ${JSON.stringify(`${baseUrl}/index.html`)};`
  ].join("\n");
}

function publicBaseUrl(request) {
  const host = request.headers.host || `127.0.0.1:${PORT}`;
  const hostname = host.split(":")[0];
  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return `http://${getLanAddress()}:${PORT}`;
  }
  return `http://${host}`;
}

function getLanAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT)) {
    sendText(response, "Forbidden", "text/plain; charset=utf-8", 403);
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(response, "Not found", "text/plain; charset=utf-8", 404);
      return;
    }
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, data, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function sendText(response, text, contentType, status = 200) {
  response.writeHead(status, { "Content-Type": contentType });
  response.end(text);
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
