// ============================================================
// 游戏数据常量 — 从 CLI main.js 提取
// ============================================================

const WORLD = {
  year: "大宋宣和二年",
  season: "秋末",
  region: "河北东路，清河县",
  situation: "方腊在南方起事，朝廷抽调兵力南征，各地防务空虚。土匪做大，官府自顾不暇。入冬前最后一波旺季。",
  factions: {
    官府: { attitude: "冷淡", desc: "缺兵少粮，需打点才办事。近期严查'通匪'。" },
    青龙寨: { attitude: "敌对", desc: "盘踞清风岭，控制北线官道。大当家想招安，二当家反对。" },
    漕帮: { attitude: "友善", desc: "控制水路，和镖局有过合作。帮主欠你人情。" },
    白莲教: { attitude: "未知", desc: "暗中活动，拉拢江湖人。扯上关系会被官府盯上。" }
  }
};

const INITIAL_BUREAU = {
  name: "义信镖局",
  money: 180,
  debt: 100,
  reputation: 62,
  daily_cost: 3,
  max_days: 30,
  day: 1,
};

const BUREAU_RULE_OPTIONS = [
  { id: "money_first",   text: "能用钱解决的不动手",       conflicts: ["never_pay"] },
  { id: "never_pay",     text: "一分钱都不给，靠气势和道理", conflicts: ["money_first"] },
  { id: "official_polite", text: "对官府的人客气恭敬",      conflicts: ["official_hard"] },
  { id: "official_hard", text: "对官府不卑不亢，据理力争",  conflicts: ["official_polite"] },
  { id: "people_first",  text: "人比货重要，必要时弃货保人", conflicts: ["cargo_first"] },
  { id: "cargo_first",   text: "货比什么都重要，拼了也要保货", conflicts: ["people_first"] },
  { id: "low_profile",   text: "低调行事，能避则避",        conflicts: ["show_strength"] },
  { id: "show_strength", text: "亮出招牌，让人知道我们不好惹", conflicts: ["low_profile"] },
  { id: "gather_intel",  text: "多听多看多打探，情报优先",   conflicts: [] },
  { id: "no_trouble",    text: "少管闲事，只管自己的镖",     conflicts: ["help_others"] },
  { id: "help_others",   text: "能帮则帮，广结善缘",        conflicts: ["no_trouble"] },
];

const PERSONAL_RULE_OPTIONS = {
  "铁嘴张": [
    { id: "tz_honest_price", text: "报价要实在，不许漫天要价" },
    { id: "tz_no_promise",   text: "不许替镖局做超出能力的承诺" },
    { id: "tz_lead_talk",    text: "所有场合你先开口，别人不许抢话" },
    { id: "tz_save_money",   text: "花钱之前先问我，超过10两不许自作主张" },
    { id: "tz_sweet_talk",   text: "多夸人，嘴甜些，关系比钱好使" },
  ],
  "莽夫李": [
    { id: "ml_shut_up",     text: "别人说话的时候你闭嘴" },
    { id: "ml_no_fight",    text: "不许先动手，除非对方打到面前" },
    { id: "ml_protect",     text: "你只管保护镖车和人，交涉的事别掺和" },
    { id: "ml_intimidate",  text: "站出来亮亮块头，但不要说话" },
    { id: "ml_patience",    text: "忍住脾气，不管对方怎么挑衅都不动手" },
  ],
  "柳如烟": [
    { id: "lr_observe",     text: "先观察再行动，不要急着表态" },
    { id: "lr_verify",      text: "来路不明的人事都要查，不许大意" },
    { id: "lr_backup",      text: "永远准备一个备选方案" },
    { id: "lr_connections", text: "利用你衙门的旧关系，能打听就打听" },
    { id: "lr_frugal",      text: "精打细算，能省一文是一文" },
  ]
};

const COMPLIANCE_CONFLICTS = {
  "ml_shut_up":    { with_tag: "暴躁", compliance: 40, resist_text: "忍得很辛苦，可能憋不住" },
  "ml_no_fight":   { with_tag: "暴躁", compliance: 50, resist_text: "勉强能忍，但被激怒时不好说" },
  "ml_patience":   { with_tag: "暴躁", compliance: 25, resist_text: "强烈抵触，极可能爆发" },
  "tz_honest_price": { with_tag: "贪财", compliance: 55, resist_text: "嘴上答应，实际可能还是往高了报" },
  "tz_save_money":   { with_tag: "贪财", compliance: 70, resist_text: "会遵守但心不甘情不愿" },
  "lr_connections":  { with_tag: "多疑", compliance: 60, resist_text: "会去打听但不完全信任得到的信息" },
};

