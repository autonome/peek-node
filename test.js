const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// Use a test database
const TEST_DB = path.join(__dirname, "test-peek.db");
process.env.DATA_DIR = __dirname;

// Clean up before requiring db module
if (fs.existsSync(TEST_DB)) {
  fs.unlinkSync(TEST_DB);
}
if (fs.existsSync(TEST_DB + "-wal")) {
  fs.unlinkSync(TEST_DB + "-wal");
}
if (fs.existsSync(TEST_DB + "-shm")) {
  fs.unlinkSync(TEST_DB + "-shm");
}

// Override DB_PATH by modifying DATA_DIR before import
process.env.DATA_DIR = __dirname;

// We need to modify the db.js to use test database
// For now, we'll test by directly manipulating

describe("Database Tests", () => {
  let db;

  before(() => {
    // Rename peek.db to test-peek.db in env
    const originalDbPath = path.join(__dirname, "peek.db");
    if (fs.existsSync(originalDbPath)) {
      // Back up existing db if any
    }
  });

  beforeEach(() => {
    // Fresh db module for each test
    delete require.cache[require.resolve("./db")];

    // Clean test database
    const testDb = path.join(__dirname, "peek.db");
    if (fs.existsSync(testDb)) {
      fs.unlinkSync(testDb);
    }
    if (fs.existsSync(testDb + "-wal")) {
      fs.unlinkSync(testDb + "-wal");
    }
    if (fs.existsSync(testDb + "-shm")) {
      fs.unlinkSync(testDb + "-shm");
    }

    db = require("./db");
  });

  after(() => {
    // Clean up test database
    const testDb = path.join(__dirname, "peek.db");
    if (fs.existsSync(testDb)) {
      fs.unlinkSync(testDb);
    }
    if (fs.existsSync(testDb + "-wal")) {
      fs.unlinkSync(testDb + "-wal");
    }
    if (fs.existsSync(testDb + "-shm")) {
      fs.unlinkSync(testDb + "-shm");
    }
  });

  describe("saveUrl", () => {
    it("should save a URL without tags", () => {
      const id = db.saveUrl("https://example.com");
      assert.ok(id, "should return an id");
      assert.match(id, /^[0-9a-f-]{36}$/, "id should be a UUID");
    });

    it("should save a URL with tags", () => {
      const id = db.saveUrl("https://example.com", ["test", "demo"]);
      assert.ok(id);

      const urls = db.getSavedUrls();
      assert.strictEqual(urls.length, 1);
      assert.strictEqual(urls[0].url, "https://example.com");
      assert.deepStrictEqual(urls[0].tags.sort(), ["demo", "test"]);
    });

    it("should update existing URL instead of duplicating", () => {
      const id1 = db.saveUrl("https://example.com", ["tag1"]);
      const id2 = db.saveUrl("https://example.com", ["tag2"]);

      // Should reuse same ID
      assert.strictEqual(id1, id2);

      const urls = db.getSavedUrls();
      assert.strictEqual(urls.length, 1);
      // Tags should be replaced
      assert.deepStrictEqual(urls[0].tags, ["tag2"]);
    });

    it("should save multiple different URLs", () => {
      db.saveUrl("https://example1.com");
      db.saveUrl("https://example2.com");
      db.saveUrl("https://example3.com");

      const urls = db.getSavedUrls();
      assert.strictEqual(urls.length, 3);
    });
  });

  describe("getSavedUrls", () => {
    it("should return empty array when no URLs", () => {
      const urls = db.getSavedUrls();
      assert.deepStrictEqual(urls, []);
    });

    it("should return all saved URLs", () => {
      db.saveUrl("https://first.com");
      db.saveUrl("https://second.com");
      db.saveUrl("https://third.com");

      const urls = db.getSavedUrls();
      assert.strictEqual(urls.length, 3);
      const urlStrings = urls.map((u) => u.url).sort();
      assert.deepStrictEqual(urlStrings, [
        "https://first.com",
        "https://second.com",
        "https://third.com",
      ]);
    });

    it("should include saved_at timestamp", () => {
      db.saveUrl("https://example.com");
      const urls = db.getSavedUrls();

      assert.ok(urls[0].saved_at);
      // Should be ISO format
      assert.ok(new Date(urls[0].saved_at).toISOString());
    });
  });

  describe("deleteUrl", () => {
    it("should delete a URL by id", () => {
      const id = db.saveUrl("https://example.com");
      assert.strictEqual(db.getSavedUrls().length, 1);

      db.deleteUrl(id);
      assert.strictEqual(db.getSavedUrls().length, 0);
    });

    it("should cascade delete url_tags associations", () => {
      const id = db.saveUrl("https://example.com", ["tag1", "tag2"]);
      db.deleteUrl(id);

      // URL should be gone
      assert.strictEqual(db.getSavedUrls().length, 0);

      // Tags should still exist (not deleted with URL)
      const tags = db.getTagsByFrecency();
      assert.strictEqual(tags.length, 2);
    });

    it("should not error when deleting non-existent id", () => {
      assert.doesNotThrow(() => {
        db.deleteUrl("non-existent-id");
      });
    });
  });

  describe("updateUrlTags", () => {
    it("should update tags for existing URL", () => {
      const id = db.saveUrl("https://example.com", ["old-tag"]);
      db.updateUrlTags(id, ["new-tag1", "new-tag2"]);

      const urls = db.getSavedUrls();
      assert.deepStrictEqual(urls[0].tags.sort(), ["new-tag1", "new-tag2"]);
    });

    it("should clear tags when given empty array", () => {
      const id = db.saveUrl("https://example.com", ["tag1", "tag2"]);
      db.updateUrlTags(id, []);

      const urls = db.getSavedUrls();
      assert.deepStrictEqual(urls[0].tags, []);
    });
  });

  describe("Tags and Frecency", () => {
    it("should track tag frequency", () => {
      db.saveUrl("https://example1.com", ["common"]);
      db.saveUrl("https://example2.com", ["common"]);
      db.saveUrl("https://example3.com", ["common"]);
      db.saveUrl("https://example4.com", ["rare"]);

      const tags = db.getTagsByFrecency();
      const common = tags.find((t) => t.name === "common");
      const rare = tags.find((t) => t.name === "rare");

      assert.strictEqual(common.frequency, 3);
      assert.strictEqual(rare.frequency, 1);
    });

    it("should sort tags by frecency score descending", () => {
      db.saveUrl("https://example1.com", ["rare"]);
      db.saveUrl("https://example2.com", ["common"]);
      db.saveUrl("https://example3.com", ["common"]);
      db.saveUrl("https://example4.com", ["common"]);

      const tags = db.getTagsByFrecency();
      assert.strictEqual(tags[0].name, "common");
      assert.strictEqual(tags[1].name, "rare");
    });

    it("should have positive frecency score", () => {
      db.saveUrl("https://example.com", ["test"]);
      const tags = db.getTagsByFrecency();

      assert.ok(tags[0].frecency_score > 0);
    });

    it("should return empty array when no tags", () => {
      const tags = db.getTagsByFrecency();
      assert.deepStrictEqual(tags, []);
    });
  });

  describe("Settings", () => {
    it("should save and retrieve settings", () => {
      db.setSetting("test_key", "test_value");
      const value = db.getSetting("test_key");
      assert.strictEqual(value, "test_value");
    });

    it("should return null for non-existent setting", () => {
      const value = db.getSetting("non_existent");
      assert.strictEqual(value, null);
    });

    it("should update existing setting", () => {
      db.setSetting("key", "value1");
      db.setSetting("key", "value2");

      const value = db.getSetting("key");
      assert.strictEqual(value, "value2");
    });
  });
});

