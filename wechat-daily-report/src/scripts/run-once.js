/**
 * 手动执行一次日报生成（用于测试或非定时场景）
 * 用法: node src/scripts/run-once.js
 */
require('dotenv').config();
const dailyReport = require('../services/dailyReport');
const logger = require('../lib/logger');

dailyReport
  .getMachineHeartDaily()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    logger.info('Run-once completed');
  })
  .catch((err) => {
    logger.error('Run-once failed:', err.message);
    process.exit(1);
  });
