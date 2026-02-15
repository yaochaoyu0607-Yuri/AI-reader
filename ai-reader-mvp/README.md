# AI 公众号阅读管理系统（MVP v1.0）

仅包含两个模块：
- 每日文章流（Daily Feed）
- 标签系统（Tag System）

技术栈：
- 前端：原生 HTML/CSS/JS（极简）
- 后端：Node.js + Express
- 数据库：SQLite

## 启动

```bash
cd "/Users/chovy/Desktop/大模型学习/ai-reader-mvp"
npm install
npm start
```

访问：`http://127.0.0.1:8787`

## API 概览

- `POST /api/articles/import` 导入文章数组（支持 `[]` 或 `{ articles: [] }`）
- `GET /api/articles` 获取文章流（支持 `tag_id` / `tag_name` 筛选）
- `GET /api/articles/:id` 获取文章详情
- `PATCH /api/articles/:id/read` 切换已读
- `GET /api/articles/:id/reflection` 获取文章感想
- `PUT /api/articles/:id/reflection` 保存文章感想
- `PATCH /api/articles/:id/star` 切换星标
- `POST /api/articles/:id/tags` 为文章添加标签（已有或新建）
- `DELETE /api/articles/:id/tags/:tagId` 删除文章标签
- `GET /api/tags` 标签列表及文章数量统计
- `POST /api/tags` 创建标签
- `PUT /api/tags/:id` 修改标签
- `DELETE /api/tags/:id` 删除标签
- `GET /api/tags/stats` 统计信息（今日未读/总数/已读/完成率）
- `GET /api/integrations/we-mp-rss/feeds` 获取 we-mp-rss 公众号列表
- `POST /api/integrations/we-mp-rss/sync` 从 we-mp-rss 同步文章
- `POST /api/integrations/we-mp-rss/reconcile-delete` 校验并删除本地已不存在于 we-mp-rss 的文章
- `POST /api/integrations/cleanup-duplicates` 清理重复文章（title + publish_date）
- `GET /api/articles/:id/links` 获取文章外链
- `POST /api/articles/:id/links` 手动添加资源链接
- `DELETE /api/articles/:id/links/:linkId` 删除资源链接
- `GET /api/articles/:id/notes` 获取文章分段备注
- `POST /api/articles/:id/notes` 新增文章备注段
- `DELETE /api/articles/:id/notes/:noteId` 删除文章备注段
- `GET /api/articles/notes/search` 备注中心检索（`keyword`、`tag_id`）

说明：将文章标记为已读前，需先填写感想。

## Article 导入字段

每条至少包含：
- `title`
- `url`（唯一，重复会自动忽略）
- `publish_date`（日期字符串，可被 `new Date()` 解析）
- `source`

## 与 we-mp-rss 打通

页面里有“同步 we-mp-rss 文章”按钮，默认读取本机：
- `http://127.0.0.1:8001`

也可直接调用接口：

```bash
curl -X POST http://127.0.0.1:8787/api/integrations/we-mp-rss/sync \
  -H "Content-Type: application/json" \
  -d '{"base_url":"http://127.0.0.1:8001","limit":30}'
```

可选只同步指定公众号：

```json
{
  "base_url": "http://127.0.0.1:8001",
  "limit": 30,
  "feed_ids": ["MP_WXS_3073282833"]
}
```
