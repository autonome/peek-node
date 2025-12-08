const { Hono } = require("hono");
const { serve } = require("@hono/node-server");
const db = require("./db");

const app = new Hono();

const API_KEY = process.env.API_KEY;

// Auth middleware
app.use("*", async (c, next) => {
  // Health check is public
  if (c.req.path === "/") {
    return next();
  }

  if (!API_KEY) {
    console.warn("WARNING: API_KEY not set, auth disabled");
    return next();
  }

  const auth = c.req.header("Authorization");
  if (!auth || auth !== `Bearer ${API_KEY}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Webhook server running" });
});

// Receive URLs from iOS app
app.post("/webhook", async (c) => {
  const body = await c.req.json();

  console.log("=== Webhook Received ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("URLs:", body.urls?.length || 0);

  const saved = [];
  if (body.urls && Array.isArray(body.urls)) {
    for (const item of body.urls) {
      if (item.url) {
        const id = db.saveUrl(item.url, item.tags || []);
        saved.push({ id, url: item.url });
        console.log(`Saved: ${item.url}`);
      }
    }
  }

  console.log("========================");

  return c.json({ received: true, saved_count: saved.length });
});

// Get all saved URLs
app.get("/urls", (c) => {
  const urls = db.getSavedUrls();
  return c.json({ urls });
});

// Get tags sorted by frecency
app.get("/tags", (c) => {
  const tags = db.getTagsByFrecency();
  return c.json({ tags });
});

// Delete a URL
app.delete("/urls/:id", (c) => {
  const id = c.req.param("id");
  db.deleteUrl(id);
  return c.json({ deleted: true });
});

// Update tags for a URL
app.patch("/urls/:id/tags", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  db.updateUrlTags(id, body.tags || []);
  return c.json({ updated: true });
});

const port = process.env.PORT || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
