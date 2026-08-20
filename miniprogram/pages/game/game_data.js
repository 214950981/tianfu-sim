// pages/game/game_data.js
// === 放置修仙 V4.0：上下文强绑定 Roguelike 剧本引擎 ===

const REALM_NAMES = ["炼气期", "筑基期", "金丹期", "元婴期", "化神期", "炼虚期", "合体期", "大乘期", "渡劫期", "真仙境", "金仙境", "仙尊境", "仙帝境", "神帝境", "天道境"];
const SUB_REALMS = ["入门", "小成", "大成", "圆满"];

const REALM_CONFIG = [
  { index: 0,  name: "炼气期", tier: 1, baseYears: 1 },
  { index: 1,  name: "筑基期", tier: 1, baseYears: 2 },
  { index: 2,  name: "金丹期", tier: 1, baseYears: 5 },
  { index: 3,  name: "元婴期", tier: 1, baseYears: 10 },
  { index: 4,  name: "化神期", tier: 2, baseYears: 50 },
  { index: 5,  name: "炼虚期", tier: 2, baseYears: 100 },
  { index: 6,  name: "合体期", tier: 2, baseYears: 200 },
  { index: 7,  name: "大乘期", tier: 2, baseYears: 500 },
  { index: 8,  name: "渡劫期", tier: 3, baseYears: 1000 },
  { index: 9,  name: "真仙境", tier: 3, baseYears: 2000 },
  { index: 10, name: "金仙境", tier: 3, baseYears: 5000 },
  { index: 11, name: "仙尊境", tier: 4, baseYears: 10000 },
  { index: 12, name: "仙帝境", tier: 4, baseYears: 50000 },
  { index: 13, name: "神帝境", tier: 4, baseYears: 100000 },
  { index: 14, name: "天道境", tier: 4, baseYears: 500000 }
];

