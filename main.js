// ============================================================
// EscortSim Prototype v3 - 有限制的日常+出镖循环
// 核心：槽位有限 + 时间压力 + 性格抗拒
// ============================================================

import readline from "readline";

// ============================================================
// LLM 配置 — 支持 OpenRouter (BYOK) + Ollama 本地 fallback
// ============================================================
// 优先级：环境变量 > .env 文件 > 回退 Ollama 本地
//
// 用法：
//   OPENROUTER_API_KEY=sk-or-xxx node main.js
//   或在 .env 文件中写入 OPENROUTER_API_KEY=sk-or-xxx
//
// 可选覆盖：
//   LLM_MODEL=deepseek/deepseek-r1   （覆盖默认模型）
//   LLM_BACKEND=ollama               （强制用本地 Ollama）
// ============================================================

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OLLAMA_URL = "http://localhost:11434/api/chat";

// 默认模型推荐（OpenRouter 上便宜且中文能力强）
const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-chat-v3-0324";
const DEFAULT_OLLAMA_MODEL = "qwen3-coder:30b";

// 从环境变量或 .env 加载配置
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const envContent = readFileSync(join(__dirname, ".env"), "utf-8");
  for (const line of envContent.split("\n")) {
    const m = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env 不存在，忽略 */ }

const API_KEY = process.env.OPENROUTER_API_KEY || "";
const BACKEND = process.env.LLM_BACKEND || (API_KEY ? "openrouter" : "ollama");
const MODEL = process.env.LLM_MODEL || (BACKEND === "openrouter" ? DEFAULT_OPENROUTER_MODEL : DEFAULT_OLLAMA_MODEL);

// ============================================================
// 世界状态
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

// ============================================================
// 镖局状态
// ============================================================

const BUREAU = {
  name: "义信镖局",
  money: 180,
  debt: 100,           // 年底(30天)到期
  reputation: 62,
  daily_cost: 3,       // 每天固定消耗（伙食杂费）
  max_days: 30,        // 总天数限制（入冬歇业）
  day: 1,
};

// ============================================================
// 规矩系统 —— 槽位有限，从预设选项中选
// ============================================================

// 总规矩：最多选 3 条（从以下选项中选）
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

// 个人规矩：每人最多选 2 条
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

// 性格-规矩冲突表：哪些规矩和哪些性格冲突
// 冲突越大，执行时越可能走样/抗拒
const COMPLIANCE_CONFLICTS = {
  // 莽夫李的性格 vs 规矩
  "ml_shut_up":    { with_tag: "暴躁", compliance: 40, resist_text: "忍得很辛苦，可能憋不住" },
  "ml_no_fight":   { with_tag: "暴躁", compliance: 50, resist_text: "勉强能忍，但被激怒时不好说" },
  "ml_patience":   { with_tag: "暴躁", compliance: 25, resist_text: "强烈抵触，极可能爆发" },
  // 铁嘴张的性格 vs 规矩
  "tz_honest_price": { with_tag: "贪财", compliance: 55, resist_text: "嘴上答应，实际可能还是往高了报" },
  "tz_save_money":   { with_tag: "贪财", compliance: 70, resist_text: "会遵守但心不甘情不愿" },
  // 柳如烟的性格 vs 规矩
  "lr_connections":  { with_tag: "多疑", compliance: 60, resist_text: "会去打听但不完全信任得到的信息" },
};

// 当前已选规矩
let bureauRules = [];  // max 3, 存 id
let personalRules = { "铁嘴张": [], "莽夫李": [], "柳如烟": [] };  // max 2 each

// ============================================================
// 镖师数据
// ============================================================

