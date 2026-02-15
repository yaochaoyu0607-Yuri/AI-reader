const { XMLParser } = require("fast-xml-parser");
const articleRepo = require("../repositories/articleRepository");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseFeedList(xmlText) {
  const data = parser.parse(xmlText);
  const channel = data?.rss?.channel || {};
  const items = toArray(channel.item);
  return items
    .map((item) => ({
      id: item.id || item.guid || null,
      name: item.title || "未知公众号",
    }))
    .filter((f) => Boolean(f.id));
}

function toDateOnly(input) {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function mapArticleItem(item, fallbackSource) {
  const title = item.title || "";
  const url = item.link || item.guid || "";
  const publishDate = toDateOnly(item.pubDate);
  const source = fallbackSource || "we-mp-rss";
  return {
    title,
    url,
    publish_date: publishDate,
    source,
    raw_publish_date: item.pubDate || "",
  };
}

function isValidUrl(input) {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

async function fetchXml(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`请求失败: ${url} (${res.status})`);
  }
  return res.text();
}

async function listFeeds(baseUrl) {
  const pageSize = 30; // we-mp-rss /rss endpoint max limit is 30
  let offset = 0;
  const allFeeds = [];

  for (let i = 0; i < 20; i += 1) {
    const xml = await fetchXml(`${baseUrl}/rss?limit=${pageSize}&offset=${offset}`);
    const page = parseFeedList(xml);
    allFeeds.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const dedup = new Map();
  allFeeds.forEach((f) => {
    if (!dedup.has(f.id)) dedup.set(f.id, f);
  });
  return Array.from(dedup.values());
}

async function upsertArticle(article) {
  const result = await articleRepo.createArticle({
    title: article.title,
    url: article.url,
    publish_date: article.publish_date,
    source: article.source,
    sync_origin: "we-mp-rss",
  });

  let articleId = null;
  if (result.changes === 1) {
    articleId = result.lastID;
  } else {
    const existing = await articleRepo.getArticleByUrl(article.url);
    articleId = existing?.id || null;
    if (articleId && existing?.sync_origin !== "we-mp-rss") {
      await articleRepo.markArticleSyncOrigin(articleId, "we-mp-rss");
    }
  }

  return result;
}

async function fetchFeedArticles(baseUrl, feedId, sourceName, limit, offset = 0) {
  const xml = await fetchXml(
    `${baseUrl}/rss/${encodeURIComponent(feedId)}/api?limit=${limit}&offset=${offset}`
  );
  const data = parser.parse(xml);
  const channel = data?.rss?.channel || {};
  const items = toArray(channel.item);
  const source = sourceName || channel.title || "we-mp-rss";
  return items.map((item) => mapArticleItem(item, source));
}

async function syncOneFeed(baseUrl, feedId, sourceName, limit) {
  const mapped = await fetchFeedArticles(baseUrl, feedId, sourceName, limit, 0);

  let inserted = 0;
  let ignored = 0;
  let errors = 0;
  const error_items = [];

  for (const article of mapped) {
    if (!article.title || !article.title.trim()) {
      errors += 1;
      error_items.push({
        reason: "title 为空",
        url: article.url || "",
        title: article.title || "",
      });
      continue;
    }

    if (!isValidUrl(article.url)) {
      errors += 1;
      error_items.push({
        reason: "url 非法",
        url: article.url || "",
        title: article.title,
      });
      continue;
    }

    if (!article.publish_date) {
      errors += 1;
      error_items.push({
        reason: "publish_date 非法",
        url: article.url,
        title: article.title,
        raw_publish_date: article.raw_publish_date,
      });
      continue;
    }

    try {
      const result = await upsertArticle(article);
      if (result.changes === 1) inserted += 1;
      else ignored += 1;
    } catch (error) {
      errors += 1;
      error_items.push({
        reason: error.message || "数据库写入失败",
        url: article.url,
        title: article.title,
      });
    }
  }

  return { inserted, ignored, errors, error_items };
}

async function reconcileDeleteMissing(baseUrl, feed) {
  const pageSize = 100;
  let offset = 0;
  const remoteUrls = new Set();

  for (let i = 0; i < 60; i += 1) {
    const page = await fetchFeedArticles(baseUrl, feed.id, feed.name, pageSize, offset);
    page
      .filter((a) => isValidUrl(a.url))
      .forEach((a) => {
        remoteUrls.add(a.url);
      });
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const localRows = await articleRepo.listArticleIdsBySourceOrigin(feed.name, "we-mp-rss");
  const toDelete = localRows.filter((row) => !remoteUrls.has(row.url)).map((row) => row.id);
  const deletedResult = await articleRepo.deleteArticlesByIds(toDelete);

  return {
    feed_id: feed.id,
    feed_name: feed.name,
    remote_count: remoteUrls.size,
    local_count: localRows.length,
    deleted: deletedResult.changes || 0,
  };
}

async function syncFromWeMpRss(options = {}) {
  const baseUrl = (options.base_url || "http://127.0.0.1:8001").replace(/\/+$/, "");
  const perFeedLimit = Math.max(1, Math.min(100, Number(options.limit || 30)));

  let targetFeeds = [];
  if (Array.isArray(options.feed_ids) && options.feed_ids.length > 0) {
    const all = await listFeeds(baseUrl);
    const nameMap = new Map(all.map((f) => [f.id, f.name]));
    targetFeeds = options.feed_ids.map((id) => ({ id, name: nameMap.get(id) || id }));
  } else {
    targetFeeds = await listFeeds(baseUrl);
  }

  let totalInserted = 0;
  let totalIgnored = 0;
  let totalErrors = 0;
  const detail = [];
  const error_items = [];

  for (const feed of targetFeeds) {
    const result = await syncOneFeed(baseUrl, feed.id, feed.name, perFeedLimit);
    totalInserted += result.inserted;
    totalIgnored += result.ignored;
    totalErrors += result.errors;
    error_items.push(...(result.error_items || []).map((e) => ({ ...e, feed_id: feed.id })));
    detail.push({
      feed_id: feed.id,
      feed_name: feed.name,
      inserted: result.inserted,
      ignored: result.ignored,
      errors: result.errors,
    });
  }

  return {
    base_url: baseUrl,
    feed_count: targetFeeds.length,
    inserted: totalInserted,
    ignored: totalIgnored,
    errors: totalErrors,
    detail,
    error_items,
    synced_at: new Date().toISOString(),
  };
}

async function reconcileWithWeMpRss(options = {}) {
  const baseUrl = (options.base_url || "http://127.0.0.1:8001").replace(/\/+$/, "");
  let targetFeeds = [];

  if (Array.isArray(options.feed_ids) && options.feed_ids.length > 0) {
    const all = await listFeeds(baseUrl);
    const nameMap = new Map(all.map((f) => [f.id, f.name]));
    targetFeeds = options.feed_ids.map((id) => ({ id, name: nameMap.get(id) || id }));
  } else {
    targetFeeds = await listFeeds(baseUrl);
  }

  const detail = [];
  let totalDeleted = 0;
  for (const feed of targetFeeds) {
    const item = await reconcileDeleteMissing(baseUrl, feed);
    detail.push(item);
    totalDeleted += item.deleted;
  }

  return {
    base_url: baseUrl,
    feed_count: targetFeeds.length,
    deleted: totalDeleted,
    detail,
    reconciled_at: new Date().toISOString(),
  };
}

module.exports = {
  syncFromWeMpRss,
  reconcileWithWeMpRss,
  listFeeds,
};