// --- ⭐ 核心黑科技：逻辑自洽剧本库 ---
// 结构：地点 (随机前置) + 遭遇与行为 (强绑定逻辑) 
const FRAGMENTS = {
  // ==================== 【卷一：凡尘卷】(炼气-元婴，属性检定门槛 20~50) ====================
  TIER_1: {
    locations: ["在一处荒废的古洞府中", "深入十万大山外围", "于凡人皇城的地下黑市", "途径一处阴森的乱葬岗", "在宗门后山的灵液寒潭", "路过一片迷雾森林", "潜入一处废弃的灵矿废坑"],
    events: {
      EPIC: [
        { desc: "你发现了一本发光的秘籍，试着参悟其遗留的残阵！", req: "insight", reqVal: 30, succ: "你瞬间看破残阵，竟是地阶功法！悟性+3，战力暴涨 {power_large}。", fail: "你强行推演残阵，慘遭阵法反噬吐血，最大寿元 {life_lose_mid}。" },
        { desc: "你看到两只筑基期妖兽在抢夺一株灵草，你果断出手虎口夺食！", req: "body", reqVal: 30, succ: "你展现出恐怖的肉身力量，硬撼妖兽夺走至宝！体魄+3，最大寿元 {life_large}。", fail: "你被妖兽一爪拍飞，骨骼碎裂，最大寿元 {life_lose_large}。" },
        { desc: "你遇到神秘游商兜售不知名残卷，你掷出重金强行买下！", req: "wealth", reqVal: 40, succ: "竟然是失传的上古秘术！全属性+2，战力 {power_huge}。", fail: "打开一看全是白纸，你被骗得气血攻心，体魄-2。" },
        { desc: "你被残破的幻境迷阵困住，索性闭着眼睛乱闯！", req: "luck", reqVal: 35, succ: "你福至心灵，竟然误打误撞走进了阵法中枢的宝库！灵石 {gold_large}，修为 {exp_huge}。", fail: "你一头撞在杀阵死门上，险些丢了性命，修为大跌 {exp_lose_mid}。" }
      ],
      RARE: [
        { desc: "你在一处隐秘暗格中发现了一个机关，尝试破解。", req: "insight", reqVal: 20, succ: "机关应声而开！悟性+1，获得灵石 {gold_mid}。", fail: "机关年久失修卡死了，你一无所获。" },
        { desc: "你发现四周灵气狂暴异常，但你依然强行吸收。", req: "body", reqVal: 20, succ: "你气血如龙，强行驯服了灵气！体魄+2，修为 {exp_large}。", fail: "狂暴灵气撑破了你的经脉，休养数月，寿元 {life_lose_small}。" },
        { desc: "你花重金贿赂了当地的地头蛇，打探秘境情报。", req: "wealth", reqVal: 25, succ: "获得了稀缺资源的坐标！修为大增 {exp_large}，灵石 {gold_mid}。", fail: "地头蛇拿钱跑路了，你气得内伤，灵石 {gold_lose_small}。" }
      ],
      NORMAL: [
        { desc: "你寻得一处避风港，顺其自然，打坐静修。", req: "none", reqVal: 0, succ: "心境平和，真气流转，修为稳步增加 {exp_small}。", fail: "" },
        { desc: "你四处闲逛，看看有无散落的机缘。", req: "luck", reqVal: 10, succ: "运气不错，捡到一些散落的碎灵石 {gold_small}。", fail: "不小心踩进泥坑，弄脏了道袍，什么也没发现。" },
        { desc: "你观摩四周的地势风水，若有所思。", req: "none", reqVal: 0, succ: "对天地之理多了一丝明悟，修为微涨 {exp_small}。", fail: "" }
      ],
      DANGER: [
        { desc: "你遭遇暗中埋伏的劫修偷袭，对方刀法狠毒！", req: "body", reqVal: 40, succ: "你肉身强悍，硬抗一刀反杀对方！夺得其储物袋，灵石 {gold_mid}。", fail: "你被一刀砍中要害，拼死血遁逃生，最大寿元 {life_lose_large}，战力大损 {power_lose_mid}。" },
        { desc: "迷雾中窜出剧毒妖蛇，直逼你的面门！", req: "insight", reqVal: 35, succ: "你反应极快，并指如剑斩下蛇头。战力微涨 {power_small}。", fail: "你躲闪不及中了剧毒，险些丧命，最大寿元 {life_lose_mid}，根骨-2。" }
      ]
    }
  },

  // ==================== 【卷二：修真卷】(化神-大乘，属性检定门槛 100~300) ====================
  TIER_2: {
    locations: ["在破碎的虚空裂缝边缘", "踏上荒凉的星空古路", "深入坠仙谷的最深处", "潜入东海海底的龙宫废墟", "误入域外天魔交战的远古战场", "探寻一处出世的化神期洞府"],
    events: {
      EPIC: [
        { desc: "一株散发混沌气的三万年仙药出世，你脑海中疯狂推演其封印阵法！", req: "insight", reqVal: 150, succ: "悟性大爆发！你强行解开了禁制，吞下仙药脱胎换骨！最大寿元 {life_huge}，修为 {exp_max}。", fail: "阵法反震，你神魂险些破灭，休养百年才醒来，最大寿元 {life_lose_large}。" },
        { desc: "一块极道帝兵的残片悬浮在半空，你顶着粉碎真空的威压徒手去抓！", req: "body", reqVal: 180, succ: "体魄+5，你死死握住残片，将其炼化！战力狂飙 {power_max}，灵石 {gold_huge}。", fail: "残片的锐气切断了你的手臂，本源重创，最大寿元 {life_lose_huge}。" },
        { desc: "一位跨界大能的残魂企图夺舍你，你疯狂引爆随身携带的所有重宝抵抗！", req: "wealth", reqVal: 200, succ: "钱能力发威！宝物爆炸的威能将残魂震碎，你反向吞噬！全属性+3，战力 {power_huge}。", fail: "你的法宝品级太低，未能阻挡夺舍，被夺走部分生机，最大寿元 {life_lose_max}。" },
        { desc: "一座绝世杀阵将你困住，生机渺茫，你闭着眼睛凭直觉乱闯！", req: "luck", reqVal: 150, succ: "大难不死必有后福！你竟然走出了唯一的生门！福源+5，修为暴涨 {exp_huge}。", fail: "你一头撞死在死门上，凭借替死符才苟活，战力大跌 {power_lose_huge}。" }
      ],
      RARE: [
        { desc: "恐怖的空间风暴正在席卷，你不但不退，反而盘膝坐下观摩空间法则。", req: "insight", reqVal: 100, succ: "悟性+2，你明悟了一丝空间真意，修为大增 {exp_large}，战力 {power_large}。", fail: "你看得头痛欲裂，双目流血，一无所获只得退走。" },
        { desc: "遗迹坌塌，你以肉身硬抗废墟的余波，在残骸中大肆搜刮。", req: "body", reqVal: 120, succ: "体魄+3，你从乱石中扒出绝世珍宝！灵石 {gold_large}。", fail: "你被余波震得经脉寸断，狼犹逃出，最大寿元 {life_lose_mid}。" }
      ],
      NORMAL: [
        { desc: "你小心翼翼地在外围徘徊，不敢深入。", req: "none", reqVal: 0, succ: "虽然没大机缘，但也捡到些前辈遗留的边角料，灵石 {gold_mid}。", fail: "" },
        { desc: "你静看此地沧海桑田的变迁。", req: "none", reqVal: 0, succ: "道心更加坚固，修为稳步推进 {exp_mid}。", fail: "" }
      ],
      DANGER: [
        { desc: "域外天魔发现了你，化作黑雾钻入你的识海妄图控制你！", req: "insight", reqVal: 200, succ: "你道心坚如磕石，将天魔生生炼化为神识养料！修为 {exp_huge}。", fail: "你陷入无尽的幻境折磨，耗费千年才苏醒，白白流逝寿元 {life_lose_huge}，悟性-5。" }
      ]
    }
  },

  // ==================== 【卷三：灵界卷】(渡劫-金仙，属性检定门槛 500~1000) ====================
  TIER_3: {
    locations: ["登临九重天阙的南天门外", "漂浮在仙魔交锋的混沌长河中", "混入九天蟠桃盛会的外围", "探索一位远古真仙的坐化洞府", "站在充满索气的斩仙台上"],
    events: {
      EPIC: [
        { desc: "一道三千大道交织的仙道法则显化，你敞开心神，强行引法则入体！", req: "insight", reqVal: 800, succ: "悟性+10，你借此铸就无瑕仙躯！战力 {power_max}，全属性+5。", fail: "凡人之躯妄图承载仙道，肉身当场崩毁！最大寿元 {life_lose_max}。" },
        { desc: "一张散发着无尽威严的仙王法旨从天而降，你顶着威压强行站立不跪！", req: "body", reqVal: 900, succ: "体魄+10，你傲骨惊天，竟得到仙王印记认可！修为暴涨 {exp_max}。", fail: "你被法旨威压压得骨肉成泥，重塑仙躯耗费无尽寿元 {life_lose_max}。" },
        { desc: "一株传说中的混沌青莲缓缓绽放，你试着释放自己的气息与其共鸣。", req: "luck", reqVal: 850, succ: "你天生携带大气运，青莲竟然主动认你为主！福源+10，最大寿元 {life_max}。", fail: "青莲对你毫无感应，破空而去，你怅然若失。" }
      ],
      RARE: [
        { desc: "你收集了神魔交锋时溢散出的一丝混沌气，试图将其炼化。", req: "talent", reqVal: 600, succ: "根骨+5，你的仙基底蕴大增，修为跨越式增长 {exp_huge}。", fail: "混沌气太过沉重，不仅没炼化，反而压碎了你的经脉。" },
        { desc: "你豪掷千金，买通了盛会的守仙将，偷偷潜入内场。", req: "wealth", reqVal: 700, succ: "你品尝到了真正的仙茗与蟠桃残羹！最大寿元 {life_huge}。", fail: "仙将嫌钱少把你打了出来，颜面尽失，损失灵石 {gold_lose_large}。" }
      ],
      NORMAL: [
        { desc: "你只敢远远地在云端观望大能论道，不敢靠近。", req: "none", reqVal: 0, succ: "即便如此也长了见识，心境微动，修为 {exp_large}。", fail: "" }
      ],
      DANGER: [
        { desc: "一具漂浮了百万年的无名仙尸突然睁开眼睛，向你挥出毁天灭地的一拳！", req: "body", reqVal: 1000, succ: "你爆发全部潜能，勉强挡下这一击，并在生死间突破！战力飙升 {power_huge}。", fail: "你被一拳打爆了半边身子，仙基动摇，最大寿元 {life_lose_max}，根骨-10。" }
      ]
    }
  },

  // ==================== 【卷四：仙道卷】(仙尊-天道，属性检定门槛 2000~5000) ====================
  TIER_4: {
    locations: ["在鸿蒙未判的宇宙奇点", "于大千世界的宇宙边荒", "漫步在时光长河的最尽头", "端坐在至高无上的天道核心", "凝视着吞噬一切的万界归墟"],
    events: {
      EPIC: [
        { desc: "你踏入时光长河源头，竟然看到了最初的自己，你坐下与其对弈！", req: "insight", reqVal: 3000, succ: "悟性+50，你明悟了大千本源，过去未来归一！战力破灭寰宇 {power_max}，全属性+20！", fail: "你陷入了过去与未来的逻辑悖论，道心几近崩溃，最大寿元 {life_lose_max}。" },
        { desc: "维持宇宙运转的天道意志开始崩塌，你竟妄图以己心代天心去缝合它！", req: "body", reqVal: 3500, succ: "体魄+50，你承受住了天道之重，成为了这方宇宙的主宰！修为 {exp_max}，寿元 {life_max}！", fail: "天道因果反噬，你承受了无量量劫，战力大损，最大寿元 {life_lose_max}。" },
        { desc: "足以磨灭仙帝的灭世磨盘向你碾压而来，你穷极一切底蕴与法宝硬撼！", req: "wealth", reqVal: 4000, succ: "你的无尽重宝生生将磨盘砾碎，化作漫天仙源！灵石 {gold_max}，战力 {power_max}。", fail: "法宝尽毁也未能挡住，你被打入轮回深渊，九死一生，修为暴跌 {exp_lose_max}。" }
      ],
      RARE: [
        { desc: "你亲眼目睹了一方大千世界的毁灭，借机收取了一缕鸿蒙紫气。", req: "talent", reqVal: 2000, succ: "根骨+20，超脱轮回，修为暴增 {exp_huge}。", fail: "紫气消散得太快，你未能将其禁锭。" }
      ],
      NORMAL: [
        { desc: "你静坐于虚无之中，坐看纪元更迭。", req: "none", reqVal: 0, succ: "一梦十万年，宇宙生灭皆在掌间，修为自然涌动 {exp_max}。", fail: "" }
      ],
      DANGER: [
        { desc: "归墟深处伸出了一只无法名状的黑手，瞬间将你拖入深渊！", req: "luck", reqVal: 3000, succ: "在必死之局中，你触发逆天福源，竟落入了一处未知的终极仙境！全属性+10，最大寿元 {life_max}。", fail: "你被拖入永恒的黑暗，神魂遭受无尽折磨，悟性-30，最大寿元 {life_lose_max}。" }
      ]
    }
  }
};

