const { get, run, all } = require("../db/database");

async function getReflectionByArticleId(articleId) {
  return get(
    `
    SELECT article_id, content, created_at, updated_at
    FROM ArticleReflection
    WHERE article_id = ?
  `,
    [articleId]
  );
}

async function upsertReflection(articleId, content) {
  const now = new Date().toISOString();
  return run(
    `
    INSERT INTO ArticleReflection (article_id, content, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(article_id) DO UPDATE SET
      content = excluded.content,
      updated_at = excluded.updated_at
  `,
    [articleId, content, now, now]
  );
}

async function listReflectionsWithArticle({ keyword = "", tagId = null } = {}) {
  const trimmed = String(keyword || "").trim();
  const like = `%${trimmed}%`;
  const hasKeyword = trimmed.length > 0 ? 1 : 0;
  const hasTag = Number.isFinite(Number(tagId)) && Number(tagId) > 0 ? 1 : 0;
  const normalizedTagId = hasTag ? Number(tagId) : 0;

  return all(
    `
    SELECT
      r.article_id,
      r.content,
      r.created_at,
      r.updated_at,
      a.title AS article_title,
      a.url AS article_url,
      a.publish_date,
      a.source,
      COALESCE(GROUP_CONCAT(t.name, ' | '), '') AS tag_names
    FROM ArticleReflection r
    JOIN Article a ON a.id = r.article_id
    LEFT JOIN ArticleTag at ON at.article_id = a.id
    LEFT JOIN Tag t ON t.id = at.tag_id
    WHERE
      (? = 0 OR r.content LIKE ? OR a.title LIKE ?)
      AND
      (? = 0 OR EXISTS (
        SELECT 1
        FROM ArticleTag at2
        WHERE at2.article_id = a.id AND at2.tag_id = ?
      ))
    GROUP BY r.article_id
    ORDER BY r.updated_at DESC
  `,
    [hasKeyword, like, like, hasTag, normalizedTagId]
  );
}

module.exports = {
  getReflectionByArticleId,
  upsertReflection,
  listReflectionsWithArticle,
};
