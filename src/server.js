require("dotenv").config();

const path = require("path");
const express = require("express");
const { initDb } = require("./db/database");
const articleController = require("./controllers/articleController");
const tagController = require("./controllers/tagController");
const integrationController = require("./controllers/integrationController");
const aiController = require("./controllers/aiController");
const { startAIWorker } = require("./services/aiQueueService");

const app = express();
const PORT = process.env.PORT || 8787;

app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  if (/\.(html|js|css)$/.test(req.path)) {
    res.set("Cache-Control", "no-store");
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok", now: new Date().toISOString() } });
});

app.use("/api/articles", articleController);
app.use("/api/tags", tagController);
app.use("/api/integrations", integrationController);
app.use("/api/ai", aiController);

app.use(
  express.static(path.join(__dirname, "../public"), {
    setHeaders: (res, filePath) => {
      if (/\.(html|js|css)$/.test(filePath)) {
        res.set("Cache-Control", "no-store");
      }
    },
  })
);

app.get("*", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

initDb()
  .then(() => {
    startAIWorker();
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