// --- ⭐ Roguelike 引擎运行区：自动生成 2000+ 条极其通顺的奇遇！ ---
function generateRoguelikeEvents() {
  const events = { TIER_1: {}, TIER_2: {}, TIER_3: {}, TIER_4: {} };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  for (const tierKey in FRAGMENTS) {
    const data = FRAGMENTS[tierKey];
    for (const rarity in data.events) {
      events[tierKey][rarity] = [];
      const eventList = data.events[rarity];
      
      // 生成足够庞大且逻辑绝对自洽的组合池
      for (let i = 0; i < 60; i++) {
        let loc = pick(data.locations);
        let ev = pick(eventList);

        events[tierKey][rarity].push({
          text: `${loc}，${ev.desc}`,  // 地点 + 遭遇(带有强烈的前置动作)
          reqAttr: ev.req,             // 属性门槛
          reqVal: ev.reqVal,           // 门槛值
          succText: ev.succ,           // 逻辑连贯的大成功
          failText: ev.fail            // 逻辑连贯的大失败
        });
      }
    }
  }
  return events;
}

const ADVENTURE_EVENTS = generateRoguelikeEvents();

// --- 4. 坊市全自动化：200+ 道具生成引擎 (保持不变) ---
const CORE_ITEMS = [
  { id: 101, name: "凝气丹", desc: "炼气基础", price: 200, attr: "insight", value: 1, rarity: "Gray", minLevel: 1 },
  { id: 102, name: "筑基丹", desc: "突破必备", price: 800, attr: "insight", value: 3, rarity: "Green", minLevel: 5 },
  { id: 103, name: "金丹砂", desc: "稳固金丹", price: 3500, attr: "insight", value: 5, rarity: "Blue", minLevel: 11 },
  { id: 104, name: "元婴果", desc: "破婴成神", price: 10000, attr: "insight", value: 10, rarity: "Purple", minLevel: 16 },
  { id: 105, name: "化神涎", desc: "触摸法则", price: 35000, attr: "insight", value: 25, rarity: "Orange", minLevel: 21 },
  { id: 106, name: "大罗造化丹", desc: "夺天地造化", price: 150000, attr: "insight", value: 60, rarity: "Gold", minLevel: 50 },
  { id: 107, name: "九转还魂丹", desc: "增加极多寿元", price: 80000, attr: "body", value: 40, rarity: "Orange", minLevel: 30 },
  { id: 108, name: "无字天书", desc: "提升根骨", price: 120000, attr: "talent", value: 50, rarity: "Gold", minLevel: 45 },
  { id: 109, name: "气运金龙", desc: "皇朝气运", price: 500000, attr: "luck", value: 80, rarity: "Gold", minLevel: 60 },
  { id: 501, name: "混沌道果", desc: "世界之源", price: 2000000, attr: "insight", value: 150, rarity: "Red", minLevel: 80 }
];

