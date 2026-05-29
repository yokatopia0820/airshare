const CLIENT_TTL_MS = 15 * 1000;
const ROOM_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_MESSAGES = 200;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
    if (!env.DB) return withCors(json({ error: "D1 binding DB is required" }, 500));
    if (!env.FILES) return withCors(json({ error: "R2 binding FILES is required" }, 500));

    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/health" || url.pathname === "/health") {
        return withCors(json({ ok: true, publicBaseUrl: url.origin }));
      }

      const fileContentMatch = url.pathname.match(/^\/(?:api\/)?rooms\/([^/]+)\/files\/([^/]+)\/content$/);
      if (fileContentMatch && (request.method === "GET" || request.method === "HEAD")) {
        return withCors(await getFileContent(request, env, fileContentMatch[1], fileContentMatch[2]));
      }

      const match = url.pathname.match(/^\/(?:api\/)?rooms\/([^/]+)(?:\/(files|messages))?$/);
      if (!match) return withCors(json({ error: "Not found" }, 404));

      const roomId = normalizeRoomId(match[1]);
      const resource = match[2] || "";
      await pruneRoom(env, roomId);

      if (!resource && request.method === "GET") {
        return withCors(json(await roomStatus(env.DB, roomId)));
      }

      if (!resource && request.method === "POST") {
        const body = await readJson(request);
        await touchClient(env.DB, roomId, body);
        return withCors(json({ ok: true, ...(await roomStatus(env.DB, roomId)) }));
      }

      if (resource === "files" && request.method === "GET") {
        return withCors(json(await listFiles(env.DB, roomId, url.origin)));
      }

      if (resource === "files" && request.method === "POST") {
        const body = await readJson(request);
        return withCors(json(await insertFile(env, roomId, body, url.origin)));
      }

      if (resource === "files" && request.method === "DELETE") {
        return withCors(json(await clearFiles(env, roomId)));
      }

      if (resource === "messages" && request.method === "GET") {
        return withCors(json(await listMessages(env.DB, roomId)));
      }

      if (resource === "messages" && request.method === "POST") {
        const body = await readJson(request);
        return withCors(json(await insertMessage(env.DB, roomId, body)));
      }

      return withCors(json({ error: "Method not allowed" }, 405));
    } catch (error) {
      return withCors(json({ error: error.message }, 500));
    }
  }
};

async function touchClient(db, roomId, body = {}) {
  const clientId = String(body.client_id || "").slice(0, 80);
  if (!clientId) return;
  const sender = String(body.sender || "Device").slice(0, 40);
  const now = Date.now();
  await db.prepare(`
    INSERT INTO room_clients (room_id, client_id, sender, last_seen)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(room_id, client_id)
    DO UPDATE SET sender = excluded.sender, last_seen = excluded.last_seen
  `).bind(roomId, clientId, sender, now).run();
}

async function roomStatus(db, roomId) {
  await deleteExpiredClients(db);
  const clients = await db.prepare(`
    SELECT client_id AS id, sender AS name, last_seen AS lastSeen
    FROM room_clients
    WHERE room_id = ?
    ORDER BY last_seen DESC
  `).bind(roomId).all();

  return {
    roomId,
    clientCount: clients.results.length,
    clients: clients.results,
    updatedAt: Date.now()
  };
}

async function deleteExpiredClients(db) {
  const cutoff = Date.now() - CLIENT_TTL_MS;
  await db.prepare("DELETE FROM room_clients WHERE last_seen < ?").bind(cutoff).run();
}

async function pruneRoom(env, roomId) {
  const cutoff = new Date(Date.now() - ROOM_RETENTION_MS).toISOString();
  const staleFiles = await env.DB.prepare(`
    SELECT object_key
    FROM files
    WHERE room_id = ? AND created_at < ?
  `).bind(roomId, cutoff).all();

  await Promise.all(staleFiles.results.map(file => env.FILES.delete(file.object_key)));
  await env.DB.prepare("DELETE FROM files WHERE room_id = ? AND created_at < ?").bind(roomId, cutoff).run();
  await env.DB.prepare("DELETE FROM chat_messages WHERE room_id = ? AND created_at < ?").bind(roomId, cutoff).run();
}

