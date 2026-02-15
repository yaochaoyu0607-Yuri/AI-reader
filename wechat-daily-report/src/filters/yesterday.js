/**
 * 筛选“前一天”发布的文章
 * 依赖 fetcher 返回的 timeText（如 "昨天"、"1天前"、"YYYY-MM-DD"）或仅按日期过滤
 */
const logger = require('../lib/logger');

/**
 * 解析 timeText 是否为“昨天”
 * @param {string} timeText - 如 "昨天", "1天前", "2024-02-10", "02-10"
 * @param {string} yesterdayStr - 目标日期 "YYYY-MM-DD"
 */
function isYesterdayByText(timeText, yesterdayStr) {
  if (!timeText) return false;
  const t = timeText.trim();
  if (t === '昨天') return true;
  if (/^1\s*天前$/i.test(t)) return true;
  const match = t.match(/(\d{4})-(\d{2})-(\d{2})/) || t.match(/(\d{2})-(\d{2})/);
  if (match) {
    if (match[1].length === 4) {
      return `${match[1]}-${match[2]}-${match[3]}` === yesterdayStr;
    }
    const [_, month, day] = match;
    const [y] = yesterdayStr.split('-');
    return `${y}-${month}-${day}` === yesterdayStr;
  }
  return false;
}

/**
 * 获取昨天的日期字符串 YYYY-MM-DD
 */
function getYesterdayDateStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 从文章列表中筛出“昨天”发布的
 * @param {Array<{ title: string, link: string, timeText?: string }>} articles
 * @param {string} [yesterday] - 可选，默认自动计算昨天
 */
function filterYesterday(articles, yesterday = getYesterdayDateStr()) {
  const filtered = articles.filter((a) => isYesterdayByText(a.timeText, yesterday));
  logger.info('Filter yesterday:', yesterday, 'kept:', filtered.length, 'of', articles.length);
  return filtered.map(({ title, link }) => ({ title, link }));
}

module.exports = {
  filterYesterday,
  getYesterdayDateStr,
  isYesterdayByText,
};