const ESCORTS = [
  {
    name: "铁嘴张",
    title: "话事人",
    speech: 85, combat: 30, courage: 60, loyalty: 70,
    tags: ["圆滑", "贪财", "怕死"],
    tendency: "遇事优先谈判，能用钱解决绝不动手，谈不拢就退让",
    bio: "走南闯北二十年，靠一张嘴吃饭。见人说人话，见鬼说鬼话。胆子不大但脑子活。",
  },
  {
    name: "莽夫李",
    title: "武师",
    speech: 25, combat: 90, courage: 95, loyalty: 85,
    tags: ["暴躁", "义气", "鲁莽"],
    tendency: "不爱废话，觉得对方不讲理就想动手，但听从镖局命令",
    bio: "少林寺还俗武僧，一身蛮力。脾气火爆但重义气，被铁嘴张一碗酒骗来当了镖师。",
  },
  {
    name: "柳如烟",
    title: "军师",
    speech: 70, combat: 45, courage: 50, loyalty: 60,
    tags: ["冷静", "精明", "多疑"],
    tendency: "善于观察对方弱点，喜欢以退为进，必要时不择手段",
    bio: "前衙门师爷，因得罪上官被逐。精通律法人情，看人极准，但不完全信任任何人。",
  }
];

// ============================================================
// 日常事件池
// ============================================================

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

// ============================================================
// 出镖任务
// ============================================================

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

// ============================================================
// Ollama 调用
// ============================================================

async function callLLM(messages, temperature = 0.8) {
  try {
    let content;

    if (BACKEND === "openrouter") {
      // ─── OpenRouter (OpenAI-compatible) ───
      if (!API_KEY) throw new Error("未设置 OPENROUTER_API_KEY");
      const resp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
          "HTTP-Referer": "https://github.com/escort-sim",
          "X-Title": "EscortSim-CLI"
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature,
          max_tokens: 2000,
        })
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenRouter ${resp.status}: ${err}`);
      }
      const data = await resp.json();
      content = data.choices?.[0]?.message?.content || "";
    } else {
      // ─── Ollama 本地 ───
      const resp = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages,
          stream: false,
          options: { temperature, num_predict: 2000 }
        })
      });
      if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
      const data = await resp.json();
      content = data.message?.content || "";
    }

    // 统一清理 thinking tags
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return content;
  } catch (e) {
    return `[LLM 调用失败: ${e.message}]`;
  }
}

// ============================================================
// CLI 工具
// ============================================================

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function printSep() { console.log("\n" + "═".repeat(58) + "\n"); }

// ============================================================
// 规矩系统辅助函数
// ============================================================

function getRuleText(id) {
  const br = BUREAU_RULE_OPTIONS.find(r => r.id === id);
  if (br) return br.text;
  for (const opts of Object.values(PERSONAL_RULE_OPTIONS)) {
    const pr = opts.find(r => r.id === id);
    if (pr) return pr.text;
  }
  return id;
}

function getBureauRulesText() {
  if (bureauRules.length === 0) return "（暂无总规矩）";
  return bureauRules.map((id, i) => `${i + 1}. ${getRuleText(id)}`).join("\n");
}

function getPersonalRulesText(name) {
  const rules = personalRules[name];
  if (!rules || rules.length === 0) return "（暂无）";
  return rules.map((id, i) => {
    const conflict = COMPLIANCE_CONFLICTS[id];
    const warn = conflict ? ` ⚠️ 服从度${conflict.compliance}%` : "";
    return `${i + 1}. ${getRuleText(id)}${warn}`;
  }).join("\n");
}

function getComplianceWarning(ruleId, escort) {
  const conflict = COMPLIANCE_CONFLICTS[ruleId];
  if (!conflict) return null;
  if (escort.tags.includes(conflict.with_tag)) {
    return conflict;
  }
  return null;
}

// ============================================================
// 显示函数
// ============================================================

function showStatus() {
  const b = BUREAU;
  const daysLeft = b.max_days - b.day;
  const moneyAtEnd = b.money - (daysLeft * b.daily_cost);
  const canPayDebt = moneyAtEnd >= b.debt;

  console.log(`\n  📊 义信镖局 · 第 ${b.day}/${b.max_days} 天`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  💰 ${b.money} 两  |  每天消耗 ${b.daily_cost} 两`);
  console.log(`  📅 还剩 ${daysLeft} 天入冬  |  欠债 ${b.debt} 两（到期）`);
  console.log(`  📈 声望 ${b.reputation}/100`);
  if (!canPayDebt) {
    console.log(`  🚨 按当前趋势，入冬时还不上债！`);
  }
  const projected = b.money - (daysLeft * b.daily_cost) - b.debt;
  console.log(`  📉 预计入冬结余: ${projected} 两${projected < 0 ? "（破产）" : ""}`);
  console.log();
}

