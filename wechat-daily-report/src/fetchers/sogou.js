/**
 * 搜狗微信搜索抓取器（免费，无需 API Key）
 * 直接解析 type=2 文章搜索结果页（无需浏览器自动化）
 */
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../lib/logger');

const SOGOU_HOST = 'https://weixin.sogou.com';
const SOGOU_WEIXIN_SEARCH = `${SOGOU_HOST}/weixin`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const REQUEST_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://weixin.sogou.com/',
};

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeSource(text) {
  return normalizeText(text).replace(/\s+/g, '');
}

function parseDateFromScript(scriptText) {
  const m = String(scriptText || '').match(/timeConvert\('(\d{10})'\)/);
  if (!m) return '';
  const d = new Date(Number(m[1]) * 1000);
  return d.toISOString().slice(0, 10);
}

function buildCookieHeader(setCookieHeader) {
  if (!Array.isArray(setCookieHeader)) return '';
  return setCookieHeader
    .map((line) => String(line).split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function parseRealUrlFromLinkHtml(html) {
  const script = String(html || '');
  const parts = [...script.matchAll(/url \+= '([^']*)'/g)].map((m) => m[1]);
  if (!parts.length) return '';
  return parts.join('').replace(/@/g, '');
}

async function resolveRealUrl(rawHref, cookieHeader) {
  if (!rawHref) return '';
  const requestUrl = new URL(rawHref, SOGOU_HOST).toString();
  try {
    const headers = { ...REQUEST_HEADERS };
    if (cookieHeader) headers.Cookie = cookieHeader;
    const res = await axios.get(requestUrl, {
      headers,
      timeout: 12000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const realFromScript = parseRealUrlFromLinkHtml(res.data);
    if (realFromScript) return realFromScript;
    return (res.request && res.request.res && res.request.res.responseUrl) || requestUrl;
  } catch (err) {
    const location = err.response && err.response.headers && err.response.headers.location;
    if (location) {
      return new URL(location, requestUrl).toString();
    }
    return requestUrl;
  }
}

async function fetchSogouWeixinType2Page(query, page = 1) {
  const queryUrl = `${SOGOU_WEIXIN_SEARCH}?type=2&query=${encodeURIComponent(query)}&ie=utf8&page=${page}`;
  const res = await axios.get(queryUrl, {
    headers: REQUEST_HEADERS,
    timeout: 15000,
    maxRedirects: 3,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  return res;
}

async function fetchArticlesByAccount(accountName) {
  try {
    const sourceTarget = normalizeSource(accountName);
    // 关键词搜索（type=2）对“公众号名”本身不敏感：很多文章标题里不会包含“机器之心”，
    // 所以这里用一组通用关键词扩大召回，再用“来源”字段精确过滤为机器之心。
    const querySeeds = [
      accountName,
      'AI',
      '大模型',
      '模型',
      'OpenAI',
      'Claude',
      'DeepSeek',
      'Transformer',
      'Agent',
    ];

    const seenRaw = new Set();
    const candidates = [];

    for (const seed of querySeeds) {
      // 只扫少量页，避免高频；每天一次的场景足够
      for (let p = 1; p <= 3; p++) {
        const res = await fetchSogouWeixinType2Page(seed, p);
        const cookieHeader = buildCookieHeader(res.headers['set-cookie']);
        const $ = cheerio.load(res.data, { decodeEntities: false });

        $('ul.news-list li').each((_, el) => {
          const $li = $(el);
          const sourceName = normalizeSource($li.find('.all-time-y2').first().text());
          if (sourceName !== sourceTarget) return;

          const $a = $li.find('h3 a, a[uigs^="article_title_"]').first();
          const rawHref = $a.attr('href');
          const title = normalizeText($a.text());
          if (!rawHref || !title) return;

          const key = `${rawHref}|${title}`;
          if (seenRaw.has(key)) return;
          seenRaw.add(key);

          const scriptText = $li.find('.s2 script').first().html() || '';
          const timeText = parseDateFromScript(scriptText);
          candidates.push({ title, rawHref, timeText, cookieHeader });
        });

        // 如果已经拿到一些候选且本页没有更多来源命中，继续下一 seed 即可
        if (candidates.length >= 30) break;
      }
      if (candidates.length >= 30) break;
    }

    // 还原真实 mp 链接（/link 返回的 JS 拼接 url）
    const items = [];
    for (const item of candidates) {
      const realUrl = await resolveRealUrl(item.rawHref, item.cookieHeader);
      items.push({ title: item.title, link: realUrl, timeText: item.timeText });
    }

    logger.info('Sogou fetcher:', accountName, 'raw items:', items.length);
    return items;
  } catch (err) {
    logger.error('Sogou fetch failed:', err.message);
    return [];
  }
}

module.exports = {
  fetchArticlesByAccount,
};
