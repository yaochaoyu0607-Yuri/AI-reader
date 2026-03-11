const { all, run } = require("../db/database");

const SAVED_PROFILES_KEY = "saved_profiles";
const CURRENT_PROFILE_ID_KEY = "current_profile_id";

const PRESETS = {
  openai: {
    provider: "openai",
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    chat_model: "gpt-4.1-mini",
    embedding_model: "text-embedding-3-large",
    use_local_embedding: false,
    description: "适合直接连接 OpenAI 官方接口。",
  },
  deepseek: {
    provider: "deepseek",
    label: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    chat_model: "deepseek-chat",
    embedding_model: "",
    use_local_embedding: true,
    description: "国产主流选择，推荐直接用聊天模型 + 本地 embedding。",
  },
  qwen: {
    provider: "qwen",
    label: "通义千问",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    chat_model: "qwen-plus",
    embedding_model: "text-embedding-v4",
    use_local_embedding: false,
    description: "阿里云百炼兼容 OpenAI 接口，适合中文场景。",
  },
  kimi: {
    provider: "kimi",
    label: "Kimi",
    base_url: "https://api.moonshot.cn/v1",
    chat_model: "moonshot-v1-8k",
    embedding_model: "",
    use_local_embedding: true,
    description: "月之暗面模型，长文本表现较好，推荐配合本地 embedding。",
  },
  zhipu: {
    provider: "zhipu",
    label: "智谱 GLM",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    chat_model: "glm-4-flash",
    embedding_model: "embedding-3",
    use_local_embedding: false,
    description: "智谱官方接口，适合快速接入国产模型。",
  },
  doubao: {
    provider: "doubao",
    label: "豆包",
    base_url: "https://ark.cn-beijing.volces.com/api/v3",
    chat_model: "",
    embedding_model: "",
    use_local_embedding: true,
    description: "火山引擎 Ark 接口，通常需要填写你自己的模型接入点 ID。",
  },
  minimax: {
    provider: "minimax",
    label: "MiniMax",
    base_url: "https://api.minimax.chat/v1",
    chat_model: "MiniMax-Text-01",
    embedding_model: "",
    use_local_embedding: true,
    description: "MiniMax 官方接口，建议先连聊天模型，再按需补 embedding。",
  },
  siliconflow: {
    provider: "siliconflow",
    label: "SiliconFlow",
    base_url: "https://api.siliconflow.cn/v1",
    chat_model: "Qwen/Qwen2.5-7B-Instruct",
    embedding_model: "BAAI/bge-m3",
    use_local_embedding: false,
    description: "国产聚合平台，适合想在一个入口切多种模型。",
  },
  compatible: {
    provider: "compatible",
    label: "自定义兼容接口",
    base_url: "https://api.openai.com/v1",
    chat_model: "",
    embedding_model: "",
    use_local_embedding: false,
    description: "适用于任意 OpenAI Compatible 服务，自行填写模型名即可。",
  },
};