function showEscorts() {
  for (const e of ESCORTS) {
    const bar = (v) => "█".repeat(Math.round(v / 10)) + "░".repeat(10 - Math.round(v / 10));
    console.log(`  【${e.name}】${e.title} — ${e.tags.join("·")}`);
    console.log(`    口${bar(e.speech)} 武${bar(e.combat)} 胆${bar(e.courage)} 义${bar(e.loyalty)}`);
    console.log(`    规矩: ${getPersonalRulesText(e.name).replace(/\n/g, "\n          ")}`);
    console.log();
  }
}

function showAllRules() {
  console.log(`  📜 镖局总规矩（${bureauRules.length}/3）：`);
  console.log(`  ${getBureauRulesText().replace(/\n/g, "\n  ")}`);
  console.log();
  for (const e of ESCORTS) {
    const rules = personalRules[e.name];
    console.log(`  【${e.name}】的规矩（${rules.length}/2）：`);
    console.log(`  ${getPersonalRulesText(e.name).replace(/\n/g, "\n  ")}`);
    console.log();
  }
}

// ============================================================
// 规矩编辑（有限选择）
// ============================================================

async function editRules() {
  while (true) {
    console.log();
    showAllRules();
    console.log("  ┌────────────────────────────────────┐");
    console.log("  │  1. 设定/更换总规矩（最多3条）      │");
    console.log("  │  2. 设定铁嘴张的规矩（最多2条）     │");
    console.log("  │  3. 设定莽夫李的规矩（最多2条）     │");
    console.log("  │  4. 设定柳如烟的规矩（最多2条）     │");
    console.log("  │  0. 返回                            │");
    console.log("  └────────────────────────────────────┘");

    const choice = await ask("  > ");
    if (choice.trim() === "0") break;

    if (choice.trim() === "1") {
      await editBureauRules();
    } else if (["2", "3", "4"].includes(choice.trim())) {
      const names = ["铁嘴张", "莽夫李", "柳如烟"];
      await editPersonalRules(names[parseInt(choice.trim()) - 2]);
    }
  }
}

async function editBureauRules() {
  console.log(`\n  当前总规矩（${bureauRules.length}/3）：`);
  console.log(`  ${getBureauRulesText().replace(/\n/g, "\n  ")}`);
  console.log(`\n  可选规矩（互相冲突的不能同时选）：`);

  const available = BUREAU_RULE_OPTIONS.filter(opt => {
    // 过滤掉和已选规矩冲突的
    for (const selected of bureauRules) {
      const selectedOpt = BUREAU_RULE_OPTIONS.find(o => o.id === selected);
      if (selectedOpt.conflicts.includes(opt.id)) return false;
    }
    return true;
  });

  available.forEach((opt, i) => {
    const selected = bureauRules.includes(opt.id) ? " ✓" : "";
    console.log(`    ${i + 1}. ${opt.text}${selected}`);
  });
  console.log(`    0. 清空所有总规矩`);
  console.log(`    回车. 不改了`);

  const input = await ask("\n  选择（输入编号切换，多个用空格分隔）: ");
  if (!input.trim()) return;
  if (input.trim() === "0") {
    bureauRules = [];
    console.log("  ✓ 总规矩已清空");
    return;
  }

  const indices = input.trim().split(/\s+/).map(s => parseInt(s) - 1);
  for (const idx of indices) {
    if (idx < 0 || idx >= available.length) continue;
    const opt = available[idx];
    if (bureauRules.includes(opt.id)) {
      // 取消选择
      bureauRules = bureauRules.filter(id => id !== opt.id);
      console.log(`  ✗ 移除: ${opt.text}`);
    } else if (bureauRules.length >= 3) {
      console.log(`  ⚠️ 已满3条！先移除一条才能加新的。`);
    } else {
      bureauRules.push(opt.id);
      console.log(`  ✓ 添加: ${opt.text}`);
    }
  }
}

