# Token 经济系统设计 — 后续开发路线图

## Context

当前游戏的核心机制是"设定规矩 → 看结果 → 调整"，LLM 调用是固定模式（日常1轮、出镖2轮）。用户提出新设计方向：**Token 本身就是游戏资源**，玩家的目标是用尽量少的 Token 高效推进游戏。这把"写好 Prompt"从开发者问题变成了玩家乐趣。

## 核心设计理念

### 1. 任务解决的 Token 经济
- 玩家给出清晰、精准的规矩/策略 → AI 一两轮就解决 → 省 Token
- 玩家交代不清/前后矛盾/没定位问题 → AI 需要多轮澄清/走偏 → 费 Token
- 通过**可见的对话轮数**和**Token 消耗数字**让玩家感知代价
- 给出警告提示玩家"你的策略可能有盲区"

### 2. 镖师招募的 Token 经济
- 花费游戏内货币 + 声望 + Token 来招募新镖师
- Token 花得越多 → 角色设定越丰满（更多 bio、更复杂性格、更精细立绘）
- 给玩家"为角色买单"的感觉——投入越多越了解 TA

---

## 实现拆分（按优先级排序）

### Phase 1: Token 追踪基础设施
> 让 Token 消耗可见、可追踪

**改动文件:** `src/llm.js`, `src/app.js`, `src/style.css`

- [ ] **1.1** `llm.js` 的 `chat()` 和 `chatStream()` 解析 OpenRouter 返回的 `usage` 字段
  - OpenRouter 返回: `{ usage: { prompt_tokens, completion_tokens, total_tokens } }`
  - 累计到 `llm.sessionTokens` 和 `llm.sessionCost`
- [ ] **1.2** UI 顶部状态栏增加 Token 消耗显示
  - 格式: `🔥 消耗 12,340 tokens ($0.042)`
  - 每次 LLM 调用后实时更新
- [ ] **1.3** 每次叙事输出底部显示本次调用消耗
  - 格式: `[本次: 1,280 tokens · 第 1 轮]`

### Phase 2: 多轮对话机制（任务解决经济）
> 规矩不清时触发追加轮次，消耗更多 Token

**改动文件:** `src/game-engine.js`, `src/app.js`, `src/llm.js`

- [ ] **2.1** 改造 `buildDailyPrompt()` — LLM 可以返回"需要澄清"标记
  - System prompt 加入: 如果镖师的规矩对当前场景有明显盲区或矛盾，在回复末尾加 `[需要指示]` + 具体问题
  - 如果规矩完备 → 一轮结束，Token 最少
- [ ] **2.2** `handleDaily()` 检测 `[需要指示]` → 弹出选择/补充面板
  - 玩家可以: 选择临时补充指示（消耗第 2 轮）或 放手不管（镖师按性格行事，可能出问题但不多花 Token）
  - 选择后追加一轮 LLM 调用
- [ ] **2.3** 出镖任务改为**逐段推进**（取代一次性推演）
  - 每段路程 = 1 次 LLM 调用 + 可能的澄清轮
  - 玩家在中途可以调整策略（花 Token）或不管（省 Token 但风险大）
  - 轮数上限: 日常最多 3 轮，出镖每段最多 2 轮
- [ ] **2.4** Token 效率评分
  - 每次事件结束显示: "效率: ⭐⭐⭐ (1轮解决)" 或 "效率: ⭐ (3轮，策略有矛盾)"
  - 累计效率影响声望加成

### Phase 3: 镖师招募系统
> 用 Token 生成新角色

**新增文件:** `src/recruitment.js`
**改动文件:** `src/game-engine.js`, `src/game-data.js`, `src/app.js`, `src/style.css`

- [ ] **3.1** 招募入口 + 花费设计
  - 底部操作栏新增「招募」按钮
  - 花费: 50 两 + 20 声望 + Token（由生成深度决定）
  - 三档:
    - 简略 (~500 tokens): 名字 + 基础属性 + 1 个 tag + 简短 bio
    - 标准 (~1500 tokens): 完整属性 + 3 tags + tendency + 完整 bio + 个人规矩选项
    - 精细 (~3000 tokens): 标准 + 详细前史 + 人际关系 + 独特事件线 + 生成 SVG 立绘
