// cloudfunctions/syncPlayerData/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID; 
  const { action, data } = event; 

  const collectionName = 'player_data';

  try {
    const userRes = await db.collection(collectionName).where({ _openid: openid }).get();
    const hasAccount = userRes.data.length > 0;
    const existingUser = hasAccount ? userRes.data[0] : null;

    if (action === 'get') {
      if (!hasAccount) {
        const newProfile = { 
          _openid: openid, 
          diamonds: 0, 
          merit: 0, 
          power: "0",             
          dailyPower: "0",        
          nickName: "神秘道友",
          avatarUrl: "/assets/default_avatar.png",
          province: "诸天万界",
          realm_name: "炼气期",
          lastUpdate: db.serverDate() 
        };
        await db.collection(collectionName).add({ data: newProfile });
        return { success: true, data: newProfile };
      }
      return { success: true, data: existingUser };
    }

    if (action === 'update') {
      if (!hasAccount) {
        return { success: false, msg: "账号未初始化，无法同步因果" };
      }

      let updateData = { ...data, lastUpdate: db.serverDate() };
      
      if (updateData.nickName && updateData.nickName !== "神秘道友") {
        try {
          const secRes = await cloud.openapi.security.msgSecCheck({ content: updateData.nickName });
          if (secRes && secRes.errCode && secRes.errCode !== 0) {
            return { success: false, isViolation: true, msg: "道号沾染因果，请重新拟定！" };
          }
        } catch (err) {
          if (err.errCode === 87014) {
            return { success: false, isViolation: true, msg: "道号沾染因果，请重新拟定！" };
          }
          return { success: false, isViolation: true, msg: "天道安检机异常，错误码: " + (err.errCode || "ERR_SEC") };
        }
      }

      if (updateData.power !== undefined) {
        let newPower = String(updateData.power);
        let oldPower = existingUser.power || "0";
        let oldDailyPower = existingUser.dailyPower || "0";
        
        let lastUpdateDate = existingUser.lastUpdate ? new Date(existingUser.lastUpdate) : new Date(0);
        let today = new Date(); 
        let lastDayStr = new Date(lastUpdateDate.getTime() + 8 * 3600000).toISOString().split('T')[0];
        let todayStr = new Date(today.getTime() + 8 * 3600000).toISOString().split('T')[0];
        let isSameDay = (lastDayStr === todayStr);

        const isGreater = (a, b) => {
          if (a.length !== b.length) return a.length > b.length;
          return a > b;
        };

        if (isGreater(newPower, oldPower)) {
          updateData.power = newPower; 
        } else {
          delete updateData.power;     
          delete updateData.realm_name; 
        }

        if (!isSameDay) {
          updateData.dailyPower = newPower;
        } else if (isGreater(newPower, oldDailyPower)) {
          updateData.dailyPower = newPower;
        }
      }

      await db.collection(collectionName).doc(existingUser._id).update({
        data: updateData
      });
      return { success: true };
    }
  } catch (e) {
    console.error("【天道崩塌】云函数异常：", e);
    return { success: false, error: e };
  }
};