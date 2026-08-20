// utils/cloud.js - 云端操作封装

/**
 * 同步玩家数据到云端（带防抖）
 * @param {Object} data - 要同步的数据
 * @param {Function} onSuccess - 成功回调
 * @param {Function} onError - 失败回调
 */
function syncPlayerData(data, onSuccess, onError) {
  if (!wx.cloud) {
    console.error('云开发未初始化');
    onError && onError(new Error('云开发未初始化'));
    return;
  }

  wx.cloud.callFunction({
    name: 'syncPlayerData',
    data: {
      action: 'update',
      data: data
    },
    success: (res) => {
      if (res.result && res.result.success) {
        onSuccess && onSuccess(res.result);
      } else {
        const error = new Error(res.result?.msg || '云端同步失败');
        console.error('云端同步失败:', error);
        onError && onError(error);
      }
    },
    fail: (err) => {
      console.error('云端调用失败:', err);
      onError && onError(err);
    }
  });
}

/**
 * 从云端获取玩家数据
 * @param {Function} onSuccess - 成功回调
 * @param {Function} onError - 失败回调
 */
function getPlayerData(onSuccess, onError) {
  if (!wx.cloud) {
    console.error('云开发未初始化');
    onError && onError(new Error('云开发未初始化'));
    return;
  }

  wx.cloud.callFunction({
    name: 'syncPlayerData',
    data: { action: 'get' },
    success: (res) => {
      if (res.result && res.result.success) {
        onSuccess && onSuccess(res.result.data);
      } else {
        const error = new Error(res.result?.msg || '获取云端数据失败');
        console.error('获取云端数据失败:', error);
        onError && onError(error);
      }
    },
    fail: (err) => {
      console.error('云端调用失败:', err);
      onError && onError(err);
    }
  });
}

/**
 * 防抖同步（避免频繁调用）
 * @param {Object} context - 上下文对象
 * @param {Object} data - 要同步的数据
 */
function debouncedSync(context, data) {
  const now = Date.now();
  
  // 如果距离上次同步不足10秒，跳过
  if (context._lastCloudSyncTime && (now - context._lastCloudSyncTime) < 10000) {
    return;
  }
  
  context._lastCloudSyncTime = now;
  syncPlayerData(data);
}

/**
 * 更新钻石并同步云端
 * @param {Object} context - 页面上下文
 * @param {number} delta - 变化量（正数增加，负数减少）
 * @returns {number} 新的钻石数量
 */
function updateDiamonds(context, delta) {
  const currentDiamonds = context.data.diamonds || 0;
  const newDiamonds = Math.max(0, currentDiamonds + delta);
  
  // 更新本地状态
  context.setData({ diamonds: newDiamonds });
  
  // 更新本地存储
  let assets = wx.getStorageSync('global_assets') || {};
  assets.diamonds = newDiamonds;
  wx.setStorageSync('global_assets', assets);
  
  // 同步云端
  syncPlayerData({ diamonds: newDiamonds }, null, (err) => {
    console.error('钻石同步失败:', err);
    wx.showToast({ 
      title: '钻石同步失败，请检查网络', 
      icon: 'none',
      duration: 2000
    });
  });
  
  return newDiamonds;
}

/**
 * 验证每日领取状态（云端优先）
 * @param {string} key - 存储键名
 * @param {Function} callback - 回调函数 (canClaim: boolean)
 */
function checkDailyClaim(key, callback) {
  const today = new Date().toDateString();
  let assets = wx.getStorageSync('global_assets') || {};
  
  // 先检查本地缓存
  if (assets[key] === today) {
    callback(false);
    return;
  }
  
  // 云端验证（防止本地篡改）
  getPlayerData((cloudData) => {
    const cloudLastDate = cloudData[key] || '';
    
    if (cloudLastDate === today) {
      // 云端已领取，更新本地
      assets[key] = today;
      wx.setStorageSync('global_assets', assets);
      callback(false);
    } else {
      // 可以领取
      callback(true);
    }
  }, (err) => {
    // 云端请求失败，降级使用本地验证
    console.warn('云端验证失败，使用本地验证:', err);
    callback(assets[key] !== today);
  });
}

module.exports = {
  syncPlayerData,
  getPlayerData,
  debouncedSync,
  updateDiamonds,
  checkDailyClaim
};