const ESCORTS = [
  {
    name: "铁嘴张",
    title: "话事人",
    portrait: "../assets/portraits/tiezui-zhang.svg",
    speech: 85, combat: 30, courage: 60, loyalty: 70,
    tags: ["圆滑", "贪财", "怕死"],
    tendency: "遇事优先谈判，能用钱解决绝不动手，谈不拢就退让",
    bio: "走南闯北二十年，靠一张嘴吃饭。见人说人话，见鬼说鬼话。胆子不大但脑子活。",
  },
  {
    name: "莽夫李",
    title: "武师",
    portrait: "../assets/portraits/mangfu-li.svg",
    speech: 25, combat: 90, courage: 95, loyalty: 85,
    tags: ["暴躁", "义气", "鲁莽"],
    tendency: "不爱废话，觉得对方不讲理就想动手，但听从镖局命令",
    bio: "少林寺还俗武僧，一身蛮力。脾气火爆但重义气，被铁嘴张一碗酒骗来当了镖师。",
  },
  {
    name: "柳如烟",
    title: "军师",
    portrait: "../assets/portraits/liuruyan.svg",
    speech: 70, combat: 45, courage: 50, loyalty: 60,
    tags: ["冷静", "精明", "多疑"],
    tendency: "善于观察对方弱点，喜欢以退为进，必要时不择手段",
    bio: "前衙门师爷，因得罪上官被逐。精通律法人情，看人极准，但不完全信任任何人。",
  }
];

const DAILY_EVENTS = [
  {
    id: "official_inspection",
    title: "官差例行登记",
    category: "官府",
    description: "县衙派了两个衙役来，例行核查在册镖师。需交出名册、回答几个问题。",
    tests: "对官府态度、礼节、是否多嘴",
    relevant_rules: ["official_polite", "official_hard", "ml_shut_up", "ml_patience"]
  },
  {
    id: "neighbor_dispute",
    title: "隔壁商户纠纷",
    category: "市井",
    description: "隔壁绸缎庄和客人吵起来了，差点撞到你镖局门口的镖车。你的镖师在门口看着。",
    tests: "是否多管闲事、如何保护自家财产",
    relevant_rules: ["no_trouble", "help_others", "ml_no_fight"]
  },
  {
    id: "gang_scout",
    title: "可疑人物打探",
    category: "江湖",
    description: "酒馆里有人跟你的镖师搭话，问'贵镖局最近接了什么大单啊'。像是青龙寨眼线。",
    tests: "警惕性、口风、是否反向套话",
    relevant_rules: ["gather_intel", "low_profile", "lr_observe", "lr_verify"]
  },
  {
    id: "client_visit",
    title: "客户上门询价",
    category: "生意",
    description: "一位外地商人来问：有批瓷器要从清河运到汴京，怎么收费？",
    tests: "报价合理性、是否过度承诺",
    relevant_rules: ["tz_honest_price", "tz_no_promise", "tz_sweet_talk"]
  },
  {
    id: "official_bribe",
    title: "官差暗示要好处",
    category: "官府",
    description: "之前来登记的衙役又来了，闲聊说'最近上头查得紧，兄弟们跑断了腿'，意味深长地看着你。",
    tests: "是否读懂暗示、是否打点、花多少",
    relevant_rules: ["money_first", "never_pay", "official_polite", "lr_frugal"]
  },
  {
    id: "tavern_rumor",
    title: "酒馆风闻",
    category: "情报",
    description: "镖师在酒馆喝酒，听人说'青龙寨在清风岭设了新卡，过路商队都被截了'。",
    tests: "是否追问、是否汇报、是否当回事",
    relevant_rules: ["gather_intel", "lr_observe", "lr_verify"]
  },
  {
    id: "protection_request",
    title: "外地商队拜码头",
    category: "江湖",
    description: "一支外地商队路过，领队来拜码头打招呼，送了两坛酒。这是江湖规矩。",
    tests: "礼数、是否回礼、是否攀关系",
    relevant_rules: ["help_others", "no_trouble", "show_strength", "low_profile"]
  },
  {
    id: "drunk_challenge",
    title: "醉汉挑衅",
    category: "市井",
    description: "酒馆里一个醉汉认出莽夫李，大声嚷嚷'和尚不去念经跑来当打手'，引得众人侧目。",
    tests: "忍耐力、是否动怒、如何化解",
    relevant_rules: ["ml_shut_up", "ml_no_fight", "ml_patience", "low_profile"]
  }
];

const MISSIONS = [
  {
    id: "gold_escort",
    client: "清河县王员外",
    title: "押运黄金至沧州",
    cargo: { type: "黄金", value: 500 },
    reward: 120,
    penalty: 80,
    deadline_days: 5,
    route_risks: [
      { location: "清风岭", threat: "青龙寨关卡", likelihood: "极高" },
      { location: "清河关卡", threat: "官府盘查", likelihood: "中" }
    ],
    special: "大客户，做好了后面还有三单。",
    difficulty: "高"
  },
  {
    id: "silk_escort",
    client: "苏州李掌柜（漕帮介绍）",
    title: "押运绸缎至汴京",
    cargo: { type: "绸缎", value: 300 },
    reward: 70,
    penalty: 50,
    deadline_days: 7,
    route_risks: [
      { location: "清河关卡", threat: "税吏敲诈", likelihood: "高" },
      { location: "野猪林", threat: "散匪", likelihood: "低" }
    ],
    special: "漕帮介绍的单子，做好了加深关系。",
    difficulty: "中"
  }
];
