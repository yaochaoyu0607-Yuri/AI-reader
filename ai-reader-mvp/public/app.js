const state = {
  articles: [],
  tags: [],
  selectedTagId: "",
  showUnreadOnly: false,
  showStarOnly: false,
  stats: null,
  currentArticle: null,
  pendingDeleteTagId: null,
  reflectionAutoSaveTimer: null,
  reflectionLastSaved: "",
  openDayGroups: new Set(),
};

const el = {
  stats: document.getElementById("stats"),
  feed: document.getElementById("feed"),
  tagStrip: document.getElementById("tagStrip"),
  tagManageBtn: document.getElementById("tagManageBtn"),
  notesCenterBtn: document.getElementById("notesCenterBtn"),
  reflectionsCenterBtn: document.getElementById("reflectionsCenterBtn"),
  unreadOnlyToggle: document.getElementById("unreadOnlyToggle"),
  starOnlyToggle: document.getElementById("starOnlyToggle"),
  syncBaseUrl: document.getElementById("syncBaseUrl"),
  syncLimit: document.getElementById("syncLimit"),
  syncFeedIds: document.getElementById("syncFeedIds"),
  syncBtn: document.getElementById("syncBtn"),
  quickSyncBtn: document.getElementById("quickSyncBtn"),
  cleanupDupBtn: document.getElementById("cleanupDupBtn"),
  reconcileDeleteBtn: document.getElementById("reconcileDeleteBtn"),
  syncLog: document.getElementById("syncLog"),
  lastSyncText: document.getElementById("lastSyncText"),
  jsonInput: document.getElementById("jsonInput"),
  importBtn: document.getElementById("importBtn"),
  detailDialog: document.getElementById("detailDialog"),
  detailTitle: document.getElementById("detailTitle"),
  detailUrl: document.getElementById("detailUrl"),
  detailMeta: document.getElementById("detailMeta"),
  detailNotes: document.getElementById("detailNotes"),
  newNoteContent: document.getElementById("newNoteContent"),
  addNoteBtn: document.getElementById("addNoteBtn"),
  tagList: document.getElementById("tagList"),
  tagAddPanel: document.getElementById("tagAddPanel"),
  existingTagSelect: document.getElementById("existingTagSelect"),
  reflectionInput: document.getElementById("reflectionInput"),
  closeDialogBtn: document.getElementById("closeDialogBtn"),
  tagManageDialog: document.getElementById("tagManageDialog"),
  manageNewTagName: document.getElementById("manageNewTagName"),
  manageCreateTagBtn: document.getElementById("manageCreateTagBtn"),
  manageTagList: document.getElementById("manageTagList"),
  closeTagManageBtn: document.getElementById("closeTagManageBtn"),
  notesCenterDialog: document.getElementById("notesCenterDialog"),
  notesKeywordInput: document.getElementById("notesKeywordInput"),
  notesTagFilter: document.getElementById("notesTagFilter"),
  notesSearchBtn: document.getElementById("notesSearchBtn"),
  notesCenterList: document.getElementById("notesCenterList"),
  closeNotesCenterBtn: document.getElementById("closeNotesCenterBtn"),
  reflectionsCenterDialog: document.getElementById("reflectionsCenterDialog"),
  reflectionsKeywordInput: document.getElementById("reflectionsKeywordInput"),
  reflectionsTagFilter: document.getElementById("reflectionsTagFilter"),
  reflectionsSearchBtn: document.getElementById("reflectionsSearchBtn"),
  reflectionsCenterList: document.getElementById("reflectionsCenterList"),
  closeReflectionsCenterBtn: document.getElementById("closeReflectionsCenterBtn"),
};

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || "请求失败");
  }
  return data.data;
}

async function markArticleRead(articleId) {
  await request(`/api/articles/${articleId}/read`, {
    method: "PATCH",
    body: JSON.stringify({ is_read: true }),
  });
}

async function ensureReflectionForRead(articleId) {
  const reflection = await request(`/api/articles/${articleId}/reflection`);
  return Boolean(String(reflection?.content || "").trim());
}