async function editPersonalRules(name) {
  const escort = ESCORTS.find(e => e.name === name);
  const options = PERSONAL_RULE_OPTIONS[name];
  const current = personalRules[name];

  console.log(`\n  【${name}】当前规矩（${current.length}/2）：`);
  console.log(`  ${getPersonalRulesText(name).replace(/\n/g, "\n  ")}`);
  console.log(`\n  可选规矩：`);

  options.forEach((opt, i) => {
    const selected = current.includes(opt.id) ? " ✓" : "";
    const conflict = getComplianceWarning(opt.id, escort);
    const warn = conflict ? ` ⚠️ 和「${conflict.with_tag}」冲突，服从度仅${conflict.compliance}%` : "";
    console.log(`    ${i + 1}. ${opt.text}${selected}${warn}`);
  });
  console.log(`    0. 清空`);
  console.log(`    回车. 不改了`);

  const input = await ask("\n  选择（输入编号切换）: ");
  if (!input.trim()) return;
  if (input.trim() === "0") {
    personalRules[name] = [];
    console.log(`  ✓ ${name}的规矩已清空`);
    return;
  }

  const indices = input.trim().split(/\s+/).map(s => parseInt(s) - 1);
  for (const idx of indices) {
    if (idx < 0 || idx >= options.length) continue;
    const opt = options[idx];
    if (current.includes(opt.id)) {
      personalRules[name] = current.filter(id => id !== opt.id);
      console.log(`  ✗ 移除: ${opt.text}`);
    } else if (current.length >= 2) {
      console.log(`  ⚠️ 已满2条！先移除一条才能加新的。`);
    } else {
      const conflict = getComplianceWarning(opt.id, escort);
      if (conflict) {
        console.log(`  ⚠️ 注意: ${conflict.resist_text}（服从度${conflict.compliance}%）`);
        const confirm = await ask(`  仍然设定？(y/n): `);
        if (confirm.trim().toLowerCase() !== "y") continue;
      }
      personalRules[name].push(opt.id);
      console.log(`  ✓ 添加: ${opt.text}`);
    }
  }
}

// ============================================================
// 构建规矩描述（给LLM用）
// ============================================================

function buildRulesContext() {
  let text = "## 镖局总规矩\n";
  if (bureauRules.length === 0) {
    text += "无。镖师按自己性格行事。\n";
  } else {
    text += bureauRules.map(id => `- ${getRuleText(id)}`).join("\n") + "\n";
  }

  text += "\n## 镖师个人规矩与服从度\n";
  for (const e of ESCORTS) {
    const rules = personalRules[e.name];
    text += `【${e.name}】性格：${e.tags.join("、")}，行事：${e.tendency}\n`;
    if (rules.length === 0) {
      text += `  规矩：无，完全按性格行事\n`;
    } else {
      for (const ruleId of rules) {
        const conflict = getComplianceWarning(ruleId, e);
        if (conflict) {
          text += `  规矩：${getRuleText(ruleId)}（⚠️ 和性格「${conflict.with_tag}」冲突，服从度${conflict.compliance}%，${conflict.resist_text}）\n`;
        } else {
          text += `  规矩：${getRuleText(ruleId)}（服从度高，会认真执行）\n`;
        }
      }
    }
  }
  return text;
}

// ============================================================
// 日常事件引擎
// ============================================================

