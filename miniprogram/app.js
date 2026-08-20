// app.js
App({
  onLaunch: function () {
    // === 1. 天道云端初始化 ===
    this.globalData = {
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      env: "cloud1-8glg1sird4d40bc0",
    };
    if (!wx.cloud) {
      console.error("天道残缺：请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }

    // === 2. 触发天道法则更迭检测 (版本热更新) ===
    this.checkUpdate();
  },

  // ⭐ 新增：沉浸式修仙风更新机制
  checkUpdate: function () {
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager();
      
      updateManager.onCheckForUpdate(function (res) {
        if (res.hasUpdate) {
          console.log('【天道提示】检测到新版本法则，正在为您降下祥瑞...');
        }
      });

      updateManager.onUpdateReady(function () {
        wx.showModal({
          title: '天道法则更迭',
          content: '新版修仙界已构建完毕，请道友重聚肉身（重启小程序）以顺应天时！',
          showCancel: false, // 强制玩家重启，不给取消的机会
          confirmText: '重聚肉身',
          confirmColor: '#FFD700', // 暗金色的确认按钮
          success: function (res) {
            if (res.confirm) {
              // 新的版本已经下载好，调用 applyUpdate 应用新版本并重启
              updateManager.applyUpdate();
            }
          }
        });
      });

      updateManager.onUpdateFailed(function () {
        // 新版本下载失败（通常是因为网络极差）
        wx.showModal({
          title: '雷劫干扰',
          content: '新版法则接引失败，请道友稍后在微信列表中删除本程序，重新搜索踏入仙途！',
          showCancel: false,
          confirmText: '明悟'
        });
      });
    }
  }
});