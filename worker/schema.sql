CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data_url TEXT NOT NULL,
  sender TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_room ON files(room_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room_id);
