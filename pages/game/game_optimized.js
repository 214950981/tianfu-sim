// pages/game/game_optimized.js - 优化版主游戏逻辑

const { REALM_NAMES, SUB_REALMS, REALM_CONFIG, ATTR_NAMES } = require('../../utils/constants.js');
const { formatBigInt, safeParseBigInt, formatPercent } = require('../../utils/format.js');
const { updateDiamonds, debouncedSync, getPlayerData } = require('../../utils/cloud.js');
const { addLog, addLogsBatch } = require('../../utils/logger.js');

// 引入游戏数据（需要确保存在）
const { ADVENTURE_EVENTS, MASTER_ITEMS } = require('./game_data.js');

Page({
  data: {
    // === 引擎状态 ===
    isRunning: true,
    gameSpeed: 1,
    unlockedSpeed: 1,
    isDead: false,
    isBottleneck: false,
    isBigBottleneck: false,
    hasUsedDiamondArray: false,
    gambleBonus: 0,
    isWandering: false,
    lastLogId: "log-bottom-anchor",

    // === UI 展示 ===
    realmName: "炼气期 小成",
    realmColorClass: "Gray",
    rootName: "凡人无灵根",
    rootColorClass: "Gray",
    expStr: "0",
    nextExpStr: "100",
    powerStr: "10",
    expPercent: 0,
    
    // === 数值面板 ===
    age: 16,
    maxAge: 100,
    gold: 500,
    diamonds: 0,
    levelId: 1,
    breakthroughRate: 100,
    earnedMerit: 0,
    
    // === 弹窗与控制 ===
    showRebirthModal: false,
    showRechargeModal: false,
    showSpeedModal: false,
    dailyShareCount: 0,
    dailyDiamondShareCount: 0,

    // 仙籍登记状态
    hasRealInfo: wx.getStorageSync('hasRealInfo') || false,
    tempAvatar: wx.getStorageSync('myAvatar') || '',
    tempNickName: wx.getStorageSync('myNickName') || '',

    // 充值档位
    rechargeTiers: [
      { name: "昭告诸天", desc: "传道得 300 钻", base: 300, bonus: 0, type: "share_300" }
    ],

    logs: [],
    playerAttrs: { wealth: 5, body: 5, talent: 5, luck: 5, insight: 5 },
    rootMulti: 1.0 
  },

  // 核心数据使用BigInt
  coreData: {
    exp: safeParseBigInt(0),
    nextExp: safeParseBigInt(100),
    power: safeParseBigInt(10),
    basePower: safeParseBigInt(10)
  },

  engineTimer: null,
  _lastUIDrawTime: 0,
  _lastCloudSyncTime: 0,
  _lastRealm: '',

  onLoad() {
    this.addLog("【系统】神识归位，天道齿轮开始转动，修仙之路开启！", "event-epic");
  },

  onShow() {
    this.syncFromStorage();
    this.syncCloudAssets();
    this.checkDailyShare();
    if (!this.data.isDead && this.data.isRunning && !this.data.isBigBottleneck) {
      this.startEngine();
    }
  },

  onHide() { 
    this.stopEngine();
    // 离开页面时强制同步一次
    this.forceSyncToCloud();
  },
  
  onUnload() { 
    this.stopEngine();
    this.forceSyncToCloud();
  },

  // ==========================================
  // 云端同步相关
  // ==========================================
  
  syncCloudAssets() {
    getPlayerData((cloudData) => {
      let assets = wx.getStorageSync('global_assets') || {};
      assets.diamonds = cloudData.diamonds || 0;
      if (cloudData.merit !== undefined) {
        assets.merit_points = cloudData.merit;
      }
      wx.setStorageSync('global_assets', assets);
      this.setData({ diamonds: assets.diamonds });
    }, (err) => {
      console.error("云端数据同步失败:", err);
      // 失败时不阻断游戏，继续使用本地数据
    });
  },

  forceSyncToCloud() {
    const info = this.getRealmInfo(this.data.levelId);
    debouncedSync(this, {
      power: String(this.coreData.power),
      realm_name: info.name,
      nickName: wx.getStorageSync('myNickName') || "神秘道友",
      avatarUrl: wx.getStorageSync('myAvatar') || "/assets/default_avatar.png"
    });
  },

  // ==========================================
  // 引擎控制
  // ==========================================

  startEngine() {
    this.stopEngine();
    const interval = 1000 / this.data.gameSpeed;
    this.engineTimer = setTimeout(() => { 
      this.engineTick(); 
    }, interval);
  },

  stopEngine() {
    if (this.engineTimer) {
      clearTimeout(this.engineTimer);
      this.engineTimer = null;
    }
  },

  toggleEngine() {
    if (this.data.isDead) return;
    
    if (this.data.isBigBottleneck) {
      this.handleBigBottleneck();
      return;
    }
    
    const nextState = !this.data.isRunning;
    this.setData({ isRunning: nextState });
    
    if (nextState) {
      this.addLog("【系统】道心重燃，岁月继续流逝...", "normal");
      this.startEngine();
    } else {
      this.addLog("【系统】你停止了吐纳，岁月静止。", "normal");
      this.stopEngine();
    }
  },

  toggleWander() {
    if (this.data.isDead || this.data.isBigBottleneck) return;
    
    const nextState = !this.data.isWandering;
    this.setData({ isWandering: nextState });
    
    if (nextState) {
      this.addLog("【苟道】你施展秘法隐匿修为，停止吐纳，开始在红尘中游历寻找机缘！", "event-epic");
    } else {
      this.addLog("【出关】你结束了游历，回到洞府开始全力闭关，修为再次涌动！", "event-breakthrough");
    }
  },

  // ==========================================
  // 引擎核心循环
  // ==========================================

  engineTick(isInstant = false) {
    if (this.data.isDead || (!this.data.isRunning && !isInstant)) return;
    if (this.data.isBigBottleneck && !isInstant) return;

    try {
      let config = this.getRealmConfig(this.data.levelId);
      let years = config.baseYears;
      let lifeCost = Math.floor(years * Math.pow(1.15, config.index));
    
      // 检查寿元
      if (this.data.age + lifeCost >= this.data.maxAge) {
        this.setData({ age: this.data.maxAge });
        this.triggerDeath("天人五衰降临，你终究敌不过天道岁月，身死道消！", isInstant);
        return;
      }
      
      this.setData({ age: this.data.age + lifeCost });

      // 游历模式 vs 闭关模式
      if (this.data.isWandering) {
        this.handleWandering(years, isInstant);
      } else {
        this.handleCultivation(years, isInstant);
      }

      this.checkLifeGuard(isInstant);
      
      if (!isInstant) {
        this.updateUI();
        if (this.data.isRunning && !this.data.isDead && !this.data.isBigBottleneck) {
          this.startEngine();
        }
      }
    } catch (err) {
      console.error('引擎tick错误:', err);
      this.stopEngine();
      wx.showToast({ title: '修炼出错，请重试', icon: 'none' });
    }
  },

  handleWandering(years, isInstant) {
    let roll = Math.random() * 100;
    if (roll < 60) {
      this.triggerRandomEncounter(years, isInstant);
    } else if (roll < 80) {
      this.autoMarket(isInstant);
    } else {
      this.addLog(`游历 ${years} 载，看遍凡尘烟火，心境越发祥和。`, "normal", isInstant);
    }
  },

  handleCultivation(years, isInstant) {
    if (this.data.isBottleneck) {
      this.doAutoSmallTribulation(isInstant);
    } else {
      this.gainExp(years, isInstant);
      let roll = Math.random() * 100;
      if (roll < 30) {
        this.triggerRandomEncounter(years, isInstant);
      } else if (roll < 50) {
        this.autoMarket(isInstant);
      }
    }
  },

  // ==========================================
  // 修炼与突破
  // ==========================================

  gainExp(years, isInstant) {
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index;
    let numMulti = Math.pow(2, m);
    let realmMulti = BigInt(Math.floor(numMulti));
    let talentFactor = BigInt(Math.max(1, Math.floor(this.data.playerAttrs.talent / 2)));
    let rootFactor = BigInt(Math.floor(this.data.rootMulti * 10));
    
    let gain = (safeParseBigInt(50) * talentFactor * rootFactor * BigInt(years) * realmMulti) / safeParseBigInt(10);
    this.coreData.exp += gain;

    if (this.coreData.exp >= this.coreData.nextExp) {
      this.coreData.exp = this.coreData.nextExp;
      let isMajor = (this.data.levelId % SUB_REALMS.length) === 0;
      
      if (isMajor) {
        this.setData({ 
          isBigBottleneck: true,
          hasUsedDiamondArray: false,
          gambleBonus: 0
        });
        this.recalcRate();
        this.stopEngine();
        this.addLog(`【大境界瓶颈】修为大圆满，天怒劫云压顶！请点击下方【引雷劫】引动天雷！`, "event-deadly", isInstant);
      } else {
        this.setData({ isBottleneck: true });
        this.doAutoSmallTribulation(isInstant);
      }
    } else {
      this.addLog(`闭关 ${years} 载，修为增加 ${formatBigInt(gain)}`, "normal", isInstant);
    }
  },

  doAutoSmallTribulation(isInstant) {
    let nextLevel = this.data.levelId + 1;
    this.coreData.exp = safeParseBigInt(0);
    this.coreData.nextExp = (this.coreData.nextExp * safeParseBigInt(15)) / safeParseBigInt(10);
    let powerGain = safeParseBigInt(100 * nextLevel);
    this.coreData.basePower += powerGain;
    this.coreData.power = this.coreData.basePower;
    let ageGain = 20 + nextLevel * 5;
    
    this.setData({ 
      levelId: nextLevel, 
      isBottleneck: false, 
      maxAge: this.data.maxAge + ageGain 
    });
    
    this.addLog(`【精进】真气溢满，水到渠成晋升【${this.getRealmInfo(nextLevel).name}】！`, "event-breakthrough", isInstant);
  },

  // ==========================================
  // 大境界渡劫
  // ==========================================

  handleBigBottleneck() {
    let rate = this.data.breakthroughRate;
    let lifeLeft = this.data.maxAge - this.data.age;
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index;
    
    let gambleCost = Math.floor(config.baseYears * 15 * Math.pow(1.15, m));
    if (gambleCost < 10) gambleCost = 10;
    
    let diamondCost = (m + 1) * 10;
    let arrayText = this.data.breakthroughRate >= 100 
      ? '💎 胜率已满 (稳过天劫)' 
      : `💎 钻石逆天 (耗${diamondCost}钻 +20%胜率)`;
    let gambleText = this.data.gambleBonus >= 20 
      ? '🧘 底蕴已满 (无法再提升胜率)' 
      : `🧘 沉淀底蕴 (耗${formatBigInt(gambleCost)}年搏几率)`;

    wx.showActionSheet({
      title: `【雷劫降临】胜率: ${rate}% | 余寿: ${formatBigInt(lifeLeft)}年`,
      itemList: ['⚡ 准备充分，开始渡劫', gambleText, arrayText],
      success: (res) => {
        if (res.tapIndex === 0) this.executeBigTribulation(false);
        else if (res.tapIndex === 1) this.gambleLifespan(gambleCost);
        else if (res.tapIndex === 2) this.buyDiamondArray(diamondCost);
      },
      fail: (err) => {
        console.error('ActionSheet取消:', err);
      }
    });
  },

  gambleLifespan(gambleCost) {
    if (this.data.gambleBonus >= 20) {
      wx.showToast({ title: '底蕴已达本境极限，无法继续提升！', icon: 'none' });
      this.handleBigBottleneck();
      return;
    }
    
    if (this.data.age + gambleCost > this.data.maxAge) {
      wx.showToast({ title: '寿元干涸，强行闭关必死无疑！', icon: 'none' });
      this.handleBigBottleneck();
      return;
    }
    
    this.setData({ age: this.data.age + gambleCost });
    let roll = Math.random() * 100;
    
    if (roll < 60) {
      let gain = Math.floor(Math.random() * 3) + 2;
      if (this.data.gambleBonus + gain > 20) gain = 20 - this.data.gambleBonus;
      
      this.setData({
        breakthroughRate: Math.min(100, this.data.breakthroughRate + gain),
        gambleBonus: this.data.gambleBonus + gain
      });
      
      this.addLog(`【红尘历练】虚度${formatBigInt(gambleCost)}年光阴，道心通明，天劫胜率 +${gain}%！`, "event-epic");
    } else if (roll < 85) {
      let gain = 1;
      if (this.data.gambleBonus + gain > 20) gain = 0;
      
      this.coreData.basePower = (this.coreData.basePower * safeParseBigInt(105)) / safeParseBigInt(100);
      this.coreData.power = this.coreData.basePower;
      
      if (gain > 0) {
        this.setData({
          breakthroughRate: Math.min(100, this.data.breakthroughRate + gain),
          gambleBonus: this.data.gambleBonus + gain
        });
        this.addLog(`【闭死关】${formatBigInt(gambleCost)}年参悟，底蕴积攒，天劫胜率 +1%。`, "normal");
      } else {
        this.addLog(`【闭死关】${formatBigInt(gambleCost)}年参悟，底蕴已满，仅战力稍有提升。`, "normal");
      }
    } else {
      let penalty = Math.floor(gambleCost * 0.5);
      if (penalty < 5) penalty = 5;
      this.setData({ age: this.data.age + penalty });
      this.addLog(`【走火入魔】强推法门遭反噬！额外折寿${formatBigInt(penalty)}年，好在胜率未跌。`, "event-deadly");
    }
    
    this.updateUI(true);
    this.handleBigBottleneck();
  },

  buyDiamondArray(cost) {
    if (this.data.breakthroughRate >= 100) {
      wx.showToast({ title: '胜率已达 100%，天雷也奈何不了你！', icon: 'none' });
      this.handleBigBottleneck();
      return;
    }
    
    if (this.data.diamonds < cost) {
      wx.showToast({ title: `需钻石 ${cost} 钻，余额不足！`, icon: 'none' });
      this.handleBigBottleneck();
      return;
    }
    
    // 使用封装的updateDiamonds函数
    updateDiamonds(this, -cost);
    
    this.setData({
      breakthroughRate: Math.min(100, this.data.breakthroughRate + 20)
    });
    
    this.addLog(`【钻石逆天】消耗 ${cost} 钻石开启夺天造化阵，雷劫胜率暴涨 +20%！`, "event-epic");
    
    this.updateUI(true);
    this.handleBigBottleneck();
  },

  executeBigTribulation(isInstant) {
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index;
    let rate = this.data.breakthroughRate;
    let success = false;
    let msg = "";

    // 家境护盾
    let shieldReduc = 0;
    if (this.data.playerAttrs.wealth > (m + 1) * 30) {
      shieldReduc = 10;
      msg += "【家境底蕴】家族虚影为你抵消部分雷威！";
    }

    let roll = Math.random() * 100;
    if (roll <= rate) {
      success = true;
    } else {
      // 福源奇迹
      let miracleRoll = Math.random() * 300;
      if (miracleRoll < this.data.playerAttrs.luck) {
        success = true;
        msg += "【逆天福源】一道仙光强行护体，破而后立！";
      }
    }

    this.setData({ hasUsedDiamondArray: false, gambleBonus: 0 });

    if (success) {
      this.handleTribulationSuccess(m, isInstant, msg);
    } else {
      this.handleTribulationFailure(m, isInstant, msg, shieldReduc);
    }
  },

  handleTribulationSuccess(m, isInstant, msg) {
    let nextLevel = this.data.levelId + 1;
    this.coreData.exp = safeParseBigInt(0);
    this.coreData.nextExp = this.coreData.nextExp * safeParseBigInt(100);
    let talentBonus = 1 + (this.data.playerAttrs.talent / 100);
    let ageGain = Math.floor((200 * (m + 1) * (m + 1)) * talentBonus);
    let powerGain = BigInt(Math.floor(2000 * (m + 1) * (m + 1) * talentBonus));
    
    this.coreData.basePower += safeParseBigInt(powerGain);
    this.coreData.power = this.coreData.basePower;

    this.setData({ 
      levelId: nextLevel, 
      isBigBottleneck: false, 
      maxAge: this.data.maxAge + ageGain 
    });
    
    this.addLog(`${msg}【飞升】天雷散去！跨入【${this.getRealmInfo(nextLevel).name}】，获寿 ${ageGain} 载！`, "event-breakthrough", isInstant);
    this.recalcRate();
    
    if (!isInstant) this.startEngine();
  },

  handleTribulationFailure(m, isInstant, msg, shieldReduc) {
    this.coreData.exp = this.coreData.exp / safeParseBigInt(2);
    let basePenalty = 35;
    let actualPenalty = basePenalty - shieldReduc - (this.data.playerAttrs.body * 0.1);
    if (actualPenalty < 5) actualPenalty = 5;
    
    let ageLost = Math.floor(this.data.maxAge * (actualPenalty / 100));
    let attrs = { ...this.data.playerAttrs };
    const keys = ['body', 'talent', 'insight', 'wealth'];
    let randomKey = keys[Math.floor(Math.random() * keys.length)];
    attrs[randomKey] = Math.max(1, attrs[randomKey] - 5);

    this.setData({ 
      isBigBottleneck: false, 
      maxAge: Math.max(this.data.age + 1, this.data.maxAge - ageLost), 
      playerAttrs: attrs 
    });
    
    this.addLog(`${msg}【道陨】天劫无情碾碎了道基！寿元暴跌 ${ageLost}，${ATTR_NAMES[randomKey]}-5！`, "event-deadly", isInstant);
    this.recalcRate();
    
    if (!isInstant) this.startEngine();
  },

  recalcRate() {
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index;
    let isMajor = (this.data.levelId % SUB_REALMS.length) === 0;
    
    if (isMajor) {
      let baseRate = Math.max(10, 80 - m * 8);
      let requiredInsight = (m + 1) * (m + 1) * 40;
      let insightBonus = Math.floor((this.data.playerAttrs.insight / requiredInsight) * 50);
      let rate = baseRate + Math.min(50, insightBonus);
      this.setData({ breakthroughRate: Math.min(100, rate) });
    } else {
      this.setData({ breakthroughRate: 100 });
    }
  },

  // ==========================================
  // 随机事件与市场
  // ==========================================

  triggerRandomEncounter(years, isInstant) {
    try {
      let config = this.getRealmConfig(this.data.levelId);
      let tierKey = "TIER_" + config.tier;
      let pool = ADVENTURE_EVENTS[tierKey];
      
      if (!pool) {
        console.warn('未找到事件池:', tierKey);
        return;
      }
      
      let luck = this.data.playerAttrs.luck;
      let roll = Math.random() * 100 + (luck * 0.2);
      
      let rarity = "NORMAL";
      let typeClass = "normal";
      if (roll > 85) { rarity = "EPIC"; typeClass = "event-epic"; }
      else if (roll > 65) { rarity = "RARE"; typeClass = "event-breakthrough"; }
      else if (roll < 10) { rarity = "DANGER"; typeClass = "event-deadly"; }

      let eventList = pool[rarity];
      if (!eventList || eventList.length === 0) return;
      
      let ev = eventList[Math.floor(Math.random() * eventList.length)];
      let attrVal = 0;
      if (ev.reqAttr !== 'none') {
        attrVal = this.data.playerAttrs[ev.reqAttr] || 0;
      }
      let isSuccess = attrVal >= ev.reqVal;
      let resultText = isSuccess ? ev.succText : ev.failText;
      
      if (!resultText) return;

      let fullText = ev.text + resultText;
      this.applyDynamicEffect(fullText, typeClass, isInstant);
    } catch (err) {
      console.error('触发随机事件失败:', err);
    }
  },

  applyDynamicEffect(text, type, isInstant) {
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index + 1;
    let attrs = { ...this.data.playerAttrs };
    let newGold = this.data.gold;
    let newMaxAge = this.data.maxAge;

    // 属性匹配
    const attrMatch = [
      { regex: /悟性([+-]\d+)/, key: 'insight' },
      { regex: /体魄([+-]\d+)/, key: 'body' },
      { regex: /根骨([+-]\d+)/, key: 'talent' },
      { regex: /福源([+-]\d+)/, key: 'luck' },
      { regex: /家境([+-]\d+)/, key: 'wealth' }
    ];
    
    attrMatch.forEach(item => {
      let match = text.match(item.regex);
      if (match) {
        attrs[item.key] = Math.max(0, attrs[item.key] + parseInt(match[1]));
      }
    });

    // 资源占位符替换
    let parsedText = text.replace(/\{(\w+)\}/g, (match, p1) => {
      return this.parseResourcePlaceholder(p1, m, newGold, newMaxAge, attrs);
    });

    this.coreData.power = this.coreData.basePower;
    
    this.setData({ playerAttrs: attrs, gold: newGold, maxAge: newMaxAge });
    this.addLog(`[气运] ${parsedText}`, type, isInstant);
  },

  parseResourcePlaceholder(p1, m, newGold, newMaxAge, attrs) {
    // 这里需要根据实际的占位符逻辑处理
    // 简化版本，实际需要完整实现
    return p1;
  },

  autoMarket(isInstant) {
    if (!MASTER_ITEMS || MASTER_ITEMS.length === 0) return;
    
    let available = MASTER_ITEMS.filter(i => 
      i.minLevel <= this.data.levelId && i.price <= this.data.gold
    );
    
    if (available.length > 0) {
      available.sort((a, b) => b.price - a.price);
      let item = available[0];
      let attrs = { ...this.data.playerAttrs };
      attrs[item.attr] += item.value;
      let newMaxAge = this.data.maxAge;
      if (item.attr === 'body') newMaxAge += item.value * 5;
      
      this.setData({ 
        gold: this.data.gold - item.price, 
        playerAttrs: attrs, 
        maxAge: newMaxAge 
      });
      
      this.addLog(`【坊市淘宝】豪掷 ${item.price} 灵石，得 [${item.name}]，${ATTR_NAMES[item.attr]}大涨！`, "event-epic", isInstant);
    }
  },

  // ==========================================
  // 工具方法
  // ==========================================

  getRealmConfig(levelId) {
    let subLen = SUB_REALMS.length;
    let majorIdx = Math.floor((levelId - 1) / subLen);
    majorIdx = Math.min(majorIdx, REALM_CONFIG.length - 1);
    return REALM_CONFIG[majorIdx];
  },

  getRealmInfo(level) {
    let subLen = SUB_REALMS.length;
    let majorIdx = Math.floor((level - 1) / subLen);
    let subIdx = (level - 1) % subLen;
    majorIdx = Math.min(majorIdx, REALM_NAMES.length - 1);
    const colors = ["Gray", "Green", "Blue", "Purple", "Orange", "Gold", "Red"];
    let colorIdx = Math.min(majorIdx, colors.length - 1);
    return { 
      name: `${REALM_NAMES[majorIdx]} ${SUB_REALMS[subIdx]}`, 
      color: colors[colorIdx] 
    };
  },

  addLog(text, type, isInstant) {
    addLog(this, text, type, isInstant);
  },

  updateUI(force = false) {
    const now = Date.now();
    
    // UI刷新节流
    if (!force && this._lastUIDrawTime && now - this._lastUIDrawTime < 250) {
      return;
    }
    this._lastUIDrawTime = now;

    let info = this.getRealmInfo(this.data.levelId);
    let percent = formatPercent(this.coreData.exp, this.coreData.nextExp);
    
    this.setData({
      realmName: info.name,
      realmColorClass: info.color,
      expPercent: percent,
      expStr: formatBigInt(this.coreData.exp),
      nextExpStr: formatBigInt(this.coreData.nextExp),
      powerStr: formatBigInt(this.coreData.power)
    });

    // 云端同步节流
    try {
      let runData = { ...(wx.getStorageSync('current_run') || {}) };
      runData.gold = this.data.gold;
      runData.level_id = this.data.levelId;
      runData.max_age = this.data.maxAge;
      runData.age = this.data.age;
      runData.realm_name = info.name;
      runData.base_attrs = this.data.playerAttrs;
      runData.exp = this.coreData.exp.toString();
      runData.nextExp = this.coreData.nextExp.toString();
      runData.power = this.coreData.power.toString();
      runData.basePower = this.coreData.basePower.toString();
      runData.isWandering = this.data.isWandering;
      runData.gameSpeed = this.data.gameSpeed;
      runData.unlockedSpeed = this.data.unlockedSpeed;
      wx.setStorageSync('current_run', runData);

      // 每隔10秒或境界变化时同步云端
      if (!this._lastSyncTime || 
          now - this._lastSyncTime > 10000 || 
          this._lastRealm !== info.name || 
          this.data.isDead) {
        this._lastSyncTime = now;
        this._lastRealm = info.name;
        
        debouncedSync(this, {
          power: String(this.coreData.power),
          realm_name: info.name,
          nickName: wx.getStorageSync('myNickName') || "神秘道友",
          avatarUrl: wx.getStorageSync('myAvatar') || "/assets/default_avatar.png"
        });
      }
    } catch (e) {
      console.error('更新UI失败:', e);
    }
  },

  checkLifeGuard(isInstant = false) {
    if (this.data.age >= this.data.maxAge && !this.data.isDead) {
      this.triggerDeath("寿元彻底干涸，灵魂崩灭于岁月之中。", isInstant);
    }
  },

  triggerDeath(msg, isInstant = false) {
    this.stopEngine();
    let calcMerit = Math.floor(Math.sqrt(this.data.age) + this.data.levelId * 20);
    if (calcMerit > 2000) calcMerit = 2000;
    
    this.setData({ isDead: true, earnedMerit: calcMerit });
    this.addLog(msg, "event-deadly", isInstant);
    
    if (!isInstant) this.updateUI(true);
  },

  suicide() {
    if (this.data.isDead) return;
    wx.showModal({
      title: '兵解重修',
      content: '是否散尽修为，凝聚功德重入轮回？',
      success: (res) => {
        if (res.confirm) {
          this.triggerDeath("你果断震碎元婴，化作满天光华兵解重修。");
        }
      }
    });
  },

  goToRebirth() {
    let assets = wx.getStorageSync('global_assets') || { merit_points: 0 };
    let newMerit = (assets.merit_points || 0) + this.data.earnedMerit;
    
    assets.merit_points = newMerit;
    wx.setStorageSync('global_assets', assets);
    wx.removeStorageSync('current_run');
    
    // 同步云端功德
    debouncedSync(this, { merit: newMerit });

    this.checkDailyShare();
    this.setData({ showRebirthModal: true });
  },

  doRealRebirth() {
    wx.reLaunch({ url: '/pages/start/start' });
  },

  syncFromStorage() {
    const runData = wx.getStorageSync('current_run') || {};
    const assets = wx.getStorageSync('global_assets') || {};
    
    if (runData.level_id === undefined) {
      runData.level_id = 1;
      runData.gold = runData.start_gold || 500;
      runData.max_age = 80 + (runData.base_attrs ? runData.base_attrs.body * 5 : 25);
      runData.age = 16;
    }
    
    this.coreData.exp = safeParseBigInt(runData.exp, "0");
    this.coreData.nextExp = safeParseBigInt(runData.nextExp, "100");
    this.coreData.power = safeParseBigInt(runData.power, "10");
    this.coreData.basePower = safeParseBigInt(runData.basePower, "10");

    this.setData({
      gold: runData.gold,
      diamonds: assets.diamonds || 0,
      levelId: runData.level_id,
      maxAge: runData.max_age,
      age: runData.age || 16,
      playerAttrs: runData.base_attrs || this.data.playerAttrs,
      rootName: runData.root ? runData.root.name : "凡人无灵根",
      rootColorClass: runData.root ? runData.root.color : "Gray",
      rootMulti: runData.root ? runData.root.multi : 1.0,
      isWandering: runData.isWandering || false,
      gameSpeed: runData.gameSpeed || 1,
      unlockedSpeed: runData.unlockedSpeed || 1
    });
    
    this.setData({
      hasRealInfo: wx.getStorageSync('hasRealInfo') || false,
      tempAvatar: wx.getStorageSync('myAvatar') || '',
      tempNickName: wx.getStorageSync('myNickName') || ''
    });

    this.recalcRate();
  },

  checkDailyShare() {
    let assets = wx.getStorageSync('global_assets') || {};
    let today = new Date().toDateString();
    
    if (assets.last_share_date !== today) {
      assets.last_share_date = today;
      assets.daily_share_count = 0;
      assets.daily_diamond_share_count = 0;
      wx.setStorageSync('global_assets', assets);
    }
    
    this.setData({
      dailyShareCount: assets.daily_share_count || 0,
      dailyDiamondShareCount: assets.daily_diamond_share_count || 0
    });
  },

  // 其他方法保持不变...
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatar: avatarUrl });
  },

  onInputNickname(e) {
    this.setData({ tempNickName: e.detail.value });
  },

  async saveProfileToCloud() {
    const avatar = this.data.tempAvatar;
    const nickName = (this.data.tempNickName || '').trim();

    if (!avatar || !nickName) {
      wx.showToast({ title: '请完善道号与真容', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '天道审核中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'syncPlayerData',
        data: {
          action: 'update',
          data: {
            avatarUrl: avatar,
            nickName: nickName
          }
        }
      });

      if (res.result && res.result.isViolation) {
        wx.hideLoading();
        wx.showModal({
          title: '天道震怒',
          content: res.result.msg || '道号沾染因果，请重新拟定！',
          showCancel: false
        });
        return;
      }

      wx.setStorageSync('myAvatar', avatar);
      wx.setStorageSync('myNickName', nickName);
      wx.setStorageSync('hasRealInfo', true);

      this.setData({ hasRealInfo: true });
      wx.hideLoading();
      wx.showToast({ title: '铭刻成功！' });

    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '天道网络拥堵', icon: 'none' });
      console.error(err);
    }
  },

  toggleRechargeModal() {
    this.setData({ showRechargeModal: !this.data.showRechargeModal });
  },

  doRecharge(e) {
    let index = e.currentTarget.dataset.index;
    let tier = this.data.rechargeTiers[index];
    
    if (tier.type === "free") {
      let assets = wx.getStorageSync('global_assets') || {};
      let today = new Date().toDateString();

      if (assets.last_free_diamond_date === today) {
        wx.showToast({ title: '今日已领低保，道友明儿再来吧！', icon: 'none' });
        return;
      }

      assets.last_free_diamond_date = today;
      wx.setStorageSync('global_assets', assets);

      let totalGain = tier.base + tier.bonus;
      wx.showToast({ title: `白嫖成功，获得 ${totalGain} 钻石`, icon: 'none' });
      updateDiamonds(this, totalGain);
      this.setData({ showRechargeModal: false });
    } else {
      wx.showToast({ title: '请点击按钮进行传道！', icon: 'none' });
    }
  },

  skipRealm() {
    if (this.data.isDead || this.data.isBigBottleneck) return;
    if (this.data.isWandering) {
      wx.showToast({ title: '游历压制修为中，无法推演飞升！', icon: 'none' });
      return;
    }
    
    let subLen = SUB_REALMS.length;
    let currentMajor = Math.floor((this.data.levelId - 1) / subLen);
    
    if (currentMajor >= REALM_NAMES.length - 1) {
      wx.showToast({ title: '已至巅峰，无可逾越', icon: 'none' });
      return;
    }
    
    let targetLevel = (currentMajor + 1) * subLen + 1;
    let cost = (currentMajor + 1) * 10;
    
    wx.showModal({
       title: '极速飞升 (闭死关)',
       content: `消耗 ${cost} 钻石跳过【${REALM_NAMES[currentMajor]}】？`,
       success: (res) => {
          if (res.confirm) {
             if (this.data.diamonds < cost) {
               wx.showToast({ title: '钻石不足', icon: 'none' });
               this.toggleRechargeModal();
               return;
             }
             
             updateDiamonds(this, -cost);
             wx.showLoading({ title: '飞升推演中...', mask: true });
             
             let wasRunning = this.data.isRunning;
             this.stopEngine();
             let safetyLimit = 5000;
             
             while(this.data.levelId < targetLevel && 
                   !this.data.isDead && 
                   safetyLimit > 0 && 
                   !this.data.isBigBottleneck) {
               this.engineTick(true);
               safetyLimit--;
             }
             
             this.setData({ 
               logs: this.data.logs, 
               lastLogId: '' 
             }, () => {
               this.setData({ lastLogId: "log-bottom-anchor" });
             });
             
             this.updateUI(true);
             wx.hideLoading();
             
             if (this.data.isDead) {
               wx.showModal({ 
                 title: '道陨', 
                 content: '强行飞升期间老死，身死道消！', 
                 showCancel: false 
               });
             } else if (this.data.isBigBottleneck) {
               wx.showToast({ title: '已推演至大境界瓶颈！', icon: 'none' });
             } else {
               wx.showToast({ title: '飞升推演完成！', icon: 'success' });
             }
             
             if (wasRunning && !this.data.isDead && !this.data.isBigBottleneck) {
               this.startEngine();
             }
          }
       }
    });
  },

  toggleSpeedModal() {
    this.setData({ showSpeedModal: !this.data.showSpeedModal });
  },

  setGameSpeed(e) {
    let spd = parseInt(e.currentTarget.dataset.speed);
    if (spd <= this.data.unlockedSpeed) {
      this.setData({ gameSpeed: spd });
      wx.showToast({ title: `已切换至 x${spd} 倍速`, icon: 'none' });
      if (this.data.isRunning && !this.data.isBigBottleneck) {
        this.startEngine();
      }
      this.toggleSpeedModal();
    }
  },

  buySpeed(e) {
    let target = parseInt(e.currentTarget.dataset.target);
    if (target <= this.data.unlockedSpeed || target > 10) return;
    
    let cost = (target - this.data.unlockedSpeed) * 1;
    
    wx.showModal({
      title: '突破岁月流速',
      content: `消耗 ${cost} 钻石，将流速上限直接提升至 x${target} 吗？`,
      confirmText: '豪掷钻石',
      success: (res) => {
        if (res.confirm) {
          if (this.data.diamonds < cost) {
            wx.showToast({ title: '钻石不足', icon: 'none' });
            this.toggleRechargeModal();
          } else {
            updateDiamonds(this, -cost);
            this.unlockSpeed(target);
          }
        }
      }
    });
  },

  unlockSpeedFree(e) {
    let type = e.currentTarget.dataset.type;
    let currentMax = this.data.unlockedSpeed;
    
    if (currentMax >= 5) {
      wx.showToast({ title: '免费提速已达天道限制', icon: 'none' });
      return;
    }
    
    if (type === 'ad') {
      wx.showLoading({ title: '观摩天道中...' });
      setTimeout(() => {
        wx.hideLoading();
        this.unlockSpeed(currentMax + 1);
      }, 1500);
    }
  },

  unlockSpeed(newMax) {
    let spd = Math.min(10, newMax);
    this.setData({ unlockedSpeed: spd, gameSpeed: spd });
    wx.showToast({ title: `突破！已解锁 x${spd} 倍速`, icon: 'success' });
    
    let runData = wx.getStorageSync('current_run') || {};
    runData.unlockedSpeed = spd;
    runData.gameSpeed = spd;
    wx.setStorageSync('current_run', runData);
    
    if (this.data.isRunning && !this.data.isBigBottleneck) {
      this.startEngine();
    }
  },

  onShareAppMessage(options) {
    // 分享逻辑保持不变...
    if (options.from === 'button' && options.target.dataset.type === 'speed') {
      setTimeout(() => {
        let currentMax = this.data.unlockedSpeed;
        if(currentMax < 5) this.unlockSpeed(currentMax + 1);
      }, 1500);
      return { title: '快来助我突破岁月流速！', path: '/pages/start/start' };
    }

    if (options.from === 'button' && options.target.dataset.type === 'share_300') {
      this.checkDailyShare();
      let assets = wx.getStorageSync('global_assets') || {};
      
      if ((assets.daily_diamond_share_count || 0) >= 10) {
        wx.showToast({ title: '今日传道功德已满，明日请早！', icon: 'none' });
        return { title: '放置成仙，开局领300钻！', path: '/pages/start/start' };
      }

      setTimeout(() => {
        assets.daily_diamond_share_count = (assets.daily_diamond_share_count || 0) + 1;
        updateDiamonds(this, 300);
        wx.setStorageSync('global_assets', assets);
        this.setData({ 
          dailyDiamondShareCount: assets.daily_diamond_share_count, 
          showRechargeModal: false 
        });
        
        wx.showToast({ 
          title: `传道成功！获 300 钻 (今日:${assets.daily_diamond_share_count}/10)`, 
          icon: 'none' 
        });
      }, 1500);

      return { 
        title: `我正在修仙，开局免费领300钻，快来一起渡劫！`, 
        path: '/pages/start/start'
      };
    }

    this.checkDailyShare();
    let assets = wx.getStorageSync('global_assets') || { merit_points: 0, ad_tickets: 3 };
    if (assets.daily_share_count < 3) {
      assets.daily_share_count++;
      assets.ad_tickets = (assets.ad_tickets || 0) + 3;
      wx.setStorageSync('global_assets', assets);
      this.setData({ dailyShareCount: assets.daily_share_count });
      
      setTimeout(() => {
         updateDiamonds(this, 50);
         wx.showToast({ title: '传道成功，投胎+3，钻石+50', icon: 'none' });
      }, 1500);
    } else {
      wx.showToast({ title: '今日奖励已达上限', icon: 'none' });
    }
    
    let info = this.getRealmInfo(this.data.levelId);
    let msg = `我以【${this.data.rootName}】修至【${info.name}】，战力${formatBigInt(this.coreData.power)}！`;
    return { title: msg, path: '/pages/start/start' };
  }
});
