const { all, get } = require("../db/database");
const { generateEmbedding, normalizeWhitespace } = require("./aiService");

function parseEmbedding(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch (_error) {
    return [];
  }
}

function cosineSimilarity(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denom) return 0;
  return dot / denom;
}

async function loadVectorRecords() {
  const rows = await all(
    `
    SELECT
      'article' AS type,
      a.id,
      a.title,
      a.url,
      a.publish_date,
      a.source,
      a.content AS text,
      a.content_embedding AS embedding
    FROM Article a
    WHERE a.content_embedding IS NOT NULL
    UNION ALL
    SELECT
      'note' AS type,
      n.id,
      a.title,
      a.url,
      a.publish_date,
      a.source,
      n.content AS text,
      n.content_embedding AS embedding
    FROM ArticleNote n
    JOIN Article a ON a.id = n.article_id
    WHERE n.content_embedding IS NOT NULL
    UNION ALL
    SELECT
      'thought' AS type,
      r.article_id AS id,
      a.title,
      a.url,
      a.publish_date,
      a.source,
      r.content AS text,
      r.content_embedding AS embedding
    FROM ArticleReflection r
    JOIN Article a ON a.id = r.article_id
    WHERE r.content_embedding IS NOT NULL
    UNION ALL
    SELECT
      'article_ai' AS type,
      ai.article_id AS id,
      a.title,
      a.url,
      a.publish_date,
      a.source,
      ai.summary AS text,
      ai.embedding AS embedding
    FROM ArticleAI ai
    JOIN Article a ON a.id = ai.article_id
    WHERE ai.embedding IS NOT NULL
  `
  );

  return rows.map((row) => ({
    ...row,
    text: normalizeWhitespace(row.text || ""),
    embedding: parseEmbedding(row.embedding),
  }));
}

async function vectorSearch(query, { limit = 8, types = null, excludeArticleId = null } = {}) {
  const queryEmbedding = await generateEmbedding(query);
  const rows = await loadVectorRecords();
  return rows
    .filter((row) => row.embedding.length > 0)
    .filter((row) => !types || types.includes(row.type))
    .filter((row) => !excludeArticleId || Number(row.id) !== Number(excludeArticleId))
    .map((row) => ({
      ...row,
      score: cosineSimilarity(queryEmbedding, row.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function buildUserInterestEmbedding() {
  const rows = await all(
    `
    SELECT title, source, description, content
    FROM Article
    WHERE is_starred = 1
    ORDER BY publish_date DESC, id DESC
    LIMIT 20
  `
  );

  const noteRows = await all(
    `
    SELECT content
    FROM ArticleNote
    ORDER BY created_at DESC, id DESC
    LIMIT 30
  `
  );

  const tagRows = await all(
    `
    SELECT t.name
    FROM Tag t
    JOIN ArticleTag at ON at.tag_id = t.id
    GROUP BY t.id
    ORDER BY COUNT(at.article_id) DESC, t.name ASC
    LIMIT 20
  `
  );

  const merged = [
    ...rows.map((row) => [row.title, row.source, row.description, row.content].filter(Boolean).join(" ")),
    ...noteRows.map((row) => row.content),
    ...tagRows.map((row) => row.name),
  ]
    .filter(Boolean)
    .join("\n");

  return generateEmbedding(merged);
}

async function getArticleVectorContext(articleId) {
  return get(
    `
    SELECT
      a.id,
      a.title,
      a.description,
      a.content,
      a.publish_date,
      a.source,
      ai.summary,
      ai.key_concepts
    FROM Article a
    LEFT JOIN ArticleAI ai ON ai.article_id = a.id
    WHERE a.id = ?
  `,
    [articleId]
  );
}

module.exports = {
  cosineSimilarity,
  vectorSearch,
  buildUserInterestEmbedding,
  getArticleVectorContext,
};
