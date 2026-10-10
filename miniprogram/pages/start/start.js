// pages/start/start.js
const { MASTER_TALENTS, ROOT_POOL, GAME_HELP } = require('./data.js');
const { AdService, PaymentService, claimReward } = require('../../services/commerce.js');

Page({
  data: {
    // 资产与状态
    ad_tickets: 3,
    diamonds: 0,
    bonusPoints: 0,
    consumedMerit: 0,
    
    // 盲盒摇号结果
    currentTalents: [],
    currentRoot: {},
    finalAttrs: { wealth: 5, body: 5, talent: 5, luck: 5, insight: 5 },
    totalPointsInfo: "",
    totalAttrPoints: 0,         // 命格总属性点数
    
    // 锁定系统状态
    lockedTalents: [false, false, false], // 3个天赋槽的锁定状态
    isRootLocked: false,                  // 灵根锁定状态

    // UI 弹窗控制
    showHelp: false,
    showRechargeModal: false,
    showBuyTicketModal: false,
    buyAmount: 1,

    // 自动投胎系统
    showAutoRollModal: false,
    autoRollAmount: 10,         // 用户设置的自动投胎次数
    isAutoRolling: false,       // 当前是否正在自动投胎
    autoRollLeft: 0,            // 自动投胎剩余次数

    // --- 新增：自动投胎阈值配置 ---
    stopTierIndex: 2, // 默认选中索引2（紫阶及以上）
    tierPickerList: [
      { name: '蓝阶及以上', values: ['Blue', 'Purple', 'Orange', 'Gold', 'Red'] },
      { name: '紫阶及以上', values: ['Purple', 'Orange', 'Gold', 'Red'] },
      { name: '橙阶及以上', values: ['Orange', 'Gold', 'Red'] },
      { name: '金阶及以上', values: ['Gold', 'Red'] },
      { name: '仅限红阶停', values: ['Red'] }
    ],


    // 氪金档位配置表
    rechargeTiers: [
      { price: 1, base: 10, bonus: 0 },
      { price: 6, base: 60, bonus: 6 },
      { price: 30, base: 300, bonus: 30 },
      { price: 98, base: 980, bonus: 200 },
      { price: 198, base: 1980, bonus: 600 },
      { price: 648, base: 6480, bonus: 2408 }
    ],
    helpData: GAME_HELP
  },

  onLoad() { 
    this.initLifeCycle(); 
  },

  onShow() {
    // ⭐ 核心防刷：每次回到首页，强制从云端拉取真实资产
    this.syncCloudAssets();
  },

  // ==========================================
  // ⭐ 云端天道同步防刷机制
  // ==========================================
  syncCloudAssets() {
    wx.cloud.callFunction({
      name: 'syncPlayerData',
      data: { action: 'get' },
      success: (res) => {
        if (res.result && res.result.success) {
          let cloudData = res.result.data;
          let assets = wx.getStorageSync('global_assets') || {};

          // 以云端真实数据为准覆盖本地
          assets.diamonds = cloudData.diamonds !== undefined ? cloudData.diamonds : (assets.diamonds || 0);
          assets.merit_points = cloudData.merit !== undefined ? cloudData.merit : (assets.merit_points || 0);
          assets.ad_tickets = cloudData.ad_tickets !== undefined ? cloudData.ad_tickets : (assets.ad_tickets !== undefined ? assets.ad_tickets : 3);
          wx.setStorageSync('global_assets', assets);
          
          // 如果云端拉取到了新的功德或资产，重新执行生命周期进行转化
          this.initLifeCycle();
        }
      },
      fail: (err) => console.error("【天道失联】起步页资产同步失败:", err)
    });
  },

  updateCloudData(updateObj) {
    // 资产一旦变动，立刻上报云端备案，防止本地破解修改
    wx.cloud.callFunction({
      name: 'syncPlayerData',
      data: { action: 'update', data: updateObj },
      fail: (err) => console.error("【警告】天道数据防刷更新失败:", err)
    });
  },

  initLifeCycle() {
    let assets = wx.getStorageSync('global_assets') || {};
    let tickets = assets.ad_tickets !== undefined ? assets.ad_tickets : 3;
    let merit = assets.merit_points || 0;
    let currentDiamonds = assets.diamonds || 0;
    
    // 功德转化属性点核心逻辑
    let extraPoints = Math.floor(merit / 100);
    let leftMerit = merit % 100;
    
    assets.merit_points = leftMerit;
    assets.ad_tickets = tickets;
    assets.diamonds = currentDiamonds;
    wx.setStorageSync('global_assets', assets);
    
    this.setData({
      ad_tickets: tickets,
      diamonds: currentDiamonds,
      bonusPoints: extraPoints,
      consumedMerit: merit - leftMerit
    });

    // ⭐ 防刷闭环：如果玩家消耗了功德转化为属性点，必须同步扣除云端功德，防止无限重刷！
    if (extraPoints > 0) {
      this.updateCloudData({ merit: leftMerit });
    }
    
    // 如果没有正在自动摇号，才初始化面相（防止打断自动进程）
    if (!this.data.isAutoRolling) {
      this.generateCharacter();
    }
  },

  // === 1. 强化版摇号引擎：融合锁定逻辑 ===
  generateCharacter() {
    let pool = [null, null, null];
    let selectedIds = [];
    let totalWeight = MASTER_TALENTS.reduce((sum, item) => sum + item.weight, 0);
    
    // A. 继承被锁定的天赋
    for (let i = 0; i < 3; i++) {
      if (this.data.lockedTalents[i] && this.data.currentTalents[i]) {
        pool[i] = this.data.currentTalents[i];
        selectedIds.push(this.data.currentTalents[i].t_id);
      }
    }

    // B. 填补未锁定的空缺
    for (let i = 0; i < 3; i++) {
      if (!pool[i]) {
        while (true) {
          let randomNum = Math.floor(Math.random() * totalWeight);
          let currentWeight = 0;
          let found = null;
          for (let talent of MASTER_TALENTS) {
            currentWeight += talent.weight;
            if (randomNum < currentWeight) {
              found = talent;
              break;
            }
          }
          if (found && !selectedIds.includes(found.t_id)) {
            pool[i] = found;
            selectedIds.push(found.t_id);
            break;
          }
        }
      }
    }

    // C. 计算属性 (融合天赋增益)
    let attrs = { wealth: 5, body: 5, talent: 5, luck: 5, insight: 5 };
    pool.forEach(t => {
      attrs.wealth += t.attr.wealth;
      attrs.body += t.attr.body;
      attrs.talent += t.attr.talent;
      attrs.luck += t.attr.luck;
      attrs.insight += t.attr.insight;
    });

    const attrKeys = ["wealth", "body", "talent", "luck", "insight"];
    let totalDistribute = 20 + this.data.bonusPoints;
    for (let i = 0; i < totalDistribute; i++) {
      let randomKey = attrKeys[Math.floor(Math.random() * attrKeys.length)];
      attrs[randomKey]++;
    }

    // D. 抽取灵根 (如果未锁定)
    // 【顺序调整】灵根必须在"保底去负 + 统计总点数"之前抽，
    // 因为新灵根带 bonus 五维加成，要并入 attrs 后再统一结算。
    let root = this.data.currentRoot;
    if (!this.data.isRootLocked) {
      let finalLuck = attrs.luck > 0 ? attrs.luck : 0;
      let rootWeight = ROOT_POOL.reduce((sum, item) => sum + item.weight, 0);
      
      let rootRoll = Math.floor(Math.random() * rootWeight) + (finalLuck * 25); 
      
      if (rootRoll >= rootWeight) {
        rootRoll = rootWeight - 1; 
      }
      
      let cWeight = 0;
      for (let i = 0; i < ROOT_POOL.length; i++) {
        cWeight += ROOT_POOL[i].weight;
        if (rootRoll < cWeight) {
          root = ROOT_POOL[i];
          break;
        }
      }
    }

    // 【灵根联动】灵根的 bonus 五维加成并入属性。
    // 原来灵根只有 multi 一个作用，与八维属性完全脱节；
    // 现在"抽到什么灵根"同时影响修炼速度和属性分布，但仍是一次性单向加算，
    // 玩家看卡片上的「体魄+8」就知道多了多少，不存在隐式多层耦合。
    if (root && root.bonus) {
      for (let bk in root.bonus) {
        if (attrs[bk] !== undefined) attrs[bk] += root.bonus[bk];
      }
    }

    // 保底锁死杜绝负数，并计算总属性点数
    let finalTotalAttr = 0;
    attrKeys.forEach(key => {
      if (attrs[key] < 0) attrs[key] = 0;
      finalTotalAttr += attrs[key];
    });

    this.setData({
      currentTalents: pool,
      currentRoot: root,
      finalAttrs: attrs,
      totalAttrPoints: finalTotalAttr,
      totalPointsInfo: `基础20点 + 功德化解${this.data.bonusPoints}点`
    });
  },

  // === 2. 锁定系统核心逻辑 ===
  toggleLockTalent(e) {
    let index = e.currentTarget.dataset.index;
    let newLocks = [...this.data.lockedTalents];
    newLocks[index] = !newLocks[index];
    this.setData({ lockedTalents: newLocks });
  },

  toggleLockRoot() {
    this.setData({ isRootLocked: !this.data.isRootLocked });
  },

  getLockCount() {
    let count = 0;
    this.data.lockedTalents.forEach(isLocked => { if (isLocked) count++; });
    if (this.data.isRootLocked) count++;
    return count;
  },

  getLockCost(count) {
    if (count === 1) return 10;
    if (count === 2) return 30;
    if (count === 3) return 50;
    if (count >= 4) return 100; // 最多锁4个(3天赋+1灵根)，防止出Bug给个保底高价
    return 0;
  },

// === 3. 极品防误触监测 (动态阈值版) ===
checkHighRarity() {
  // 读取当前玩家选择的目标阶位数组
  const targetTiers = this.data.tierPickerList[this.data.stopTierIndex].values;
  let hasHigh = false;
  
  // 检查没锁定的天赋里有没有达标的
  for (let i = 0; i < 3; i++) {
    if (!this.data.lockedTalents[i] && this.data.currentTalents[i] && targetTiers.includes(this.data.currentTalents[i].rarity)) {
      hasHigh = true;
    }
  }
  // 检查没锁定的灵根里有没有达标的
  if (!this.data.isRootLocked && this.data.currentRoot && targetTiers.includes(this.data.currentRoot.color)) {
    hasHigh = true;
  }
  
  return hasHigh;
},

  // === 4. 手动投胎 ===
  reRoll() {
    // 正在自动则停止
    if (this.data.isAutoRolling) {
      this.stopAutoRoll();
      return;
    }

    // 极品防误触
    if (this.checkHighRarity()) {
      wx.showModal({
        title: '仙缘警示',
        content: '检测到未锁定的【高品质命格/灵根】！继续投胎将永久错失此等仙缘，执意重入轮回？',
        confirmText: '无情抛弃',
        cancelText: '我再看看',
        success: (res) => { if (res.confirm) this.executeRoll(false); }
      });
    } else {
      this.executeRoll(false);
    }
  },

  // === 5. 自动投胎系统 ===
  toggleAutoRollModal() {
    if (this.data.isAutoRolling) {
      this.stopAutoRoll();
      return;
    }
    this.setData({ showAutoRollModal: !this.data.showAutoRollModal, autoRollAmount: 10 });
  },

  onAutoRollInput(e) {
    let val = parseInt(e.detail.value);
    this.setData({ autoRollAmount: isNaN(val) || val <= 0 ? 1 : val });
  },

  startAutoRoll() {
    if (this.data.autoRollAmount <= 0) return;
    
    // 开始前先检测防误触
    if (this.checkHighRarity()) {
      wx.showModal({
        title: '仙缘警示',
        content: '当前存在未锁定的【极品仙缘】，开启自动投胎将失去它们！确定继续吗？',
        success: (res) => {
          if (res.confirm) {
            this.setData({ isAutoRolling: true, autoRollLeft: this.data.autoRollAmount, showAutoRollModal: false });
            this.executeRoll(true);
          }
        }
      });
    } else {
      this.setData({ isAutoRolling: true, autoRollLeft: this.data.autoRollAmount, showAutoRollModal: false });
      this.executeRoll(true);
    }
  },

  stopAutoRoll() {
    this.setData({ isAutoRolling: false, autoRollLeft: 0 });
  },
// 切换自动洗髓停止阈值
onTierChange(e) {
  this.setData({
    stopTierIndex: e.detail.value
  });
},
  // === 6. 核心扣费与执行逻辑 ===
  executeRoll(isAuto) {
    let locks = this.getLockCount();
    let lockCost = this.getLockCost(locks);

    // 【1】扣费逻辑判定
    if (locks > 0) {
      // 有锁定，强行消耗钻石
      if (this.data.diamonds < lockCost) {
        if (isAuto) this.stopAutoRoll();
        wx.showModal({
          title: '仙玉不足',
          content: `锁定 ${locks} 项天机，单次投胎需消耗 ${lockCost} 钻石。`,
          confirmText: '去充值',
          success: (res) => { if (res.confirm) this.toggleRechargeModal(); }
        });
        return;
      }
      // 扣除钻石
      let newDiamonds = this.data.diamonds - lockCost;
      this.setData({ diamonds: newDiamonds });
      let assets = wx.getStorageSync('global_assets') || {};
      assets.diamonds = newDiamonds;
      wx.setStorageSync('global_assets', assets);

      // ⭐ 防刷闭环：锁定消耗了钻石，必须立刻备案云端
      this.updateCloudData({ diamonds: newDiamonds });

    } else {
      // 没锁定，消耗免费次数
      if (this.data.ad_tickets <= 0) {
        if (isAuto) this.stopAutoRoll();
        wx.showModal({
          title: '轮回次数已尽',
          content: '观看广告、分享或使用钻石购买次数',
          confirmText: '去购买',
          success: (res) => { if (res.confirm) this.toggleBuyTicketModal(); }
        });
        return;
      }
      // 扣除次数
      let newTickets = this.data.ad_tickets - 1;
      this.setData({ ad_tickets: newTickets });
      let assets = wx.getStorageSync('global_assets') || {};
      assets.ad_tickets = newTickets;
      wx.setStorageSync('global_assets', assets);

      // ⭐ 防刷闭环：次数变动也同步云端，防止清缓存无限投胎
      this.updateCloudData({ ad_tickets: newTickets });
    }

    // 【2】产生新结果
    this.generateCharacter();

    // 【3】自动模式后续推进
    if (isAuto && this.data.isAutoRolling) {
      let left = this.data.autoRollLeft - 1;
      this.setData({ autoRollLeft: left });
      
      if (left > 0) {
        // 自动摇完立刻检测，出了极品强制停车！
        if (this.checkHighRarity()) {
          this.stopAutoRoll();
          wx.showToast({ title: '已刷出极品仙缘，自动停止！', icon: 'none', duration: 3000 });
        } else {
          // 继续下一次递归 (150毫秒的极速快感)
          setTimeout(() => {
            if (this.data.isAutoRolling) this.executeRoll(true);
          }, 150);
        }
      } else {
        this.stopAutoRoll();
        wx.showToast({ title: '自动投胎完成', icon: 'success' });
      }
    }
  },

  // === 7. 资产面板、弹窗与充值方法 ===
  toggleRechargeModal() { this.setData({ showRechargeModal: !this.data.showRechargeModal }); },
  toggleBuyTicketModal() { this.setData({ showBuyTicketModal: !this.data.showBuyTicketModal, buyAmount: 1 }); },
  
  doRecharge(e) {
    let index = e.currentTarget.dataset.index;
    let tier = this.data.rechargeTiers[index];
    let totalGain = tier.base + tier.bonus;
    wx.showLoading({ title: '呼叫仙界商行...' });
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({ title: `充值成功，获得 ${totalGain} 钻石`, icon: 'none' });
      let newDiamonds = this.data.diamonds + totalGain;
      this.setData({ diamonds: newDiamonds, showRechargeModal: false });
      let assets = wx.getStorageSync('global_assets') || {};
      assets.diamonds = newDiamonds;
      wx.setStorageSync('global_assets', assets);
      
      // ⭐ 防刷闭环：充值获得钻石，必须立刻存入云端
      this.updateCloudData({ diamonds: newDiamonds });
    }, 800);
  },

  onAmountInput(e) {
    let val = parseInt(e.detail.value);
    this.setData({ buyAmount: isNaN(val) || val <= 0 ? 1 : val });
  },

  buyMaxTickets() {
    if (this.data.diamonds <= 0) {
      wx.showToast({ title: '钻石不足', icon: 'none' }); return;
    }
    this.setData({ buyAmount: this.data.diamonds });
  },

  confirmBuyTickets() {
    let cost = this.data.buyAmount;
    if (this.data.diamonds < cost) {
      wx.showToast({ title: '钻石不足', icon: 'none' });
      this.setData({ showBuyTicketModal: false });
      this.toggleRechargeModal();
      return;
    }
    let newDiamonds = this.data.diamonds - cost;
    this.setData({ diamonds: newDiamonds, showBuyTicketModal: false });
    let assets = wx.getStorageSync('global_assets') || {};
    assets.diamonds = newDiamonds;
    wx.setStorageSync('global_assets', assets);
    
    // ⭐ 防刷闭环：购买消耗了钻石，必须同步云端
    this.updateCloudData({ diamonds: newDiamonds });

    this.addTickets(cost);
    wx.showToast({ title: `购得 ${cost} 次轮回`, icon: 'success' });
  },

  watchAd() {
    // 【商业化接口 + 防刷】原实现是 setTimeout 后直接 addTickets(5)，
    // 既是假广告，次数也只记在本地 storage，清缓存即可无限刷。
    // 现在：观看走 AdService，发奖走云函数 claimReward（服务端日限 20 次）。
    AdService.show().then(async (res) => {
      if (!res.completed) {
        wx.showToast({ title: '未看完广告，奖励未发放', icon: 'none' });
        return;
      }
      const r = await claimReward('ad_ticket');
      if (r.success) {
        this.setData({ ad_tickets: r.ad_tickets });
        let assets = wx.getStorageSync('global_assets') || {};
        assets.ad_tickets = r.ad_tickets;
        wx.setStorageSync('global_assets', assets);
        wx.showToast({ title: `次数 +${r.granted.ad_tickets}`, icon: 'success' });
      } else {
        wx.showToast({ title: r.msg || '今日次数已用尽', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    let assets = wx.getStorageSync('global_assets') || {};
    let today = new Date().toDateString();
    if (assets.last_share_date !== today) {
      assets.last_share_date = today;
      assets.daily_share_count = 0;
    }
    if (assets.daily_share_count < 3) {
      assets.daily_share_count++;
      wx.setStorageSync('global_assets', assets);
      this.addTickets(3);
      setTimeout(() => { wx.showToast({ title: '次数 +3', icon: 'none' }); }, 1000);
    } else {
      setTimeout(() => { wx.showToast({ title: '今日奖励已达上限', icon: 'none' }); }, 1000);
    }
    return { title: '放置成仙！极品命格等你测！', path: '/pages/start/start' };
  },

  addTickets(num) {
    let t = this.data.ad_tickets + num;
    this.setData({ ad_tickets: t });
    let assets = wx.getStorageSync('global_assets') || {};
    assets.ad_tickets = t;
    wx.setStorageSync('global_assets', assets);
    
    // ⭐ 防刷闭环：获得了次数，存入云端
    this.updateCloudData({ ad_tickets: t });
  },

  toggleHelp() { this.setData({ showHelp: !this.data.showHelp }); },

  launchGame() {
    let activeTalentIds = this.data.currentTalents.map(t => t.t_id);
    let runData = {
      is_alive: true,
      seed: "Run_" + Date.now(),
      base_attrs: this.data.finalAttrs,             
      talents_active: activeTalentIds,    
      root: this.data.currentRoot,  
      start_gold: (this.data.finalAttrs.wealth < 0 ? 0 : this.data.finalAttrs.wealth) * 100 
    };
    wx.setStorageSync('current_run', runData);
    wx.showLoading({ title: '踏入仙路...', mask: true });
    setTimeout(() => {
      wx.hideLoading();
      wx.reLaunch({ url: '/pages/game/game' });
    }, 1000);
  }
});