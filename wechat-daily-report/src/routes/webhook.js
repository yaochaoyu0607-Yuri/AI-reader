/**
 * Webhook 路由：供外部 curl 或定时任务调用，返回昨日文章 JSON
 */
const express = require('express');
const router = express.Router();
const dailyReport = require('../services/dailyReport');
const logger = require('../lib/logger');

/**
 * GET /daily
 * 返回“机器之心”昨日文章日报，JSON 格式（PRD 规定）
 * 例: curl http://localhost:3000/daily
 */
router.get('/daily', async (req, res) => {
  try {
    logger.info('Webhook /daily called');
    const report = await dailyReport.getMachineHeartDaily();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(report);
  } catch (err) {
    logger.error('Daily report error:', err.message);
    res.status(500).json({
      error: 'daily_report_failed',
      message: err.message,
    });
  }
});

/**
 * 预留：多公众号汇总（第二阶段或扩展）
 * GET /daily/all
 */
router.get('/daily/all', async (req, res) => {
  try {
    const reports = await dailyReport.buildDailyReports();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ reports });
  } catch (err) {
    logger.error('Daily reports error:', err.message);
    res.status(500).json({ error: 'daily_reports_failed', message: err.message });
  }
});

module.exports = router;
