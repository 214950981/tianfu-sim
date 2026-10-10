// cloudfunctions/syncPlayerData/index.js
// =============================================================================
// Phase 2 安全加固版
//
// 加固前的实际问题（基于线上部署代码复核）：
//   1. update 分支把 event.data 原样展开写库（{ ...data }），字段零校验。
//      客户端可以写入任意字段、任意类型、任意大小 —— 包括 _openid 本身。
//   2. update 分支没有账号存在性检查，未初始化账号也能触发 where().update()。
//   3. diamonds / merit / ad_tickets 完全由客户端决定最终值，
//      客户端只要发 { diamonds: 99999999 } 就到账。
//   4. power 虽有"只增不减"保护，但没有上界，一次性写入 60 位数即可永久锁榜。
//   5. 日限 10 次领钻、膜拜去重、免费领钻全靠 wx.setStorageSync 本地存储，
//      清缓存即可无限刷。
//
// 本版本的处理：
//   - 白名单字段校验：未声明字段直接拒绝，不再 { ...data } 盲展开。
//   - 逐字段类型与范围校验：超范围拒绝。
//   - 账号存在性检查：未初始化账号的 update 直接拒绝。
//   - power 上界校验（10^30）。
//   - 新增服务端记账动作 claimReward：分享领钻 / 膜拜 / 免费领钻的次数与
//     去重全部由服务端按 openid + 日期记录，客户端不再有发言权。
//   - 奖励数额由服务端常量决定，客户端只提交"动作类型"，不提交数值。
//
// 仍未完成的过渡（见报告"下一阶段建议"）：
//   - 修为 / 境界 / 战力仍是客户端计算后提交结果值，服务端只做上界与单调性
//     校验，未做完整服务端模拟。这是有意的分步落地，不在本次范围。
// =============================================================================

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const COLLECTION = 'player_data';

// ---------------------------------------------------------------------------
// 常量：奖励数额与每日上限由服务端定义，客户端无权指定
// ---------------------------------------------------------------------------
const REWARD_RULES = {
  // 分享领 300 钻，每日 10 次
  share_diamond: { diamonds: 300, dailyLimit: 10, counterField: 'cnt_share_diamond' },
  // 分享送投胎次数，每日 3 次
  share_ticket: { ad_tickets: 3, diamonds: 50, dailyLimit: 3, counterField: 'cnt_share_ticket' },
  // 每日免费低保领钻，每日 1 次
  free_diamond: { diamonds: 300, dailyLimit: 1, counterField: 'cnt_free_diamond' },
  // 看激励视频换投胎次数，每日 20 次（接入真实广告后由广告回调校验，见报告）
  ad_ticket: { ad_tickets: 5, dailyLimit: 20, counterField: 'cnt_ad_ticket' }
};

// 膜拜：每日最多膜拜 3 位，且同一对象当日不可重复
const WORSHIP_DAILY_LIMIT = 3;
const WORSHIP_REWARD_MIN = 1;
const WORSHIP_REWARD_MAX = 10;

// 战力理论上界。推导见 rank.js safeBigPower 注释。
const POWER_MAX_DIGITS = 31;

// 资产上界，防止异常累加后变成天文数字
const DIAMOND_MAX = 100000000;   // 1 亿
const MERIT_MAX = 100000000;
const TICKET_MAX = 100000;

