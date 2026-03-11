const { all, get } = require("../db/database");
const aiService = require("./aiService");
const vectorStore = require("./vectorStore");

function toSourceId(record) {
  if (record.type === "note") return { note_id: record.id };
  if (record.type === "thought") return { thought_id: record.id };
  return { article_id: record.id };
}

function buildContextText(records) {
  return records
    .map(
      (item, idx) =>
        `[${idx + 1}] type=${item.type} id=${item.id} title=${item.title || ""} source=${item.source || ""}\n${String(
          item.text || ""
        ).slice(0, 1200)}`
    )
    .join("\n\n");
}

async function knowledgeChat(query) {
  const retrieved = await vectorStore.vectorSearch(query, { limit: 10 });
  const contextText = buildContextText(retrieved);
  const result = await aiService.answerKnowledgeQuestion({
    query,
    contextText,
    contextItems: retrieved,
  });

  const fallbackSources = retrieved.slice(0, 6).map((item) => ({
    type: item.type,
    id: item.id,
    title: item.title || "",
    ...toSourceId(item),
  }));

  return {
    answer: result.answer || "未生成回答。",
    sources: Array.isArray(result.sources) && result.sources.length ? result.sources : fallbackSources,
    retrieved_count: retrieved.length,
  };
}

async function relatedKnowledge(articleId) {
  const article = await vectorStore.getArticleVectorContext(articleId);
  if (!article) {
    throw new Error("文章不存在");
  }

  const query = [article.title, article.description, article.content, article.summary].filter(Boolean).join("\n");
  const related = await vectorStore.vectorSearch(query, {
    limit: 16,
    excludeArticleId: articleId,
  });

  const relatedArticles = related.filter((x) => x.type === "article").slice(0, 6);
  const relatedNotes = related.filter((x) => x.type === "note").slice(0, 6);
  const thoughts = related.filter((x) => x.type === "thought").slice(0, 8);

  const supporting = thoughts.filter((x) => x.score >= 0.72).slice(0, 4);
  const conflicting = thoughts.filter((x) => x.score < 0.72).slice(0, 4);

  return {
    related_articles: relatedArticles.map((x) => ({
      article_id: x.id,
      title: x.title,
      source: x.source,
      publish_date: x.publish_date,
      score: Number(x.score.toFixed(4)),
    })),
    related_notes: relatedNotes.map((x) => ({
      note_id: x.id,
      article_title: x.title,
      content: x.text.slice(0, 240),
      score: Number(x.score.toFixed(4)),
    })),
    conflicting_views: conflicting.map((x) => ({
      thought_id: x.id,
      article_title: x.title,
      content: x.text.slice(0, 240),
      score: Number(x.score.toFixed(4)),
    })),
    supporting_views: supporting.map((x) => ({
      thought_id: x.id,
      article_title: x.title,
      content: x.text.slice(0, 240),
      score: Number(x.score.toFixed(4)),
    })),
  };
}

async function readingPriority() {
  const interestEmbedding = await vectorStore.buildUserInterestEmbedding();
  const rows = await all(
    `
    SELECT
      a.id,
      a.title,
      a.source,
      a.publish_date,
      a.description,
      a.content,
      a.content_embedding,
      a.is_starred,
      COALESCE(ai.summary, '') AS ai_summary,
      COALESCE(GROUP_CONCAT(t.name, ' | '), '') AS tag_names
    FROM Article a
    LEFT JOIN ArticleAI ai ON ai.article_id = a.id
    LEFT JOIN ArticleTag at ON at.article_id = a.id
    LEFT JOIN Tag t ON t.id = at.tag_id
    WHERE a.is_read = 0
    GROUP BY a.id
    ORDER BY a.publish_date DESC, a.id DESC
  `
  );

  const scored = rows
    .map(async (row) => {
      const embedding =
        JSON.parse(row.content_embedding || "[]").length > 0
          ? JSON.parse(row.content_embedding || "[]")
          : await aiService.generateEmbedding(
              [row.title, row.source, row.description, row.content, row.ai_summary].filter(Boolean).join(" ")
            );
      const similarity = vectorStore.cosineSimilarity(interestEmbedding, embedding);
      const reasonBits = [];
      if (row.tag_names) reasonBits.push(`匹配标签：${row.tag_names.split(" | ").slice(0, 3).join(" / ")}`);
      if (row.ai_summary) reasonBits.push(`主题接近你近期关注：${row.ai_summary.slice(0, 40)}`);
      if (row.is_starred) reasonBits.push("历史上你倾向星标类似主题");
      return {
        article_id: row.id,
        title: row.title,
        source: row.source,
        publish_date: row.publish_date,
        priority_score: Number((similarity * 100).toFixed(2)),
        reason: reasonBits.join("；") || "与近期笔记和星标主题相近",
      };
    })
    ;

  const resolved = await Promise.all(scored);
  return resolved.sort((a, b) => b.priority_score - a.priority_score).slice(0, 20);
}

async function weeklyReport({ dateRange }) {
  const start = dateRange?.start || "";
  const end = dateRange?.end || "";
  if (!start || !end) {
    throw new Error("dateRange.start 和 dateRange.end 为必填");
  }

  const articles = await all(
    `
    SELECT title, description, content, source
    FROM Article
    WHERE publish_date >= ? AND publish_date <= ?
    ORDER BY publish_date DESC, id DESC
  `,
    [start, end]
  );

  const notes = await all(
    `
    SELECT n.content
    FROM ArticleNote n
    JOIN Article a ON a.id = n.article_id
    WHERE a.publish_date >= ? AND a.publish_date <= ?
    ORDER BY n.created_at DESC, n.id DESC
  `,
    [start, end]
  );

  const thoughts = await all(
    `
    SELECT r.content
    FROM ArticleReflection r
    JOIN Article a ON a.id = r.article_id
    WHERE a.publish_date >= ? AND a.publish_date <= ?
    ORDER BY r.updated_at DESC
  `,
    [start, end]
  );

  const starred = await all(
    `
    SELECT title
    FROM Article
    WHERE is_starred = 1 AND publish_date >= ? AND publish_date <= ?
    ORDER BY publish_date DESC, id DESC
  `,
    [start, end]
  );

  return aiService.generateWeeklyReport({
    dateRange: `${start} ~ ${end}`,
    articlesText: articles
      .map((x) => [x.title, x.source, x.description, x.content].filter(Boolean).join(" "))
      .join("\n"),
    notesText: notes.map((x) => x.content).join("\n"),
    thoughtsText: thoughts.map((x) => x.content).join("\n"),
    starredTitles: starred.map((x) => x.title).join("\n"),
  });
}

module.exports = {
  knowledgeChat,
  relatedKnowledge,
  readingPriority,
  weeklyReport,
};
