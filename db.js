const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");

// Database path - use ./data for Railway volume, fallback to current dir for local dev
const DB_PATH = path.join(process.env.DATA_DIR || "./data", "peek.db");

let db = null;

function getConnection() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  const conn = db;

  // urls table
  conn.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_urls_url ON urls(url);
    CREATE INDEX IF NOT EXISTS idx_urls_deleted ON urls(deleted_at);
  `);

  // tags table
  conn.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      frequency INTEGER NOT NULL DEFAULT 0,
      last_used TEXT NOT NULL,
      frecency_score REAL NOT NULL DEFAULT 0.0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
    CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecency_score DESC);
  `);

  // url_tags junction table
  conn.exec(`
    CREATE TABLE IF NOT EXISTS url_tags (
      url_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (url_id, tag_id),
      FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  // settings table
  conn.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Enable foreign keys
  conn.pragma("foreign_keys = ON");
}

function generateUUID() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function calculateFrecency(frequency, lastUsed) {
  const lastUsedDate = new Date(lastUsed);
  const daysSinceUse = (Date.now() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = 1.0 / (1.0 + daysSinceUse / 7.0);
  return frequency * 10.0 * decayFactor;
}

function saveUrl(url, tags = []) {
  const conn = getConnection();
  const timestamp = now();

  // Check if URL already exists
  const existing = conn.prepare("SELECT id FROM urls WHERE url = ? AND deleted_at IS NULL").get(url);

  let urlId;
  if (existing) {
    urlId = existing.id;
    // Update existing URL
    conn.prepare("UPDATE urls SET updated_at = ? WHERE id = ?").run(timestamp, urlId);
    // Remove old tag associations
    conn.prepare("DELETE FROM url_tags WHERE url_id = ?").run(urlId);
  } else {
    urlId = generateUUID();
    conn.prepare(`
      INSERT INTO urls (id, url, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(urlId, url, timestamp, timestamp);
  }

  // Add tags
  for (const tagName of tags) {
    const tagId = getOrCreateTag(tagName, timestamp);
    conn.prepare(`
      INSERT OR IGNORE INTO url_tags (url_id, tag_id, created_at)
      VALUES (?, ?, ?)
    `).run(urlId, tagId, timestamp);
  }

  return urlId;
}

function getOrCreateTag(name, timestamp) {
  const conn = getConnection();

  const existing = conn.prepare("SELECT id, frequency FROM tags WHERE name = ?").get(name);

  if (existing) {
    const newFrequency = existing.frequency + 1;
    const frecencyScore = calculateFrecency(newFrequency, timestamp);
    conn.prepare(`
      UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ?
      WHERE id = ?
    `).run(newFrequency, timestamp, frecencyScore, timestamp, existing.id);
    return existing.id;
  } else {
    const frecencyScore = calculateFrecency(1, timestamp);
    const result = conn.prepare(`
      INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?, ?)
    `).run(name, timestamp, frecencyScore, timestamp, timestamp);
    return result.lastInsertRowid;
  }
}

function getSavedUrls() {
  const conn = getConnection();

  const urls = conn.prepare(`
    SELECT id, url, created_at as saved_at
    FROM urls
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
  `).all();

  // Get tags for each URL
  const getTagsStmt = conn.prepare(`
    SELECT t.name
    FROM tags t
    JOIN url_tags ut ON t.id = ut.tag_id
    WHERE ut.url_id = ?
  `);

  return urls.map((row) => ({
    id: row.id,
    url: row.url,
    saved_at: row.saved_at,
    tags: getTagsStmt.all(row.id).map((t) => t.name),
  }));
}

function getTagsByFrecency() {
  const conn = getConnection();

  return conn.prepare(`
    SELECT name, frequency, last_used, frecency_score
    FROM tags
    ORDER BY frecency_score DESC
  `).all();
}

function deleteUrl(id) {
  const conn = getConnection();
  conn.prepare("DELETE FROM urls WHERE id = ?").run(id);
}

function updateUrlTags(id, tags) {
  const conn = getConnection();
  const timestamp = now();

  // Remove old associations
  conn.prepare("DELETE FROM url_tags WHERE url_id = ?").run(id);

  // Add new tags
  for (const tagName of tags) {
    const tagId = getOrCreateTag(tagName, timestamp);
    conn.prepare(`
      INSERT OR IGNORE INTO url_tags (url_id, tag_id, created_at)
      VALUES (?, ?, ?)
    `).run(id, tagId, timestamp);
  }

  // Update URL timestamp
  conn.prepare("UPDATE urls SET updated_at = ? WHERE id = ?").run(timestamp, id);
}

function getSetting(key) {
  const conn = getConnection();
  const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  const conn = getConnection();
  conn.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

module.exports = {
  getConnection,
  saveUrl,
  getSavedUrls,
  getTagsByFrecency,
  deleteUrl,
  updateUrlTags,
  getSetting,
  setSetting,
};