// ---------------------------------------------------------------------------
// 白名单：只有这里声明的字段允许被 update 写入。
// validate 返回 { ok, value } 或 { ok:false, reason }
// ---------------------------------------------------------------------------
const FIELD_RULES = {
  nickName: (v) => {
    if (typeof v !== 'string') return { ok: false, reason: 'nickName 必须是字符串' };
    const t = v.trim();
    if (!t) return { ok: false, reason: 'nickName 不能为空' };
    if (t.length > 20) return { ok: false, reason: 'nickName 超长' };
    return { ok: true, value: t };
  },
  avatarUrl: (v) => {
    if (typeof v !== 'string') return { ok: false, reason: 'avatarUrl 必须是字符串' };
    if (v.length > 512) return { ok: false, reason: 'avatarUrl 超长' };
    // 只允许微信头像域名或本地默认图，拒绝任意外链
    const allowed = v === '' ||
      v.startsWith('/') ||
      v.startsWith('wxfile://') ||
      v.startsWith('http://tmp/') ||
      /^https:\/\/[a-z0-9.-]*\.(qpic\.cn|qlogo\.cn|myqcloud\.com)\//i.test(v);
    if (!allowed) return { ok: false, reason: 'avatarUrl 域名不在白名单' };
    return { ok: true, value: v };
  },
  province: (v) => {
    if (typeof v !== 'string') return { ok: false, reason: 'province 必须是字符串' };
    if (v.length > 20) return { ok: false, reason: 'province 超长' };
    return { ok: true, value: v };
  },
  realm_name: (v) => {
    if (typeof v !== 'string') return { ok: false, reason: 'realm_name 必须是字符串' };
    if (v.length > 20) return { ok: false, reason: 'realm_name 超长' };
    return { ok: true, value: v };
  },
  // power 以字符串形式存储（大数），只校验是纯数字且不超上界
  power: (v) => {
    const s = String(v === undefined || v === null ? '0' : v);
    if (!/^\d+$/.test(s)) return { ok: false, reason: 'power 必须是纯数字字符串' };
    if (s.length > POWER_MAX_DIGITS) return { ok: false, reason: 'power 超出理论上界' };
    return { ok: true, value: s };
  },
  diamonds: (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
      return { ok: false, reason: 'diamonds 必须是整数' };
    }
    if (v < 0 || v > DIAMOND_MAX) return { ok: false, reason: 'diamonds 超范围' };
    return { ok: true, value: v };
  },
  merit: (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
      return { ok: false, reason: 'merit 必须是整数' };
    }
    if (v < 0 || v > MERIT_MAX) return { ok: false, reason: 'merit 超范围' };
    return { ok: true, value: v };
  },
  ad_tickets: (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) {
      return { ok: false, reason: 'ad_tickets 必须是整数' };
    }
    if (v < 0 || v > TICKET_MAX) return { ok: false, reason: 'ad_tickets 超范围' };
    return { ok: true, value: v };
  }
};

// 大数字符串比较：先比长度，长度相同比字典序
function isGreater(a, b) {
  const x = String(a || '0');
  const y = String(b || '0');
  if (x.length !== y.length) return x.length > y.length;
  return x > y;
}

// 北京时间日期字符串
function cstDayStr(d) {
  return new Date(new Date(d).getTime() + 8 * 3600000).toISOString().split('T')[0];
}

