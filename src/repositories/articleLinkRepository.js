const { run, get, all } = require("../db/database");

async function upsertArticleLink({ article_id, url, domain, title = "" }) {
  const createdAt = new Date().toISOString();
  return run(
    `
    INSERT OR IGNORE INTO ArticleLink
    (article_id, url, domain, title, is_collected, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `,
    [article_id, url, domain, title || "", createdAt]
  );
}

async function createArticleLink({ article_id, url, domain, title = "" }) {
  const createdAt = new Date().toISOString();
  return run(
    `
    INSERT OR IGNORE INTO ArticleLink
    (article_id, url, domain, title, is_collected, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `,
    [article_id, url, domain, title || "", createdAt]
  );
}

async function listLinksByArticleId(articleId) {
  return all(
    `
    SELECT id, article_id, url, domain, title, is_collected, created_at
    FROM ArticleLink
    WHERE article_id = ?
    ORDER BY id DESC
  `,
    [articleId]
  );
}

async function setCollected(linkId, isCollected) {
  return run("UPDATE ArticleLink SET is_collected = ? WHERE id = ?", [
    isCollected ? 1 : 0,
    linkId,
  ]);
}

async function getLinkById(linkId) {
  return get(
    `
    SELECT id, article_id, url, domain, title, is_collected, created_at
    FROM ArticleLink
    WHERE id = ?
  `,
    [linkId]
  );
}

async function listCollectedLinks() {
  return all(
    `
    SELECT id, article_id, url, domain, title, is_collected, created_at
    FROM ArticleLink
    WHERE is_collected = 1
    ORDER BY created_at DESC, id DESC
  `
  );
}

async function deleteLinkById(linkId) {
  return run("DELETE FROM ArticleLink WHERE id = ?", [linkId]);
}

module.exports = {
  upsertArticleLink,
  createArticleLink,
  listLinksByArticleId,
  setCollected,
  getLinkById,
  listCollectedLinks,
  deleteLinkById,
};
