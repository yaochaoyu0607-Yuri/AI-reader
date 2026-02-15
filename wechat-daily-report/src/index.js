/**
 * 入口：启动 HTTP 服务（Webhook）+ 每日定时任务
 */
const config = require('./config');
const logger = require('./lib/logger');
const cron = require('node-cron');
const express = require('express');
const webhookRoutes = require('./routes/webhook');
const dailyReport = require('./services/dailyReport');

const app = express();
app.use(express.json());
app.use('/', webhookRoutes);

// 健康检查（可选）
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'wechat-daily-report' });
});

// 每天定时执行一次：拉取昨日文章并打日志
function runScheduledDaily() {
  logger.info('Cron: running daily report job');
  dailyReport
    .getMachineHeartDaily()
    .then((report) => {
      logger.info('Cron daily result:', JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      logger.error('Cron daily job failed:', err.message);
    });
}

// 校验 cron 表达式是否有效（node-cron 支持 5 位：分 时 日 月 周）
const cronSchedule = config.cronSchedule.trim().split(/\s+/).length === 5
  ? config.cronSchedule
  : '0 8 * * *';

if (cron.validate(cronSchedule)) {
  cron.schedule(cronSchedule, runScheduledDaily);
  logger.info('Cron scheduled:', cronSchedule);
} else {
  logger.warn('Invalid CRON_SCHEDULE, using default 0 8 * * * (08:00 daily)');
  cron.schedule('0 8 * * *', runScheduledDaily);
}

const port = config.port;
app.listen(port, () => {
  logger.info('Server listening on port', port, '| GET /daily for report');
});
