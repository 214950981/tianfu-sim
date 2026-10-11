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
    locations: ["在一处荒废的古洞府中", "深入十万大山外围", "于凡人皇城的地下黑市", "途径一处阴森的乱葬岗", "在宗门后山的灵液寒潭", "路过一片迷雾森林", "潜入一处废弃的灵矿废坑", "在城郊一座香火断绝的山神庙", "于药农常走的采灵小径旁", "在宗门外门的杂役院墙根下", "途径一道横跨深涧的腐朽索桥"],
    events: {
      EPIC: [
        { desc: "你发现了一本发光的秘籍，试着参悟其遗留的残阵！", req: "insight", reqVal: 30, succ: "你瞬间看破残阵，竟是地阶功法！悟性+3，战力暴涨 {power_large}。", fail: "你强行推演残阵，惨遭阵法反噬吐血，最大寿元 {life_lose_mid}。" },
        { desc: "你看到两只筑基期妖兽在抢夺一株灵草，你果断出手虎口夺食！", req: "body", reqVal: 30, succ: "你展现出恐怖的肉身力量，硬撼妖兽夺走至宝！体魄+3，最大寿元 {life_large}。", fail: "你被妖兽一爪拍飞，骨骼碎裂，最大寿元 {life_lose_large}。" },
        { desc: "你遇到神秘游商兜售不知名残卷，你掷出重金强行买下！", req: "wealth", reqVal: 40, succ: "竟然是失传的上古秘术！全属性+2，战力 {power_huge}。", fail: "打开一看全是白纸，你被骗得气血攻心，体魄-2。" },
        { desc: "你被残破的幻境迷阵困住，索性闭着眼睛乱闯！", req: "luck", reqVal: 35, succ: "你福至心灵，竟然误打误撞走进了阵法中枢的宝库！灵石 {gold_large}，修为 {exp_huge}，家境+2。", fail: "你一头撞在杀阵死门上，险些丢了性命，修为大跌 {exp_lose_mid}。" }
      ,
        { desc: "你撞见一名重伤的筑基修士，他将一枚玉简塞进你手里便气绝了，你当即参悟。", req: "insight", reqVal: 32, succ: "玉简中是一门完整的御气法门！悟性+3，修为暴涨 {exp_large}，战力 {power_large}。", fail: "你贪多强记，神魂被玉简中残存的意念冲撞，最大寿元 {life_lose_mid}。" },
        { desc: "山神庙的神像裂开，露出半截锈迹斑斑的古剑，你握住剑柄用力一拔。", req: "body", reqVal: 34, succ: "古剑认主，剑气顺着经脉淬炼全身！体魄+3，战力 {power_large}，灵石 {gold_mid}，家境+1。", fail: "古剑锈蚀太深应手而碎，碎片割伤你的掌心，最大寿元 {life_lose_small}。" }
      ],
      RARE: [
        { desc: "你在一处隐秘暗格中发现了一个机关，尝试破解。", req: "insight", reqVal: 20, succ: "机关应声而开！悟性+1，获得灵石 {gold_mid}，家境+1。", fail: "机关年久失修卡死了，你一无所获。" },
        { desc: "你发现四周灵气狂暴异常，但你依然强行吸收。", req: "body", reqVal: 20, succ: "你气血如龙，强行驯服了灵气！体魄+2，修为 {exp_large}。", fail: "狂暴灵气撑破了你的经脉，修养数月，寿元 {life_lose_small}。" },
        { desc: "你花重金贿赂了当地的地头蛇，打探秘境情报。", req: "wealth", reqVal: 25, succ: "获得了稀缺资源的坐标！修为大增 {exp_large}，灵石 {gold_mid}，家境+3。", fail: "地头蛇拿钱跑路了，你气得内伤，灵石 {gold_lose_small}。" }
      ,
        { desc: "路边一名货郎低声叫卖来历不明的灵米，你蹲下仔细挑了挑。", req: "wealth", reqVal: 24, succ: "你挑出三粒真正的百年灵米，服下后气血充盈！体魄+2，修为 {exp_mid}。", fail: "整袋都是染色的凡米，你白花了钱，灵石 {gold_lose_small}。" },
        { desc: "涧底传来妖兽幼崽的哀鸣，你循声下去查看。", req: "luck", reqVal: 22, succ: "幼崽通体雪白，竟主动蹭你手心，随你而去护道！福源+2，战力 {power_mid}。", fail: "那是母兽设下的诱饵，你被扑出数丈，最大寿元 {life_lose_small}。" }
      ],
      NORMAL: [
        { desc: "你寻得一处避风港，顺其自然，打坐静修。", req: "none", reqVal: 0, succ: "心境平和，真气流转，修为稳步增加 {exp_small}。", fail: "" },
        { desc: "你四处闲逛，看看有无散落的机缘。", req: "luck", reqVal: 10, succ: "运气不错，捡到一些散落的碎灵石 {gold_small}。", fail: "不小心踩进泥坑，弄脏了道袍，什么也没发现。" },
        { desc: "你观摩四周的地势风水，若有所思。", req: "none", reqVal: 0, succ: "对天地之理多了一丝明悟，修为微涨 {exp_small}。", fail: "" }
      ,
        { desc: "你盘坐在溪边，听着水声调理这几日紊乱的真气。", req: "none", reqVal: 0, succ: "心神渐宁，真气重归顺畅，修为 {exp_small}。", fail: "" },
        { desc: "你替山下村民驱走了一头作乱的野猪，村民凑了些铜板答谢。", req: "none", reqVal: 0, succ: "举手之劳，倒是攒下些家底，灵石 {gold_small}。", fail: "" }
      ],
      DANGER: [
        { desc: "你遭遇暗中埋伏的劫修偷袭，对方刀法狠毒！", req: "body", reqVal: 40, succ: "你肉身强悍，硬抗一刀反杀对方！夺得其储物袋，灵石 {gold_mid}，家境+1。", fail: "你被一刀砍中要害，拼死血遁逃生，最大寿元 {life_lose_large}，战力大损 {power_lose_mid}。" },
        { desc: "迷雾中窜出剧毒妖蛇，直逼你的面门！", req: "insight", reqVal: 35, succ: "你反应极快，并指如剑斩下蛇头。战力微涨 {power_small}。", fail: "你躲闪不及中了剧毒，险些丧命，最大寿元 {life_lose_mid}，根骨-2。" }
      ,
        { desc: "索桥中段忽然断裂，你整个人向深涧坠落！", req: "body", reqVal: 26, succ: "你反手扣住崖壁藤蔓，硬生生把自己拽了上来！体魄+2。", fail: "你重重砸在涧底乱石上，筋骨尽碎，最大寿元 {life_lose_large}。" }
      ]
    }
  },

  // ==================== 【卷二：修真卷】(化神-大乘，属性检定门槛 100~300) ====================
  TIER_2: {
    locations: ["在破碎的虚空裂缝边缘", "踏上荒凉的星空古路", "深入坠仙谷的最深处", "潜入东海海底的龙宫废墟", "误入域外天魔交战的远古战场", "探寻一处出世的化神期洞府", "在一处上古修士陨落的古战场", "于两大宗门交界的灵脉争夺带", "在终年雷云不散的雷罚禁地"],
    events: {
      EPIC: [
        { desc: "一株散发混沌气的三万年仙药出世，你脑海中疯狂推演其封印阵法！", req: "insight", reqVal: 150, succ: "悟性大爆发！你强行解开了禁制，吞下仙药脱胎换骨！最大寿元 {life_huge}，修为 {exp_max}。", fail: "阵法反震，你神魂险些破灭，修养百年才醒来，最大寿元 {life_lose_large}。" },
        { desc: "一块极道帝兵的残片悬浮在半空，你顶着粉碎真空的威压徒手去抓！", req: "body", reqVal: 180, succ: "体魄+5，你死死握住残片，将其炼化！战力狂飙 {power_max}，灵石 {gold_huge}，家境+4。", fail: "残片的锐气切断了你的手臂，本源重创，最大寿元 {life_lose_huge}。" },
        { desc: "一位跨界大能的残魂企图夺舍你，你疯狂引爆随身携带的所有重宝抵抗！", req: "wealth", reqVal: 200, succ: "钞能力发威！宝物爆炸的威能将残魂震碎，你反向吞噬！全属性+3，战力 {power_huge}。", fail: "你的法宝品级太低，未能阻挡夺舍，被夺走部分生机，最大寿元 {life_lose_max}。" },
        { desc: "一座绝世杀阵将你困住，生机渺茫，你闭着眼睛凭直觉乱闯！", req: "luck", reqVal: 150, succ: "大难不死必有后福！你竟然走出了唯一的生门！福源+5，修为暴涨 {exp_huge}。", fail: "你一头撞死在死门上，凭借替死符才苟活，战力大跌 {power_lose_huge}。" }
      ,
        { desc: "古战场中央立着一具未倒的金丹期道骸，你上前以神识试探其残留道韵。", req: "insight", reqVal: 120, succ: "你从道韵中窥见半部神通！悟性+8，修为 {exp_huge}，战力 {power_huge}。", fail: "道骸残念勃然暴怒，一掌拍在你神魂上，最大寿元 {life_lose_large}。" },
        { desc: "雷罚禁地中心悬着一枚凝练到极致的雷精，你张口将其吞下炼化。", req: "body", reqVal: 130, succ: "雷精在丹田炸开，肉身被反复淬炼重塑！体魄+8，战力 {power_huge}，寿元 {life_large}。", fail: "雷精当场在你体内炸开，经脉尽断，最大寿元 {life_lose_huge}。" }
      ],
      RARE: [
        { desc: "恐怖的空间风暴正在席卷，你不但不退，反而盘膝坐下观摩空间法则。", req: "insight", reqVal: 100, succ: "悟性+2，你明悟了一丝空间真意，修为大增 {exp_large}，战力 {power_large}。", fail: "你看得头痛欲裂，双目流血，一无所获只得退走。" },
        { desc: "遗迹坍塌，你以肉身硬抗废墟的余波，在残骸中大肆搜刮。", req: "body", reqVal: 120, succ: "体魄+3，你从乱石中扒出绝世珍宝！灵石 {gold_large}，家境+2。", fail: "你被余波震得经脉寸断，狼狈逃出，最大寿元 {life_lose_mid}。" }
      ,
        { desc: "两宗弟子正在灵脉边缘械斗，你趁乱摸向无人看守的灵石矿脉。", req: "luck", reqVal: 100, succ: "你满载而归且无人察觉！灵石 {gold_large}，修为 {exp_mid}，家境+2。", fail: "你被双方同时发现，围攻之下仓皇而逃，最大寿元 {life_lose_mid}。" }
      ],
      NORMAL: [
        { desc: "你小心翼翼地在外围徘徊，不敢深入。", req: "none", reqVal: 0, succ: "虽然没大机缘，但也捡到些前辈遗留的边角料，灵石 {gold_mid}，家境+1。", fail: "" },
        { desc: "你静看此地沧海桑田的变迁。", req: "none", reqVal: 0, succ: "道心更加坚固，修为稳步推进 {exp_mid}。", fail: "" }
      ,
        { desc: "你在古战场拾取残破的兵刃碎片，熔了换些灵石。", req: "none", reqVal: 0, succ: "碎片虽破，材质尚可，灵石 {gold_mid}，家境+1。", fail: "" }
      ],
      DANGER: [
        { desc: "域外天魔发现了你，化作黑雾钻入你的识海妄图控制你！", req: "insight", reqVal: 200, succ: "你道心坚如磐石，将天魔生生炼化为神识养料！修为 {exp_huge}。", fail: "你陷入无尽的幻境折磨，耗费千年才苏醒，白白流逝寿元 {life_lose_huge}，悟性-5。" }
      ,
        { desc: "一道无主的本源雷霆锁定了你，当空直劈而下！", req: "luck", reqVal: 110, succ: "雷霆在你头顶三寸处诡异散去，你福至心灵有所明悟！悟性+5。", fail: "雷霆正中天灵，你神魂焦枯，最大寿元 {life_lose_huge}，悟性-10。" }
      ]
    }
  },

  // ==================== 【卷三：灵界卷】(渡劫-金仙，属性检定门槛 500~1000) ====================
  TIER_3: {
    locations: ["登临九重天阙的南天门外", "漂浮在仙魔交锋的混沌长河中", "混入九天蟠桃盛会的外围", "探索一位远古真仙的坐化洞府", "站在充满煞气的斩仙台上", "在仙魔大战遗留的星墟战场", "于横贯虚空的上古传送阵残骸旁", "在一尊真仙坐化的道场深处"],
    events: {
      EPIC: [
        { desc: "一道三千大道交织的仙道法则显化，你敞开心神，强行引法则入体！", req: "insight", reqVal: 800, succ: "悟性+10，你借此铸就无暇仙躯！战力 {power_max}，全属性+5。", fail: "凡人之躯妄图承载仙道，肉身当场崩毁！最大寿元 {life_lose_max}。" },
        { desc: "一张散发着无尽威严的仙王法旨从天而降，你顶着威压强行站立不跪！", req: "body", reqVal: 900, succ: "体魄+10，你傲骨惊天，竟得到仙王印记认可！修为暴涨 {exp_max}。", fail: "你被法旨威压压得骨肉成泥，重塑仙躯耗费无尽寿元 {life_lose_max}。" },
        { desc: "一株传说中的混沌青莲缓缓绽放，你试着释放自己的气息与其共鸣。", req: "luck", reqVal: 850, succ: "你天生携带大气运，青莲竟然主动认你为主！福源+10，最大寿元 {life_max}。", fail: "青莲对你毫无感应，破空而去，你怅然若失。" }
      ,
        { desc: "真仙道场中央留着一方蒲团，你在其上盘膝坐下，承受道场自发的问道。", req: "insight", reqVal: 900, succ: "你一一答出真仙所问，道场承认你为后继者！悟性+25，修为 {exp_max}，战力 {power_max}。", fail: "你答错第三问，道场灵光尽散并将你逐出，最大寿元 {life_lose_max}。" }
      ],
      RARE: [
        { desc: "你收集了神魔交锋时溢散出的一丝混沌气，试图将其炼化。", req: "talent", reqVal: 600, succ: "根骨+5，你的仙基底蕴大增，修为跨越式增长 {exp_huge}。", fail: "混沌气太过沉重，不仅没炼化，反而压碎了你的经脉。" },
        { desc: "你豪掷千金，买通了盛会的守仙将，偷偷潜入内场。", req: "wealth", reqVal: 700, succ: "你品尝到了真正的仙茗与蟠桃残羹！最大寿元 {life_huge}。", fail: "仙将嫌钱少把你打了出来，颜面尽失，损失灵石 {gold_lose_large}。" }
      ,
        { desc: "传送阵残骸仍有微弱灵光流转，你尝试以自身法力重启它。", req: "talent", reqVal: 800, succ: "阵法短暂贯通，你从中取出一件仙家重宝！战力 {power_huge}，灵石 {gold_max}，家境+8。", fail: "阵法空间乱流爆发，你被撕裂又勉强聚形，最大寿元 {life_lose_huge}。" }
      ],
      NORMAL: [
        { desc: "你只敢远远地在云端观望大能论道，不敢靠近。", req: "none", reqVal: 0, succ: "即便如此也长了见识，心境微动，修为 {exp_large}。", fail: "" }
      ,
        { desc: "你在星墟中采集散落的仙灵之气，缓缓纳入丹田。", req: "none", reqVal: 0, succ: "仙气入体，修为稳步精进 {exp_huge}。", fail: "" }
      ],
      DANGER: [
        { desc: "一具漂浮了百万年的无名仙尸突然睁开眼睛，向你挥出毁天灭地的一拳！", req: "body", reqVal: 1000, succ: "你爆发全部潜能，勉强挡下这一击，并在生死间突破！战力飙升 {power_huge}。", fail: "你被一拳打爆了半边身子，仙基动摇，最大寿元 {life_lose_max}，根骨-10。" }
      ,
        { desc: "星墟深处一头仙魔战争中残存的凶物嗅到了你的气息，当即扑杀而来！", req: "body", reqVal: 950, succ: "你与凶物硬撼百余回合，终将其斩杀炼化！体魄+20，战力 {power_max}。", fail: "凶物一口咬穿你的护体仙光，你重伤遁走，最大寿元 {life_lose_max}。" }
      ]
    }
  },

  // ==================== 【卷四：仙道卷】(仙尊-天道，属性检定门槛 2000~5000) ====================
  TIER_4: {
    locations: ["在鸿蒙未判的宇宙奇点", "于大千世界的宇宙边荒", "漫步在时光长河的最尽头", "端坐在至高无上的天道核心", "凝视着吞噬一切的万界归墟", "在诸天万界的因果交汇之点", "于一方新生宇宙的创世之初"],
    events: {
      EPIC: [
        { desc: "你踏入时光长河源头，竟然看到了最初的自己，你坐下与其对弈！", req: "insight", reqVal: 3000, succ: "悟性+50，你明悟了大千本源，过去未来归一！战力破灭寰宇 {power_max}，全属性+20！", fail: "你陷入了过去与未来的逻辑悖论，道心几近崩溃，最大寿元 {life_lose_max}。" },
        { desc: "维持宇宙运转的天道意志开始崩塌，你竟妄图以己心代天心去缝合它！", req: "body", reqVal: 3500, succ: "体魄+50，你承受住了天道之重，成为了这方宇宙的主宰！修为 {exp_max}，寿元 {life_max}！", fail: "天道因果反噬，你承受了无量量劫，战力大损，最大寿元 {life_lose_max}。" },
        { desc: "足以磨灭仙帝的灭世磨盘向你碾压而来，你穷极一切底蕴与法宝硬撼！", req: "wealth", reqVal: 4000, succ: "你的无尽重宝生生将磨盘砸碎，化作漫天仙源！灵石 {gold_max}，战力 {power_max}，家境+20。", fail: "法宝尽毁也未能挡住，你被打入轮回深渊，九死一生，修为暴跌 {exp_lose_max}。" }
      ,
        { desc: "因果交汇点浮现出你尚未发生的无数结局，你伸手握住其中最亮的一条。", req: "luck", reqVal: 3200, succ: "你亲手篡改了自己的因果线！全属性+25，修为 {exp_max}，寿元 {life_max}。", fail: "你篡改因果失败，反被无量因果反噬加身，最大寿元 {life_lose_max}。" }
      ],
      RARE: [
        { desc: "你亲眼目睹了一方大千世界的毁灭，借机收取了一缕鸿蒙紫气。", req: "talent", reqVal: 2000, succ: "根骨+20，超脱轮回，修为暴增 {exp_huge}。", fail: "紫气消散得太快，你未能将其禁锢。" }
      ,
        { desc: "一方新生宇宙正在你面前成型，你向其中投下一缕自己的道韵。", req: "insight", reqVal: 2500, succ: "你的道韵成为该宇宙的底层法则之一！悟性+30，战力 {power_max}。", fail: "道韵被新生法则排异挤出，你空耗一场。" }
      ],
      NORMAL: [
        { desc: "你静坐于虚无之中，坐看纪元更迭。", req: "none", reqVal: 0, succ: "一梦十万年，宇宙生灭皆在掌间，修为自然涌动 {exp_max}。", fail: "" }
      ,
        { desc: "你立于创世之初，静观法则自行编织成形。", req: "none", reqVal: 0, succ: "旁观亦是修行，修为自然增长 {exp_max}。", fail: "" }
      ],
      DANGER: [
        { desc: "归墟深处伸出了一只无法名状的黑手，瞬间将你拖入深渊！", req: "luck", reqVal: 3000, succ: "在必死之局中，你触发逆天福源，竟落入了一处未知的终极仙境！全属性+10，最大寿元 {life_max}。", fail: "你被拖入永恒的黑暗，神魂遭受无尽折磨，悟性-30，最大寿元 {life_lose_max}。" }
      ,
        { desc: "创世的原初之火失控蔓延，瞬间将你彻底吞没！", req: "body", reqVal: 3600, succ: "你以道体硬抗原初之火的焚烧，脱胎换骨！体魄+30，寿元 {life_max}。", fail: "原初之火烧穿你的道体根基，最大寿元 {life_lose_max}，全属性-10。" }
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

// 坊市道具生成。
//
// 原实现的问题：200 件道具按 i%5 轮转五维、价格 150+i*120+levelReq*200 线性增长，
// 而灵石产出是 500*m² 这类几何增长 —— 后期灵石以几个数量级压过道具价格，
// 导致"永远买得起全池最贵的那件"，道具池形同虚设。
// 且 value = floor(levelReq/5)+1 最高只有 21，和后期属性量级完全脱节。
//
// 现实现：按大境界分 15 档，每档覆盖 体魄/根骨/福源/悟性 四维（家境不售，
// 避免 灵石→家境→灵石 的放大环），价格与数值都随境界几何增长，
// 使"灵石够不够买下一档"始终是个真问题。
function generateFullDictionary() {
  let dictionary = [...CORE_ITEMS];

  const TIER_PREFIX = ["凝气", "筑基", "金丹", "元婴", "化神", "炼虚", "合体", "大乘",
                       "渡劫", "真仙", "金仙", "仙尊", "仙帝", "神帝", "天道"];
  const ATTR_ITEMS = [
    { attr: "body",    names: ["锻体丹", "淬骨液", "龙血石"] },
    { attr: "talent",  names: ["洗髓经", "通脉散", "易筋帖"] },
    { attr: "luck",    names: ["转运符", "祈福玉", "锦鲤佩"] },
    { attr: "insight",  names: ["明心茶", "悟道香", "清灵篆"] }
  ];
  const RARITY_BY_TIER = ["Gray", "Gray", "Green", "Green", "Blue", "Blue", "Blue",
                          "Purple", "Purple", "Purple", "Orange", "Orange", "Orange", "Gold", "Gold"];

  let id = 2000;
  for (let m = 0; m < 15; m++) {
    // 价格与数值同步几何增长，保证各境界都存在"买不买得起"的张力
    let price = Math.floor(400 * Math.pow(2.6, m));
    let value = Math.floor(6 * Math.pow(1.62, m));
    for (const grp of ATTR_ITEMS) {
      for (let k = 0; k < grp.names.length; k++) {
        dictionary.push({
          id: id++,
          name: TIER_PREFIX[m] + grp.names[k],
          desc: `${TIER_PREFIX[m]}境界的${grp.names[k]}，可提升对应资质。`,
          // 同档内三件做轻微价差，避免完全同质
          price: Math.floor(price * (0.8 + k * 0.2)),
          attr: grp.attr,
          value: Math.max(1, Math.floor(value * (0.8 + k * 0.2))),
          rarity: RARITY_BY_TIER[m],
          minLevel: m * 4 + 1
        });
      }
    }
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