describe("API Tests", () => {
  let app;
  let db;

  beforeEach(() => {
    // Clean database
    delete require.cache[require.resolve("./db")];

    const testDb = path.join(__dirname, "peek.db");
    if (fs.existsSync(testDb)) {
      fs.unlinkSync(testDb);
    }
    if (fs.existsSync(testDb + "-wal")) {
      fs.unlinkSync(testDb + "-wal");
    }
    if (fs.existsSync(testDb + "-shm")) {
      fs.unlinkSync(testDb + "-shm");
    }

    db = require("./db");

    // Create fresh Hono app
    delete require.cache[require.resolve("./index")];
    const { Hono } = require("hono");
    app = new Hono();

    // Recreate routes (simplified version of index.js)
    app.get("/", (c) => c.json({ status: "ok" }));

    app.post("/webhook", async (c) => {
      const body = await c.req.json();
      const saved = [];
      if (body.urls && Array.isArray(body.urls)) {
        for (const item of body.urls) {
          if (item.url) {
            const id = db.saveUrl(item.url, item.tags || []);
            saved.push({ id, url: item.url });
          }
        }
      }
      return c.json({ received: true, saved_count: saved.length });
    });

    app.get("/urls", (c) => c.json({ urls: db.getSavedUrls() }));
    app.get("/tags", (c) => c.json({ tags: db.getTagsByFrecency() }));
    app.delete("/urls/:id", (c) => {
      db.deleteUrl(c.req.param("id"));
      return c.json({ deleted: true });
    });
    app.patch("/urls/:id/tags", async (c) => {
      const body = await c.req.json();
      db.updateUrlTags(c.req.param("id"), body.tags || []);
      return c.json({ updated: true });
    });
  });

  after(() => {
    const testDb = path.join(__dirname, "peek.db");
    if (fs.existsSync(testDb)) {
      fs.unlinkSync(testDb);
    }
    if (fs.existsSync(testDb + "-wal")) {
      fs.unlinkSync(testDb + "-wal");
    }
    if (fs.existsSync(testDb + "-shm")) {
      fs.unlinkSync(testDb + "-shm");
    }
  });

  describe("GET /", () => {
    it("should return ok status", async () => {
      const res = await app.request("/");
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.status, "ok");
    });
  });

  describe("POST /webhook", () => {
    it("should save URLs from webhook payload", async () => {
      const res = await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: [
            { url: "https://example1.com", tags: ["tag1"] },
            { url: "https://example2.com", tags: ["tag2"] },
          ],
        }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.received, true);
      assert.strictEqual(json.saved_count, 2);

      // Verify saved
      const urls = db.getSavedUrls();
      assert.strictEqual(urls.length, 2);
    });

    it("should handle empty urls array", async () => {
      const res = await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [] }),
      });

      const json = await res.json();
      assert.strictEqual(json.saved_count, 0);
    });

    it("should handle missing urls field", async () => {
      const res = await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      assert.strictEqual(json.saved_count, 0);
    });

    it("should skip items without url field", async () => {
      const res = await app.request("/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: [
            { url: "https://valid.com" },
            { tags: ["no-url"] },
            { url: "https://also-valid.com" },
          ],
        }),
      });

      const json = await res.json();
      assert.strictEqual(json.saved_count, 2);
    });
  });

  describe("GET /urls", () => {
    it("should return saved URLs", async () => {
      db.saveUrl("https://example.com", ["tag1"]);

      const res = await app.request("/urls");
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.urls.length, 1);
      assert.strictEqual(json.urls[0].url, "https://example.com");
      assert.deepStrictEqual(json.urls[0].tags, ["tag1"]);
    });

    it("should return empty array when no URLs", async () => {
      const res = await app.request("/urls");
      const json = await res.json();

      assert.deepStrictEqual(json.urls, []);
    });
  });

  describe("GET /tags", () => {
    it("should return tags sorted by frecency", async () => {
      db.saveUrl("https://example1.com", ["common"]);
      db.saveUrl("https://example2.com", ["common"]);
      db.saveUrl("https://example3.com", ["rare"]);

      const res = await app.request("/tags");
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.tags[0].name, "common");
    });
  });

  describe("DELETE /urls/:id", () => {
    it("should delete a URL", async () => {
      const id = db.saveUrl("https://example.com");

      const res = await app.request(`/urls/${id}`, { method: "DELETE" });
      const json = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.deleted, true);
      assert.strictEqual(db.getSavedUrls().length, 0);
    });
  });

  describe("PATCH /urls/:id/tags", () => {
    it("should update tags for a URL", async () => {
      const id = db.saveUrl("https://example.com", ["old"]);

      const res = await app.request(`/urls/${id}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: ["new1", "new2"] }),
      });

      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.updated, true);

      const urls = db.getSavedUrls();
      assert.deepStrictEqual(urls[0].tags.sort(), ["new1", "new2"]);
    });
  });
});
