const express = require("express");
const { get } = require("../db/database");
const ragPipeline = require("../ai/ragPipeline");
const aiService = require("../ai/aiService");
const {
  getAISettingsPublic,
  saveAISettings,
  saveAISettingsProfile,
  applyAISettingsProfile,
  deleteAISettingsProfile,
} = require("../services/aiSettingsService");
const articleRepo = require("../repositories/articleRepository");
const articleNoteRepo = require("../repositories/articleNoteRepository");
const reflectionRepo = require("../repositories/articleReflectionRepository");
const tagRepo = require("../repositories/tagRepository");
const {
  enqueueArticleAI,
  processArticleEmbedding,
  processArticleSummary,
} = require("../services/aiQueueService");

const router = express.Router();

function ok(res, data) {
  return res.json({ success: true, data });
}

function fail(res, error, code = 400) {
  return res.status(code).json({ success: false, error: error.message || String(error) });
}

router.get("/settings", async (_req, res) => {
  try {
    return ok(res, await getAISettingsPublic());
  } catch (error) {
    return fail(res, error, 500);
  }
});

router.put("/settings", async (req, res) => {
  try {
    return ok(res, await saveAISettings(req.body || {}));
  } catch (error) {
    return fail(res, error, 400);
  }
});

router.post("/settings/profiles", async (req, res) => {
  try {
    return ok(res, await saveAISettingsProfile(req.body || {}));
  } catch (error) {
    return fail(res, error, 400);
  }
});

router.post("/settings/apply-profile", async (req, res) => {
  try {
    return ok(res, await applyAISettingsProfile(String(req.body?.profile_id || "").trim()));
  } catch (error) {
    return fail(res, error, 400);
  }
});

router.delete("/settings/profiles/:id", async (req, res) => {
  try {
    return ok(res, await deleteAISettingsProfile(String(req.params.id || "").trim()));
  } catch (error) {
    return fail(res, error, 400);
  }
});

router.post("/settings/test", async (req, res) => {
  try {
    return ok(res, await aiService.testExternalAIConfig(req.body || {}));
  } catch (error) {
    return fail(res, error, 400);
  }
});

router.get("/articles/:id/tag-suggestions", async (req, res) => {
  try {
    const articleId = Number(req.params.id);
    const article = await get(
      `
      SELECT a.id, a.title, a.source, a.content, ai.summary, ai.key_concepts
      FROM Article a
      LEFT JOIN ArticleAI ai ON ai.article_id = a.id
      WHERE a.id = ?
    `,
      [articleId]
    );
    if (!article) return fail(res, new Error("文章不存在"), 404);

    const notes = await articleNoteRepo.listNotesByArticleId(articleId);
    const reflection = await reflectionRepo.getReflectionByArticleId(articleId);
    const existingTags = await articleRepo.listTagsForArticle(articleId);
    const allTags = await tagRepo.listTags();

    const data = await aiService.suggestTags({
      articleId,
      title: article.title,
      source: article.source,
      summary: article.summary || "",
      keyConcepts: JSON.parse(article.key_concepts || "[]"),
      notes: notes.map((x) => x.content),
      thoughts: reflection?.content ? [reflection.content] : [],
      existingTags: existingTags.map((x) => x.name),
      candidateTags: allTags.map((x) => x.name),
    });

    return ok(res, {
      article_id: articleId,
      suggestions: data.suggestions,
    });
  } catch (error) {
    return fail(res, error, 500);
  }
});

router.post("/articles/:id/apply-tag-suggestions", async (req, res) => {
  try {
    const articleId = Number(req.params.id);
    const article = await articleRepo.getArticleById(articleId);
    if (!article) return fail(res, new Error("文章不存在"), 404);

    const inputTags = Array.isArray(req.body?.tags)
      ? req.body.tags.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    if (!inputTags.length) {
      return fail(res, new Error("tags 不能为空"), 400);
    }

    for (const name of inputTags) {
      const tag = await tagRepo.createTag({ name, type: null });
      await articleRepo.attachTag(articleId, tag.id);
    }

    await enqueueArticleAI(articleId);
    const tags = await articleRepo.listTagsForArticle(articleId);
    return ok(res, {
      article_id: articleId,
      applied: inputTags,
      tags,
    });
  } catch (error) {
    return fail(res, error, 400);
  }
});

router.get("/articles/:id/summary", async (req, res) => {
  try {
    const articleId = Number(req.params.id);
    const row = await get(
      `
      SELECT article_id, summary, core_arguments, key_concepts, actionable_insights, updated_at
      FROM ArticleAI
      WHERE article_id = ?
    `,
      [articleId]
    );
    if (!row) {
      await enqueueArticleAI(articleId);
      await processArticleEmbedding(articleId);
      await processArticleSummary(articleId);
      const refreshed = await get(
        `
        SELECT article_id, summary, core_arguments, key_concepts, actionable_insights, updated_at
        FROM ArticleAI
        WHERE article_id = ?
      `,
        [articleId]
      );
      if (!refreshed) {
        return ok(res, {
          article_id: articleId,
          status: "queued",
        });
      }
      return ok(res, {
        article_id: refreshed.article_id,
        summary: refreshed.summary,
        core_arguments: JSON.parse(refreshed.core_arguments || "[]"),
        key_concepts: JSON.parse(refreshed.key_concepts || "[]"),
        actionable_insights: JSON.parse(refreshed.actionable_insights || "[]"),
        updated_at: refreshed.updated_at,
        status: "ready",
      });
    }
    return ok(res, {
      article_id: row.article_id,
      summary: row.summary,
      core_arguments: JSON.parse(row.core_arguments || "[]"),
      key_concepts: JSON.parse(row.key_concepts || "[]"),
      actionable_insights: JSON.parse(row.actionable_insights || "[]"),
      updated_at: row.updated_at,
      status: "ready",
    });
  } catch (error) {
    return fail(res, error, 500);
  }
});

router.get("/reading-priority", async (_req, res) => {
  try {
    const data = await ragPipeline.readingPriority();
    return ok(res, data);
  } catch (error) {
    return fail(res, error, 500);
  }
});

router.get("/related-knowledge", async (req, res) => {
  try {
    const articleId = Number(req.query.articleId);
    if (!articleId) return fail(res, new Error("articleId 为必填"), 400);
    const data = await ragPipeline.relatedKnowledge(articleId);
    return ok(res, data);
  } catch (error) {
    return fail(res, error, 500);
  }
});

router.post("/knowledge-chat", async (req, res) => {
  try {
    const query = String(req.body?.query || "").trim();
    if (!query) return fail(res, new Error("query 不能为空"), 400);
    const data = await ragPipeline.knowledgeChat(query);
    return ok(res, data);
  } catch (error) {
    return fail(res, error, 500);
  }
});

router.post("/weekly-report", async (req, res) => {
  try {
    const data = await ragPipeline.weeklyReport({
      dateRange: req.body?.dateRange || {},
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error, 400);
  }
});

module.exports = router;
