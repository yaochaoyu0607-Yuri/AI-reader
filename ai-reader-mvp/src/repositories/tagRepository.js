const { run, get, all } = require("../db/database");

async function createTag({ name, type = null }) {
  const createdAt = new Date().toISOString();
  await run("INSERT OR IGNORE INTO Tag (name, type, created_at) VALUES (?, ?, ?)", [
    name,
    type,
    createdAt,
  ]);
  return findTagByNameType(name, type);
}

async function findTagByNameType(name, type = null) {
  return get("SELECT id, name, type, created_at FROM Tag WHERE name = ? AND type IS ?", [
    name,
    type,
  ]);
}

async function findTagById(id) {
  return get("SELECT id, name, type, created_at FROM Tag WHERE id = ?", [id]);
}

async function listTags() {
  return all(
    `
    SELECT
      t.id,
      t.name,
      t.type,
      t.created_at,
      COUNT(at.article_id) AS article_count
    FROM Tag t
    LEFT JOIN ArticleTag at ON at.tag_id = t.id
    GROUP BY t.id
    ORDER BY article_count DESC, t.name ASC
  `
  );
}

async function updateTag(id, { name, type = null }) {
  return run("UPDATE Tag SET name = ?, type = ? WHERE id = ?", [name, type, id]);
}

async function deleteTag(id) {
  return run("DELETE FROM Tag WHERE id = ?", [id]);
}

module.exports = {
  createTag,
  findTagByNameType,
  findTagById,
  listTags,
  updateTag,
  deleteTag,
};
