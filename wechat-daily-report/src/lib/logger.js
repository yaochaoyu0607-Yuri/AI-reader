/**
 * 简单日志模块：带时间戳与级别
 */
const levels = { info: 'INFO', warn: 'WARN', error: 'ERROR', debug: 'DEBUG' };

function formatMessage(level, ...args) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level}]`;
  return [prefix, ...args];
}

const logger = {
  info(...args) {
    console.log(...formatMessage(levels.info, ...args));
  },
  warn(...args) {
    console.warn(...formatMessage(levels.warn, ...args));
  },
  error(...args) {
    console.error(...formatMessage(levels.error, ...args));
  },
  debug(...args) {
    if (process.env.DEBUG) {
      console.log(...formatMessage(levels.debug, ...args));
    }
  },
};

module.exports = logger;
