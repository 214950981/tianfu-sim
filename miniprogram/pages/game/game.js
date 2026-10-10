// pages/game/game.js

const { REALM_NAMES, SUB_REALMS, REALM_CONFIG, ADVENTURE_EVENTS, MASTER_ITEMS } = require('./game_data.js');
const { AdService, PaymentService, claimReward } = require('../../services/commerce.js');

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
    rootMultiStr: "1.0",   // 【体验】灵根修炼倍率，显示在灵根卡片下方

    // ⭐ 新增：仙籍登记状态变量
    hasRealInfo: wx.getStorageSync('hasRealInfo') || false,
    tempAvatar: wx.getStorageSync('myAvatar') || '',
    tempNickName: wx.getStorageSync('myNickName') || '',

    // 氪金档位
    rechargeTiers: [
      { price: 1, base: 10, bonus: 0 },
      { price: 6, base: 60, bonus: 6 },
      { price: 30, base: 300, bonus: 30 },
      { price: 98, base: 980, bonus: 200 },
      { price: 198, base: 1980, bonus: 600 },
      { price: 648, base: 6480, bonus: 2408 }
    ],

    logs: [],
    playerAttrs: { wealth: 5, body: 5, talent: 5, luck: 5, insight: 5 },
    rootMulti: 1.0 
  },

  coreData: {
    exp: 0n,
    nextExp: 100n,
    power: 10n,
    basePower: 10n
  },

  engineTimer: null, 
  _lastUIDrawTime: 0, // ⭐ 渲染节流阀时间戳

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

  onHide() { this.stopEngine(); },
  onUnload() { this.stopEngine(); },

  // ==========================================
  // ⭐ 仙籍登记模块 (解决“微信用户”问题)
  // ==========================================
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ tempAvatar: avatarUrl });
  },

  onInputNickname(e) {
    this.setData({ tempNickName: e.detail.value });
  },

  // 3. 保存并飞升云端 (新增安检机制)
  async saveProfileToCloud() {
    const avatar = this.data.tempAvatar;
    // ⭐ 漏洞修补：剔除纯空格，防止狡猾玩家起空白名字
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

  // ==========================================
  // 云端天道同步机制 (防刷闭环)
  // ==========================================
  syncCloudAssets() {
    wx.cloud.callFunction({
      name: 'syncPlayerData',
      data: { action: 'get' },
      success: (res) => {
        if (res.result && res.result.success) {
          let cloudData = res.result.data;
          this.setData({ diamonds: cloudData.diamonds || 0 });
          let assets = wx.getStorageSync('global_assets') || {};
          assets.diamonds = cloudData.diamonds || 0;
          if (cloudData.merit !== undefined) assets.merit_points = cloudData.merit;
          wx.setStorageSync('global_assets', assets);
        }
      },
      fail: (err) => console.error("【天道失联】云端数据同步失败:", err)
    });
  },

  updateDiamonds(val) {
    let newD = Math.max(0, this.data.diamonds + val);
    this.setData({ diamonds: newD });
    let assets = wx.getStorageSync('global_assets') || {};
    assets.diamonds = newD;
    wx.setStorageSync('global_assets', assets);

    wx.cloud.callFunction({
      name: 'syncPlayerData',
      data: { action: 'update', data: { diamonds: newD } },
      fail: (err) => console.error("【警告】天道钻石账本同步失败：", err)
    });
  },

  // ==========================================
  // 充值中心逻辑 (随地呼叫仙界商行)
  // ==========================================
  toggleRechargeModal() {
    this.setData({ showRechargeModal: !this.data.showRechargeModal });
  },

  async doRecharge(e) {
    // 【收入漏损修复】原实现对 1/6/30/98/198/648 元六个档位一律
    // setTimeout 后直接 updateDiamonds(totalGain) —— 不付钱直接到账。
    // 既没有支付流程，也绕过了服务端记账。
    // 现在统一走 PaymentService；未接入支付时明确告知，不再白送钻石。
    let index = e.currentTarget.dataset.index;
    let tier = this.data.rechargeTiers[index];

    const r = await PaymentService.pay(tier);
    if (r.success) {
      // 真实支付成功后，钻石由支付回调云函数在服务端发放，
      // 这里只需重新拉取云端资产，不在客户端自行加数。
      this.syncCloudAssets();
      this.setData({ showRechargeModal: false });
      return;
    }
    wx.showModal({
      title: '仙界商行未开张',
      content: '支付通道尚未接入，暂时无法充值。可先通过【传道分享】免费领取钻石。',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // ==========================================
  // 引擎核心
  // ==========================================
  startEngine() {
    this.stopEngine(); 
    const interval = 1000 / this.data.gameSpeed; 
    this.engineTimer = setTimeout(() => { this.engineTick(); }, interval);
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

  engineTick(isInstant = false) {
    if (this.data.isDead || (!this.data.isRunning && !isInstant)) return;
    if (this.data.isBigBottleneck && !isInstant) return; 

    let config = this.getRealmConfig(this.data.levelId);
    let years = config.baseYears;

    let lifeCost = Math.floor(years * Math.pow(1.15, config.index)); 
  
    if (this.data.age + lifeCost >= this.data.maxAge) {
      this.setData({ age: this.data.maxAge });
      // 【体验修复】原文案只说"天人五衰降临"，玩家分不清是修炼太慢还是寿元不够，
      // 这正是用户反馈"反复暴死但看不懂"的直接来源。补上具体数字。
      this.triggerDeath(
        `天人五衰降临！【${this.getRealmInfo(this.data.levelId).name}】每次闭关需耗 ` +
        `${this.formatBigInt(lifeCost)} 年，而你仅余 ` +
        `${this.formatBigInt(Math.max(0, this.data.maxAge - this.data.age))} 年，` +
        `寿元先于修为枯竭，身死道消！`,
        isInstant
      );
      return;
    }
    
    this.setData({ age: this.data.age + lifeCost });

    if (this.data.isWandering) {
      let roll = Math.random() * 100;
      if (roll < 60) {
        this.triggerRandomEncounter(years, isInstant);
      } else if (roll < 80) {
        this.autoMarket(isInstant);
      } else {
        this.addLog(`游历 ${years} 载，看遍凡尘烟火，心境越发祥和。`, "normal", isInstant);
      }
    } else {
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
    }

    this.checkLifeGuard(isInstant);
    
    if (!isInstant) {
      // ⭐ 正常的引擎滴答走节流渲染，不强制刷新
      this.updateUI();
      if (this.data.isRunning && !this.data.isDead && !this.data.isBigBottleneck) {
        this.startEngine();
      }
    }
  },

  gainExp(years, isInstant) {
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index; 
    
    let numMulti = Math.pow(2, m);
    let realmMulti = BigInt(Math.floor(numMulti)); 
    let talentFactor = BigInt(Math.max(1, Math.floor(this.data.playerAttrs.talent / 2)));
    let rootFactor = BigInt(Math.floor(this.data.rootMulti * 10)); 
    
    let gain = (50n * talentFactor * rootFactor * BigInt(years) * realmMulti) / 10n;
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
      // 【日志降噪】原来每个 tick 都打一条"闭关N载"，刷屏且无信息量。
      // 改为每 5 个 tick 汇总一条，并附带本境界进度百分比与修炼效率，
      // 让玩家知道自己"为什么变强、还差多少"。
      this._quietTick = (this._quietTick || 0) + 1;
      if (this._quietTick % 5 === 0) {
        let pct = this.coreData.nextExp > 0n
          ? Number(this.coreData.exp * 100n / this.coreData.nextExp) : 0;
        this.addLog(
          `闭关 ${this.formatBigInt(years * 5)} 载，修为 ${this.formatBigInt(this.coreData.exp)}/${this.formatBigInt(this.coreData.nextExp)} (${pct}%)｜效率 x${this.data.rootMultiStr}`,
          "normal", isInstant
        );
      }
    }
  },

  handleBigBottleneck() {
    let rate = this.data.breakthroughRate;
    let lifeLeft = this.data.maxAge - this.data.age;
    
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index;
    
    let gambleCost = Math.floor(config.baseYears * 15 * Math.pow(1.15, m));
    if (gambleCost < 10) gambleCost = 10;
    
    let diamondCost = (m + 1) * 10; 
    let arrayText = this.data.hasUsedDiamondArray ? '💎 阵法已毁 (单次天劫限购1次)' : `💎 钻石逆天 (耗${diamondCost}钻 +20%胜率)`;
    let gambleText = this.data.gambleBonus >= 20 ? '🧘 底蕴已满 (无法再提升胜率)' : `🧘 沉淀底蕴 (耗${this.formatBigInt(gambleCost)}年搏几率)`;

    wx.showActionSheet({
      title: `【雷劫降临】胜率: ${rate}% | 余寿: ${this.formatBigInt(lifeLeft)}年`,
      itemList: ['⚡ 逆天而行 (强行引雷劫)', gambleText, arrayText],
      success: (res) => {
        if (res.tapIndex === 0) this.executeBigTribulation(false);
        else if (res.tapIndex === 1) this.gambleLifespan(gambleCost);
        else if (res.tapIndex === 2) this.buyDiamondArray(diamondCost);
      }
    });
  },

  gambleLifespan(gambleCost) {
    if (this.data.gambleBonus >= 20) {
      wx.showToast({ title: '底蕴已达本境极限，无法继续提升！', icon: 'none' });
      this.handleBigBottleneck(); return;
    }
    if (this.data.age + gambleCost > this.data.maxAge) {
      wx.showToast({ title: '寿元干涸，强行闭关必死无疑！', icon: 'none' }); 
      this.handleBigBottleneck(); return;
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
      this.addLog(`【红尘历练】虚度${this.formatBigInt(gambleCost)}年光阴，道心通明，天劫胜率 +${gain}%！`, "event-epic");
    } else if (roll < 85) {
      let gain = 1;
      if (this.data.gambleBonus + gain > 20) gain = 0;
      this.coreData.basePower = (this.coreData.basePower * 105n) / 100n;
      this.coreData.power = this.coreData.basePower; 
      if (gain > 0) {
        this.setData({ 
          breakthroughRate: Math.min(100, this.data.breakthroughRate + gain),
          gambleBonus: this.data.gambleBonus + gain
        });
        this.addLog(`【闭死关】${this.formatBigInt(gambleCost)}年参悟，底蕴积攒，天劫胜率 +1%。`, "normal");
      } else {
        this.addLog(`【闭死关】${this.formatBigInt(gambleCost)}年参悟，底蕴已满，仅战力稍有提升。`, "normal");
      }
    } else {
      let penalty = Math.floor(gambleCost * 0.5);
      if (penalty < 5) penalty = 5;
      this.setData({ age: this.data.age + penalty }); 
      this.addLog(`【走火入魔】强推法门遭反噬！额外折寿${this.formatBigInt(penalty)}年，好在胜率未跌。`, "event-deadly");
    }
    // ⭐ 手动交互操作，强制刷新UI
    this.updateUI(true);
    this.handleBigBottleneck(); 
  },

  buyDiamondArray(cost) {
    if (this.data.hasUsedDiamondArray) {
      wx.showToast({ title: '此阵法在同一次天劫中仅可开启一回！', icon: 'none' });
      this.handleBigBottleneck(); return;
    }
    if (this.data.diamonds < cost) {
      wx.showToast({ title: `需钻石 ${cost} 钻，余额不足！`, icon: 'none' });
      this.handleBigBottleneck(); return;
    }
    
    this.updateDiamonds(-cost);
    this.setData({ hasUsedDiamondArray: true, breakthroughRate: Math.min(100, this.data.breakthroughRate + 20) });
    this.addLog(`【钻石逆天】消耗 ${cost} 钻石开启夺天造化阵，雷劫胜率暴涨 +20%！`, "event-epic");
    // ⭐ 手动交互操作，强制刷新UI
    this.updateUI(true);
    this.handleBigBottleneck();
  },

  executeBigTribulation(isInstant) {
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index;
    let rate = this.data.breakthroughRate;
    let success = false;
    let msg = "";

    let shieldReduc = 0;
    if (this.data.playerAttrs.wealth > (m + 1) * 30) {
      shieldReduc = 10;
      msg += "【家境底蕴】家族虚影为你抵消部分雷威！";
    }

    let roll = Math.random() * 100;
    if (roll <= rate) { success = true; } 
    else {
      let miracleRoll = Math.random() * 300;
      if (miracleRoll < this.data.playerAttrs.luck) {
        success = true; msg += "【逆天福源】一道仙光强行护体，破而后立！";
      }
    }

    this.setData({ hasUsedDiamondArray: false, gambleBonus: 0 });

    if (success) {
      let nextLevel = this.data.levelId + 1;
      this.coreData.exp = 0n;
      // 【数值平衡】大境界经验需求阶跃：100n -> 2n
      // 单 tick 收益跨大境界只增长 (baseYears比值 × 2)，14 次累计约 8.19e9；
      // 旧需求增长 100 × 1.5^3 = 337.5/境界，14 次累计约 1.7e35，差 25 个数量级。
      // 取 2n 后需求累计 (2 × 1.5^3)^14 ≈ 8.3e11，与收益同阶。
      this.coreData.nextExp = this.coreData.nextExp * 2n; 
      let talentBonus = 1 + (this.data.playerAttrs.talent / 100);
      // 【数值平衡】突破寿元奖励：二次式 -> 按「下一境界单 tick 成本 × tick 预算」计价。
      // 寿元消耗是指数的 baseYears * 1.15^index（化神期 87 年/tick，天道境 353 万年/tick），
      // 旧奖励是二次的（化神期只给 5500 年 ≈ 63 tick），两条曲线不同阶 —— 这才是
      // 玩家在元婴/化神反复暴死的主因，单独改经验或单独改 1.15 都解决不了。
      let nextIdx = Math.min(m + 1, REALM_CONFIG.length - 1);
      let nextTickCost = Math.max(1, Math.floor(REALM_CONFIG[nextIdx].baseYears * Math.pow(1.15, nextIdx)));
      let ageGain = Math.floor(nextTickCost * 200 * talentBonus);
      let powerGain = BigInt(Math.floor(2000 * (m + 1) * (m + 1) * talentBonus));
      this.coreData.basePower += powerGain;
      this.coreData.power = this.coreData.basePower;

      this.setData({ levelId: nextLevel, isBigBottleneck: false, maxAge: this.data.maxAge + ageGain });
      // 【日志降噪】大境界突破是整局最重要的事件，用 ★★★★★ 顶格标记，
      // 与大量"闭关N载"的流水日志拉开视觉层级。
      this.addLog(`★★★★★【飞升】${msg}天雷散去！跨入【${this.getRealmInfo(nextLevel).name}】，获寿 ${this.formatBigInt(ageGain)} 载！`, "event-breakthrough", isInstant);
      this.recalcRate();
      if (!isInstant) this.startEngine();
    } else {
      this.coreData.exp = this.coreData.exp / 2n;
      let basePenalty = 35; 
      let actualPenalty = basePenalty - shieldReduc - (this.data.playerAttrs.body * 0.1);
      if (actualPenalty < 5) actualPenalty = 5; 
      let ageLost = Math.floor(this.data.maxAge * (actualPenalty / 100));
      let attrs = { ...this.data.playerAttrs };
      const keys = ['body', 'talent', 'insight', 'wealth'];
      let randomKey = keys[Math.floor(Math.random() * keys.length)];
      attrs[randomKey] = Math.max(1, attrs[randomKey] - 5);

      this.setData({ isBigBottleneck: false, maxAge: Math.max(this.data.age + 1, this.data.maxAge - ageLost), playerAttrs: attrs });
      this.addLog(`★★★★★【道陨】${msg}天劫无情碾碎了道基！寿元暴跌 ${this.formatBigInt(ageLost)}，${this.getAttrName(randomKey)}-5！`, "event-deadly", isInstant);
      this.recalcRate();
      if (!isInstant) this.startEngine();
    }
  },

  doAutoSmallTribulation(isInstant) {
    let nextLevel = this.data.levelId + 1;
    this.coreData.exp = 0n;
    this.coreData.nextExp = (this.coreData.nextExp * 15n) / 10n; 
    let powerGain = BigInt(100 * nextLevel);
    this.coreData.basePower += powerGain;
    this.coreData.power = this.coreData.basePower;
    // 【数值平衡】小境界寿元奖励同理改为按当前境界单 tick 成本计价。
    // 旧式在化神期只给约 110 年，而该境界 1 个 tick 就要 87 年。
    let cfgNow = this.getRealmConfig(this.data.levelId);
    let tickCostNow = Math.max(1, Math.floor(cfgNow.baseYears * Math.pow(1.15, cfgNow.index)));
    let ageGain = Math.floor(tickCostNow * 80 * (1 + this.data.playerAttrs.talent / 100));
    this.setData({ levelId: nextLevel, isBottleneck: false, maxAge: this.data.maxAge + ageGain });
    this.addLog(`★★【精进】真气溢满，水到渠成晋升【${this.getRealmInfo(nextLevel).name}】，获寿 ${this.formatBigInt(ageGain)} 载。`, "event-breakthrough", isInstant);
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

  triggerRandomEncounter(years, isInstant) {
    let config = this.getRealmConfig(this.data.levelId);
    let tierKey = "TIER_" + config.tier;
    let pool = ADVENTURE_EVENTS[tierKey];
    
    let luck = this.data.playerAttrs.luck;
    let roll = Math.random() * 100 + (luck * 0.2); 
    
    let rarity = "NORMAL";
    let typeClass = "normal";
    if (roll > 85) { rarity = "EPIC"; typeClass = "event-epic"; }
    else if (roll > 65) { rarity = "RARE"; typeClass = "event-breakthrough"; }
    else if (roll < 10) { rarity = "DANGER"; typeClass = "event-deadly"; } 

    let eventList = pool[rarity];
    let ev = eventList[Math.floor(Math.random() * eventList.length)];
    let attrVal = 0;
    if (ev.reqAttr !== 'none') attrVal = this.data.playerAttrs[ev.reqAttr];
    let isSuccess = attrVal >= ev.reqVal;
    let resultText = isSuccess ? ev.succText : ev.failText;
    if (!resultText) return; 

    let fullText = ev.text + resultText;
    this.applyDynamicEffect(fullText, typeClass, isInstant);
  },

  applyDynamicEffect(text, type, isInstant) {
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index + 1; 
    let attrs = { ...this.data.playerAttrs };
    let newGold = this.data.gold;
    let newMaxAge = this.data.maxAge;
    // 本境界单 tick 的寿元成本：事件的寿元增减一律以它为锚，
    // 避免低境界刷奇遇就能攒出跨境界的寿元（原来是 5m/20m/100m 这类绝对值）。
    let tickCostNow = Math.max(1, Math.floor(config.baseYears * Math.pow(1.15, config.index)));

    const attrMatch = [
      { regex: /悟性([+-]\d+)/, key: 'insight' }, { regex: /体魄([+-]\d+)/, key: 'body' },
      { regex: /根骨([+-]\d+)/, key: 'talent' }, { regex: /福源([+-]\d+)/, key: 'luck' }, { regex: /家境([+-]\d+)/, key: 'wealth' }
    ];
    attrMatch.forEach(item => { 
      let match = text.match(item.regex); 
      if (match) {
        attrs[item.key] = Math.max(0, attrs[item.key] + parseInt(match[1])); 
      }
    });

    // 【Bug 修复·根因A】「全属性±N」此前没有任何解析分支。
    // game_data.js 中有 7 支文案写「全属性+2/+3/+5/+10/+20/+25/-10」，
    // 而上面 5 条正则只认「悟性/体魄/根骨/福源/家境」单维短语，
    // 导致这 7 支（全是 EPIC/DANGER 高稀有度）文字照常显示、数值一点不变 ——
    // 这正是玩家反馈「奇遇文字显示了但实际没触发效果」的主因。
    let allMatch = text.match(/全属性([+-]\d+)/);
    if (allMatch) {
      let delta = parseInt(allMatch[1]);
      ['insight', 'body', 'talent', 'luck', 'wealth'].forEach(k => {
        attrs[k] = Math.max(0, attrs[k] + delta);
      });
    }

    let parsedText = text.replace(/\{(\w+)\}/g, (match, p1) => {
        let val = 0;
        if (p1 === 'gold_small') { val = 100 * m; newGold += val; return "+" + val; }
        if (p1 === 'gold_mid') { val = 500 * m * m; newGold += val; return "+" + val; }
        if (p1 === 'gold_large') { val = 5000 * m * m; newGold += val; return "+" + val; }
        if (p1 === 'gold_huge') { val = 50000 * m * m; newGold += val; return "+" + val; }
        if (p1 === 'gold_max') { val = 500000 * m * m * m; newGold += val; return "+" + val; }
        
        if (p1 === 'gold_lose_small') { val = 100 * m; newGold = Math.max(0, newGold - val); return "-" + val; }
        if (p1 === 'gold_lose_mid') { val = 500 * m * m; newGold = Math.max(0, newGold - val); return "-" + val; }
        if (p1 === 'gold_lose_large') { val = 5000 * m * m; newGold = Math.max(0, newGold - val); return "-" + val; }
        if (p1 === 'gold_lose_huge') { val = 50000 * m * m; newGold = Math.max(0, newGold - val); return "-" + val; }
        if (p1 === 'gold_lose_max') { val = 500000 * m * m * m; newGold = Math.max(0, newGold - val); return "-" + val; }

        if (p1 === 'life_small') { val = 5 * m; newMaxAge += val; return "+" + val; }
        if (p1 === 'life_mid') { val = 20 * m; newMaxAge += val; return "+" + val; }
        if (p1 === 'life_large') { val = 100 * m; newMaxAge += val; return "+" + val; }
        if (p1 === 'life_huge') { val = 500 * m; newMaxAge += val; return "+" + val; }
        if (p1 === 'life_max') { val = 2000 * m; newMaxAge += val; return "+" + val; }
        
        if (p1 === 'life_lose_small') { val = Math.floor(1.5 * m); newMaxAge = Math.max(1, newMaxAge - val); return "-" + val; }
        if (p1 === 'life_lose_mid') { val = Math.floor(3 * m); newMaxAge = Math.max(1, newMaxAge - val); return "-" + val; }
        if (p1 === 'life_lose_large') { val = Math.floor(8 * m); newMaxAge = Math.max(1, newMaxAge - val); return "-" + val; }
        if (p1 === 'life_lose_huge') { val = Math.floor(25 * m); newMaxAge = Math.max(1, newMaxAge - val); return "-" + val; }
        if (p1 === 'life_lose_max') { val = Math.floor(100 * m); newMaxAge = Math.max(1, newMaxAge - val); return "-" + val; }

        if (p1 === 'power_small') { let v = BigInt(10 * m); this.coreData.basePower += v; return "+" + v.toString(); }
        if (p1 === 'power_mid') { let v = BigInt(100 * m * m); this.coreData.basePower += v; return "+" + v.toString(); }
        if (p1 === 'power_large') { let v = BigInt(1000 * m * m); this.coreData.basePower += v; return "+" + v.toString(); }
        if (p1 === 'power_huge') { let v = BigInt(10000 * m * m * m); this.coreData.basePower += v; return "+" + v.toString(); }
        if (p1 === 'power_max') { let v = BigInt(100000 * m * m * m); this.coreData.basePower += v; return "+" + v.toString(); }
        
        if (p1 === 'power_lose_small') { let v = BigInt(10 * m); this.coreData.basePower = this.coreData.basePower > v ? this.coreData.basePower - v : 1n; return "-" + v.toString(); }
        if (p1 === 'power_lose_mid') { let v = BigInt(100 * m * m); this.coreData.basePower = this.coreData.basePower > v ? this.coreData.basePower - v : 1n; return "-" + v.toString(); }
        if (p1 === 'power_lose_large') { let v = BigInt(1000 * m * m); this.coreData.basePower = this.coreData.basePower > v ? this.coreData.basePower - v : 1n; return "-" + v.toString(); }
        if (p1 === 'power_lose_huge') { let v = BigInt(10000 * m * m * m); this.coreData.basePower = this.coreData.basePower > v ? this.coreData.basePower - v : 1n; return "-" + v.toString(); }
        if (p1 === 'power_lose_max') { let v = BigInt(100000 * m * m * m); this.coreData.basePower = this.coreData.basePower > v ? this.coreData.basePower - v : 1n; return "-" + v.toString(); }

        if (p1.startsWith('exp_')) {
          let multi = 1n;
          if(p1.includes('small')) multi = 2n;
          if(p1.includes('mid')) multi = 10n;
          if(p1.includes('large')) multi = 50n;
          if(p1.includes('huge')) multi = 200n;
          if(p1.includes('max')) multi = 1000n;

          let gain = (this.coreData.nextExp / 100n) * multi; 
          if (gain <= 0n) gain = 100n;
          if (p1.includes('lose')) {
              this.coreData.exp -= gain;
              if(this.coreData.exp < 0n) this.coreData.exp = 0n;
              return "-" + this.formatBigInt(gain);
          } else if (this.data.isWandering) {
              // 【Bug 修复·根因B-2】红尘游历期间 engineTick 不调用 gainExp，
              // 因此修为涨了也永远不会触发突破判定，exp 会一直顶在 nextExp，
              // 而日志每次仍打印全额「修为 +N」—— 第 2 次起实际增量为 0。
              // 现在游历期的修为奖励按「压制修为」设定折算为寿元，
              // 既与文案自洽（游历不长修为），也不再是假数字。
              let bonusAge = Math.max(1, Math.floor(Number(gain * 100n / this.coreData.nextExp) / 100 * tickCostNow));
              this.coreData.pendingAge = (this.coreData.pendingAge || 0) + bonusAge;
              return "转化为寿元 +" + this.formatBigInt(BigInt(bonusAge));
          } else {
              this.coreData.exp += gain;
              // 【Bug 修复·根因B-1】原来超出 nextExp 的部分被静默丢弃，
              // 但日志已按 gain 全额显示。实测中位浪费 9.37e10 修为。
              // 现在溢出部分按比例折算为寿元，显示与实际一致。
              if (this.coreData.exp > this.coreData.nextExp) {
                  let overflow = this.coreData.exp - this.coreData.nextExp;
                  this.coreData.exp = this.coreData.nextExp;
                  let bonusAge = Math.max(1, Math.floor(Number(overflow * 100n / this.coreData.nextExp) / 100 * tickCostNow));
                  this.coreData.pendingAge = (this.coreData.pendingAge || 0) + bonusAge;
                  return "+" + this.formatBigInt(gain - overflow) + "(溢出转寿元 +" + this.formatBigInt(BigInt(bonusAge)) + ")";
              }
              return "+" + this.formatBigInt(gain);
          }
        }
        return p1;
    });

    this.coreData.power = this.coreData.basePower; 

    // 把修为溢出/游历压制折算出来的寿元并入本次结算
    if (this.coreData.pendingAge) {
      newMaxAge += this.coreData.pendingAge;
      this.coreData.pendingAge = 0;
    }

    this.setData({ playerAttrs: attrs, gold: newGold, maxAge: newMaxAge });
    this.addLog(`[气运] ${parsedText}`, type, isInstant);
  },

  autoMarket(isInstant) {
    let available = MASTER_ITEMS.filter(i => i.minLevel <= this.data.levelId && i.price <= this.data.gold);
    if (available.length > 0) {
      available.sort((a, b) => b.price - a.price);
      let item = available[0];
      let attrs = { ...this.data.playerAttrs };
      attrs[item.attr] += item.value;
      let newMaxAge = this.data.maxAge;
      if (item.attr === 'body') newMaxAge += item.value * 5; 
      this.setData({ gold: this.data.gold - item.price, playerAttrs: attrs, maxAge: newMaxAge });
      this.addLog(`【坊市淘宝】豪掷 ${item.price} 灵石，得 [${item.name}]，${this.getAttrName(item.attr)}大涨！`, "event-epic", isInstant);
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
       wx.showToast({ title: '已至巅峰，无可逾越', icon: 'none' }); return;
    }
    let targetLevel = (currentMajor + 1) * subLen + 1;
    let cost = (currentMajor + 1) * 10; 
    wx.showModal({
       title: '极速飞升 (闭死关)',
       content: `消耗 ${cost} 钻石跳过【${REALM_NAMES[currentMajor]}】？\n(自动推演遇到雷劫将会为您暂停)`,
       success: (res) => {
          if (res.confirm) {
             if (this.data.diamonds < cost) {
                wx.showToast({ title: '钻石不足，强求不得', icon: 'none' }); 
                this.toggleRechargeModal();
                return;
             }
             this.updateDiamonds(-cost);
             wx.showLoading({ title: '飞升推演中...', mask: true });
             
             let wasRunning = this.data.isRunning;
             this.stopEngine();
             let safetyLimit = 5000; 
             
             while(this.data.levelId < targetLevel && !this.data.isDead && safetyLimit > 0 && !this.data.isBigBottleneck) {
                this.engineTick(true); 
                safetyLimit--;
             }
             
             this.setData({ logs: this.data.logs, lastLogId: '' }, () => {
                 this.setData({ lastLogId: 'log-bottom-anchor' });
             });
             // ⭐ 手动交互操作，强制刷新UI
             this.updateUI(true);
             wx.hideLoading();
             
             if (this.data.isDead) {
                wx.showModal({ title: '道陨', content: '强行飞升期间老死，身死道消！', showCancel: false });
             } else if (this.data.isBigBottleneck) {
                wx.showToast({ title: '已推演至大境界瓶颈，请手动破关！', icon: 'none' });
             } else if (safetyLimit <= 0) {
                wx.showToast({ title: '卡在小瓶颈，需手动破关', icon: 'none' });
             } else {
                wx.showToast({ title: '飞升推演完成！', icon: 'success' });
             }
             
             if (wasRunning && !this.data.isDead && !this.data.isBigBottleneck) this.startEngine();
          }
       }
    });
  },

  // ==========================================
  // 岁月法则：新版弹窗控制与倍速购买
  // ==========================================
  toggleSpeedModal() {
    this.setData({ showSpeedModal: !this.data.showSpeedModal });
  },

  setGameSpeed(e) {
    let spd = parseInt(e.currentTarget.dataset.speed);
    if (spd <= this.data.unlockedSpeed) {
      this.setData({ gameSpeed: spd });
      wx.showToast({ title: `已切换至 x${spd} 倍速`, icon: 'none' });
      if (this.data.isRunning && !this.data.isBigBottleneck) this.startEngine();
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
            this.updateDiamonds(-cost);
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
      wx.showToast({ title: '免费提速已达天道限制(5倍)，后续请使用钻石', icon: 'none' });
      return;
    }
    if (type === 'ad') {
      // 【商业化接口】改走统一的 AdService。当前为桩实现（未配置广告位时
      // 等价于原来的 setTimeout 模拟），接入真实激励视频后此处无需改动。
      AdService.show().then((res) => {
        if (res.completed) {
          this.unlockSpeed(currentMax + 1);
          if (res.stub) {
            // 明确标注这是桩，便于真机联调时发现广告没真正接入
            console.warn('[AdService] 桩实现发奖，广告位未配置:', res.reason);
          }
        } else {
          wx.showToast({ title: '未看完广告，提速失败', icon: 'none' });
        }
      });
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
    if (this.data.isRunning && !this.data.isBigBottleneck) this.startEngine();
  },

  checkDailyShare() {
    let assets = wx.getStorageSync('global_assets') || {};
    let today = new Date().toDateString();
    if (assets.last_share_date !== today) {
      assets.last_share_date = today;
      assets.daily_share_count = 0;
      wx.setStorageSync('global_assets', assets);
    }
    this.setData({ dailyShareCount: assets.daily_share_count || 0 });
  },

  onShareAppMessage(options) {
    if (options.from === 'button' && options.target.dataset.type === 'speed') {
      setTimeout(() => {
        let currentMax = this.data.unlockedSpeed;
        if(currentMax < 5) this.unlockSpeed(currentMax + 1);
      }, 1500);
      return { title: '快来助我突破岁月流速！', path: '/pages/start/start' };
    }

    this.checkDailyShare();
    let assets = wx.getStorageSync('global_assets') || { merit_points: 0, ad_tickets: 3 };
    if (assets.daily_share_count < 3) {
      assets.daily_share_count++;
      assets.ad_tickets = (assets.ad_tickets || 0) + 3;
      wx.setStorageSync('global_assets', assets);
      this.setData({ dailyShareCount: assets.daily_share_count });
      wx.showToast({ title: '得道多助，投胎次数+3', icon: 'none' });
    } else {
      wx.showToast({ title: '今日传道奖励已达上限', icon: 'none' });
    }
    
    let info = this.getRealmInfo(this.data.levelId);
    let msg = `我以【${this.data.rootName}】修至【${info.name}】，战力${this.formatBigInt(this.coreData.power)}！求超越！`;
    return { title: msg, path: '/pages/start/start' };
  },

  getRealmConfig(levelId) {
    let subLen = SUB_REALMS.length;
    let majorIdx = Math.floor((levelId - 1) / subLen);
    majorIdx = Math.min(majorIdx, REALM_CONFIG.length - 1);
    return REALM_CONFIG[majorIdx];
  },

  getAttrName(key) {
    const map = { body: '体魄', talent: '根骨', insight: '悟性', luck: '福源', wealth: '家境' };
    return map[key] || key;
  },

  addLog(text, type, isInstant = false) {
    let logs = this.data.logs;
    const id = "log_" + Date.now() + Math.floor(Math.random()*100);
    logs.push({ id, year: this.data.age, text, type: "log-" + type });
    if (logs.length > 50) logs.shift(); 
    if (!isInstant) {
      this.setData({ logs, lastLogId: '' }, () => { this.setData({ lastLogId: "log-bottom-anchor" }); });
    } else {
      this.data.logs = logs; 
    }
  },

  getRealmInfo(level) {
    let subLen = SUB_REALMS.length; 
    let majorIdx = Math.floor((level - 1) / subLen);
    let subIdx = (level - 1) % subLen;
    majorIdx = Math.min(majorIdx, REALM_NAMES.length - 1);
    const colors = ["Gray", "Green", "Blue", "Purple", "Orange", "Gold", "Red"];
    let colorIdx = Math.min(majorIdx, colors.length - 1);
    return { name: `${REALM_NAMES[majorIdx]} ${SUB_REALMS[subIdx]}`, color: colors[colorIdx] };
  },

  syncFromStorage() {
    const runData = wx.getStorageSync('current_run') || {};
    const assets = wx.getStorageSync('global_assets') || {};
    if (runData.level_id === undefined) {
      runData.level_id = 1; runData.gold = runData.start_gold || 500;
      runData.max_age = 80 + (runData.base_attrs ? runData.base_attrs.body * 5 : 25);
      runData.age = 16;
    }
    this.coreData.exp = BigInt(runData.exp || "0");
    this.coreData.nextExp = BigInt(runData.nextExp || "100");
    this.coreData.power = BigInt(runData.power || "10");
    this.coreData.basePower = BigInt(runData.basePower || "10");

    this.setData({
      gold: runData.gold, diamonds: assets.diamonds || 0, levelId: runData.level_id,
      maxAge: runData.max_age, age: runData.age || 16, playerAttrs: runData.base_attrs || this.data.playerAttrs,
      rootName: runData.root ? runData.root.name : "凡人无灵根",
      rootColorClass: runData.root ? runData.root.color : "Gray",
      rootMulti: runData.root ? runData.root.multi : 1.0,
      rootMultiStr: (runData.root ? runData.root.multi : 1.0).toFixed(1),
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

  // ⭐ 新增 force 参数：是否无视节流，强制更新UI
  updateUI(force = false) {
    const now = Date.now();
    // ⭐ 核心修复2：性能节流阀。除非强制(force)要求，否则每秒最多渲染 4 次 (250ms一次)
    if (!force && this._lastUIDrawTime && now - this._lastUIDrawTime < 250) {
      return; 
    }
    this._lastUIDrawTime = now;

    let info = this.getRealmInfo(this.data.levelId);
    let percent = Number(this.coreData.exp * 100n / this.coreData.nextExp);
    
    this.setData({
      realmName: info.name, realmColorClass: info.color, expPercent: percent,
      expStr: this.formatBigInt(this.coreData.exp), nextExpStr: this.formatBigInt(this.coreData.nextExp),
      powerStr: this.formatBigInt(this.coreData.power)
    });

    try {
      let runData = { ...(wx.getStorageSync('current_run') || {}) };
      runData.gold = this.data.gold; runData.level_id = this.data.levelId; runData.max_age = this.data.maxAge;
      runData.age = this.data.age; runData.realm_name = info.name; runData.base_attrs = this.data.playerAttrs;
      runData.exp = this.coreData.exp.toString(); runData.nextExp = this.coreData.nextExp.toString();
      runData.power = this.coreData.power.toString(); runData.basePower = this.coreData.basePower.toString();
      runData.isWandering = this.data.isWandering; 
      runData.gameSpeed = this.data.gameSpeed;         
      runData.unlockedSpeed = this.data.unlockedSpeed; 
      wx.setStorageSync('current_run', runData);

      // ⭐ [天道同步机制]
      if (!this._lastSyncTime || now - this._lastSyncTime > 10000 || this._lastRealm !== info.name || this.data.isDead) {
        this._lastSyncTime = now;
        this._lastRealm = info.name;

        wx.cloud.callFunction({
          name: 'syncPlayerData',
          data: {
            action: 'update',
            data: {
              power: String(this.coreData.power), 
              realm_name: info.name,              
              // ⭐ 核心修复1：彻底剔除 diamonds 的盲目同步，防止覆盖本地真实资产
              nickName: wx.getStorageSync('myNickName') || "神秘道友",
              avatarUrl: wx.getStorageSync('myAvatar') || "/assets/default_avatar.png"
            }
          }
        });
      }

    } catch (e) { }
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
    // ⭐ 死亡瞬间属于关键节点，强制刷新一次UI
    if (!isInstant) this.updateUI(true); 
  },

  suicide() {
    if (this.data.isDead) return;
    wx.showModal({
      title: '兵解重修', content: '是否散尽修为，凝聚功德重入轮回？',
      success: (res) => { if (res.confirm) this.triggerDeath("你果断震碎元婴，化作满天光华兵解重修。"); }
    });
  },

  goToRebirth() {
    let assets = wx.getStorageSync('global_assets') || { merit_points: 0 };
    let newMerit = (assets.merit_points || 0) + this.data.earnedMerit;
    
    assets.merit_points = newMerit;
    wx.setStorageSync('global_assets', assets);
    wx.removeStorageSync('current_run');
    
    wx.cloud.callFunction({
      name: 'syncPlayerData',
      data: { action: 'update', data: { merit: newMerit } }
    });

    this.checkDailyShare();
    this.setData({ showRebirthModal: true });
  },

  doRealRebirth() {
    wx.reLaunch({ url: '/pages/start/start' });
  },

  formatBigInt(n) {
    // 【Bug 修复】原实现无数组越界保护：units 只有 8 项（最大「穰」=32 位），
    // 33 位数时 units[idx] 为 undefined，界面直接渲染 "1undefined"。
    // rank.js 的 formatPower 本就有 unitIdx 上限保护，这份漏了。
    // 战力经多次轮回叠加完全可以超过 32 位，必须兜底。
    const units = ["", "万", "亿", "兆", "京", "垓", "秭", "穰", "沟", "涧", "正", "载"];
    let s = (n === undefined || n === null) ? "0" : n.toString();
    if (s.charAt(0) === '-') return "0";
    if (s.length <= 4) return s;
    let idx = Math.floor((s.length - 1) / 4);
    if (idx >= units.length) {
      // 超出所有可命名单位，退化为科学计数，绝不输出 undefined
      return s.substring(0, 4) + "e" + (s.length - 4);
    }
    let head = s.substring(0, s.length % 4 || 4);
    return head + units[idx];
  }

});