async function listFiles(db, roomId, origin) {
  const result = await db.prepare(`
    SELECT id, room_id, name, type, size, sender, created_at
    FROM files
    WHERE room_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(roomId).all();

  return result.results.map(file => ({
    ...file,
    content_url: `${origin}/api/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(file.id)}/content`
  }));
}

async function insertFile(env, roomId, body, origin) {
  const id = String(body.id || cryptoRandomId()).slice(0, 100);
  const name = String(body.name || "file").slice(0, 240);
  const type = String(body.type || "application/octet-stream").slice(0, 120);
  const size = Number(body.size || 0);
  const sender = String(body.sender || "Device").slice(0, 40);
  const createdAt = body.created_at || new Date().toISOString();
  const bytes = dataUrlToBytes(String(body.data_url || ""));

  if (!bytes.byteLength) throw new Error("File data is empty");
  if (bytes.byteLength > MAX_FILE_BYTES || size > MAX_FILE_BYTES) throw new Error("File exceeds the size limit");

  const objectKey = `${roomId}/${id}`;
  await env.FILES.put(objectKey, bytes, {
    httpMetadata: { contentType: type },
    customMetadata: { name, roomId, id }
  });

  await env.DB.prepare(`
    INSERT OR REPLACE INTO files (id, room_id, name, type, size, object_key, sender, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, roomId, name, type, bytes.byteLength || size, objectKey, sender, createdAt).run();

  return {
    ok: true,
    file: {
      id,
      room_id: roomId,
      name,
      type,
      size: bytes.byteLength || size,
      sender,
      created_at: createdAt,
      content_url: `${origin}/api/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(id)}/content`
    }
  };
}

async function getFileContent(request, env, rawRoomId, rawFileId) {
  const roomId = normalizeRoomId(rawRoomId);
  const fileId = decodeURIComponent(rawFileId);
  const metadata = await env.DB.prepare(`
    SELECT name, type, object_key
    FROM files
    WHERE room_id = ? AND id = ?
  `).bind(roomId, fileId).first();

  if (!metadata) return json({ error: "File not found" }, 404);

  const object = await env.FILES.get(metadata.object_key);
  if (!object) return json({ error: "File content not found" }, 404);

  const headers = new Headers();
  headers.set("Content-Type", metadata.type || object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "private, max-age=60");
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeRFC5987ValueChars(metadata.name)}`);
  headers.set("Accept-Ranges", "bytes");

  if (request.method === "HEAD") return new Response(null, { headers });
  return new Response(object.body, { headers });
}

async function clearFiles(env, roomId) {
  const files = await env.DB.prepare("SELECT object_key FROM files WHERE room_id = ?").bind(roomId).all();
  await Promise.all(files.results.map(file => env.FILES.delete(file.object_key)));
  await env.DB.prepare("DELETE FROM files WHERE room_id = ?").bind(roomId).run();
  return { ok: true };
}

async function listMessages(db, roomId) {
  const result = await db.prepare(`
    SELECT id, room_id, sender, message, created_at
    FROM chat_messages
    WHERE room_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).bind(roomId, MAX_MESSAGES).all();
  return result.results;
}

async function insertMessage(db, roomId, body) {
  const id = String(body.id || cryptoRandomId()).slice(0, 100);
  const sender = String(body.sender || "Device").slice(0, 40);
  const message = String(body.message || "").slice(0, 4000);
  const createdAt = body.created_at || new Date().toISOString();
  if (!message) throw new Error("Message is empty");

  await db.prepare(`
    INSERT INTO chat_messages (id, room_id, sender, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, roomId, sender, message, createdAt).run();

  return { ok: true, message: { id, room_id: roomId, sender, message, created_at: createdAt } };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function dataUrlToBytes(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("Invalid file data");
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";

  if (!isBase64) return new TextEncoder().encode(decodeURIComponent(payload));

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function normalizeRoomId(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function encodeRFC5987ValueChars(value) {
  return encodeURIComponent(value).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
