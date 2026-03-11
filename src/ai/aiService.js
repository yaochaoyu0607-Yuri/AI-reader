const crypto = require("crypto");
const { get, run } = require("../db/database");
const prompts = require("./promptTemplates");
const { getAISettingsInternal } = require("../services/aiSettingsService");

const DEFAULT_EMBEDDING_DIM = 256;

function hashInput(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function safeJsonParse(input, fallback) {
  try {
    return JSON.parse(input);
  } catch (_error) {
    return fallback;
  }
}

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function normalizeVector(vector) {
  const sum = Math.sqrt(vector.reduce((acc, n) => acc + n * n, 0)) || 1;
  return vector.map((n) => Number((n / sum).toFixed(8)));
}

function localEmbedding(text, dim = DEFAULT_EMBEDDING_DIM) {
  const vector = new Array(dim).fill(0);
  const tokens = tokenize(text);
  tokens.forEach((token) => {
    const digest = crypto.createHash("md5").update(token).digest();
    const idx = digest[0] % dim;
    const sign = digest[1] % 2 === 0 ? 1 : -1;
    const weight = 1 + (digest[2] % 5) / 5;
    vector[idx] += sign * weight;
  });
  return normalizeVector(vector);
}

function topKeywords(text, limit = 6) {
  const freq = new Map();
  tokenize(text).forEach((token) => {
    freq.set(token, (freq.get(token) || 0) + 1);
  });
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

function sentenceSplit(text) {
  return normalizeWhitespace(text)
    .split(/(?<=[。！？.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function localArticleSummary(payload) {
  const articleText = normalizeWhitespace(
    [payload.title, payload.description, payload.content].filter(Boolean).join(" ")
  );
  const sentences = sentenceSplit(articleText);
  const summary = sentences.slice(0, 3).join(" ") || payload.title;
  const concepts = topKeywords(articleText, 6);
  const notes = (payload.notes || []).slice(0, 3);
  const thoughts = (payload.thoughts || []).slice(0, 3);

  return {
    summary,
    core_arguments: sentences.slice(0, 4).map((s) => s.slice(0, 120)),
    key_concepts: concepts,
    actionable_insights: [
      ...notes.map((n) => `结合笔记延展：${n.slice(0, 80)}`),
      ...thoughts.map((t) => `结合感想反思：${t.slice(0, 80)}`),
    ].slice(0, 4),
  };
}

function localKnowledgeAnswer({ query, contextItems }) {
  const queryTokens = new Set(tokenize(query));
  const ranked = contextItems
    .map((item) => {
      const hay = normalizeWhitespace(item.text || "");
      const overlap = tokenize(hay).filter((t) => queryTokens.has(t)).length;
      return { ...item, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap || (b.score || 0) - (a.score || 0))
    .slice(0, 5);

  const answer = ranked.length
    ? ranked
        .map((item, idx) => `${idx + 1}. ${item.title || item.type}：${normalizeWhitespace(item.text).slice(0, 160)}`)
        .join("\n")
    : "当前知识库中没有足够上下文支持回答这个问题。";

  return {
    answer,
    sources: ranked.map((item) => ({
      type: item.type,
      id: item.id,
      title: item.title || "",
    })),
  };
}

function localWeeklyReport(payload) {
  const articleText = payload.articlesText || "";
  const notesText = payload.notesText || "";
  const thoughtsText = payload.thoughtsText || "";
  const merged = [articleText, notesText, thoughtsText].join(" ");
  const keywords = topKeywords(merged, 8);

  return {
    themes: keywords.slice(0, 4),
    new_ideas: sentenceSplit(notesText).slice(0, 4),
    changing_opinions: sentenceSplit(thoughtsText).slice(0, 4),
    recommended_topics: keywords.slice(4, 8),
  };
}

function localTagSuggestions(payload) {
  const used = new Set((payload.existingTags || []).map((x) => String(x || "").trim().toLowerCase()));
  const candidatePool = (payload.candidateTags || [])
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const candidateMap = new Map(candidatePool.map((x) => [x.toLowerCase(), x]));

  const ranked = [];
  const addSuggestion = (name, reason, confidence) => {
    const normalized = String(name || "").trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (used.has(key)) return;
    if (ranked.some((item) => item.name.toLowerCase() === key)) return;
    ranked.push({
      name: candidateMap.get(key) || normalized,
      reason,
      confidence,
    });
  };

  (payload.keyConcepts || []).forEach((concept, idx) => {
    const key = String(concept || "").trim();
    if (!key) return;
    addSuggestion(key, "来自 AI 提炼的关键概念", Number((0.88 - idx * 0.05).toFixed(2)));
  });

  candidatePool.forEach((tag) => {
    const lower = tag.toLowerCase();
    const mergedText = [
      payload.title,
      payload.summary,
      ...(payload.notes || []),
      ...(payload.thoughts || []),
      ...(payload.keyConcepts || []),
    ]
      .join(" ")
      .toLowerCase();
    if (mergedText.includes(lower)) {
      addSuggestion(tag, "与文章主题和你的笔记高度匹配", 0.82);
    }
  });

  return {
    suggestions: ranked.slice(0, 6),
  };
}

async function getCache(inputHash) {
  const row = await get("SELECT response FROM AI_CACHE WHERE input_hash = ?", [inputHash]);
  return row ? safeJsonParse(row.response, null) : null;
}

async function setCache(inputHash, response) {
  await run(
    `
    INSERT INTO AI_CACHE (input_hash, response, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(input_hash) DO UPDATE SET response = excluded.response, created_at = excluded.created_at
  `,
    [inputHash, JSON.stringify(response), new Date().toISOString()]
  );
}

async function callJsonModel({ prompt, fallbackFactory, cacheKey, responseSchemaHint = "" }) {
  const inputHash = hashInput(`${cacheKey}\n${prompt}\n${responseSchemaHint}`);
  const cached = await getCache(inputHash);
  if (cached) return cached;

  const runtime = await getRuntimeConfig();
  if (!runtime.apiKey || !runtime.chatModel) {
    const fallback = fallbackFactory();
    await setCache(inputHash, fallback);
    return fallback;
  }

  const body = {
    model: runtime.chatModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Return strict JSON only. No markdown fences. Be deterministic.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  const res = await fetch(`${runtime.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtime.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const fallback = fallbackFactory();
    await setCache(inputHash, fallback);
    return fallback;
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "{}";
  const parsed = typeof raw === "string" ? safeJsonParse(raw, fallbackFactory()) : raw;
  await setCache(inputHash, parsed);
  return parsed;
}

async function generateEmbedding(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const runtime = await getRuntimeConfig();
  if (!runtime.apiKey || !runtime.embeddingModel || runtime.useLocalEmbedding) {
    return localEmbedding(normalized);
  }

  const model = runtime.embeddingModel;
  const cacheKey = hashInput(`embedding:${model}:${normalized}`);
  const cached = await getCache(cacheKey);
  if (cached?.embedding) return cached.embedding;

  const res = await fetch(`${runtime.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtime.apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: normalized,
    }),
  });

  if (!res.ok) {
    const fallback = localEmbedding(normalized);
    await setCache(cacheKey, { embedding: fallback });
    return fallback;
  }

  const data = await res.json();
  const embedding = data?.data?.[0]?.embedding || localEmbedding(normalized);
  await setCache(cacheKey, { embedding });
  return embedding;
}

async function getRuntimeConfig() {
  const settings = await getAISettingsInternal();
  return {
    provider: settings.provider || "openai",
    baseUrl: (settings.base_url || process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(
      /\/+$/,
      ""
    ),
    apiKey: settings.api_key || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
    chatModel: settings.chat_model || process.env.AI_CHAT_MODEL || "gpt-4.1-mini",
    embeddingModel:
      settings.embedding_model || process.env.AI_EMBEDDING_MODEL || "text-embedding-3-large",
    useLocalEmbedding: Boolean(settings.use_local_embedding),
  };
}

async function testExternalAIConfig(override = null) {
  const runtime = override
    ? {
        provider: override.provider || "compatible",
        baseUrl: (override.base_url || "https://api.openai.com/v1").replace(/\/+$/, ""),
        apiKey: override.api_key || "",
        chatModel: override.chat_model || "",
        embeddingModel: override.embedding_model || "",
        useLocalEmbedding: Boolean(override.use_local_embedding),
      }
    : await getRuntimeConfig();

  if (!runtime.apiKey) {
    throw new Error("请先填写 API Key");
  }
  if (!runtime.chatModel) {
    throw new Error("请先填写聊天模型");
  }

  const chatRes = await fetch(`${runtime.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtime.apiKey}`,
    },
    body: JSON.stringify({
      model: runtime.chatModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: 'Return {"status":"ok"}' },
      ],
    }),
  });

  if (!chatRes.ok) {
    throw new Error(`聊天模型测试失败 (${chatRes.status})`);
  }

  let embeddingStatus = "local";
  if (!runtime.useLocalEmbedding && runtime.embeddingModel) {
    const embedRes = await fetch(`${runtime.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtime.apiKey}`,
      },
      body: JSON.stringify({
        model: runtime.embeddingModel,
        input: "hello world",
      }),
    });
    if (!embedRes.ok) {
      throw new Error(`Embedding 模型测试失败 (${embedRes.status})`);
    }
    embeddingStatus = "remote";
  }

  return {
    success: true,
    provider: runtime.provider,
    base_url: runtime.baseUrl,
    chat_model: runtime.chatModel,
    embedding_mode: embeddingStatus,
    message: embeddingStatus === "remote" ? "聊天和 embedding 都测试成功" : "聊天测试成功，embedding 使用本地模式",
  };
}

async function summarizeArticle(payload) {
  const prompt = prompts.buildArticleSummaryPrompt(payload);
  return callJsonModel({
    prompt,
    cacheKey: `article-summary:${payload.articleId}`,
    responseSchemaHint: "summary/core_arguments/key_concepts/actionable_insights",
    fallbackFactory: () => localArticleSummary(payload),
  });
}

async function answerKnowledgeQuestion({ query, contextText, contextItems }) {
  const prompt = prompts.buildKnowledgeChatPrompt({
    query,
    context: contextText,
  });
  return callJsonModel({
    prompt,
    cacheKey: `knowledge-chat:${query}`,
    responseSchemaHint: "answer/sources",
    fallbackFactory: () => localKnowledgeAnswer({ query, contextItems }),
  });
}

async function generateWeeklyReport(payload) {
  const prompt = prompts.buildWeeklyReportPrompt({
    dateRange: payload.dateRange,
    articles: payload.articlesText,
    notes: payload.notesText,
    thoughts: payload.thoughtsText,
    starredTitles: payload.starredTitles,
  });
  return callJsonModel({
    prompt,
    cacheKey: `weekly-report:${payload.dateRange}`,
    responseSchemaHint: "themes/new_ideas/changing_opinions/recommended_topics",
    fallbackFactory: () => localWeeklyReport(payload),
  });
}

async function suggestTags(payload) {
  const prompt = prompts.buildTagSuggestionPrompt(payload);
  const result = await callJsonModel({
    prompt,
    cacheKey: `tag-suggestions:${payload.articleId}:${(payload.existingTags || []).join("|")}`,
    responseSchemaHint: "suggestions[{name,reason,confidence}]",
    fallbackFactory: () => localTagSuggestions(payload),
  });
  return {
    suggestions: Array.isArray(result.suggestions)
      ? result.suggestions
          .map((item) => ({
            name: String(item.name || "").trim(),
            reason: String(item.reason || "").trim(),
            confidence: Number(item.confidence || 0),
          }))
          .filter((item) => item.name)
      : [],
  };
}

module.exports = {
  normalizeWhitespace,
  generateEmbedding,
  summarizeArticle,
  answerKnowledgeQuestion,
  generateWeeklyReport,
  suggestTags,
  testExternalAIConfig,
};