function pickDailyEvent() {
  const idx = Math.floor(Math.random() * DAILY_EVENTS.length);
  return DAILY_EVENTS[idx];
}

async function runDailyEvent(event) {
  // 扣每日消耗
  BUREAU.money -= BUREAU.daily_cost;

  console.log(`\n  ☀️  第 ${BUREAU.day} 天 · ${event.title}（${event.category}）`);
  console.log(`  ──────────────────────────────────────────`);
  console.log(`  ${event.description}`);

  // 检查哪些相关规矩是玩家已经设了的
  const activeRelevant = event.relevant_rules.filter(id =>
    bureauRules.includes(id) ||
    Object.values(personalRules).some(arr => arr.includes(id))
  );
  if (activeRelevant.length > 0) {
    console.log(`  📋 相关规矩: ${activeRelevant.map(getRuleText).join("、")}`);
  } else {
    console.log(`  📋 无相关规矩生效（镖师将按性格自由行事）`);
  }
  console.log();

  const messages = [
    {
      role: "system",
      content: `你是一个武侠世界镖局日常的叙事引擎。模拟镖师们如何应对日常小事件。

${buildRulesContext()}

## 模拟规则
- 用 80-150 字描述反应和处理方式
- 如果有规矩，重点展示规矩是否被执行：
  - 服从度高的规矩：镖师会认真执行
  - 服从度低的规矩（和性格冲突）：镖师可能执行不到位、扭曲执行、甚至违反
  - 没有规矩的情况：镖师完全按性格行事（可能好可能坏）
- 语言自然口语化
- 结尾给出：
  [执行] 哪条规矩起了作用/被违反/没有相关规矩
  [效果] 一句话评价这次处理的结果（好/一般/有隐患）
- /no_think`
    },
    {
      role: "user",
      content: `事件：${event.title}\n场景：${event.description}\n测试点：${event.tests}`
    }
  ];

  process.stdout.write("  ...\r");
  const result = await callLLM(messages, 0.9);
  process.stdout.write("     \r");
  console.log(`  ${result.split("\n").join("\n  ")}`);
  console.log(`\n  💰 日常开销 -${BUREAU.daily_cost} 两（剩余 ${BUREAU.money} 两）`);
  console.log();

  BUREAU.day++;
}

// ============================================================
// 出镖引擎
// ============================================================

