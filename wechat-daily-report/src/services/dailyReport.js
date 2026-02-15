/**
 * 每日报告服务：拉取 → 筛选昨天 → 输出 JSON
 * 预留：自动摘要、飞书推送、数据库写入的扩展调用点
 */
const config = require('../config');
const { getFetcher } = require('../fetchers');
const { filterYesterday, getYesterdayDateStr } = require('../filters/yesterday');
const { buildDailyJson } = require('../output/json');
const logger = require('../lib/logger');

/**
 * 为单个公众号生成昨日文章日报
 * @param {string} source - 公众号名称
 * @returns {Promise<{ source: string, date: string, articles: Array<{title, link}> }>}
 */
async function buildReportForSource(source) {
  const yesterday = getYesterdayDateStr();
  const fetcher = getFetcher();
  if (!fetcher) {
    logger.warn('No fetcher available (e.g. Bing API key not set). Return empty.');
    return buildDailyJson(source, [], yesterday);
  }

  const raw = await fetcher.fetchArticlesByAccount(source);
  const articles = filterYesterday(raw, yesterday);
  const report = buildDailyJson(source, articles, yesterday);

  // 预留：自动摘要处理（第二阶段）
  // await summaryService.process(report);

  // 预留：飞书 Webhook 推送（第二阶段）
  // if (config.feishuWebhookUrl) await feishuService.send(report);

  // 预留：数据库写入（第二阶段）
  // if (config.databaseUrl) await dbService.save(report);

  return report;
}

/**
 * 生成所有配置公众号的日报（当前 PRD 仅要求单公众号，结构支持多公众号）
 * @returns {Promise<Array<{ source, date, articles }>>}
 */
async function buildDailyReports() {
  const sources = config.sources.length ? config.sources : ['机器之心'];
  const reports = [];
  for (const source of sources) {
    try {
      const report = await buildReportForSource(source);
      reports.push(report);
    } catch (err) {
      logger.error('Build report failed for source:', source, err.message);
      reports.push(buildDailyJson(source, [], getYesterdayDateStr()));
    }
  }
  return reports;
}

/**
 * 获取“机器之心”昨日文章日报（PRD 规定当前仅此一家）
 * 返回单条 JSON，与 PRD 输出格式一致，便于 curl 调用
 */
async function getMachineHeartDaily() {
  const reports = await buildDailyReports();
  const first = reports[0] || buildDailyJson('机器之心', [], getYesterdayDateStr());
  return first;
}

module.exports = {
  buildReportForSource,
  buildDailyReports,
  getMachineHeartDaily,
};
