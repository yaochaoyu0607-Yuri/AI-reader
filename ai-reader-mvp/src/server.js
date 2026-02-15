const path = require("path");
const express = require("express");
const { initDb } = require("./db/database");
const articleController = require("./controllers/articleController");
const tagController = require("./controllers/tagController");
const integrationController = require("./controllers/integrationController");

const app = express();
const PORT = process.env.PORT || 8787;

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok", now: new Date().toISOString() } });
});

app.use("/api/articles", articleController);
app.use("/api/tags", tagController);
app.use("/api/integrations", integrationController);

app.use(express.static(path.join(__dirname, "../public")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`AI Reader MVP running at http://127.0.0.1:${PORT}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("DB init failed:", error);
    process.exit(1);
  });
