// cloudfunctions/syncPlayerData/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID; 
  const { action, data } = event; 

  // ⭐ 核心对齐：统一使用 player_data 集合
  const collectionName = 'player_data';

  try {
    const user = await db.collection(collectionName).where({ _openid: openid }).get();

    // --- 分支 1: 登录/加载时拉取档案 ---
    if (action === 'get') {
      if (user.data.length === 0) {
        // 新玩家天道初始化 (包含 dailyPower 字段)
        const newProfile = { 
          _openid: openid, 
          diamonds: 0, 
          merit: 0, 
          power: "0",             // 历史最高战力
          dailyPower: "0",        // 今日最高战力
          nickName: "神秘道友",
          avatarUrl: "/assets/default_avatar.png",
          province: "诸天万界",
          realm_name: "炼气期",
          lastUpdate: db.serverDate() 
        };
        await db.collection(collectionName).add({ data: newProfile });
        return { success: true, data: newProfile };
      }
      return { success: true, data: user.data[0] };
    }

    // --- 分支 2: 更新档案 (包含双榜数据分离与违规安检) ---
    if (action === 'update') {
      let updateData = { ...data, lastUpdate: db.serverDate() };
      
      // ⭐ 【天道护城河】：铁血违规词安检 (宁可错杀绝不放过)
      if (updateData.nickName && updateData.nickName !== "神秘道友") {
        try {
          const secRes = await cloud.openapi.security.msgSecCheck({ content: updateData.nickName });
          // 万一微信没有报错，而是正常返回了代表违规的 errCode
          if (secRes && secRes.errCode && secRes.errCode !== 0) {
            return { success: false, isViolation: true, msg: "道号沾染因果，请重新拟定！" };
          }
        } catch (err) {
          console.error("【安检机异常日志】", err);
          // 87014 是标准的命中违禁词
          if (err.errCode === 87014) {
            return { success: false, isViolation: true, msg: "道号沾染因果，请重新拟定！" };
          }
          // 如果是其他错误（比如 config.json 权限没生效），全部拦截，并把错误码暴露给前端！
          return { 
            success: false, 
            isViolation: true, 
            msg: "天道安检机故障，错误码: " + (err.errCode || err.errMsg || "未知") 
          };
        }
      }

      // ⭐ 【核心改造：双榜战力分流系统与防覆盖保护罩】
      if (updateData.power !== undefined) {
        let newPower = String(updateData.power);
        let oldPower = user.data[0].power || "0";
        let oldDailyPower = user.data[0].dailyPower || "0";
        
        // 跨天精准判断 (转换为北京时间 UTC+8 对比天数)
        let lastUpdateDate = user.data[0].lastUpdate ? new Date(user.data[0].lastUpdate) : new Date(0);
        let today = new Date(); 
        let lastDayStr = new Date(lastUpdateDate.getTime() + 8 * 3600000).toISOString().split('T')[0];
        let todayStr = new Date(today.getTime() + 8 * 3600000).toISOString().split('T')[0];
        let isSameDay = (lastDayStr === todayStr);

        // 大数字符串比较法则：先比长度，长度一样比字典序
        const isGreater = (a, b) => {
          if (a.length !== b.length) return a.length > b.length;
          return a > b;
        };

        // 1. 结算总榜 (历史最高巅峰)
        if (isGreater(newPower, oldPower)) {
          updateData.power = newPower; // 破历史记录，存入
        } else {
          // 没破历史记录，删掉前端传来的字段，保护云端老巅峰数据
          delete updateData.power;     
          delete updateData.realm_name; 
        }

        // 2. 结算日榜 (今日最高巅峰)
        if (!isSameDay) {
          // 跨天了！今天是全新的开始，直接记录今天的初始战力
          updateData.dailyPower = newPower;
        } else {
          // 还在同一天，看看有没有破今天的记录
          if (isGreater(newPower, oldDailyPower)) {
            updateData.dailyPower = newPower;
          }
        }
      }

      await db.collection(collectionName).where({ _openid: openid }).update({
        data: updateData
      });
      return { success: true };
    }
  } catch (e) {
    console.error("【天道崩塌】云函数执行异常：", e);
    return { success: false, error: e };
  }
};