function generateFullDictionary() {
  let dictionary = [...CORE_ITEMS];
  const prefixes = ["破碎的", "陈旧的", "古朴的", "发光的", "神秘的", "被封印的", "远古的", "不朽的", "禁忌的", "史前的", "滴血的", "残缺的", "温润的", "冰冷的", "炽热的"];
  const suffixes = ["残页", "石刻", "断剑", "玉佩", "香囊", "舍利", "卷轴", "木匣", "灵印", "经文", "指骨", "兽皮", "龟甲", "罗盘", "面具"];
  const attrs = ["insight", "body", "talent", "luck", "wealth"];

  for (let i = 0; i < 200; i++) {
    const attrKey = attrs[i % 5];
    const levelReq = Math.floor(i / 2) + 1; 
    
    let rarity = "Gray";
    if (i > 160) rarity = "Gold";
    else if (i > 120) rarity = "Orange";
    else if (i > 80) rarity = "Purple";
    else if (i > 40) rarity = "Blue";
    else if (i > 20) rarity = "Green";

    dictionary.push({
      id: 2000 + i,
      name: prefixes[i % prefixes.length] + suffixes[Math.floor(i / suffixes.length) % suffixes.length] + ` +${Math.floor(levelReq / 5) + 1}`,
      desc: `挂机自动购买的奇珍。`,
      price: 150 + (i * 120) + (levelReq * 200),
      attr: attrKey,
      value: Math.floor(levelReq / 5) + 1,
      rarity: rarity,
      minLevel: levelReq
    });
  }
  return dictionary;
}

const MASTER_ITEMS = generateFullDictionary();

module.exports = {
  REALM_NAMES,
  SUB_REALMS,
  REALM_CONFIG,
  ADVENTURE_EVENTS,
  MASTER_ITEMS
};