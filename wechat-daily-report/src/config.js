/**
 * 环境与运行配置
 * 支持从 .env 读取，预留多公众号、飞书、数据库等扩展
 */
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  cronSchedule: process.env.CRON_SCHEDULE || '0 8 * * *',
  /** 公众号名称列表（预留多公众号） */
  sources: (process.env.SOURCES || '机器之心')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  bingSearchApiKey: process.env.BING_SEARCH_API_KEY || '',
  feishuWebhookUrl: process.env.FEISHU_WEBHOOK_URL || '',
  databaseUrl: process.env.DATABASE_URL || '',
};

module.exports = config;