function maskApiKey(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function createProfileId() {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readSettingsMap() {
  const rows = await all("SELECT setting_key, setting_value FROM AISettings");
  return rows.reduce((acc, row) => {
    acc[row.setting_key] = row.setting_value;
    return acc;
  }, {});
}

function parseSavedProfiles(map = {}) {
  try {
    const parsed = JSON.parse(map[SAVED_PROFILES_KEY] || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function serializePreset(item) {
  return {
    provider: item.provider,
    label: item.label,
    base_url: item.base_url,
    chat_model: item.chat_model,
    embedding_model: item.embedding_model,
    use_local_embedding: item.use_local_embedding,
    description: item.description || "",
  };
}

function serializeProfilePublic(item) {
  return {
    id: item.id,
    name: item.name,
    provider: item.provider,
    label: (PRESETS[item.provider] || {}).label || item.provider,
    base_url: item.base_url,
    chat_model: item.chat_model,
    embedding_model: item.embedding_model,
    use_local_embedding: Boolean(item.use_local_embedding),
    has_api_key: Boolean(item.api_key),
    api_key_masked: maskApiKey(item.api_key),
    updated_at: item.updated_at || "",
  };
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  if (typeof value === "number") return value > 0;
  return fallback;
}

function getDefaultSettings() {
  const preset = PRESETS.openai;
  return {
    provider: preset.provider,
    base_url: preset.base_url,
    api_key: "",
    chat_model: preset.chat_model,
    embedding_model: preset.embedding_model,
    use_local_embedding: preset.use_local_embedding,
  };
}

async function getAISettingsInternal() {
  const map = await readSettingsMap();
  const defaults = getDefaultSettings();
  return {
    provider: Object.prototype.hasOwnProperty.call(map, "provider") ? map.provider : defaults.provider,
    base_url: Object.prototype.hasOwnProperty.call(map, "base_url")
      ? map.base_url
      : defaults.base_url,
    api_key: Object.prototype.hasOwnProperty.call(map, "api_key") ? map.api_key : defaults.api_key,
    chat_model: Object.prototype.hasOwnProperty.call(map, "chat_model")
      ? map.chat_model
      : defaults.chat_model,
    embedding_model: Object.prototype.hasOwnProperty.call(map, "embedding_model")
      ? map.embedding_model
      : defaults.embedding_model,
    use_local_embedding: normalizeBoolean(map.use_local_embedding, defaults.use_local_embedding),
  };
}

async function getAISettingsPublic() {
  const map = await readSettingsMap();
  const data = await getAISettingsInternal();
  const profiles = parseSavedProfiles(map);
  return {
    provider: data.provider,
    base_url: data.base_url,
    chat_model: data.chat_model,
    embedding_model: data.embedding_model,
    use_local_embedding: data.use_local_embedding,
    has_api_key: Boolean(data.api_key),
    api_key_masked: maskApiKey(data.api_key),
    current_profile_id: map[CURRENT_PROFILE_ID_KEY] || "",
    presets: Object.values(PRESETS).map(serializePreset),
    profiles: profiles.map(serializeProfilePublic),
  };
}

function mergeSettings(current, payload = {}) {
  const provider = String(payload.provider || current.provider || "openai").trim();
  const preset = PRESETS[provider] || PRESETS.compatible;
  const keepExistingKey = payload.keep_existing_key !== false;
  const incomingApiKey = typeof payload.api_key === "string" ? payload.api_key.trim() : null;
  const hasBaseUrl = Object.prototype.hasOwnProperty.call(payload, "base_url");
  const hasChatModel = Object.prototype.hasOwnProperty.call(payload, "chat_model");
  const hasEmbeddingModel = Object.prototype.hasOwnProperty.call(payload, "embedding_model");

  return {
    provider,
    base_url: String(hasBaseUrl ? payload.base_url : preset.base_url ?? current.base_url ?? "").trim(),
    api_key:
      payload.clear_api_key === true
        ? ""
        : incomingApiKey !== null && incomingApiKey.length > 0
          ? incomingApiKey
          : keepExistingKey
            ? current.api_key || ""
            : "",
    chat_model: String(
      hasChatModel ? payload.chat_model : preset.chat_model ?? current.chat_model ?? ""
    ).trim(),
    embedding_model: String(
      hasEmbeddingModel
        ? payload.embedding_model
        : preset.embedding_model ?? current.embedding_model ?? ""
    ).trim(),
    use_local_embedding: normalizeBoolean(
      payload.use_local_embedding,
      preset.use_local_embedding ?? current.use_local_embedding
    ),
  };
}

async function saveAISettings(payload = {}) {
  const current = await getAISettingsInternal();
  const next = mergeSettings(current, payload);
  const map = await readSettingsMap();
  const currentProfileId =
    typeof payload.current_profile_id === "string"
      ? payload.current_profile_id
      : map[CURRENT_PROFILE_ID_KEY] || "";
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries({
    ...next,
    [CURRENT_PROFILE_ID_KEY]: currentProfileId,
  })) {
    await run(
      `
      INSERT INTO AISettings (setting_key, setting_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = excluded.updated_at
    `,
      [key, String(value ?? ""), now]
    );
  }
  return getAISettingsPublic();
}

async function saveAISettingsProfile(payload = {}) {
  const map = await readSettingsMap();
  const profiles = parseSavedProfiles(map);
  const current = await getAISettingsInternal();
  const next = mergeSettings(current, payload);
  const name = String(payload.name || "").trim();
  if (!name) {
    throw new Error("请先填写方案名称");
  }

  const now = new Date().toISOString();
  const matchIndex = profiles.findIndex(
    (item) => item.id === payload.profile_id || item.name.toLowerCase() === name.toLowerCase()
  );

  const profile = {
    id: matchIndex >= 0 ? profiles[matchIndex].id : createProfileId(),
    name,
    provider: next.provider,
    base_url: next.base_url,
    api_key: next.api_key,
    chat_model: next.chat_model,
    embedding_model: next.embedding_model,
    use_local_embedding: next.use_local_embedding,
    updated_at: now,
  };

  if (matchIndex >= 0) profiles[matchIndex] = profile;
  else profiles.unshift(profile);

  await saveAISettings({
    ...next,
    current_profile_id: profile.id,
    keep_existing_key: true,
  });
  await run(
    `
    INSERT INTO AISettings (setting_key, setting_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = excluded.updated_at
  `,
    [SAVED_PROFILES_KEY, JSON.stringify(profiles), now]
  );
  return getAISettingsPublic();
}

async function applyAISettingsProfile(profileId) {
  const map = await readSettingsMap();
  const profiles = parseSavedProfiles(map);
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) {
    throw new Error("未找到对应的已保存方案");
  }
  await saveAISettings({
    provider: profile.provider,
    base_url: profile.base_url,
    api_key: profile.api_key,
    chat_model: profile.chat_model,
    embedding_model: profile.embedding_model,
    use_local_embedding: profile.use_local_embedding,
    keep_existing_key: false,
    current_profile_id: profile.id,
  });
  return getAISettingsPublic();
}

async function deleteAISettingsProfile(profileId) {
  const map = await readSettingsMap();
  const profiles = parseSavedProfiles(map).filter((item) => item.id !== profileId);
  const now = new Date().toISOString();
  await run(
    `
    INSERT INTO AISettings (setting_key, setting_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_at = excluded.updated_at
  `,
    [SAVED_PROFILES_KEY, JSON.stringify(profiles), now]
  );

  if ((map[CURRENT_PROFILE_ID_KEY] || "") === profileId) {
    await run(
      `
      INSERT INTO AISettings (setting_key, setting_value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_at = excluded.updated_at
    `,
      [CURRENT_PROFILE_ID_KEY, "", now]
    );
  }

  return getAISettingsPublic();
}

module.exports = {
  PRESETS,
  getAISettingsInternal,
  getAISettingsPublic,
  saveAISettings,
  saveAISettingsProfile,
  applyAISettingsProfile,
  deleteAISettingsProfile,
};
