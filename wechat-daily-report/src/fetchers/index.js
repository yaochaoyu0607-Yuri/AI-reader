/**
 * Fetcher 工厂：默认使用搜狗微信（免费）；有 BING_SEARCH_API_KEY 时可选 Bing
 * 预留：未来可增加更多数据源
 */
const config = require('../config');
const sogouFetcher = require('./sogou');
const bingFetcher = require('./bing');

function getFetcher() {
  if (config.bingSearchApiKey) {
    return bingFetcher;
  }
  return sogouFetcher;
}

module.exports = {
  getFetcher,
  /** 预留：自动摘要处理、飞书推送、数据库写入的扩展点 */
};