// 昵称安检
async function checkNickname(nickName) {
  if (!nickName || nickName === '神秘道友') return { pass: true };
  try {
    const secRes = await cloud.openapi.security.msgSecCheck({ content: nickName });
    if (secRes && secRes.errCode && secRes.errCode !== 0) {
      return { pass: false, msg: '道号沾染因果，请重新拟定！' };
    }
    return { pass: true };
  } catch (err) {
    console.error('【安检机异常】', err);
    if (err.errCode === 87014) {
      return { pass: false, msg: '道号沾染因果，请重新拟定！' };
    }
    return { pass: false, msg: '天道安检机故障，错误码: ' + (err.errCode || err.errMsg || '未知') };
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, code: 'NO_IDENTITY', msg: '无法确认身份' };
  }

  const action = event && event.action;
  const data = (event && event.data) || {};

  if (typeof action !== 'string') {
    return { success: false, code: 'BAD_ACTION', msg: '缺少 action' };
  }

  try {
    const userRes = await db.collection(COLLECTION).where({ _openid: openid }).get();
    const hasAccount = userRes.data.length > 0;
    const me = hasAccount ? userRes.data[0] : null;

    // =====================================================================
    // action: get —— 拉取档案，不存在则初始化
    // =====================================================================
    if (action === 'get') {
      if (!hasAccount) {
        const newProfile = {
          _openid: openid,
          diamonds: 0,
          merit: 0,
          power: '0',
          dailyPower: '0',
          nickName: '神秘道友',
          avatarUrl: '/assets/default_avatar.png',
          province: '诸天万界',
          realm_name: '炼气期',
          ad_tickets: 3,
          // 服务端记账字段
          quota_day: cstDayStr(Date.now()),
          cnt_share_diamond: 0,
          cnt_share_ticket: 0,
          cnt_free_diamond: 0,
          cnt_ad_ticket: 0,
          worship_day: cstDayStr(Date.now()),
          worshipped_uids: [],
          lastUpdate: db.serverDate()
        };
        await db.collection(COLLECTION).add({ data: newProfile });
        return { success: true, data: newProfile };
      }
      return { success: true, data: me };
    }

    // =====================================================================
    // action: update —— 白名单字段校验后写入
    // =====================================================================
    if (action === 'update') {
      // 【加固 2】账号存在性检查。原版本缺这一步，未初始化账号也会走到
      // where().update()，静默匹配 0 条并返回 success:true，掩盖真实问题。
      if (!hasAccount) {
        return { success: false, code: 'NO_ACCOUNT', msg: '账号未初始化，无法同步因果' };
      }

      if (typeof data !== 'object' || Array.isArray(data) || data === null) {
        return { success: false, code: 'BAD_DATA', msg: 'data 必须是对象' };
      }

      // 【加固 1】白名单校验：拒绝未声明字段，不再 { ...data } 盲展开。
      // 这一条配合下面的逐字段范围校验，是消除远程可利用危害的关键。
      const keys = Object.keys(data);
      if (keys.length === 0) {
        return { success: false, code: 'EMPTY_DATA', msg: 'data 为空' };
      }
      if (keys.length > 10) {
        return { success: false, code: 'TOO_MANY_FIELDS', msg: '字段过多' };
      }

      const updateData = {};
      for (const k of keys) {
        const rule = FIELD_RULES[k];
        if (!rule) {
          // 明确拒绝而不是静默丢弃，便于前端发现自己传错
          return { success: false, code: 'FIELD_NOT_ALLOWED', msg: `字段不被允许: ${k}` };
        }
        const r = rule(data[k]);
        if (!r.ok) {
          return { success: false, code: 'FIELD_INVALID', msg: `${k} 校验失败: ${r.reason}` };
        }
        updateData[k] = r.value;
      }

      // 【加固 3】资产类字段不接受客户端直接设定最终值。
      // 钻石 / 功德 / 投胎次数只能通过 claimReward（服务端发奖）或
      // spend（服务端扣减）变更。这里拒绝掉，避免"客户端说有多少就有多少"。
      for (const assetKey of ['diamonds', 'merit', 'ad_tickets']) {
        if (updateData[assetKey] !== undefined) {
          const cur = me[assetKey] || 0;
          // 只允许「不大于当前值」的写入（即消耗），增加必须走 claimReward
          if (updateData[assetKey] > cur) {
            return {
              success: false,
              code: 'ASSET_INCREASE_FORBIDDEN',
              msg: `${assetKey} 不能由客户端直接增加，请使用 claimReward`
            };
          }
        }
      }

      // 昵称安检
      if (updateData.nickName) {
        const sec = await checkNickname(updateData.nickName);
        if (!sec.pass) {
          return { success: false, isViolation: true, msg: sec.msg };
        }
      }

      // 双榜战力分流 + 防覆盖保护罩（保留原有逻辑，只增加上界校验）
      if (updateData.power !== undefined) {
        const newPower = updateData.power;
        const oldPower = me.power || '0';
        const oldDailyPower = me.dailyPower || '0';

        const lastUpdateDate = me.lastUpdate ? new Date(me.lastUpdate) : new Date(0);
        const isSameDay = cstDayStr(lastUpdateDate) === cstDayStr(Date.now());

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

      if (Object.keys(updateData).length === 0) {
        return { success: true, noop: true };
      }

      updateData.lastUpdate = db.serverDate();
      await db.collection(COLLECTION).doc(me._id).update({ data: updateData });
      return { success: true };
    }

    // =====================================================================
    // action: claimReward —— 【加固 5】服务端记账发奖
    // 客户端只提交动作类型，奖励数额与每日上限全部由服务端决定。
    // 原本这些计数在 wx.setStorageSync('global_assets')，清缓存即可无限刷。
    // =====================================================================
    if (action === 'claimReward') {
      if (!hasAccount) {
        return { success: false, code: 'NO_ACCOUNT', msg: '账号未初始化' };
      }
      const type = data.type;
      const rule = REWARD_RULES[type];
      if (!rule) {
        return { success: false, code: 'BAD_REWARD_TYPE', msg: '未知奖励类型' };
      }

      const today = cstDayStr(Date.now());
      const needReset = me.quota_day !== today;
      const used = needReset ? 0 : (me[rule.counterField] || 0);

      if (used >= rule.dailyLimit) {
        return {
          success: false,
          code: 'DAILY_LIMIT_REACHED',
          msg: '今日次数已用尽，明日请早',
          used: used,
          limit: rule.dailyLimit
        };
      }

      const patch = { lastUpdate: db.serverDate() };
      if (needReset) {
        // 跨天统一重置所有计数器
        patch.quota_day = today;
        patch.cnt_share_diamond = 0;
        patch.cnt_share_ticket = 0;
        patch.cnt_free_diamond = 0;
        patch.cnt_ad_ticket = 0;
      }
      patch[rule.counterField] = used + 1;

      const granted = {};
      if (rule.diamonds) {
        const nv = Math.min(DIAMOND_MAX, (me.diamonds || 0) + rule.diamonds);
        patch.diamonds = nv;
        granted.diamonds = rule.diamonds;
      }
      if (rule.ad_tickets) {
        const nv = Math.min(TICKET_MAX, (me.ad_tickets === undefined ? 3 : me.ad_tickets) + rule.ad_tickets);
        patch.ad_tickets = nv;
        granted.ad_tickets = rule.ad_tickets;
      }

      await db.collection(COLLECTION).doc(me._id).update({ data: patch });
      return {
        success: true,
        granted: granted,
        used: used + 1,
        limit: rule.dailyLimit,
        diamonds: patch.diamonds !== undefined ? patch.diamonds : me.diamonds,
        ad_tickets: patch.ad_tickets !== undefined ? patch.ad_tickets : me.ad_tickets
      };
    }

    // =====================================================================
    // action: worship —— 【加固 5】膜拜去重改服务端
    // 原本 worshipped_uids 存在本地 storage，清缓存即可对同一人反复膜拜。
    // =====================================================================
    if (action === 'worship') {
      if (!hasAccount) {
        return { success: false, code: 'NO_ACCOUNT', msg: '账号未初始化' };
      }
      const targetUid = data.targetUid;
      if (typeof targetUid !== 'string' || !targetUid || targetUid.length > 64) {
        return { success: false, code: 'BAD_TARGET', msg: '膜拜对象无效' };
      }
      if (targetUid === openid) {
        return { success: false, code: 'SELF_WORSHIP', msg: '自恋是无法获得道祖感应的' };
      }

      const today = cstDayStr(Date.now());
      const sameDay = me.worship_day === today;
      const list = sameDay ? (me.worshipped_uids || []) : [];

      if (list.indexOf(targetUid) !== -1) {
        return { success: false, code: 'ALREADY_WORSHIPPED', msg: '今日已向这位大能膜拜过了' };
      }
      if (list.length >= WORSHIP_DAILY_LIMIT) {
        return { success: false, code: 'DAILY_LIMIT_REACHED', msg: '今日膜拜次数已用尽' };
      }

      // 奖励由服务端掷骰，客户端无法指定
      const reward = WORSHIP_REWARD_MIN +
        Math.floor(Math.random() * (WORSHIP_REWARD_MAX - WORSHIP_REWARD_MIN + 1));
      const newDiamonds = Math.min(DIAMOND_MAX, (me.diamonds || 0) + reward);

      await db.collection(COLLECTION).doc(me._id).update({
        data: {
          worship_day: today,
          worshipped_uids: list.concat([targetUid]),
          diamonds: newDiamonds,
          lastUpdate: db.serverDate()
        }
      });
      return {
        success: true,
        reward: reward,
        diamonds: newDiamonds,
        used: list.length + 1,
        limit: WORSHIP_DAILY_LIMIT
      };
    }

    // =====================================================================
    // action: spend —— 服务端扣减资产（买投胎次数、钻石提速、钻石逆天等）
    // 客户端提交"花多少"，服务端校验余额后扣减，避免客户端自行写回余额。
    // =====================================================================
    if (action === 'spend') {
      if (!hasAccount) {
        return { success: false, code: 'NO_ACCOUNT', msg: '账号未初始化' };
      }
      const cost = data.diamonds;
      if (typeof cost !== 'number' || !Number.isInteger(cost) || cost <= 0 || cost > DIAMOND_MAX) {
        return { success: false, code: 'BAD_COST', msg: '消耗数额无效' };
      }
      const cur = me.diamonds || 0;
      if (cur < cost) {
        return { success: false, code: 'INSUFFICIENT', msg: '钻石不足', diamonds: cur };
      }
      // 可选：一并发放投胎次数（买次数场景）
      const patch = { diamonds: cur - cost, lastUpdate: db.serverDate() };
      if (data.grantTickets !== undefined) {
        const gt = data.grantTickets;
        if (typeof gt !== 'number' || !Number.isInteger(gt) || gt < 0 || gt > TICKET_MAX) {
          return { success: false, code: 'BAD_GRANT', msg: '次数无效' };
        }
        // 1 钻 = 1 次，服务端自行换算，不信任客户端比例
        patch.ad_tickets = Math.min(TICKET_MAX, (me.ad_tickets === undefined ? 3 : me.ad_tickets) + cost);
      }
      await db.collection(COLLECTION).doc(me._id).update({ data: patch });
      return { success: true, diamonds: patch.diamonds, ad_tickets: patch.ad_tickets };
    }

    return { success: false, code: 'UNKNOWN_ACTION', msg: '未知 action: ' + action };
  } catch (e) {
    console.error('【天道崩塌】云函数执行异常：', e);
    // 不把原始异常对象回传给客户端，避免泄漏内部结构
    return { success: false, code: 'INTERNAL', msg: '天道运转异常，请稍后再试' };
  }
};
