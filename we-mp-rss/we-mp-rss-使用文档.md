# we-mp-rss 使用文档（本机 Docker 部署版）

本说明文档适用于你当前这台 Mac 上已经部署好的 `we-mp-rss`（容器名：`we-mp-rss`），用于订阅微信公众号文章并生成 RSS 源。

项目地址（功能说明/更新）：https://github.com/rachelos/we-mp-rss

---

## 1. 访问地址与部署信息

- Web 管理后台：
  - 本机访问：`http://127.0.0.1:8001/`
  - 局域网访问：`http://你的Mac局域网IP:8001/`
- 端口映射：宿主机 `8001` -> 容器 `8001`
- 数据持久化（宿主机目录）：
  - `/Users/chovy/Desktop/大模型学习/we-mp-rss-data`
  - 该目录会挂载到容器 `/app/data`，数据库/缓存/配置等一般都在这里

---

## 2. 首次登录

1. 打开 `http://127.0.0.1:8001/`
2. 使用默认账号密码登录：
   - 账号：`admin`
   - 密码：`admin@123`

安全建议（强烈建议）：
- 第一次登录后立即修改默认密码
- 若要对外网开放访问，请先加反向代理鉴权/白名单/HTTPS（见“安全与对外访问”）

---

## 3. 微信扫码授权（核心步骤）

`we-mp-rss` 需要通过扫码授权来获取公众号文章信息。

通用流程（不同版本 UI 文案可能略有差异）：
1. 登录后台
2. 进入“授权/扫码/登录公众号”等相关页面入口
3. 按页面提示生成二维码
4. 用微信扫描二维码并确认授权
5. 授权成功后即可添加订阅、抓取文章、生成 RSS

注意事项：
- 授权可能会过期，需要重新扫码
- 若扫码一直失败，先看“常见问题/排错”

---

## 4. 添加公众号订阅

通用流程：
1. 登录后台
2. 进入“订阅/公众号/Feeds”等模块
3. 添加需要订阅的公众号
4. 触发一次“同步/刷新/抓取”以拉取文章列表

常见字段说明（以 UI 为准）：
- 名称/备注：方便你在列表中区分
- 标签：用于分类管理（可选）
- 抓取页数/数量：影响历史文章拉取范围（越大越慢）

---

## 5. 获取 RSS 订阅地址

当订阅创建并抓取到文章后，你会在订阅详情或 RSS 页面看到 RSS 链接。

使用方式：
- 在 RSS 阅读器里添加该链接即可订阅更新
- 如果你需要在局域网设备上使用 RSS 链接，确保设备能访问 `http://你的Mac局域网IP:8001`

提示：
- 部分 RSS 阅读器会缓存内容；更新不及时可以手动刷新或调整阅读器刷新策略

---

## 6. 定时更新/定时任务（自动同步）

`we-mp-rss` 支持定时任务自动更新文章内容/订阅源。

通用使用方式：
1. 登录后台
2. 找到“任务/消息任务/调度”等页面
3. 新建定时任务（例如每小时/每天同步一次）
4. 保存后观察日志确认任务正常运行

如果你只想手动更新：
- 关闭或不创建定时任务即可（具体开关以 UI/配置为准）

---

## 7. 导出文章（Markdown/PDF/JSON 等）

项目支持导出多种格式（以 UI 实际入口为准）：
- Markdown、PDF、JSON、DOCX 等

注意：
- PDF 导出通常会依赖容器内字体/浏览器渲染组件，首次使用可能会有初始化耗时
- 如果导出失败，优先查看容器日志（见“运维命令”）

---

## 8. 通知与 Webhook（可选）

可配置的通知渠道通常包括：
- 企业微信/自定义 Webhook
- 钉钉/飞书等

通用配置方法：
1. 在后台“设置/通知/配置”中填入对应 Webhook 地址
2. 选择通知触发场景（比如授权二维码推送、更新结果推送等）
3. 触发一次事件验证是否收到消息

安全提示：
- Webhook URL 相当于密钥，请不要公开
- 备份配置时注意脱敏

---

## 9. 常用运维命令（Docker）

以下命令在终端执行即可：

### 查看容器状态

```bash
docker ps --filter name=we-mp-rss
```

### 查看日志（实时滚动）

```bash
docker logs -f we-mp-rss
```

### 重启服务

```bash
docker restart we-mp-rss
```

### 停止/启动

```bash
docker stop we-mp-rss
docker start we-mp-rss
```

### 升级到最新版

升级前建议先备份数据目录：
- `/Users/chovy/Desktop/大模型学习/we-mp-rss-data`

升级流程（官方思路）：

```bash
docker stop we-mp-rss
docker rm we-mp-rss
docker pull ghcr.io/rachelos/we-mp-rss:latest
docker run -d --name we-mp-rss --restart unless-stopped \
  -p 8001:8001 \
  -v "/Users/chovy/Desktop/大模型学习/we-mp-rss-data:/app/data" \
  ghcr.io/rachelos/we-mp-rss:latest
```

---

## 10. 备份与迁移

### 备份（推荐做法）

停止服务后备份数据目录：

```bash
docker stop we-mp-rss
tar -czf we-mp-rss-data-backup.tgz -C "/Users/chovy/Desktop/大模型学习" "we-mp-rss-data"
docker start we-mp-rss
```

### 迁移到另一台机器

1. 复制 `we-mp-rss-data` 到新机器（路径随意，但要保证挂载到容器 `/app/data`）
2. 在新机器上按相同方式运行容器并挂载该目录

---

## 11. 常见问题与排错

### 11.1 打不开页面 / 访问超时

排查顺序：
1. 容器是否在运行：`docker ps --filter name=we-mp-rss`
2. 宿主机端口是否被占用：`lsof -nP -iTCP:8001 -sTCP:LISTEN`
3. 看容器日志是否报错：`docker logs --tail 200 we-mp-rss`

### 11.2 页面能开但登录失败

- 确认账号：`admin`
- 确认密码：`admin@123`
- 如果你改过密码忘了，通常需要在数据目录里找数据库/配置进行重置（建议先备份再操作）

### 11.3 扫码授权失败/频繁过期

常见原因：
- 网络环境不稳定、DNS/代理影响
- 微信端限制或授权过期需要重扫
- 容器内浏览器组件/依赖初始化未完成

建议做法：
- 先 `docker logs -f we-mp-rss` 观察扫码动作时的日志
- 重启容器：`docker restart we-mp-rss`

---

## 12. 安全与对外访问（建议）

如果你只在本机用：
- 保持 `http://127.0.0.1:8001/` 即可

如果你要在局域网/公网使用：
- 建议用 Nginx/Caddy 做反向代理，加：
  - HTTPS
  - BasicAuth / IP 白名单 / 单点登录
  - 访问日志与限流
- 不建议直接把 `8001` 裸露到公网

---

## 参考

- 项目仓库与官方说明： https://github.com/rachelos/we-mp-rss
