// pages/rank/rank.js

Page({
  data: {
    currentTab: 'total', // 'total' 诸天总榜, 'daily' 今日活跃榜
    rankList: [],
    myRankInfo: null, 
    loading: true,
    worshippedUids: []
  },

  onShow() {
    this.initRankSystem();
  },

  // === 核心：初始化排行系统 (真人全服版) ===
  async initRankSystem() {
    this.setData({ loading: true });
    
    try {
      // 1. 获取本地数据
      const runData = wx.getStorageSync('current_run') || {};
      
      // 2. 主动向天道查一下自己真实的云端最高记录
      const cloudRes = await wx.cloud.callFunction({ name: 'syncPlayerData', data: { action: 'get' } });
      const myCloudData = cloudRes.result && cloudRes.result.data ? cloudRes.result.data : null;
      const myOpenid = myCloudData ? myCloudData._openid : "UNKNOWN";

      // 3. 获取微信信息 (兜底)
      const wxInfo = await this.safeGetWechatUserInfo();

      // ⭐ 4. 核心修复：融合本地与云端战力，取最高值！防兵解后战力显示掉落
      let localPowerRaw = runData.power ? String(runData.power) : "0";
      let localPower = BigInt(localPowerRaw.replace(/[^0-9]/g, '') || "0");

      let cloudTotalPower = BigInt(myCloudData && myCloudData.power ? String(myCloudData.power).replace(/[^0-9]/g, '') : "0");
      let cloudDailyPower = BigInt(myCloudData && myCloudData.dailyPower ? String(myCloudData.dailyPower).replace(/[^0-9]/g, '') : "0");

      let finalTotalPower = localPower > cloudTotalPower ? localPower : cloudTotalPower;
      let finalDailyPower = localPower > cloudDailyPower ? localPower : cloudDailyPower;
      
      let finalRealm = runData.realm_name || "炼气期";
      if (cloudTotalPower > localPower && myCloudData && myCloudData.realm_name) {
          finalRealm = myCloudData.realm_name; 
      }

      const myPlayerObj = {
        uid: "PLAYER_ME", 
        nickname: wx.getStorageSync('myNickName') || wxInfo.nickName || "神秘道友(你)",
        avatar: wx.getStorageSync('myAvatar') || wxInfo.avatarUrl || "/assets/default_avatar.png",
        province: wxInfo.province || "诸天万界",
        power: finalTotalPower,       
        dailyPower: finalDailyPower,  
        realm: finalRealm,
        isMe: true,
        lastUpdate: new Date()
      };

      // ⭐ 5. 拉取全服数据
      const db = wx.cloud.database();
      const orderField = this.data.currentTab === 'daily' ? 'lastUpdate' : 'power';
      const res = await db.collection('player_data') 
        .orderBy(orderField, 'desc') 
        .limit(100)
        .get();
      
      // 6. 格式化真人数据
      let serverData = res.data.map(user => ({
        uid: user._openid,
        nickname: user.nickName || "神秘道友",
        avatar: user.avatarUrl || "/assets/default_avatar.png",
        province: user.province || "诸天万界",
        power: BigInt(String(user.power || 0).replace(/[^0-9]/g, '')),
        dailyPower: BigInt(String(user.dailyPower || 0).replace(/[^0-9]/g, '')),
        realm: user.realm_name || "炼气期",
        isMe: false, 
        lastUpdate: user.lastUpdate
      }));

      // 7. 精准踢掉云端里和自己 OpenID 重复的数据
      serverData = serverData.filter(p => p.uid !== myOpenid);
      
      // 8. 合并数据
      let allPlayers = [...serverData, myPlayerObj];

      // 9. 页签数据过滤与战力切换
      let filteredPlayers = allPlayers;
      if (this.data.currentTab === 'daily') {
         const todayStart = new Date();
         todayStart.setHours(0, 0, 0, 0); 
         
         filteredPlayers = allPlayers.filter(p => {
            if (p.isMe) return true; 
            if (!p.lastUpdate) return false;
            return new Date(p.lastUpdate).getTime() >= todayStart.getTime(); 
         });

         filteredPlayers = filteredPlayers.map(p => ({
            ...p,
            power: p.dailyPower 
         }));
      }

      // 10. 降序排列
      filteredPlayers.sort((a, b) => {
        if (b.power > a.power) return 1;
        if (b.power < a.power) return -1;
        return 0;
      });

      // 11. 整理数据 (彻底消灭 BigInt，并修复“101名幻觉”)
      let myFinalRank = 0;
      const finalRankList = filteredPlayers.map((player, index) => {
        const currentRank = index + 1;
        if (player.isMe) myFinalRank = currentRank;

        let title = "寻道者";
        if (currentRank === 1) title = "诸天至尊";
        else if (currentRank === 2) title = "万界仙首";
        else if (currentRank === 3) title = "造化大能";
        else if (currentRank <= 10) title = "一方宗主";

        // ⭐ 修复幻觉：真实排名超过 100 时，不显示 101，而是显示未入榜
        let displayRank = currentRank > 100 ? "未入榜" : currentRank;

        return {
          ...player,
          power: player.power.toString(),
          dailyPower: player.dailyPower ? player.dailyPower.toString() : "0", 
          rank: displayRank,
          title: title,
          powerStr: this.formatPower(player.power)
        };
      });

      // 12. 提取兜底对象并清洗 BigInt
      const safeMyPlayerObj = {
        ...myPlayerObj,
        power: myPlayerObj.power.toString(),
        dailyPower: myPlayerObj.dailyPower ? myPlayerObj.dailyPower.toString() : "0",
        rank: "未入榜",
        powerStr: this.formatPower(myPlayerObj.power)
      };

      // 13. 更新 UI 渲染
      this.setData({
        rankList: finalRankList.slice(0, 100),
        myRankInfo: finalRankList[myFinalRank - 1] || safeMyPlayerObj
      });

    } catch (err) {
      console.error("仙榜加载致命异常:", err);
      wx.showToast({ title: '天机混乱，请检查云数据库', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // === 交互：膜拜榜单大能 (每日福利) ===
  worship(e) {
    const { uid, rank, nickname } = e.currentTarget.dataset;
    
    if (rank > 3) return; 
    if (uid === "PLAYER_ME") {
      wx.showToast({ title: '自恋是无法获得道祖感应的', icon: 'none' });
      return;
    }
    
    let assets = wx.getStorageSync('global_assets') || {};
    const today = new Date().toDateString();

    if (assets.last_worship_date !== today) {
      assets.last_worship_date = today;
      assets.worshipped_uids = [];
    }

    if (assets.worshipped_uids && assets.worshipped_uids.includes(uid)) {
      wx.showToast({ title: '今日已向这位大能膜拜过了', icon: 'none' });
      return;
    }

    const reward = Math.floor(Math.random() * 10) + 1;
    
    const newDiamonds = (assets.diamonds || 0) + reward;
    assets.diamonds = newDiamonds;
    if (!assets.worshipped_uids) assets.worshipped_uids = [];
    assets.worshipped_uids.push(uid); 
    wx.setStorageSync('global_assets', assets); 

    wx.cloud.callFunction({
      name: 'syncPlayerData',
      data: { action: 'update', data: { diamonds: newDiamonds } }
    });

    wx.showModal({
      title: '天道感应',
      content: `你虔诚膜拜了【${nickname}】，冥冥中感悟到一丝天机，获得钻石 +${reward}！`,
      showCancel: false,
      confirmText: '谢主隆恩'
    });
  },

  // === 护城河：安全获取微信信息 ===
  safeGetWechatUserInfo() {
    return new Promise((resolve) => {
      let isResolved = false;
      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          resolve({ nickName: "神秘道友", avatarUrl: "/assets/default_avatar.png" });
        }
      }, 2000);
      
      wx.getSetting({
        success: (res) => {
          if (res.authSetting['scope.userInfo']) {
            wx.getUserInfo({
              success: (info) => {
                if (!isResolved) {
                  isResolved = true;
                  clearTimeout(timer);
                  resolve(info.userInfo);
                }
              },
              fail: () => { if (!isResolved) { isResolved = true; resolve({ nickName: "神秘道友" }); } }
            });
          } else { if (!isResolved) { isResolved = true; resolve({ nickName: "未授权道友" }); } }
        },
        fail: () => { if (!isResolved) { isResolved = true; resolve({}); } }
      });
    });
  },

  // === 工具：大数值优雅展示 ===
  formatPower(power) {
    const units = ["", "万", "亿", "兆", "京", "垓", "秭", "穰", "沟", "涧"];
    let pStr = power.toString();
    if (pStr.length <= 4) return pStr;

    let unitIdx = Math.floor((pStr.length - 1) / 4);
    if (unitIdx >= units.length) unitIdx = units.length - 1;

    let remainder = pStr.length % 4 || 4;
    let head = pStr.substring(0, remainder);
    let decimal = pStr.substring(remainder, remainder + 2);

    if (decimal && decimal !== "00") {
      if (decimal.endsWith('0')) decimal = decimal[0];
      return `${head}.${decimal}${units[unitIdx]}`;
    }
    return `${head}${units[unitIdx]}`;
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.currentTab === tab) return;
    this.setData({ currentTab: tab });
    this.initRankSystem();
  }
});