const express = require("express");
const tagService = require("../services/tagService");
const articleService = require("../services/articleService");

const router = express.Router();

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, error, code = 400) {
  return res.status(code).json({ success: false, error: error.message || String(error) });
}

router.get("/", async (_req, res) => {
  try {
    const data = await tagService.listTags();
    return ok(res, data);
  } catch (error) {
    return fail(res, error, 500);
  }
});

router.post("/", async (req, res) => {
  try {
    const data = await tagService.createTag(req.body || {});
    return ok(res, data);
  } catch (error) {
    return fail(res, error, 400);
  }
});

router.put("/:id", async (req, res) => {
  try {
    const data = await tagService.updateTag(Number(req.params.id), req.body || {});
    if (!data) return fail(res, new Error("标签不存在"), 404);
    return ok(res, data);
  } catch (error) {
    return fail(res, error, 400);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const okRemoved = await tagService.removeTag(Number(req.params.id));
    if (!okRemoved) return fail(res, new Error("标签不存在"), 404);
    return ok(res, { deleted: true });
  } catch (error) {
    return fail(res, error, 400);
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const data = await articleService.getStats();
    return ok(res, data);
  } catch (error) {
    return fail(res, error, 500);
  }
});

module.exports = router;
