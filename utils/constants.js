// utils/constants.js - 游戏常量配置

// 境界名称
const REALM_NAMES = [
  "炼气期", "筑基期", "金丹期", "元婴期", 
  "化神期", "炼虚期", "合体期", "大乘期", "渡劫期"
];

// 小境界
const SUB_REALMS = ["小成", "大成", "圆满"];

// 修炼年限配置
const REALM_CONFIG = [
  { tier: 1, baseYears: 1, index: 0 },
  { tier: 2, baseYears: 2, index: 1 },
  { tier: 3, baseYears: 5, index: 2 },
  { tier: 4, baseYears: 10, index: 3 },
  { tier: 5, baseYears: 20, index: 4 },
  { tier: 6, baseYears: 50, index: 5 },
  { tier: 7, baseYears: 100, index: 6 },
  { tier: 8, baseYears: 200, index: 7 },
  { tier: 9, baseYears: 500, index: 8 }
];

// 属性名称映射
const ATTR_NAMES = {
  wealth: '家境',
  body: '体魄',
  talent: '根骨',
  luck: '福源',
  insight: '悟性'
};

// 颜色等级
const RARITY_COLORS = ["Gray", "Green", "Blue", "Purple", "Orange", "Gold", "Red"];

// 数值单位
const NUMBER_UNITS = ["", "万", "亿", "兆", "京", "垓", "秭", "穰", "沟", "涧"];

// 日志最大保留数
const MAX_LOGS = 50;

// UI刷新间隔(ms)
const UI_REFRESH_INTERVAL = 250;

// 云端同步间隔(ms)
const CLOUD_SYNC_INTERVAL = 10000;

// 每日分享上限
const DAILY_SHARE_LIMIT = 3;
const DAILY_DIAMOND_SHARE_LIMIT = 10;

// 免费钻石领取标识
const FREE_DIAMOND_STORAGE_KEY = 'last_free_diamond_date';

module.exports = {
  REALM_NAMES,
  SUB_REALMS,
  REALM_CONFIG,
  ATTR_NAMES,
  RARITY_COLORS,
  NUMBER_UNITS,
  MAX_LOGS,
  UI_REFRESH_INTERVAL,
  CLOUD_SYNC_INTERVAL,
  DAILY_SHARE_LIMIT,
  DAILY_DIAMOND_SHARE_LIMIT,
  FREE_DIAMOND_STORAGE_KEY
};
