/**
 * 输出标准 JSON 结构（PRD 规定格式）
 */
const { getYesterdayDateStr } = require('../filters/yesterday');

/**
 * 构建日报 JSON
 * @param {string} source - 公众号名称
 * @param {Array<{ title: string, link: string }>} articles
 * @param {string} [date] - 日期 YYYY-MM-DD，默认昨天
 */
function buildDailyJson(source, articles = [], date = getYesterdayDateStr()) {
  return {
    source,
    date,
    articles: articles.map((a) => ({ title: a.title, link: a.link })),
  };
}

module.exports = { buildDailyJson };
