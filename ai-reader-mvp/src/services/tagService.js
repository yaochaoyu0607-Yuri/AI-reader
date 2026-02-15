const tagRepo = require("../repositories/tagRepository");

async function listTags() {
  return tagRepo.listTags();
}

async function createTag(payload) {
  if (!payload?.name) {
    throw new Error("tag name 不能为空");
  }
  return tagRepo.createTag({
    name: payload.name.trim(),
    type: payload.type ? payload.type.trim() : null,
  });
}

async function updateTag(id, payload) {
  const tag = await tagRepo.findTagById(id);
  if (!tag) return null;
  const name = (payload?.name || "").trim();
  if (!name) throw new Error("tag name 不能为空");
  await tagRepo.updateTag(id, {
    name,
    type: payload?.type ? payload.type.trim() : null,
  });
  return tagRepo.findTagById(id);
}

async function removeTag(id) {
  const tag = await tagRepo.findTagById(id);
  if (!tag) return null;
  await tagRepo.deleteTag(id);
  return true;
}

module.exports = {
  listTags,
  createTag,
  updateTag,
  removeTag,
};
