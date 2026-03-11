const { all, get, run } = require("../db/database");
const aiService = require("../ai/aiService");

let workerTimer = null;
let workerBusy = false;
let bootstrapStarted = false;

async function enqueueJob(jobType, entityType, entityId, payload = {}) {
  const now = new Date().toISOString();
  await run(
    `
    INSERT INTO AIQueue (job_type, entity_type, entity_id, payload, status, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)
    ON CONFLICT(job_type, entity_type, entity_id) DO UPDATE SET
      payload = excluded.payload,
      status = 'pending',
      error = NULL,
      updated_at = excluded.updated_at
  `,
    [jobType, entityType, entityId, JSON.stringify(payload || {}), now, now]
  );
}

async function enqueueArticleAI(articleId) {
  await enqueueJob("embed", "article", articleId);
  await enqueueJob("summary", "article", articleId);
}

async function enqueueNoteEmbedding(noteId) {
  await enqueueJob("embed", "note", noteId);
}

async function enqueueReflectionEmbedding(articleId) {
  await enqueueJob("embed", "thought", articleId);
}

async function getArticlePayload(articleId) {
  const article = await get(
    `
    SELECT
      a.id,
      a.title,
      a.source,
      a.publish_date,
      a.description,
      a.content
    FROM Article a
    WHERE a.id = ?
  `,
    [articleId]
  );
  if (!article) return null;

  const notes = await all(
    "SELECT content FROM ArticleNote WHERE article_id = ? ORDER BY id DESC LIMIT 8",
    [articleId]
  );
  const thoughts = await all(
    "SELECT content FROM ArticleReflection WHERE article_id = ?",
    [articleId]
  );
  const tags = await all(
    `
    SELECT t.name
    FROM ArticleTag at
    JOIN Tag t ON t.id = at.tag_id
    WHERE at.article_id = ?
    ORDER BY t.name ASC
  `,
    [articleId]
  );

  return {
    articleId,
    title: article.title,
    source: article.source,
    publishDate: article.publish_date,
    description: article.description || "",
    content: article.content || "",
    notes: notes.map((x) => x.content),
    thoughts: thoughts.map((x) => x.content),
    tags: tags.map((x) => x.name),
  };
}

async function processArticleEmbedding(articleId) {
  const payload = await getArticlePayload(articleId);
  if (!payload) return;
  const text = [
    payload.title,
    payload.source,
    payload.description,
    payload.content,
    payload.tags.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
  const embedding = await aiService.generateEmbedding(text);
  await run("UPDATE Article SET content_embedding = ?, ai_status = ? WHERE id = ?", [
    JSON.stringify(embedding),
    "embedded",
    articleId,
  ]);
}

async function processArticleSummary(articleId) {
  const payload = await getArticlePayload(articleId);
  if (!payload) return;
  const summary = await aiService.summarizeArticle(payload);
  const embedding = await aiService.generateEmbedding(
    [summary.summary, ...(summary.key_concepts || []), ...(summary.core_arguments || [])].join("\n")
  );
  const now = new Date().toISOString();
  await run(
    `
    INSERT INTO ArticleAI
    (article_id, summary, core_arguments, key_concepts, actionable_insights, embedding, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(article_id) DO UPDATE SET
      summary = excluded.summary,
      core_arguments = excluded.core_arguments,
      key_concepts = excluded.key_concepts,
      actionable_insights = excluded.actionable_insights,
      embedding = excluded.embedding,
      updated_at = excluded.updated_at
  `,
    [
      articleId,
      summary.summary || "",
      JSON.stringify(summary.core_arguments || []),
      JSON.stringify(summary.key_concepts || []),
      JSON.stringify(summary.actionable_insights || []),
      JSON.stringify(embedding),
      now,
      now,
    ]
  );
  await run("UPDATE Article SET ai_status = ? WHERE id = ?", ["ready", articleId]);
}

async function processNoteEmbedding(noteId) {
  const note = await get("SELECT id, content FROM ArticleNote WHERE id = ?", [noteId]);
  if (!note) return;
  const embedding = await aiService.generateEmbedding(note.content || "");
  await run("UPDATE ArticleNote SET content_embedding = ? WHERE id = ?", [
    JSON.stringify(embedding),
    noteId,
  ]);
}

async function processThoughtEmbedding(articleId) {
  const thought = await get("SELECT article_id, content FROM ArticleReflection WHERE article_id = ?", [articleId]);
  if (!thought) return;
  const embedding = await aiService.generateEmbedding(thought.content || "");
  await run("UPDATE ArticleReflection SET content_embedding = ? WHERE article_id = ?", [
    JSON.stringify(embedding),
    articleId,
  ]);
}

async function processJob(job) {
  if (job.entity_type === "article" && job.job_type === "embed") {
    await processArticleEmbedding(job.entity_id);
    return;
  }
  if (job.entity_type === "article" && job.job_type === "summary") {
    await processArticleSummary(job.entity_id);
    return;
  }
  if (job.entity_type === "note" && job.job_type === "embed") {
    await processNoteEmbedding(job.entity_id);
    return;
  }
  if (job.entity_type === "thought" && job.job_type === "embed") {
    await processThoughtEmbedding(job.entity_id);
  }
}

async function drainQueue() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const job = await get(
      `
      SELECT id, job_type, entity_type, entity_id, payload
      FROM AIQueue
      WHERE status = 'pending'
      ORDER BY updated_at ASC, id ASC
      LIMIT 1
    `
    );
    if (!job) return;

    await run("UPDATE AIQueue SET status = 'processing', updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      job.id,
    ]);

    try {
      await processJob(job);
      await run("UPDATE AIQueue SET status = 'done', error = NULL, updated_at = ? WHERE id = ?", [
        new Date().toISOString(),
        job.id,
      ]);
    } catch (error) {
      await run("UPDATE AIQueue SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", [
        error.message || String(error),
        new Date().toISOString(),
        job.id,
      ]);
    }
  } finally {
    workerBusy = false;
  }
}

async function bootstrapAIBackfill() {
  if (bootstrapStarted) return;
  bootstrapStarted = true;

  const articles = await all(
    `
    SELECT id
    FROM Article
    WHERE COALESCE(content, '') <> ''
      AND (
        content_embedding IS NULL
        OR ai_status IS NULL
        OR ai_status <> 'ready'
      )
    ORDER BY id DESC
    LIMIT 200
  `
  );
  for (const row of articles) {
    await enqueueArticleAI(row.id);
  }

  const notes = await all(
    `
    SELECT id
    FROM ArticleNote
    WHERE content_embedding IS NULL
    ORDER BY id DESC
    LIMIT 200
  `
  );
  for (const row of notes) {
    await enqueueNoteEmbedding(row.id);
  }

  const thoughts = await all(
    `
    SELECT article_id
    FROM ArticleReflection
    WHERE content_embedding IS NULL
    ORDER BY updated_at DESC
    LIMIT 200
  `
  );
  for (const row of thoughts) {
    await enqueueReflectionEmbedding(row.article_id);
  }
}

function startAIWorker() {
  if (workerTimer) return;
  bootstrapAIBackfill().catch(() => {});
  workerTimer = setInterval(() => {
    drainQueue().catch(() => {});
  }, 1500);
}

module.exports = {
  enqueueArticleAI,
  enqueueNoteEmbedding,
  enqueueReflectionEmbedding,
  startAIWorker,
  processArticleEmbedding,
  processArticleSummary,
};
