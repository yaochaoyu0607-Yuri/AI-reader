# AI 公众号自动情报抓取与日报系统（第一阶段）

每天定时获取指定微信公众号「机器之心」**前一天发布的文章链接**，输出标准 JSON，支持通过 Webhook（HTTP）被其他系统调用。

**无需付费、无需 API Key**：默认使用搜狗微信搜索（免费），直接解析文章搜索结果页；可选配置 Bing API。

- **搜狗方式**：无额外浏览器依赖，安装即用。
- **Bing 方式**：配置 `BING_SEARCH_API_KEY` 后走 Bing API。

## 功能

- 每天定时执行一次（可配置 Cron）
- 从搜狗微信搜索获取「机器之心」最新文章列表，筛选「昨天」发布的文章
- 输出 PRD 规定的 JSON 格式
- 提供 HTTP 接口，可用 `curl` 调用
- 预留：多公众号、自动摘要、飞书 Webhook、数据库写入

## 输出格式

有文章时：

```json
{
  "source": "机器之心",
  "date": "YYYY-MM-DD",
  "articles": [
    {
      "title": "文章标题",
      "link": "文章真实URL"
    }
  ]
}
```

无文章时：

```json
{
  "source": "机器之心",
  "date": "YYYY-MM-DD",
  "articles": []
}
```

## 环境要求

- Node.js >= 18
- 无需数据库（第一阶段）

## 部署步骤

### 1. 克隆或复制项目

```bash
cd /path/to/wechat-daily-report
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制示例配置并按需修改：

```bash
cp .env.example .env
```

可选编辑 `.env`：

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | HTTP 服务端口 | 3000 |
| `CRON_SCHEDULE` | 每天执行时间（Cron 五段：分 时 日 月 周） | `0 8 * * *`（每天 8:00） |
| `SOURCES` | 公众号名称，多个用英文逗号分隔 | 机器之心 |
| `BING_SEARCH_API_KEY` | 可选。Bing API 密钥（配置后使用 Bing；不配置则用搜狗，免费） | 不配置即用搜狗 |

### 4. 启动服务

```bash
npm start
```

服务启动后：

- 定时任务按 `CRON_SCHEDULE` 每天执行一次，并在日志中输出当日日报 JSON
- Webhook 地址：`http://<host>:<PORT>/daily`

### 5. 使用 curl 调用

```bash
curl -s http://localhost:3000/daily
```

如需格式化输出（需安装 jq）：

```bash
curl -s http://localhost:3000/daily | jq
```

### 6. 手动执行一次（不启动 HTTP 服务）

```bash
npm run fetch
```

会在控制台打印当日日报 JSON，便于测试或配合外部调度使用。

## 项目结构

```
wechat-daily-report/
├── package.json
├── .env.example          # 环境变量示例
├── README.md
├── src/
│   ├── index.js          # 入口：HTTP 服务 + 定时任务
│   ├── config.js         # 配置（环境变量）
│   ├── lib/
│   │   └── logger.js     # 日志
│   ├── fetchers/         # 抓取层（搜狗微信，预留 Bing）
│   │   ├── index.js
│   │   └── sogou.js
│   ├── filters/
│   │   └── yesterday.js  # 筛选「昨天」文章
│   ├── output/
│   │   └── json.js      # 组装 PRD 规定 JSON
│   ├── services/
│   │   └── dailyReport.js # 日报编排
│   ├── routes/
│   │   └── webhook.js   # GET /daily
│   └── scripts/
│       └── run-once.js  # 手动跑一次
└── extensions/          # 预留：摘要、飞书、数据库等
```

## 数据来源与限制

- **默认：搜狗微信搜索**（免费，无需 API Key）。不调用微信私有接口。
- **可选**：配置 `BING_SEARCH_API_KEY` 后使用 Bing Web Search API（需 Azure 订阅）。
- **频率**：每天一次，由 Cron 与业务逻辑保证，请勿高频请求。

## 扩展预留

代码中已预留接口，便于第二阶段扩展：

- **多公众号**：`config.sources` 为数组，`buildDailyReports()` 已支持多源
- **自动摘要**：`services/dailyReport.js` 中预留 `summaryService.process(report)`
- **飞书 Webhook**：环境变量 `FEISHU_WEBHOOK_URL`，预留 `feishuService.send(report)`
- **数据库**：环境变量 `DATABASE_URL`，预留 `dbService.save(report)`

## 验收对照

| 要求 | 说明 |
|------|------|
| 每天自动执行 | 使用 node-cron，按 `CRON_SCHEDULE` 执行 |
| 只返回昨天文章 | `filters/yesterday.js` 按日期/“昨天”文案筛选 |
| JSON 格式正确 | `output/json.js` 严格按 PRD 结构输出 |
| 可被 curl 调用 | `GET /daily` 返回 JSON |
| 日志清晰 | 所有关键步骤通过 `lib/logger` 打日志 |

## 许可证

MIT
