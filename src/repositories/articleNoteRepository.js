const { run, all, get } = require("../db/database");

async function createArticleNote(articleId, content) {
  const createdAt = new Date().toISOString();
  return run(
    `
    INSERT INTO ArticleNote (article_id, content, created_at)
    VALUES (?, ?, ?)
  `,
    [articleId, content, createdAt]
  );
}

async function listNotesByArticleId(articleId) {
  return all(
    `
    SELECT id, article_id, content, created_at
    FROM ArticleNote
    WHERE article_id = ?
    ORDER BY id DESC
  `,
    [articleId]
  );
}

async function getNoteById(noteId) {
  return get(
    `
    SELECT id, article_id, content, created_at
    FROM ArticleNote
    WHERE id = ?
  `,
    [noteId]
  );
}

async function deleteNoteById(noteId) {
  return run("DELETE FROM ArticleNote WHERE id = ?", [noteId]);
}

async function listNotesWithArticle({ keyword = "", tagId = null } = {}) {
  const trimmed = String(keyword || "").trim();
  const like = `%${trimmed}%`;
  const hasKeyword = trimmed.length > 0 ? 1 : 0;
  const hasTag = Number.isFinite(Number(tagId)) && Number(tagId) > 0 ? 1 : 0;
  const normalizedTagId = hasTag ? Number(tagId) : 0;

  return all(
    `
    SELECT
      n.id,
      n.article_id,
      n.content,
      n.created_at,
      a.title AS article_title,
      a.url AS article_url,
      a.publish_date,
      a.source,
      COALESCE(GROUP_CONCAT(t.name, ' | '), '') AS tag_names
    FROM ArticleNote n
    JOIN Article a ON a.id = n.article_id
    LEFT JOIN ArticleTag at ON at.article_id = a.id
    LEFT JOIN Tag t ON t.id = at.tag_id
    WHERE
      (? = 0 OR n.content LIKE ? OR a.title LIKE ?)
      AND
      (? = 0 OR EXISTS (
        SELECT 1
        FROM ArticleTag at2
        WHERE at2.article_id = a.id AND at2.tag_id = ?
      ))
    GROUP BY n.id
    ORDER BY n.created_at DESC, n.id DESC
  `,
    [hasKeyword, like, like, hasTag, normalizedTagId]
  );
}

module.exports = {
  createArticleNote,
  listNotesByArticleId,
  getNoteById,
  deleteNoteById,
  listNotesWithArticle,
};
