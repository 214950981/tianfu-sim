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
    hasUsedGoldShield: false,   // 本次天劫是否已用过灵石护道
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
    // 【用户决策 3】支付通道未接入期间隐藏充值档位。
    // 接入支付后改为 true 即可恢复展示，档位数据与 doRecharge 均已保留。
    paymentEnabled: false,
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
      this.addLog(
        "【苟道】你施展秘法隐匿修为，停止吐纳，开始在红尘中游历寻找机缘！" +
        "（奇遇翻倍、但修为被压制无法突破，且寿元消耗加倍）", "event-epic");
    } else {
      this.addLog("【出关】你结束了游历，回到洞府开始全力闭关，修为再次涌动！", "event-breakthrough");
    }
  },

  engineTick(isInstant = false) {
    if (this.data.isDead || (!this.data.isRunning && !isInstant)) return;
    if (this.data.isBigBottleneck && !isInstant) return; 

    let config = this.getRealmConfig(this.data.levelId);
    let years = config.baseYears;

    // 【区分度设计】游历在外奔波，单 tick 寿元消耗是闭关的 2 倍。
    // 这是游历的真实代价 —— 原来两者寿元消耗完全相同，游历唯一的区别是
    // "不涨修为"，纯粹是显性陷阱而非策略选项。
    let lifeMulti = this.data.isWandering ? 2 : 1;
    let lifeCost = Math.floor(years * Math.pow(1.15, config.index) * lifeMulti); 

    // 【灵石消耗口 3】续命丹：寿元告急时自动服用。
    // 玩家不需要操作，但会在日志里看到"灵石换了命"，
    // 这让前面攒下的灵石在最关键的时刻产生可感知的价值。
    if (this.data.age + lifeCost * 4 >= this.data.maxAge) {
      let pillCost = Math.floor(800 * Math.pow(2.6, config.index));
      if (this.data.gold >= pillCost) {
        let addAge = lifeCost * 15;
        this.setData({ gold: this.data.gold - pillCost, maxAge: this.data.maxAge + addAge });
        this.addLog(
          `【续命丹】寿元将尽，耗 ${this.formatBigInt(pillCost)} 灵石求得续命丹，最大寿元 +${this.formatBigInt(addAge)}！`,
          "event-epic", isInstant
        );
      }
    }

    if (this.data.age + lifeCost >= this.data.maxAge) {
      this.setData({ age: this.data.maxAge });
      // 【体验修复】原文案只说"天人五衰降临"，玩家分不清是修炼太慢还是寿元不够，
      // 这正是用户反馈"反复暴死但看不懂"的直接来源。补上具体数字。
      this.triggerDeath(
        `天人五衰降临！【${this.getRealmInfo(this.data.levelId).name}】每次${this.data.isWandering ? '游历' : '闭关'}需耗 ` +
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
          hasUsedGoldShield: false,
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

    // 【灵石消耗口 2】灵石护道：天劫前花灵石买胜率。
    // 这是灵石最重要的消耗场景 —— 玩家在整局最紧张的时刻决定要不要花钱，
    // 灵石的价值在这一刻被直接兑现成"活下来"。
    let shieldCost = this.getShieldCost(m);
    let shieldText = this.data.hasUsedGoldShield
      ? '🛡 护道已用 (单次天劫限用1次)'
      : `🛡 灵石护道 (耗${this.formatBigInt(shieldCost)}灵石 +15%胜率)`;

    wx.showActionSheet({
      title: `【雷劫降临】胜率: ${rate}% | 余寿: ${this.formatBigInt(lifeLeft)}年 | 灵石: ${this.formatBigInt(this.data.gold)}`,
      itemList: ['⚡ 逆天而行 (强行引雷劫)', gambleText, shieldText, arrayText],
      success: (res) => {
        if (res.tapIndex === 0) this.executeBigTribulation(false);
        else if (res.tapIndex === 1) this.gambleLifespan(gambleCost);
        else if (res.tapIndex === 2) this.buyGoldShield(shieldCost);
        else if (res.tapIndex === 3) this.buyDiamondArray(diamondCost);
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

  // 灵石护道价码：与坊市同一套几何增长基准，保证"护道一次"约等于
  // "少买一两件当前档位的道具"，玩家能直观感到取舍。
  getShieldCost(realmIndex) {
    return Math.floor(2500 * Math.pow(2.6, Math.max(0, realmIndex)));
  },

  buyGoldShield(cost) {
    if (this.data.hasUsedGoldShield) {
      wx.showToast({ title: '护道之法在同一次天劫中仅可用一回！', icon: 'none' });
      this.handleBigBottleneck(); return;
    }
    if (this.data.gold < cost) {
      wx.showToast({ title: `需灵石 ${this.formatBigInt(cost)}，囊中不足！`, icon: 'none' });
      this.handleBigBottleneck(); return;
    }
    this.setData({
      gold: this.data.gold - cost,
      hasUsedGoldShield: true,
      breakthroughRate: Math.min(100, this.data.breakthroughRate + 15)
    });
    this.addLog(`【灵石护道】耗 ${this.formatBigInt(cost)} 灵石布下护道灵阵，雷劫胜率 +15%！`, "event-epic");
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

    this.setData({ hasUsedDiamondArray: false, hasUsedGoldShield: false, gambleBonus: 0 });

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

  // TODO(死亡压力偏低，待后续调参)：
  // 本轮改动把「必死局」与「激励倒置」都修掉了，但真实代码全程回归
  // （N=100，闭关+自动护道）显示达 L61 率已到 100%，死亡压力偏松 ——
  // 对一个修仙 roguelike 来说，"几乎不会死"会削弱天劫的紧张感。
  //
  // 已测得的压力来源数据（N=60/组，供后续调参参考）：
  //   默认(有灵石+自动护道)        通关 96.7%
  //   不买护道                    通关 98.3%
  //   零灵石(无护道/续命/坊市)      通关 68.3%，终点 P10 仅 L36
  // 可见死亡压力几乎全部由「灵石是否充裕」承载，而灵石在当前产出下
  // 很少真正短缺，于是安全网长期生效。
  //
  // 建议的后续方向（本轮不再继续数值迭代，避免过度拟合模拟器）：
  //   1. 降低灵石产出系数，或提高护道/续命丹价格曲线，让安全网不总是够用；
  //   2. 给「天劫失败」叠加累积惩罚（如同一大境界连续失败递增扣损）；
  //   3. 保留 breakthroughRate 的 92% 上限（已实现），但下调 baseRate 底板。
  // 调整前务必用 harness 跑一遍七档灵根 × 策略曲线，确认不会复活「必死局」。
  recalcRate() {
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index;
    let isMajor = (this.data.levelId % SUB_REALMS.length) === 0;
    
    if (isMajor) {
      // 【数值修复·激励倒置】原公式：
      //   baseRate = max(10, 80 - m*8)          后期固定塌到 10%
      //   requiredInsight = (m+1)^2 * 40        二次增长，m=9 时需要 4000
      //   insightBonus = insight/required * 50
      // 实测玩家到 m=9 时悟性中位只有 53，需求却是 4000，
      // 加成恒为 +0，胜率全程卡在 10% 底板 —— 悟性这一维等于不存在。
      //
      // 更糟的是它造成激励倒置：高品灵根升级快 ⇒ 每境界 tick 少
      // ⇒ 奇遇/坊市机会少 ⇒ 属性堆不起来 ⇒ 悟性更低 ⇒ 胜率更低。
      // 实测 multi=0.5 通关 86.7%，而 multi=30 只有 23.3% —— 抽到好灵根反而更难通关。
      //
      // 新公式：
      //   1) 底板从 10% 抬到 35%，后期不再是必败局；
      //   2) 悟性需求改为线性 INSIGHT_REQ[m]（由实测各境界悟性中位数反推），
      //      让悟性在任何阶段都能实际换到胜率；
      //   3) 悟性加成上限 +45，保证"堆满悟性"接近但不等于必成，天劫仍有风险。
      // INSIGHT_REQ：拿到"满额悟性加成"所需的悟性量，由实测各境界
      // 悟性分布的 P75~P90 反推 —— 堆得好的玩家能吃满，普通玩家吃一部分。
      const INSIGHT_REQ = [25, 35, 45, 60, 80, 110, 160, 240, 340, 460, 600, 780, 1000, 1300, 1700];
      // 底板：前期留出失败空间（不是 100% 必成），后期不塌到必败
      let baseRate = Math.max(30, 62 - m * 2);
      let requiredInsight = INSIGHT_REQ[Math.min(m, INSIGHT_REQ.length - 1)];
      let insightBonus = Math.floor((this.data.playerAttrs.insight / requiredInsight) * 45);
      // 悟性最多补到 +45，叠加底板后上限 92% —— 天劫永远保留一丝风险，
      // 这也是"沉淀底蕴/灵石护道/钻石逆天"三个补救手段存在的意义。
      let rate = baseRate + Math.min(45, insightBonus);
      this.setData({ breakthroughRate: Math.min(92, rate) });
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

    // 【数值修复】检定门槛改为按境界动态计算，不再用 game_data.js 里写死的 reqVal。
    //
    // 原因：原 reqVal 是 20~5000 的硬编码，但玩家属性根本到不了那个量级。
    // 全程推演（N=400）实测通过率：
    //   卷一(门槛20~40)    15.5%
    //   卷二(门槛100~200)  10.1%
    //   卷三(门槛600~1000)  0.2%
    //   卷四(门槛2000~4000) 0.0%
    // 也就是说玩家在卷三/卷四几乎只能看到失败文案 —— 主观感受正是
    // "奇遇文字出现了但没有好事发生"，这是用户反馈的体感放大器。
    //
    // 新门槛 = BASE[大境界] × 稀有度系数，BASE 表由实测的
    // "各境界入门时玩家属性中位数"反推得出，保证普通事件容易过、
    // 史诗事件需要堆属性才能过。实测通过率 卷一64% 卷二68% 卷三67% 卷四70%。
    let reqVal = this.getEncounterThreshold(config.index, rarity);

    let isSuccess;
    if (ev.reqAttr === 'wealth') {
      // 【灵石消耗口】家境类奇遇原本检定 wealth 属性，但坊市不售家境、
      // 天劫失败又会扣它，实测终局 wealth 中位=1，这类事件几乎必败。
      // 文案本身写的是"掷出重金""钞能力发威"——本来就该花钱，不该是查属性。
      // 改为检定并实际扣除灵石，灵石从此有了一个由剧情驱动的消耗场景。
      let price = this.getRichEventPrice(config.index, rarity);
      isSuccess = this.data.gold >= price;
      if (isSuccess) {
        this.setData({ gold: this.data.gold - price });
        ev = Object.assign({}, ev, {
          succText: `(掷出 ${price} 灵石) ` + ev.succText
        });
      } else {
        ev = Object.assign({}, ev, {
          failText: `(囊中羞涩，拿不出 ${price} 灵石) ` + ev.failText
        });
      }
    } else if (ev.reqAttr === 'none') {
      isSuccess = true;
    } else {
      isSuccess = this.data.playerAttrs[ev.reqAttr] >= reqVal;
    }

    let resultText = isSuccess ? ev.succText : ev.failText;
    if (!resultText) return; 

    let fullText = ev.text + resultText;
    this.applyDynamicEffect(fullText, typeClass, isInstant);
  },

  // 奇遇检定门槛表。索引 = 大境界 index(0~14)。
  // 数值来源：用真实代码跑全程推演，取"各大境界入门时玩家属性中位数"，
  // 再按稀有度缩放。这样门槛永远贴着玩家的实际成长曲线走。
  getEncounterThreshold(realmIndex, rarity) {
    const BASE = [10, 12, 13, 14, 15, 17, 22, 34, 50, 58, 60, 60, 58, 57, 56];
    const COEF = { NORMAL: 0.55, RARE: 0.85, EPIC: 1.15, DANGER: 1.0 };
    let base = BASE[Math.min(Math.max(realmIndex, 0), BASE.length - 1)];
    return Math.max(5, Math.round(base * (COEF[rarity] || 1)));
  },

  // 家境类奇遇的"掷重金"价码。按境界几何增长，贴合灵石产出规模。
  getRichEventPrice(realmIndex, rarity) {
    const PRICE = [300, 700, 1800, 4500, 11000, 28000, 70000, 180000,
                   450000, 1100000, 2800000, 7000000, 18000000, 45000000, 110000000];
    const COEF = { NORMAL: 0.5, RARE: 1, EPIC: 2, DANGER: 1.5 };
    let base = PRICE[Math.min(Math.max(realmIndex, 0), PRICE.length - 1)];
    return Math.floor(base * (COEF[rarity] || 1));
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
        // 【联动】家境 → 灵石产出乘数 = 1 + wealth/50。
        // 原来家境只在天劫失败减伤里用过一次（条件 wealth > (m+1)*30，实测几乎不可达），
        // 是事实上的死属性（全程推演终局中位 = 1）。现在它直接决定灵石收入。
        let goldMulti = 1 + attrs.wealth / 50;
        if (p1 === 'gold_small') { val = Math.floor(100 * m * goldMulti); newGold += val; return "+" + val; }
        if (p1 === 'gold_mid') { val = Math.floor(500 * m * m * goldMulti); newGold += val; return "+" + val; }
        if (p1 === 'gold_large') { val = Math.floor(5000 * m * m * goldMulti); newGold += val; return "+" + val; }
        if (p1 === 'gold_huge') { val = Math.floor(50000 * m * m * goldMulti); newGold += val; return "+" + val; }
        if (p1 === 'gold_max') { val = Math.floor(500000 * m * m * m * goldMulti); newGold += val; return "+" + val; }
        
        if (p1 === 'gold_lose_small') { val = 100 * m; newGold = Math.max(0, newGold - val); return "-" + val; }
        if (p1 === 'gold_lose_mid') { val = 500 * m * m; newGold = Math.max(0, newGold - val); return "-" + val; }
        if (p1 === 'gold_lose_large') { val = 5000 * m * m; newGold = Math.max(0, newGold - val); return "-" + val; }
        if (p1 === 'gold_lose_huge') { val = 50000 * m * m; newGold = Math.max(0, newGold - val); return "-" + val; }
        if (p1 === 'gold_lose_max') { val = 500000 * m * m * m; newGold = Math.max(0, newGold - val); return "-" + val; }

        // 寿元奖励锚定「本境界单 tick 成本」而非绝对年数。
        // 原来 life_max 固定 2000*m，在炼气期就是几千年白送，
        // 低境界反复刷奇遇即可无限续命；而到了天道境 2000*m 又几乎不够一次闭关。
        // 游历期额外打 WANDER_LIFE_GAIN 折，杜绝「边游历边自我续命」的无限 farm。
        let lifeScale = this.data.isWandering ? 0.15 : 1;
        if (p1 === 'life_small') { val = Math.max(1, Math.floor(tickCostNow * 2 * lifeScale)); newMaxAge += val; return "+" + this.formatBigInt(BigInt(val)); }
        if (p1 === 'life_mid') { val = Math.max(1, Math.floor(tickCostNow * 5 * lifeScale)); newMaxAge += val; return "+" + this.formatBigInt(BigInt(val)); }
        if (p1 === 'life_large') { val = Math.max(1, Math.floor(tickCostNow * 12 * lifeScale)); newMaxAge += val; return "+" + this.formatBigInt(BigInt(val)); }
        if (p1 === 'life_huge') { val = Math.max(1, Math.floor(tickCostNow * 30 * lifeScale)); newMaxAge += val; return "+" + this.formatBigInt(BigInt(val)); }
        if (p1 === 'life_max') { val = Math.max(1, Math.floor(tickCostNow * 80 * lifeScale)); newMaxAge += val; return "+" + this.formatBigInt(BigInt(val)); }
        
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
    // 【灵石经济重设计】这里原来是"把买得起的最贵一件买掉"，带来三个问题：
    //   1. 实测消耗/产出 = 96.3%，终局结余中位 0 —— 玩家从不经手灵石，
    //      全被自动花光，所以"灵石没什么感觉"。
    //   2. 永远买最贵的那件，属性会全部堆到单一维度（实测 body 能堆到 2503，
    //      而 wealth/talent 中位只有 1）。
    //   3. 体魄道具额外 maxAge += value*5，构成
    //      灵石→体魄道具→寿命→更多tick→更多灵石 的自我供能回路，
    //      实测纯游历 3000 tick 可刷到 body=2308、灵石产出 1.57e7，无上界。
    //
    // 现在的规则：
    //   - 临劫储备金：大境界圆满（下一步就是天劫）时，预留护道+续命的钱，
    //     只花超出储备线的部分。平时自由消费，临劫前自动留底。
    //   - 补最短板：优先买当前最低的那一维，避免单维暴堆。
    //   - 体魄道具不再直接加 maxAge（断开自我供能回路）。
    //     体魄仍通过"初始寿命 80+body*5"和"天劫减损 body*0.1"发挥作用。
    let config = this.getRealmConfig(this.data.levelId);
    let m = config.index;

    // 大境界圆满时为天劫留出储备金
    let nearTribulation = (this.data.levelId % SUB_REALMS.length) === 0;
    let reserve = nearTribulation ? Math.floor(2500 * Math.pow(2.6, m)) : 0;
    let spendable = Math.max(0, this.data.gold - reserve);

    let available = MASTER_ITEMS.filter(i =>
      i.minLevel <= this.data.levelId && i.price <= spendable && i.attr !== 'wealth'
    );
    if (available.length === 0) return;

    // 找当前最短的一维（家境不在坊市售卖，避免 灵石→家境→灵石 的放大环）
    const shopAttrs = ['body', 'talent', 'luck', 'insight'];
    let lowKey = shopAttrs[0];
    shopAttrs.forEach(k => {
      if (this.data.playerAttrs[k] < this.data.playerAttrs[lowKey]) lowKey = k;
    });

    let candidates = available.filter(i => i.attr === lowKey);
    if (candidates.length === 0) candidates = available;
    // 同一维度里取数值最高的，其次取价格最高的
    candidates.sort((a, b) => (b.value - a.value) || (b.price - a.price));
    let item = candidates[0];

    let attrs = { ...this.data.playerAttrs };
    attrs[item.attr] += item.value;
    this.setData({ gold: this.data.gold - item.price, playerAttrs: attrs });
    this.addLog(
      `【坊市淘宝】豪掷 ${item.price} 灵石补短板，得 [${item.name}]，${this.getAttrName(item.attr)}+${item.value}！`,
      "event-epic", isInstant
    );
  },

  // 【重设计】原「飞升推演」花 (major+1)*10 钻把 tick 快进到下一个大境界，
  // 不改变任何结果 —— 它卖的是"跳过等待"。但本游戏已有岁月流速系统，
  // 解锁到 x10 总共只要 9 钻且永久生效，比推演一个境界（第1个就要 10 钻）
  // 还便宜。两个系统卖同一个东西，推演被严格支配，是冗余付费点。
  //
  // 决策：保留按钮但改变它卖的东西 —— 从"跳过等待"改为"闭死关冲刺"：
  // 不再快进 tick，而是把当前境界的修为直接推满到瓶颈，
  // 代价是按境界计价的寿元（而非钻石）。这样它与倍速不再重叠：
  //   倍速   = 花钻石买"现实时间"
  //   闭死关 = 花寿元买"游戏内进度"
  // 两者维度不同，玩家在"寿元富余但没耐心"时才用它，形成真实选择。
  skipRealm() {
    if (this.data.isDead || this.data.isBigBottleneck) return;
    
    if (this.data.isWandering) {
      wx.showToast({ title: '游历压制修为中，无法闭死关冲刺！', icon: 'none' });
      return;
    }

    let subLen = SUB_REALMS.length;
    let currentMajor = Math.floor((this.data.levelId - 1) / subLen);
    if (currentMajor >= REALM_NAMES.length - 1) {
       wx.showToast({ title: '已至巅峰，无可逾越', icon: 'none' }); return;
    }

    // 冲刺到本小境界的瓶颈：代价是当前境界 12 个 tick 的寿元
    let config = this.getRealmConfig(this.data.levelId);
    let tickCost = Math.max(1, Math.floor(config.baseYears * Math.pow(1.15, config.index)));
    let ageCost = tickCost * 12;
    let lifeLeft = this.data.maxAge - this.data.age;

    if (ageCost >= lifeLeft) {
      wx.showToast({ title: `需耗 ${this.formatBigInt(ageCost)} 年，余寿不足！`, icon: 'none' });
      return;
    }

    wx.showModal({
       title: '闭死关冲刺',
       content: `耗 ${this.formatBigInt(ageCost)} 年寿元，将【${this.getRealmInfo(this.data.levelId).name}】的修为直接推满至瓶颈？\n(余寿 ${this.formatBigInt(lifeLeft)} 年)`,
       confirmText: '闭死关',
       success: (res) => {
          if (res.confirm) {
             this.setData({ age: this.data.age + ageCost });
             // 直接把修为推满，由下一次 gainExp 触发正常的瓶颈/天劫流程，
             // 不绕过任何判定。
             this.coreData.exp = this.coreData.nextExp;
             this.addLog(
               `【闭死关】燃烧 ${this.formatBigInt(ageCost)} 年寿元强行冲关，修为瞬间推至瓶颈！`,
               "event-breakthrough"
             );
             this.updateUI(true);
             // 立刻走一次 tick 以触发瓶颈判定
             this.engineTick(true);
             this.updateUI(true);
             if (this.data.isRunning && !this.data.isDead && !this.data.isBigBottleneck) this.startEngine();
          }
       }
    });
  },

  // 旧的钻石快进实现，保留备查但不再挂到任何入口。
  // 如需恢复，把 wxml 的 bindtap 改回 skipRealmLegacy 即可。
  skipRealmLegacy() {
    let subLen = SUB_REALMS.length;
    let currentMajor = Math.floor((this.data.levelId - 1) / subLen);
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

  // 滑块调速。滑块只能选到已解锁范围内的值（max 绑定 unlockedSpeed），
  // 这里再做一次钳制，防止异常值绕过。
  onSpeedSlide(e) {
    let v = parseInt(e.detail.value) || 1;
    v = Math.min(Math.max(v, 1), this.data.unlockedSpeed);
    this.setData({ gameSpeed: v });
    if (this.data.isRunning) { this.stopEngine(); this.startEngine(); }
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