function renderStats(stats) {
  el.stats.textContent = `今日未读 ${stats.unread_today} ｜ 已读 ${stats.read_articles} ｜ 总文章 ${stats.total_articles} ｜ 完成率 ${stats.completion_rate}%`;
}

function renderLastSync(ts) {
  if (!ts) {
    el.lastSyncText.textContent = "最近同步：尚未同步";
    return;
  }
  const d = new Date(ts);
  const text = Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
  el.lastSyncText.textContent = `最近同步：${text}`;
}

function renderSyncLog(result) {
  if (!result) {
    el.syncLog.textContent = "同步日志：暂无";
    return;
  }

  const lines = [
    "同步完成",
    `新增 ${result.inserted || 0} 条`,
    `重复 ${result.ignored || 0} 条（已忽略）`,
    `错误 ${result.errors || 0} 条`,
  ];
  if (Array.isArray(result.error_items) && result.error_items.length > 0) {
    lines.push("错误详情：");
    result.error_items.slice(0, 10).forEach((e, idx) => {
      lines.push(`${idx + 1}. ${e.reason} | ${e.title || "(无标题)"} | ${e.url || "(无URL)"}`);
    });
    if (result.error_items.length > 10) {
      lines.push(`... 还有 ${result.error_items.length - 10} 条错误`);
    }
  }
  el.syncLog.textContent = lines.join("\n");
}

