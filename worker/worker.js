const ALLOWED_TABLES = new Set(["files", "chat_messages"]);
const ALLOWED_ACTIONS = new Set(["insert", "query"]);

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "POST") return cors(json({ error: "POST only" }, 405));
    if (!env.DB) return cors(json({ error: "D1 binding DB is required" }, 500));

    let body;
    try {
      body = await request.json();
    } catch {
      return cors(json({ error: "Invalid JSON" }, 400));
    }

    const { table, action } = body;
    if (!ALLOWED_TABLES.has(table) || !ALLOWED_ACTIONS.has(action)) {
      return cors(json({ error: "Unsupported operation" }, 400));
    }

    try {
      if (action === "insert") return cors(json(await insertRow(env.DB, table, body.data)));
      if (action === "query") return cors(json(await queryRows(env.DB, table, body)));
      return cors(json({ error: "Unsupported action" }, 400));
    } catch (error) {
      return cors(json({ error: error.message }, 500));
    }
  }
};

async function insertRow(db, table, data = {}) {
  const allowedColumns = table === "files"
    ? ["id", "room_id", "name", "type", "size", "data_url", "sender", "created_at"]
    : ["id", "room_id", "sender", "message", "created_at"];

  const entries = Object.entries(data).filter(([key, value]) => allowedColumns.includes(key) && value !== undefined);
  if (!entries.length) throw new Error("No insertable fields");

  const columns = entries.map(([key]) => key);
  const placeholders = columns.map(() => "?").join(", ");
  const values = entries.map(([, value]) => value);

  await db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`).bind(...values).run();
  return { ok: true };
}

async function queryRows(db, table, body) {
  const filters = body.filters || {};
  const allowedSorts = new Set(["created_at ASC", "created_at DESC"]);
  const where = [];
  const values = [];

  if (filters.room_id) {
    where.push("room_id = ?");
    values.push(filters.room_id);
  }

  const limit = Math.max(1, Math.min(Number(body.limit) || 100, 200));
  const sort = allowedSorts.has(body.sort) ? body.sort : "created_at DESC";
  const sql = `SELECT * FROM ${table}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY ${sort} LIMIT ?`;

  return db.prepare(sql).bind(...values, limit).all().then(result => result.results || []);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
