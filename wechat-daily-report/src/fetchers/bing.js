/**
 * Bing Web Search API v7 抓取器
 * 搜索公众号名称 + site:mp.weixin.qq.com 获取微信文章，使用 datePublished/dateLastCrawled 做昨日筛选
 */
const axios = require('axios');
const config = require('../config');
const logger = require('../lib/logger');

const BING_SEARCH_ENDPOINT = 'https://api.bing.microsoft.com/v7.0/search';

/**
 * 从 Bing 返回的网页项中提取用于“昨天”筛选的日期文本
 * 优先使用 datePublishedDisplayText（可能为「昨天」）或 datePublished，否则用 dateLastCrawled
 */
function getTimeText(item) {
  const display = item.datePublishedDisplayText && item.datePublishedDisplayText.trim();
  if (display) return display;
  const published = item.datePublished;
  if (published && typeof published === 'string') {
    const datePart = published.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  }
  const crawled = item.dateLastCrawled;
  if (crawled && typeof crawled === 'string') {
    const datePart = crawled.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  }
  return '';
}

/**
 * 获取指定公众号在 Bing 上的微信文章列表（标题、链接、时间文本）
 * @param {string} accountName - 公众号名称，如 "机器之心"
 * @returns {Promise<Array<{ title: string, link: string, timeText?: string }>>}
 */
async function fetchArticlesByAccount(accountName) {
  const apiKey = config.bingSearchApiKey;
  if (!apiKey) {
    logger.warn('Bing: BING_SEARCH_API_KEY not set');
    return [];
  }

  const query = `${accountName} site:mp.weixin.qq.com`;
  const items = [];

  try {
    const res = await axios.get(BING_SEARCH_ENDPOINT, {
      params: {
        q: query,
        count: 50,
        mkt: 'zh-CN',
        responseFilter: 'Webpages',
      },
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
      timeout: 15000,
      validateStatus: (s) => s === 200,
    });

    const body = res.data;
    const webPages = body.webPages && body.webPages.value;
    if (!Array.isArray(webPages)) {
      logger.info('Bing: no webPages in response');
      return [];
    }

    for (const item of webPages) {
      const url = item.url;
      const name = item.name && item.name.trim();
      if (!url || !name) continue;
      const timeText = getTimeText(item);
      items.push({ title: name, link: url, timeText });
    }

    logger.info('Bing fetcher:', accountName, 'raw items:', items.length);
    return items;
  } catch (err) {
    const msg = err.response && err.response.data
      ? JSON.stringify(err.response.data)
      : err.message;
    logger.error('Bing fetch failed:', msg);
    return [];
  }
}

module.exports = {
  fetchArticlesByAccount,
};