function renderTagStrip() {
  const orderedTags = [...state.tags].sort((a, b) => {
    const aPriority = a.name === "待体验" ? 0 : 1;
    const bPriority = b.name === "待体验" ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return 0;
  });

  const chips = ['<button class="tag-button" data-tag-id="">全部</button>']
    .concat(
      orderedTags.map(
        (t) =>
          `<button class="tag-button ${t.name === "待体验" ? "priority-tag" : ""}" data-tag-id="${t.id}">
            ${t.name} (${t.article_count})
          </button>`
      )
    )
    .join("");
  el.tagStrip.innerHTML = chips;

  Array.from(el.tagStrip.querySelectorAll(".tag-button")).forEach((btn) => {
    if (String(btn.dataset.tagId || "") === String(state.selectedTagId || "")) {
      btn.classList.add("active");
    }
  });

  el.existingTagSelect.innerHTML =
    '<option value="">选择已有标签</option>' +
    state.tags.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");

  el.notesTagFilter.innerHTML =
    '<option value="">全部标签</option>' +
    state.tags.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");

  el.reflectionsTagFilter.innerHTML =
    '<option value="">全部标签</option>' +
    state.tags.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHttpUrl(url) {
  try {
    const u = new URL(String(url || "").trim());
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.toString();
  } catch (_error) {
    return null;
  }
}

function linkifyText(text) {
  const input = String(text || "");
  const parts = input.split(/(https?:\/\/[^\s<>"']+)/g);
  return parts
    .map((part, idx) => {
      if (idx % 2 === 1) {
        const safeUrl = sanitizeHttpUrl(part);
        if (!safeUrl) return escapeHtml(part);
        return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
          part
        )}</a>`;
      }
      return escapeHtml(part);
    })
    .join("")
    .replace(/\n/g, "<br>");
}

function articleCard(item) {
  const tags = (item.tags || [])
    .map((t) => `<span class="tag-chip">${t.name}</span>`)
    .join("");
  const readClass = item.is_read ? "read" : "";
  const starClass = item.is_starred ? "on" : "";
  const reflection = String(item.reflection_content || "").trim();
  const reflectionHover = reflection
    ? `<span class="reflection-info">
        <button class="info-dot" type="button" aria-label="查看感想">i</button>
        <span class="hover-reflection">${escapeHtml(reflection)}</span>
      </span>`
    : "";

  return `
    <article class="article-card ${readClass}">
      <div class="article-top">
        <span class="star-icon ${starClass}">${item.is_starred ? "★" : "☆"}</span>
        <a class="article-title" target="_blank" rel="noreferrer" href="${item.url}">${item.title}</a>
        ${reflectionHover}
      </div>
      <div class="article-meta">来源：${item.source} ｜ 发布：${item.publish_date}</div>
      <div class="article-meta">${tags || "无标签"}</div>
      <div class="article-actions">
        <button class="toggle-pill ${item.is_read ? "read" : ""}" data-action="toggle-read" data-id="${item.id}">
          ${item.is_read ? "已读" : "未读"}
        </button>
        <button class="text-action" data-action="toggle-star" data-id="${item.id}">
          ${item.is_starred ? "取消星标" : "设为星标"}
        </button>
        <button class="text-action" data-action="detail" data-id="${item.id}">详情</button>
      </div>
    </article>
  `;
}

function buildFilteredList() {
  let list = [...state.articles];
  if (state.showUnreadOnly) {
    list = list.filter((a) => !a.is_read);
  }
  if (state.showStarOnly) {
    list = list.filter((a) => a.is_starred);
  }
  return list;
}

function groupByDate(list) {
  return list.reduce((acc, item) => {
    if (!acc[item.publish_date]) acc[item.publish_date] = [];
    acc[item.publish_date].push(item);
    return acc;
  }, {});
}

function snapshotOpenDayGroups() {
  const groups = Array.from(el.feed.querySelectorAll("details.day-group[data-date]"));
  if (!groups.length) return;
  state.openDayGroups = new Set(
    groups
      .filter((g) => g.open)
      .map((g) => g.dataset.date)
      .filter(Boolean)
  );
}

function renderFeed() {
  snapshotOpenDayGroups();
  const filtered = buildFilteredList();
  const grouped = groupByDate(filtered);
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  if (!dates.length) {
    if (state.stats?.total_articles > 0 && state.stats?.read_articles === state.stats?.total_articles) {
      el.feed.innerHTML = '<div class="empty-state">全部文章已读，做得不错。</div>';
    } else {
      el.feed.innerHTML = '<div class="empty-state">今天还没有同步文章。</div>';
    }
    return;
  }

  el.feed.innerHTML = dates
    .map((d, idx) => {
      const items = grouped[d] || [];
      const unread = items.filter((a) => !a.is_read).length;
      const read = items.length - unread;
      const rate = items.length === 0 ? 0 : Math.round(((items.length - unread) / items.length) * 100);
      const shouldOpen = state.openDayGroups.size
        ? state.openDayGroups.has(d)
        : idx === 0;
      return `
      <details class="day-group" data-date="${d}" ${shouldOpen ? "open" : ""}>
        <summary class="day-title">
          <span>${d}</span>
          <span class="day-progress-wrap">
            <span class="day-progress-text">${read}/${items.length}</span>
            <span class="day-progress-bar"><span style="width:${rate}%"></span></span>
          </span>
        </summary>
        <div class="day-articles">
          ${items.map(articleCard).join("")}
        </div>
      </details>
    `;
    })
    .join("");
}

async function loadAll() {
  const [stats, tags, feed] = await Promise.all([
    request("/api/tags/stats"),
    request("/api/tags"),
    request(`/api/articles${state.selectedTagId ? `?tag_id=${state.selectedTagId}` : ""}`),
  ]);
  state.stats = stats;
  state.tags = tags;
  state.articles = feed.list;

  renderStats(stats);
  renderTagStrip();
  renderFeed();
}

function buildSyncPayload({ quick = false } = {}) {
  if (quick) {
    return {
      base_url: el.syncBaseUrl.value.trim() || "http://127.0.0.1:8001",
      limit: 30,
      feed_ids: [],
    };
  }
  const rawFeedIds = el.syncFeedIds.value.trim();
  const feedIds = rawFeedIds
    ? rawFeedIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    base_url: el.syncBaseUrl.value.trim() || "http://127.0.0.1:8001",
    limit: Number(el.syncLimit.value || 30),
    feed_ids: feedIds,
  };
}

async function runSync({ quick = false } = {}) {
  const payload = buildSyncPayload({ quick });
  const result = await request("/api/integrations/we-mp-rss/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  localStorage.setItem("lastSyncAt", result.synced_at || new Date().toISOString());
  renderLastSync(result.synced_at);
  renderSyncLog(result);
  return result;
}

async function openDetail(articleId) {
  const detail = await request(`/api/articles/${articleId}`);
  state.currentArticle = detail;

  el.detailTitle.textContent = detail.title;
  el.detailUrl.href = detail.url;
  el.detailUrl.textContent = detail.url;
  el.detailMeta.textContent = `${detail.source} ｜ ${detail.publish_date}`;

  el.tagList.innerHTML =
    (detail.tags || [])
      .map(
        (t) =>
          `<span class="tag-chip">${t.name} <button data-remove-tag="${t.id}" class="alt">x</button></span>`
      )
      .join("") || "无标签";

  const reflection = await request(`/api/articles/${articleId}/reflection`);
  el.reflectionInput.value = reflection?.content || "";
  state.reflectionLastSaved = (reflection?.content || "").trim();
  el.existingTagSelect.value = "";

  const notes = await request(`/api/articles/${articleId}/notes`);
  renderDetailNotes(notes);
  if (!el.detailDialog.open) {
    el.detailDialog.showModal();
  }
}

function renderDetailNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    el.detailNotes.innerHTML = "暂无笔记";
    return;
  }
  el.detailNotes.innerHTML = notes
    .map(
      (n) => `
      <div class="note-row">
        <div class="note-content">${linkifyText(n.content)}</div>
        <button class="alt" data-note-id="${n.id}">删除</button>
      </div>
    `
    )
    .join("");
}

function bindDialogBackdropClose(dialog) {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      dialog.close();
    }
  });
}

async function saveReflectionForCurrentArticle({ silent = true } = {}) {
  if (!state.currentArticle) return false;
  const content = el.reflectionInput.value.trim();
  if (!content) return false;
  if (content === state.reflectionLastSaved) return true;
  try {
    await request(`/api/articles/${state.currentArticle.id}/reflection`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    state.reflectionLastSaved = content;
    return true;
  } catch (error) {
    if (!silent) alert(error.message);
    return false;
  }
}

function scheduleReflectionAutoSave() {
  if (state.reflectionAutoSaveTimer) {
    clearTimeout(state.reflectionAutoSaveTimer);
  }
  state.reflectionAutoSaveTimer = setTimeout(() => {
    saveReflectionForCurrentArticle({ silent: true }).catch(() => {});
    state.reflectionAutoSaveTimer = null;
  }, 700);
}

async function closeDetailDialog() {
  if (state.reflectionAutoSaveTimer) {
    clearTimeout(state.reflectionAutoSaveTimer);
    state.reflectionAutoSaveTimer = null;
  }
  await saveReflectionForCurrentArticle({ silent: true });
  el.detailDialog.close();
  try {
    await loadAll();
  } catch (_error) {
    // Ignore refresh errors when closing dialog to avoid blocking UX.
  }
}

function renderManageTagList(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    el.manageTagList.innerHTML = "暂无标签";
    return;
  }

  el.manageTagList.innerHTML = tags
    .map(
      (t) => `
      <div class="manage-tag-row" data-tag-id="${t.id}">
        <input value="${escapeHtml(t.name)}" data-role="name" />
        <span class="tag-usage">${Number(t.article_count || 0)} 篇</span>
        <button class="alt" data-action="save">保存</button>
        <button class="alt danger" data-action="delete">删除</button>
      </div>
    `
    )
    .join("");
}

async function loadTagManagement() {
  const tags = await request("/api/tags");
  renderManageTagList(tags);
}

function renderNotesCenterList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    el.notesCenterList.innerHTML = "暂无匹配笔记";
    return;
  }
  el.notesCenterList.innerHTML = items
    .map(
      (n) => `
      <article class="note-center-item">
        <h4>${escapeHtml(n.article_title)}</h4>
        <div class="article-meta">${escapeHtml(n.source)} ｜ ${escapeHtml(n.publish_date)} ｜ ${
        n.tags?.length ? escapeHtml(n.tags.join(" / ")) : "无标签"
      }</div>
        <div class="note-center-content">${linkifyText(n.content)}</div>
      </article>
    `
    )
    .join("");
}

async function searchNotesCenter() {
  const keyword = el.notesKeywordInput.value.trim();
  const tagId = el.notesTagFilter.value;
  const params = new URLSearchParams();
  if (keyword) params.set("keyword", keyword);
  if (tagId) params.set("tag_id", tagId);
  const query = params.toString();
  const url = query ? `/api/articles/notes/search?${query}` : "/api/articles/notes/search";
  const notes = await request(url);
  renderNotesCenterList(notes);
}

function renderReflectionsCenterList(items) {
  if (!Array.isArray(items) || items.length === 0) {
    el.reflectionsCenterList.innerHTML = "暂无匹配感想";
    return;
  }
  el.reflectionsCenterList.innerHTML = items
    .map(
      (n) => `
      <article class="note-center-item">
        <h4>${escapeHtml(n.article_title)}</h4>
        <div class="article-meta">${escapeHtml(n.source)} ｜ ${escapeHtml(n.publish_date)} ｜ ${
        n.tags?.length ? escapeHtml(n.tags.join(" / ")) : "无标签"
      }</div>
        <div class="note-center-content">${linkifyText(n.content)}</div>
      </article>
    `
    )
    .join("");
}

async function searchReflectionsCenter() {
  const keyword = el.reflectionsKeywordInput.value.trim();
  const tagId = el.reflectionsTagFilter.value;
  const params = new URLSearchParams();
  if (keyword) params.set("keyword", keyword);
  if (tagId) params.set("tag_id", tagId);
  const query = params.toString();
  const url = query
    ? `/api/articles/reflections/search?${query}`
    : "/api/articles/reflections/search";
  const items = await request(url);
  renderReflectionsCenterList(items);
}

el.tagStrip.addEventListener("click", async (e) => {
  const btn = e.target.closest(".tag-button");
  if (!btn) return;
  state.selectedTagId = btn.dataset.tagId || "";
  await loadAll();
});

el.unreadOnlyToggle.addEventListener("change", (e) => {
  state.showUnreadOnly = e.target.checked;
  renderFeed();
});

el.starOnlyToggle.addEventListener("change", (e) => {
  state.showStarOnly = e.target.checked;
  renderFeed();
});

el.importBtn.addEventListener("click", async () => {
  try {
    const payload = JSON.parse(el.jsonInput.value || "[]");
    const result = await request("/api/articles/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    alert(`导入完成：新增 ${result.inserted}，忽略重复 ${result.ignored}`);
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
});

el.quickSyncBtn.addEventListener("click", async () => {
  try {
    const result = await runSync({ quick: true });
    alert(`同步完成：新增 ${result.inserted} / 重复 ${result.ignored} / 错误 ${result.errors}`);
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
});

el.syncBtn.addEventListener("click", async () => {
  try {
    const result = await runSync({ quick: false });
    alert(`同步完成：新增 ${result.inserted} / 重复 ${result.ignored} / 错误 ${result.errors}`);
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
});

el.cleanupDupBtn.addEventListener("click", async () => {
  try {
    const result = await request("/api/integrations/cleanup-duplicates", {
      method: "POST",
    });
    alert(`清理完成：删除 ${result.deleted} 条（候选 ${result.duplicate_candidates}）`);
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
});

el.reconcileDeleteBtn.addEventListener("click", async () => {
  try {
    const rawFeedIds = el.syncFeedIds.value.trim();
    const feedIds = rawFeedIds
      ? rawFeedIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const result = await request("/api/integrations/we-mp-rss/reconcile-delete", {
      method: "POST",
      body: JSON.stringify({
        base_url: el.syncBaseUrl.value.trim() || "http://127.0.0.1:8001",
        feed_ids: feedIds,
      }),
    });
    el.syncLog.textContent = `对账完成\n删除 ${result.deleted} 条\n校验公众号 ${result.feed_count} 个`;
    alert(`对账删除完成：删除 ${result.deleted} 条`);
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
});

el.feed.addEventListener("click", async (e) => {
  const titleLink = e.target.closest("a.article-title");
  if (titleLink) {
    const card = titleLink.closest(".article-card");
    const readBtn = card?.querySelector("[data-action='toggle-read']");
    const id = Number(readBtn?.dataset.id || 0);
    const item = state.articles.find((a) => a.id === id);
    if (item && !item.is_read) {
      ensureReflectionForRead(id)
        .then((okReflect) => {
          if (!okReflect) {
            alert("请先填写感想，再标记为已读");
            return openDetail(id);
          }
          return markArticleRead(id).then(() => Promise.all([loadAll(), openDetail(id)]));
        })
        .catch((error) => {
          alert(error.message || "操作失败");
        });
    } else if (id) {
      openDetail(id).catch(() => {});
    }
    return;
  }

  const btn = e.target.closest("button");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = Number(btn.dataset.id);
  const item = state.articles.find((a) => a.id === id);
  if (!item) return;

  try {
    if (action === "toggle-read") {
      const targetRead = !item.is_read;
      if (targetRead) {
        const okReflect = await ensureReflectionForRead(id);
        if (!okReflect) {
          alert("请先填写感想，再标记为已读");
          await openDetail(id);
          return;
        }
      }
      await request(`/api/articles/${id}/read`, {
        method: "PATCH",
        body: JSON.stringify({ is_read: targetRead }),
      });
      await loadAll();
      if (targetRead) {
        await openDetail(id);
      }
    } else if (action === "toggle-star") {
      await request(`/api/articles/${id}/star`, {
        method: "PATCH",
        body: JSON.stringify({ is_starred: !item.is_starred }),
      });
      await loadAll();
    } else if (action === "detail") {
      await openDetail(id);
    }
  } catch (error) {
    alert(error.message);
  }
});

el.feed.addEventListener("toggle", (e) => {
  const group = e.target;
  if (!(group instanceof HTMLDetailsElement) || !group.classList.contains("day-group")) return;
  const dateKey = group.dataset.date;
  if (!dateKey) return;
  if (group.open) {
    state.openDayGroups.add(dateKey);
  } else {
    state.openDayGroups.delete(dateKey);
  }
});

el.addNoteBtn.addEventListener("click", async () => {
  if (!state.currentArticle) return;
  const content = el.newNoteContent.value.trim();
  if (!content) {
    alert("请先填写笔记内容");
    return;
  }
  try {
    const notes = await request(`/api/articles/${state.currentArticle.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    el.newNoteContent.value = "";
    renderDetailNotes(notes);
  } catch (error) {
    alert(error.message);
  }
});

el.detailNotes.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-note-id]");
  if (!btn || !state.currentArticle) return;
  const noteId = Number(btn.dataset.noteId);
  try {
    const notes = await request(`/api/articles/${state.currentArticle.id}/notes/${noteId}`, {
      method: "DELETE",
    });
    renderDetailNotes(notes);
  } catch (error) {
    alert(error.message);
  }
});

el.detailUrl.addEventListener("click", () => {
  if (!state.currentArticle || state.currentArticle.is_read) return;
  ensureReflectionForRead(state.currentArticle.id)
    .then((okReflect) => {
      if (!okReflect) {
        alert("请先填写感想，再标记为已读");
        return;
      }
      return markArticleRead(state.currentArticle.id).then(() => loadAll());
    })
    .catch(() => {});
});

el.tagList.addEventListener("click", async (e) => {
  const id = e.target.getAttribute("data-remove-tag");
  if (!id || !state.currentArticle) return;

  try {
    const detail = await request(
      `/api/articles/${state.currentArticle.id}/tags/${id}`,
      { method: "DELETE" }
    );
    state.currentArticle = detail;
    await openDetail(state.currentArticle.id);
    await loadAll();
  } catch (error) {
    alert(error.message);
  }
});

el.existingTagSelect.addEventListener("change", async () => {
  if (!state.currentArticle) return;
  const existingTagId = Number(el.existingTagSelect.value || 0);
  if (!existingTagId) {
    return;
  }
  try {
    el.existingTagSelect.disabled = true;
    await request(`/api/articles/${state.currentArticle.id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tag_id: existingTagId }),
    });
    el.existingTagSelect.value = "";
    await loadAll();
    await openDetail(state.currentArticle.id);
  } catch (error) {
    alert(error.message);
  } finally {
    el.existingTagSelect.disabled = false;
  }
});
el.closeDialogBtn.addEventListener("click", () => {
  closeDetailDialog().catch(() => {});
});
el.reflectionInput.addEventListener("input", () => {
  scheduleReflectionAutoSave();
});
el.reflectionInput.addEventListener("blur", () => {
  saveReflectionForCurrentArticle({ silent: true }).catch(() => {});
});
el.closeTagManageBtn.addEventListener("click", () => el.tagManageDialog.close());
el.closeNotesCenterBtn.addEventListener("click", () => el.notesCenterDialog.close());
el.closeReflectionsCenterBtn.addEventListener("click", () => el.reflectionsCenterDialog.close());

el.tagManageBtn.addEventListener("click", async () => {
  try {
    await loadTagManagement();
    if (!el.tagManageDialog.open) el.tagManageDialog.showModal();
  } catch (error) {
    alert(error.message);
  }
});

el.manageCreateTagBtn.addEventListener("click", async () => {
  const name = el.manageNewTagName.value.trim();
  if (!name) {
    alert("请先输入标签名");
    return;
  }
  try {
    await request("/api/tags", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    el.manageNewTagName.value = "";
    await Promise.all([loadAll(), loadTagManagement()]);
  } catch (error) {
    alert(error.message);
  }
});

el.manageTagList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const row = btn.closest(".manage-tag-row");
  if (!row) return;
  const tagId = Number(row.dataset.tagId);
  const nameInput = row.querySelector("input[data-role='name']");
  const name = nameInput?.value?.trim() || "";

  try {
    if (btn.dataset.action === "save") {
      if (!name) {
        alert("标签名不能为空");
        return;
      }
      await request(`/api/tags/${tagId}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      await Promise.all([loadAll(), loadTagManagement()]);
      if (state.currentArticle && el.detailDialog.open) {
        await openDetail(state.currentArticle.id);
      }
    }

    if (btn.dataset.action === "delete") {
      if (state.pendingDeleteTagId !== tagId) {
        state.pendingDeleteTagId = tagId;
        btn.textContent = "确认删除";
        setTimeout(() => {
          if (state.pendingDeleteTagId === tagId) {
            state.pendingDeleteTagId = null;
            const latestBtn = row.querySelector("button[data-action='delete']");
            if (latestBtn) latestBtn.textContent = "删除";
          }
        }, 3000);
        return;
      }
      state.pendingDeleteTagId = null;
      await request(`/api/tags/${tagId}`, { method: "DELETE" });
      await Promise.all([loadAll(), loadTagManagement()]);
      if (state.currentArticle && el.detailDialog.open) {
        await openDetail(state.currentArticle.id);
      }
    }
  } catch (error) {
    alert(error.message);
  }
});

el.notesCenterBtn.addEventListener("click", async () => {
  try {
    await searchNotesCenter();
    if (!el.notesCenterDialog.open) el.notesCenterDialog.showModal();
  } catch (error) {
    alert(error.message);
  }
});

el.notesSearchBtn.addEventListener("click", async () => {
  try {
    await searchNotesCenter();
  } catch (error) {
    alert(error.message);
  }
});

el.reflectionsCenterBtn.addEventListener("click", async () => {
  try {
    await searchReflectionsCenter();
    if (!el.reflectionsCenterDialog.open) el.reflectionsCenterDialog.showModal();
  } catch (error) {
    alert(error.message);
  }
});

el.reflectionsSearchBtn.addEventListener("click", async () => {
  try {
    await searchReflectionsCenter();
  } catch (error) {
    alert(error.message);
  }
});

el.detailDialog.addEventListener("click", (e) => {
  if (e.target === el.detailDialog) {
    closeDetailDialog().catch(() => {});
  }
});
el.detailDialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeDetailDialog().catch(() => {});
});
bindDialogBackdropClose(el.tagManageDialog);
bindDialogBackdropClose(el.notesCenterDialog);
bindDialogBackdropClose(el.reflectionsCenterDialog);

renderLastSync(localStorage.getItem("lastSyncAt"));
renderSyncLog(null);
loadAll().catch((error) => alert(error.message));