- [ ] **3.2** 角色生成 Prompt 设计
  - System prompt 约束输出为 JSON 格式: `{ name, title, stats, tags, tendency, bio, personalRules }`
  - 玩家可以给提示词（想要什么类型的人）→ 影响生成方向
  - 生成后展示角色卡 → 玩家确认招募或放弃
- [ ] **3.3** SVG 立绘生成（精细档）
  - 用 LLM 生成角色外貌描述 → 再用第二轮生成 SVG 代码
  - 参考现有三张 SVG 风格（水墨简笔，绿色线条，深色背景适配）
  - 生成的 SVG 存入 `assets/portraits/generated/`
- [ ] **3.4** 动态镖师管理
  - `ESCORTS` 从常量改为动态数组
  - 招募的镖师存入 localStorage
  - 出镖时选择带哪些镖师（最多 3 人）
  - 个人规矩选项也由 LLM 生成（与角色性格匹配的 5 条）

### Phase 4: 策略警告系统
> 在消耗 Token 前提醒玩家优化

**改动文件:** `src/game-engine.js`, `src/app.js`

- [ ] **4.1** 出发前策略检查
  - 出镖前分析: 任务风险点 vs 已设规矩 → 标出"盲区"
  - 显示: "⚠️ 此任务可能遭遇官府盘查，但你没有设定相关规矩" 
  - 不阻止出发，但让玩家知道可能多花 Token
- [ ] **4.2** 规矩冲突预警
  - 如果总规矩和个人规矩矛盾 → 预警
  - 如果性格服从度 <40% 的规矩被选 → 强调"这条规矩大概率不会被执行"
- [ ] **4.3** Token 预算提示
  - 出镖前预估 Token 消耗范围: "预计消耗 2,000~5,000 tokens"
  - 基于: 路程段数 × 每段平均消耗 × 盲区系数

### Phase 5: 存档 + Token 统计面板
> 持久化 + 数据可视化

**新增文件:** `src/save.js`
**改动文件:** `src/app.js`, `src/index.html`

- [ ] **5.1** localStorage 存档
  - 保存: bureau状态、规矩、已招募镖师、Token 累计消耗
  - 自动存档（每次事件结束后）
  - 手动存档槽位 × 3
- [ ] **5.2** Token 统计面板
  - 可视化: 总消耗、各类消耗占比（日常/出镖/招募）
  - 效率趋势: 随游戏天数推进，每天平均 Token 消耗变化
  - 对比: "你的效率 vs 平均水平"（如果后续有多人数据）

---

## 技术要点

### OpenRouter Token 追踪
```javascript
// OpenRouter 非 streaming 返回:
{ choices: [...], usage: { prompt_tokens: 800, completion_tokens: 400, total_tokens: 1200 } }

// Streaming 模式: 最后一个 chunk 的 data 或通过 X-Ratelimit headers
// 备选: 调用结束后再查一次 /auth/key 计算差值
```

### 多轮检测标记
```
LLM 回复末尾:
[状态: 已解决]      → 不追加轮次
[需要指示: 具体问题]  → 触发玩家输入 → 追加轮次
```

### 角色生成 JSON Schema
```json
{
  "name": "string",
  "title": "string", 
  "speech": 0-100,
  "combat": 0-100,
  "courage": 0-100,
  "loyalty": 0-100,
  "tags": ["string", "string", "string"],
  "tendency": "string",
  "bio": "string",
  "personalRules": [{ "id": "string", "text": "string" }]
}
```

---

## 建议实施顺序

```
Phase 1 (Token 追踪)     → 1-2 天，基础设施
Phase 2 (多轮对话)       → 2-3 天，核心玩法改造
Phase 4 (策略警告)       → 1 天，体验优化
Phase 3 (镖师招募)       → 2-3 天，内容扩展
Phase 5 (存档+统计)      → 1-2 天，收尾打磨
```

Phase 1 是一切的基础（没有追踪就没有经济）。
Phase 2 是核心乐趣改造（让"写好策略"有了游戏性回报）。
Phase 3 是内容深度（让玩家有长期追求）。

---

## 验证标准

- Phase 1 完成后: 每次 LLM 调用后 UI 显示 Token 消耗数字
- Phase 2 完成后: 日常事件中，规矩完备时 1 轮解决，有盲区时弹出"需要指示"
- Phase 3 完成后: 能花钱招募新镖师，生成的角色有唯一性格和（可选）立绘
- Phase 4 完成后: 出镖前能看到盲区提醒和 Token 预估
