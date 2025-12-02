const { Hono } = require("hono");
const { serve } = require("@hono/node-server");

const app = new Hono();

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Webhook server running" });
});

app.post("/webhook", async (c) => {
  const body = await c.req.json();

  console.log("=== Webhook Received ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Headers:", JSON.stringify(c.req.header(), null, 2));
  console.log("Body:", JSON.stringify(body, null, 2));
  console.log("========================");

  return c.json({ received: true });
});

const port = process.env.PORT || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
