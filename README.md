# AI Reader

一个面向个人研究与持续学习场景的 AI 阅读管理系统。

这个项目试图解决的问题不是“如何收藏更多文章”，而是“如何把阅读行为变成可检索、可沉淀、可复用的知识资产”。系统围绕公众号文章阅读场景，打通了文章同步、阅读管理、标签归档、笔记/感想沉淀，以及基于大模型的摘要、关联知识、问答和周报生成能力。

## 项目定位

AI Reader 更接近一个轻量级的个人知识工作台，而不只是文章收藏夹：

- 上游接入公众号文章数据源
- 中间完成阅读、标注、笔记、感想等结构化沉淀
- 下游通过 AI 做摘要、标签建议、知识关联和问答

适合展示为：

- AI 应用项目
- RAG / 知识管理方向项目
- Node.js 全栈 / 后端项目

## 核心功能

### 1. 阅读管理

- 文章流展示，支持按标签筛选
- 已读 / 未读管理
- 星标文章管理
- 阅读前后感想记录
- 分段笔记记录与删除
- 链接资源补充与收藏

### 2. 知识沉淀

- 标签创建、修改、删除
- 文章与标签关联
- 笔记中心检索
- 感想中心检索
- 阅读统计与完成率统计

### 3. 数据同步

- 支持从 `we-mp-rss` 同步公众号文章
- 支持扫码授权流程
- 支持按公众号定向同步
- 支持重复文章清理
- 支持与远端源做对账删除

### 4. AI 能力

- `AI Summary`：生成文章摘要、核心观点、关键概念、可执行启发
- `AI Tag Suggestions`：根据文章内容、笔记、感想生成标签建议并支持一键应用
- `Related Knowledge`：挖掘相关文章、相关笔记和已有观点
- `Knowledge Chat`：基于知识库进行问答
- `Reading Priority`：给出文章优先级排序和原因
- `Weekly Insight`：按时间范围生成阅读周报
- `AI Settings`：支持 OpenAI Compatible 配置、保存多套模型方案

## 技术栈

- 前端：原生 `HTML` / `CSS` / `JavaScript`
- 后端：`Node.js` + `Express`
- 数据库：`SQLite`
- AI 集成：`OpenAI Compatible API`
- 数据解析：`fast-xml-parser`
- 配置管理：`dotenv`、`yaml`

## 项目结构

```text
ai-reader-mvp/
├── public/              # 前端页面与交互脚本
├── src/
│   ├── ai/              # AI 服务、向量检索、RAG 流程
│   ├── controllers/     # API 路由控制层
│   ├── repositories/    # 数据访问层
│   ├── services/        # 业务逻辑与同步/队列服务
│   ├── db/              # SQLite 初始化与连接
│   └── server.js        # 应用入口
├── we-mp-rss/           # 集成相关文档
├── product-roadmap.md   # 产品路线图
└── product-todo.md      # 当前迭代说明
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动项目

```bash
npm start
```

默认访问地址：

```text
http://127.0.0.1:8787
```

## 数据导入格式

手动导入文章时，每条记录至少包含以下字段：

- `title`
- `url`，唯一键，重复会自动忽略
- `publish_date`，可被 `new Date()` 解析
- `source`

示例：

```json
[
  {
    "title": "一篇文章",
    "url": "https://example.com/article-1",
    "publish_date": "2026-02-12",
    "source": "机器之心"
  }
]
```

## we-mp-rss 集成

系统内置了与 `we-mp-rss` 的集成能力，默认读取本机服务：

```text
http://127.0.0.1:8001
```

可通过页面执行同步，也可直接调用接口：

```bash
curl -X POST http://127.0.0.1:8787/api/integrations/we-mp-rss/sync \
  -H "Content-Type: application/json" \
  -d '{"base_url":"http://127.0.0.1:8001","limit":30}'
```

只同步指定公众号示例：

```json
{
  "base_url": "http://127.0.0.1:8001",
  "limit": 30,
  "feed_ids": ["MP_WXS_3073282833"]
}
```

## API 概览

### 文章与阅读

- `POST /api/articles/import`
- `GET /api/articles`
- `GET /api/articles/:id`
- `PATCH /api/articles/:id/read`
- `PATCH /api/articles/:id/star`
- `GET /api/articles/:id/reflection`
- `PUT /api/articles/:id/reflection`
- `GET /api/articles/:id/notes`
- `POST /api/articles/:id/notes`
- `DELETE /api/articles/:id/notes/:noteId`
- `GET /api/articles/:id/links`
- `POST /api/articles/:id/links`
- `DELETE /api/articles/:id/links/:linkId`

### 标签与统计

- `GET /api/tags`
- `POST /api/tags`
- `PUT /api/tags/:id`
- `DELETE /api/tags/:id`
- `POST /api/articles/:id/tags`
- `DELETE /api/articles/:id/tags/:tagId`
- `GET /api/tags/stats`
- `GET /api/articles/notes/search`

### AI 能力

- `GET /api/ai/articles/:id/summary`
- `GET /api/ai/articles/:id/tag-suggestions`
- `POST /api/ai/articles/:id/apply-tag-suggestions`
- `GET /api/ai/related-knowledge`
- `POST /api/ai/knowledge-chat`
- `GET /api/ai/reading-priority`
- `POST /api/ai/weekly-report`
- `GET /api/ai/settings`
- `PUT /api/ai/settings`

### 集成能力

- `GET /api/integrations/we-mp-rss/feeds`
- `POST /api/integrations/we-mp-rss/sync`
- `POST /api/integrations/we-mp-rss/auth/status`
- `POST /api/integrations/we-mp-rss/auth/qr`
- `POST /api/integrations/we-mp-rss/reconcile-delete`
- `POST /api/integrations/cleanup-duplicates`

## 适合写进简历的亮点

如果你想把这个项目写进简历，可以重点提炼下面这些表述：

- 独立开发 AI 阅读与知识管理系统，基于 `Node.js + Express + SQLite` 搭建前后端一体化应用
- 打通公众号文章同步链路，支持 `we-mp-rss` 授权、增量同步、去重与对账删除
- 基于大模型与 RAG 流程实现文章摘要、标签建议、知识问答、关联推荐和周报生成
- 将非结构化阅读内容沉淀为标签、笔记、感想等结构化知识资产，提升后续检索与复用效率

## 项目说明

- 当前仓库定位为 MVP 版本，强调真实功能闭环而非复杂工程包装
- 更完整的产品演进思路可参考 `product-roadmap.md`
- 当前迭代记录可参考 `product-todo.md`

## 后续方向

- AI 专题聚合
- 标签规范化与近义标签合并
- 更强的知识引用与可追溯能力
- 面向研究型阅读的专题视图
