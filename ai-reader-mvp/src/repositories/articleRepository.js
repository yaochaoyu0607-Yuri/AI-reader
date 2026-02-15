const { run, get, all } = require("../db/database");

function normalizeDate(dateText) {
  if (!dateText) return null;
  const d = new Date(dateText);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function createArticle(article) {
  const createdAt = new Date().toISOString();
  const publishDate = normalizeDate(article.publish_date);
  if (!publishDate) {
    throw new Error("publish_date 格式无效，请使用可解析日期");
  }

  return run(
    `
    INSERT OR IGNORE INTO Article
    (title, url, publish_date, source, sync_origin, is_read, is_starred, created_at)
    VALUES (?, ?, ?, ?, ?, 0, 0, ?)
  `,
    [
      article.title,
      article.url,
      publishDate,
      article.source,
      article.sync_origin || "manual",
      createdAt,
    ]
  );
}

async function importArticles(articles) {
  let inserted = 0;
  let ignored = 0;

  for (const article of articles) {
    const result = await createArticle(article);
    if (result.changes === 1) inserted += 1;
    else ignored += 1;
  }
  return { inserted, ignored };
}

async function cleanupDuplicateArticlesByTitleDate() {
  const countRow = await get(
    `
    SELECT COUNT(*) AS count
    FROM Article
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM Article
      GROUP BY title, publish_date
    )
  `
  );

  const result = await run(
    `
    DELETE FROM Article
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM Article
      GROUP BY title, publish_date
    )
  `
  );

  return {
    deleted: result.changes,
    duplicate_candidates: countRow?.count || 0,
  };
}

async function listArticles(filter = {}) {
  const where = [];
  const params = [];

  if (filter.tagId) {
    where.push(
      "EXISTS (SELECT 1 FROM ArticleTag at WHERE at.article_id = Article.id AND at.tag_id = ?)"
    );
    params.push(filter.tagId);
  }

  if (filter.tagName) {
    where.push(
      `EXISTS (
        SELECT 1
        FROM ArticleTag at
        JOIN Tag t ON t.id = at.tag_id
        WHERE at.article_id = Article.id AND t.name = ?
      )`
    );
    params.push(filter.tagName);
  }

  const sql = `
    SELECT
      id,
      title,
      url,
      publish_date,
      source,
      sync_origin,
      is_read,
      is_starred,
      created_at,
      (
        SELECT ar.content
        FROM ArticleReflection ar
        WHERE ar.article_id = Article.id
        LIMIT 1
      ) AS reflection_content,
      (
        SELECT COUNT(*)
        FROM ArticleLink al
        WHERE al.article_id = Article.id
      ) AS link_count
    FROM Article
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY publish_date DESC, id DESC
  `;

  const rows = await all(sql, params);
  return rows.map((r) => ({
    ...r,
    is_read: Boolean(r.is_read),
    is_starred: Boolean(r.is_starred),
  }));
}

async function getArticleById(id) {
  const article = await get(
    `
    SELECT
      id,
      title,
      url,
      publish_date,
      source,
      sync_origin,
      is_read,
      is_starred,
      created_at,
      (
        SELECT COUNT(*)
        FROM ArticleLink al
        WHERE al.article_id = Article.id
      ) AS link_count
    FROM Article
    WHERE id = ?
  `,
    [id]
  );

  if (!article) return null;
  return {
    ...article,
    is_read: Boolean(article.is_read),
    is_starred: Boolean(article.is_starred),
  };
}

async function updateReadStatus(id, isRead) {
  return run("UPDATE Article SET is_read = ? WHERE id = ?", [isRead ? 1 : 0, id]);
}

async function updateStarStatus(id, isStarred) {
  return run("UPDATE Article SET is_starred = ? WHERE id = ?", [
    isStarred ? 1 : 0,
    id,
  ]);
}

async function getArticleByUrl(url) {
  return get(
    `
    SELECT id, title, url, publish_date, source, sync_origin, is_read, is_starred, created_at
    FROM Article
    WHERE url = ?
  `,
    [url]
  );
}

async function listArticleIdsBySourceOrigin(source, origin) {
  return all(
    `
    SELECT id, url
    FROM Article
    WHERE source = ? AND sync_origin = ?
  `,
    [source, origin]
  );
}

async function deleteArticlesByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { changes: 0 };
  const placeholders = ids.map(() => "?").join(", ");
  return run(`DELETE FROM Article WHERE id IN (${placeholders})`, ids);
}

async function markArticleSyncOrigin(id, syncOrigin) {
  return run("UPDATE Article SET sync_origin = ? WHERE id = ?", [syncOrigin, id]);
}

async function getStats() {
  const totalRow = await get("SELECT COUNT(*) AS count FROM Article");
  const readRow = await get("SELECT COUNT(*) AS count FROM Article WHERE is_read = 1");
  const today = new Date().toISOString().slice(0, 10);
  const unreadTodayRow = await get(
    "SELECT COUNT(*) AS count FROM Article WHERE publish_date = ? AND is_read = 0",
    [today]
  );

  const total = totalRow.count || 0;
  const read = readRow.count || 0;
  const unreadToday = unreadTodayRow.count || 0;
  const completionRate = total === 0 ? 0 : Number(((read / total) * 100).toFixed(2));

  return {
    unread_today: unreadToday,
    total_articles: total,
    read_articles: read,
    completion_rate: completionRate,
  };
}

async function listTagsForArticle(articleId) {
  return all(
    `
    SELECT t.id, t.name, t.type, t.created_at
    FROM ArticleTag at
    JOIN Tag t ON t.id = at.tag_id
    WHERE at.article_id = ?
    ORDER BY t.name ASC
  `,
    [articleId]
  );
}

async function attachTag(articleId, tagId) {
  return run("INSERT OR IGNORE INTO ArticleTag (article_id, tag_id) VALUES (?, ?)", [
    articleId,
    tagId,
  ]);
}

async function detachTag(articleId, tagId) {
  return run("DELETE FROM ArticleTag WHERE article_id = ? AND tag_id = ?", [
    articleId,
    tagId,
  ]);
}

module.exports = {
  createArticle,
  importArticles,
  cleanupDuplicateArticlesByTitleDate,
  getArticleByUrl,
  listArticleIdsBySourceOrigin,
  deleteArticlesByIds,
  markArticleSyncOrigin,
  listArticles,
  getArticleById,
  updateReadStatus,
  updateStarStatus,
  getStats,
  listTagsForArticle,
  attachTag,
  detachTag,
};
