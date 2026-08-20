// utils/logger.js - 日志系统

const { MAX_LOGS } = require('./constants.js');

/**
 * 添加日志到日志列表
 * @param {Object} context - 页面上下文
 * @param {string} text - 日志文本
 * @param {string} type - 日志类型 (normal, event-epic, event-breakthrough, event-deadly)
 * @param {boolean} isInstant - 是否立即渲染（用于批量操作）
 */
function addLog(context, text, type = 'normal', isInstant = false) {
  const logs = context.data.logs || [];
  const id = `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  logs.push({
    id,
    year: context.data.age || 0,
    text,
    type: `log-${type}`
  });
  
  // 限制日志数量，避免内存溢出
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
  
  if (!isInstant) {
    // 正常模式：更新UI并滚动到底部
    context.setData(
      { logs, lastLogId: '' },
      () => {
        context.setData({ lastLogId: 'log-bottom-anchor' });
      }
    );
  } else {
    // 批量模式：只更新数据，不触发渲染
    context.data.logs = logs;
  }
}

/**
 * 批量添加日志（用于快速推演等场景）
 * @param {Object} context - 页面上下文
 * @param {Array} logEntries - 日志条目数组 [{text, type}]
 */
function addLogsBatch(context, logEntries) {
  const logs = context.data.logs || [];
  
  logEntries.forEach(entry => {
    const id = `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    logs.push({
      id,
      year: context.data.age || 0,
      text: entry.text,
      type: `log-${entry.type || 'normal'}`
    });
  });
  
  // 限制日志数量
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
  
  context.setData(
    { logs, lastLogId: '' },
    () => {
      context.setData({ lastLogId: 'log-bottom-anchor' });
    }
  );
}

/**
 * 清空日志
 * @param {Object} context - 页面上下文
 */
function clearLogs(context) {
  context.setData({ logs: [], lastLogId: 'log-bottom-anchor' });
}

/**
 * 获取日志类型对应的样式类
 * @param {string} type - 日志类型
 * @returns {string} CSS类名
 */
function getLogTypeClass(type) {
  const typeMap = {
    'normal': 'log-normal',
    'event-epic': 'log-event-epic',
    'event-breakthrough': 'log-event-breakthrough',
    'event-deadly': 'log-event-deadly'
  };
  return typeMap[type] || 'log-normal';
}

module.exports = {
  addLog,
  addLogsBatch,
  clearLogs,
  getLogTypeClass
};
