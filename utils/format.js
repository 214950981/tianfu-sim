// utils/format.js - 数值格式化工具

const { NUMBER_UNITS } = require('./constants.js');

/**
 * 格式化大数值（支持BigInt和Number）
 * @param {BigInt|Number|string} n - 要格式化的数值
 * @returns {string} 格式化后的字符串
 */
function formatBigInt(n) {
  if (n === null || n === undefined) return '0';
  
  // 转换为字符串
  let s = n.toString();
  
  // 处理负数
  let isNegative = false;
  if (s.startsWith('-')) {
    isNegative = true;
    s = s.substring(1);
  }
  
  // 如果长度不超过4位，直接返回
  if (s.length <= 4) {
    return isNegative ? '-' + s : s;
  }
  
  // 计算单位索引
  let idx = Math.floor((s.length - 1) / 4);
  if (idx >= NUMBER_UNITS.length) {
    idx = NUMBER_UNITS.length - 1;
  }
  
  // 提取头部和小数部分
  let headLen = s.length % 4 || 4;
  let head = s.substring(0, headLen);
  let decimal = s.substring(headLen, headLen + 2);
  
  // 构建结果
  let result;
  if (decimal && decimal !== '00') {
    // 去除末尾的0
    decimal = decimal.replace(/0+$/, '');
    result = `${head}.${decimal}${NUMBER_UNITS[idx]}`;
  } else {
    result = `${head}${NUMBER_UNITS[idx]}`;
  }
  
  return isNegative ? '-' + result : result;
}

/**
 * 安全解析BigInt（兼容低版本）
 * @param {string|number} value - 要解析的值
 * @param {string|number} defaultValue - 默认值
 * @returns {BigInt} BigInt对象
 */
function safeParseBigInt(value, defaultValue = '0') {
  try {
    if (typeof BigInt === 'undefined') {
      // 降级为Number处理
      return BigInt(Number(value || defaultValue));
    }
    return BigInt(value || defaultValue);
  } catch (e) {
    console.warn('BigInt解析失败:', e);
    return BigInt(defaultValue);
  }
}

/**
 * 格式化战力显示
 * @param {BigInt} power - 战力值
 * @returns {string} 格式化后的战力字符串
 */
function formatPower(power) {
  return formatBigInt(power);
}

/**
 * 格式化百分比
 * @param {BigInt} current - 当前值
 * @param {BigInt} total - 总值
 * @returns {number} 百分比数值
 */
function formatPercent(current, total) {
  if (!total || total === 0n) return 0;
  try {
    return Number(current * 100n / total);
  } catch (e) {
    return 0;
  }
}

module.exports = {
  formatBigInt,
  safeParseBigInt,
  formatPower,
  formatPercent
};
