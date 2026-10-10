// miniprogram/services/commerce.js
// =============================================================================
// 商业化接口桩（Phase 3）
//
// 目的：把"看广告得奖励"和"充值得钻石"从页面逻辑里剥离成统一接口，
// 让接入真实广告 / 真实支付时只改这一个文件，不动页面代码。
//
// 【当前状态：桩实现，未接入任何真实服务】
//   - AdService.show() 现在是 setTimeout 模拟，必然成功。
//     线上代码原本的 watchAd() 就是 setTimeout(1500) 直接发奖，
//     等于"假广告真发奖"—— 既没有广告收入，也可被无限点。
//   - PaymentService.pay() 直接返回 NOT_IMPLEMENTED。
//     线上代码原本的 doRecharge() 在非分享档位直接 updateDiamonds(totalGain)，
//     等于"不付钱直接到账"。rechargeTiers 里 1/6/30/98/198/648 元
//     六个档位全都是白给。这是收入漏损，不是安全漏洞，但必须堵。
//
// 【接入真实服务时要做的事】见人工操作清单第 4、5 项。
//   关键原则：奖励发放一律走云函数 claimReward，
//   客户端只负责"触发"和"上报凭证"，不负责"决定给多少"。
// =============================================================================

/**
 * 激励视频广告服务
 */
const AdService = {
  // 真实接入时填入微信广告位 ID
  REWARDED_VIDEO_AD_UNIT_ID: '',

  _ad: null,
  _implemented: false,

  /**
   * 预加载广告实例。
   * 真实实现：
   *   this._ad = wx.createRewardedVideoAd({ adUnitId: this.REWARDED_VIDEO_AD_UNIT_ID });
   *   this._ad.onError(...) / onClose(...)
   */
  init() {
    if (!this.REWARDED_VIDEO_AD_UNIT_ID) {
      // 未配置广告位，保持桩状态
      this._implemented = false;
      return false;
    }
    if (!wx.createRewardedVideoAd) {
      // 基础库过低
      this._implemented = false;
      return false;
    }
    this._ad = wx.createRewardedVideoAd({ adUnitId: this.REWARDED_VIDEO_AD_UNIT_ID });
    this._ad.onError((err) => console.error('[AdService] 广告错误', err));
    this._implemented = true;
    return true;
  },

  /**
   * 展示激励视频。
   * @returns {Promise<{completed:boolean, stub:boolean, reason?:string}>}
   *   completed=true 表示用户看完（真实实现里由 onClose 的 res.isEnded 决定）
   *   stub=true 表示这是桩返回，调用方应当知道这不是真实广告
   */
  show() {
    if (!this._implemented) {
      // ---- 桩实现：模拟 1.5 秒观看，必然成功 ----
      // 注意：这里刻意保留"必然成功"，是为了不改变现有玩法手感；
      // 但发奖已经改为走云函数 claimReward 的服务端日限，
      // 所以即使被反复调用，也会被服务端次数限制挡住。
      return new Promise((resolve) => {
        wx.showLoading({ title: '观摩天道中...' });
        setTimeout(() => {
          wx.hideLoading();
          resolve({ completed: true, stub: true, reason: 'AD_NOT_CONFIGURED' });
        }, 1500);
      });
    }

    // ---- 真实实现 ----
    return new Promise((resolve) => {
      const onClose = (res) => {
        this._ad.offClose(onClose);
        resolve({ completed: !!(res && res.isEnded), stub: false });
      };
      this._ad.onClose(onClose);
      this._ad.show().catch(() => {
        this._ad.load()
          .then(() => this._ad.show())
          .catch((err) => {
            this._ad.offClose(onClose);
            resolve({ completed: false, stub: false, reason: 'SHOW_FAILED: ' + (err && err.errMsg) });
          });
      });
    });
  }
};

/**
 * 支付服务
 */
const PaymentService = {
  _implemented: false,

  /**
   * 发起支付。
   * @param {Object} tier 档位对象，需含 price(元) 与 base/bonus(钻石)
   * @returns {Promise<{success:boolean, code:string, msg:string}>}
   *
   * 真实实现流程（必须是这个顺序，不能图省事跳步）：
   *   1. 调用自建云函数 createOrder，服务端按 tier.id 查表确定金额与钻石数
   *      —— 金额和钻石数都不能由客户端传入
   *   2. 云函数调微信支付下单接口，返回 payment 参数
   *   3. 客户端 wx.requestPayment(payment)
   *   4. 微信支付结果回调打到另一个云函数 paymentNotify
   *   5. paymentNotify 校验签名后，在服务端给该 openid 加钻石并记订单号去重
   *   客户端全程不参与"加多少钻石"的决定。
   */
  pay(tier) {
    if (!this._implemented) {
      return Promise.resolve({
        success: false,
        code: 'NOT_IMPLEMENTED',
        msg: '仙界商行尚未开张（支付通道未接入）'
      });
    }
    // 真实实现见上方注释，接入时替换这里
    return Promise.resolve({ success: false, code: 'NOT_IMPLEMENTED', msg: '未实现' });
  },

  /**
   * 当前是否可发起支付。页面可用它决定档位按钮是否置灰。
   */
  isAvailable() {
    return this._implemented;
  }
};

/**
 * 统一发奖入口：所有奖励一律经云函数 claimReward，
 * 由服务端决定数额与每日上限。客户端不再自行加资产。
 * @param {string} type share_diamond | share_ticket | free_diamond | ad_ticket
 */
function claimReward(type) {
  return new Promise((resolve) => {
    wx.cloud.callFunction({
      name: 'syncPlayerData',
      data: { action: 'claimReward', data: { type: type } },
      success: (res) => resolve(res.result || { success: false, code: 'EMPTY' }),
      fail: (err) => {
        console.error('[claimReward] 调用失败', err);
        resolve({ success: false, code: 'CALL_FAILED', msg: '天道感应中断，请稍后再试' });
      }
    });
  });
}

/**
 * 统一消耗入口：服务端校验余额后扣减。
 */
function spendDiamonds(amount, opts) {
  return new Promise((resolve) => {
    const payload = { diamonds: amount };
    if (opts && opts.grantTickets !== undefined) payload.grantTickets = opts.grantTickets;
    wx.cloud.callFunction({
      name: 'syncPlayerData',
      data: { action: 'spend', data: payload },
      success: (res) => resolve(res.result || { success: false, code: 'EMPTY' }),
      fail: (err) => {
        console.error('[spendDiamonds] 调用失败', err);
        resolve({ success: false, code: 'CALL_FAILED', msg: '天道感应中断，请稍后再试' });
      }
    });
  });
}

module.exports = { AdService, PaymentService, claimReward, spendDiamonds };