async function runMission(mission) {
  printSep();
  console.log(`  🚩 出镖：${mission.title}`);
  console.log(`  委托: ${mission.client} | 货: ${mission.cargo.type}(${mission.cargo.value}两)`);
  console.log(`  报酬: ${mission.reward}两 | 违约赔: ${mission.penalty}两 | 期限: ${mission.deadline_days}天`);
  console.log(`\n  ⚠️  风险：`);
  for (const r of mission.route_risks) {
    console.log(`     ${r.location} — ${r.threat}（${r.likelihood}）`);
  }
  console.log(`  📌 ${mission.special}`);

  // 利害速算
  const costDuringMission = mission.deadline_days * BUREAU.daily_cost;
  const best = BUREAU.money - costDuringMission + mission.reward;
  const worst = BUREAU.money - costDuringMission - mission.penalty;
  console.log(`\n  💰 利害（含路上${mission.deadline_days}天消耗${costDuringMission}两）：`);
  console.log(`     最好: ${best} 两  |  最差: ${worst} 两`);
  if (worst < 0) console.log(`     🚨 最差情况直接资不抵债`);

  printSep();

  const escortInfo = ESCORTS.map(e =>
    `【${e.name}】${e.title}，口才${e.speech}武力${e.combat}胆量${e.courage}义气${e.loyalty}。性格：${e.tags.join("、")}。行事：${e.tendency}。`
  ).join("\n");

  const factionInfo = Object.entries(WORLD.factions)
    .map(([n, f]) => `${n}（${f.attitude}）：${f.desc}`)
    .join("\n");

  const sysPrompt = `你是一个武侠世界押镖的叙事推演引擎。

## 世界背景
${WORLD.year}，${WORLD.season}，${WORLD.region}。${WORLD.situation}

## 势力
${factionInfo}

## 镖局
${BUREAU.name}，银两${BUREAU.money}两，声望${BUREAU.reputation}/100。日消耗${BUREAU.daily_cost}两。
欠债${BUREAU.debt}两即将到期。只剩${BUREAU.max_days - BUREAU.day}天入冬。

${buildRulesContext()}

## 镖师
${escortInfo}

## 任务
${mission.title} | ${mission.client}
货物: ${mission.cargo.type}（${mission.cargo.value}两）| 报酬: ${mission.reward}两 | 违约: ${mission.penalty}两
期限: ${mission.deadline_days}天
风险: ${mission.route_risks.map(r => `${r.location}-${r.threat}(${r.likelihood})`).join("; ")}

## 推演要求
生成完整押镖旅程（2-3个遭遇）。

### 第X天 · 事件标题
（150-200字叙事）
[规矩执行] 哪条规矩起了作用/被违反，为什么
[花费: X两/无]  [时间: 正常/耽误X天]

### 最终结算
[结果等级: 圆满/顺利/磕碰/勉强/部分失败/出事/灾难]
（总结）

[数值变化]
- 银两: ±X（原因）
- 声望: ±X
- 关系变化: 如有
- 镖师状况: 如有

## 核心规则
- 有规矩时：按规矩执行，但服从度低的可能走样
- 无规矩时：完全按性格行事——结果不可控
- 规矩和性格匹配好 → 好结果；规矩和性格冲突 → 执行偏差带来问题
- 没设规矩的领域是"盲区"——镖师可能做出你不想要的事
- 经济后果要合理
- /no_think`;

  const messages = [
    { role: "system", content: sysPrompt },
    { role: "user", content: "开始推演。" }
  ];

  console.log("  镖队出发了……\n");
  process.stdout.write("  (推演中...)\r");
  const result = await callLLM(messages, 0.85);
  process.stdout.write("              \r");
  console.log(result);

  // 复盘
  printSep();
  console.log("  📊 策略复盘\n");

  const reviewMessages = [
    ...messages,
    { role: "assistant", content: result },
    {
      role: "user",
      content: `简短复盘（80-120字）：

1.【规矩效果】哪条规矩起了作用？哪里是"盲区"（没设规矩导致的问题）？
2.【冲突表现】哪个镖师因性格抗拒了规矩？结果如何？
3.【下次建议】一个方向性提示（不给最优解）

条目格式。
/no_think`
    }
  ];

  process.stdout.write("  (复盘...)\r");
  const review = await callLLM(reviewMessages, 0.6);
  process.stdout.write("           \r");
  console.log(`  ${review.split("\n").join("\n  ")}`);
  printSep();

  // 更新状态（简化，后续可解析LLM）
  BUREAU.money -= (mission.deadline_days * BUREAU.daily_cost);
  BUREAU.money += Math.round(mission.reward * 0.6); // 假设磕碰等级
  BUREAU.reputation += 3;
  BUREAU.day += mission.deadline_days;
}

// ============================================================
// 选择任务
// ============================================================

async function chooseMission() {
  console.log("\n  📋 可接任务：\n");
  MISSIONS.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.title}（${m.difficulty}）— 报酬${m.reward}两 风险:${m.route_risks.map(r => r.threat).join(",")}`);
  });
  console.log("  0. 还没准备好");

  const choice = await ask("\n  > ");
  const idx = parseInt(choice.trim()) - 1;

  if (idx >= 0 && idx < MISSIONS.length) {
    const m = MISSIONS[idx];
    console.log(`\n  ⚠️  出镖要花 ${m.deadline_days} 天（消耗 ${m.deadline_days * BUREAU.daily_cost} 两日常开支）`);
    console.log(`     你还剩 ${BUREAU.max_days - BUREAU.day} 天入冬。出完这趟还剩 ${BUREAU.max_days - BUREAU.day - m.deadline_days} 天。`);
    const confirm = await ask(`  确定出镖？(y/n): `);
    if (confirm.trim().toLowerCase() === "y") {
      await runMission(m);
      await ask("  [回车继续]");
    }
  }
}

// ============================================================
// 主菜单
// ============================================================

async function mainMenu() {
  while (true) {
    // 检查游戏结束
    if (BUREAU.day >= BUREAU.max_days) {
      printSep();
      console.log("  ❄️  入冬了。最后一波旺季结束。\n");
      const final = BUREAU.money - BUREAU.debt;
      if (final >= 0) {
        console.log(`  💰 结余: ${BUREAU.money} - ${BUREAU.debt}(还债) = ${final} 两`);
        console.log(`  📈 声望: ${BUREAU.reputation}`);
        console.log(`\n  义信镖局撑过了这个秋天。${final > 50 ? "还算宽裕。" : "但日子紧巴巴的。"}`);
      } else {
        console.log(`  💰 银两: ${BUREAU.money}，欠债: ${BUREAU.debt}`);
        console.log(`  🚨 还不上债。漕帮的人来敲门了……`);
        console.log(`\n  义信镖局没能撑过这个冬天。`);
      }
      printSep();
      rl.close();
      return;
    }

    if (BUREAU.money <= 0) {
      printSep();
      console.log("  🚨 银两耗尽。镖师们散了。义信镖局关门大吉。");
      printSep();
      rl.close();
      return;
    }

    showStatus();
    console.log("  ┌────────────────────────────────────────┐");
    console.log("  │  1. 过一天（日常事件） -3两             │");
    console.log("  │  2. 查看/修改规矩                      │");
    console.log("  │  3. 查看镖师                           │");
    console.log("  │  4. 出镖                               │");
    console.log("  │  5. 退出                               │");
    console.log("  └────────────────────────────────────────┘");

    const choice = await ask("  > ");

    switch (choice.trim()) {
      case "1": {
        const event = pickDailyEvent();
        await runDailyEvent(event);
        await ask("  [回车继续]");
        break;
      }
      case "2": {
        await editRules();
        break;
      }
      case "3": {
        showEscorts();
        await ask("  [回车继续]");
        break;
      }
      case "4": {
        await chooseMission();
        break;
      }
      case "5": {
        rl.close();
        return;
      }
    }
  }
}

// ============================================================
// 入口
// ============================================================

async function main() {
  console.clear();
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║                                                      ║
  ║        镖 局 风 云  ·  原 型 v3                      ║
  ║                                                      ║
  ╠══════════════════════════════════════════════════════╣
  ║  你有 30 天。入冬前要还清 100 两欠债。               ║
  ║  每天消耗 3 两。你现在有 180 两。                    ║
  ║  不出镖就坐吃山空。出镖没准备好就血本无归。          ║
  ╚══════════════════════════════════════════════════════╝
  `);

  // 显示 LLM 配置信息
  const keyHint = API_KEY ? `${API_KEY.slice(0, 8)}...` : "未设置";
  console.log(`  ⚙️  LLM 后端: ${BACKEND.toUpperCase()} | 模型: ${MODEL}`);
  if (BACKEND === "openrouter") {
    console.log(`  🔑 API Key: ${keyHint}`);
  }
  console.log();

  console.log("  玩法：");
  console.log("  · 过日常 → 观察镖师行为 → 发现问题");
  console.log("  · 改规矩 → 但槽位有限（总3条+每人2条），需要取舍");
  console.log("  · 出镖 → 规矩好=结果好，规矩差/盲区=出问题");
  console.log("  · 注意：和性格冲突大的规矩，镖师可能不听！");
  console.log("  · 注意：每天都在花钱！不能无限练兵！");
  console.log();

  await ask("  [回车开始]");
  await mainMenu();
}

main().catch(console.error);
