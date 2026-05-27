// ============================================================
// 游戏引擎 — 状态管理 + 规矩系统 + Prompt 构建
// ============================================================

class GameEngine {
  constructor() {
    this.bureau = { ...INITIAL_BUREAU };
    this.bureauRules = [];
    this.personalRules = { "铁嘴张": [], "莽夫李": [], "柳如烟": [] };
  }

  // ─── 查询 ───

  getRuleText(id) {
    const br = BUREAU_RULE_OPTIONS.find(r => r.id === id);
    if (br) return br.text;
    for (const opts of Object.values(PERSONAL_RULE_OPTIONS)) {
      const pr = opts.find(r => r.id === id);
      if (pr) return pr.text;
    }
    return id;
  }

  getComplianceWarning(ruleId, escort) {
    const conflict = COMPLIANCE_CONFLICTS[ruleId];
    if (!conflict) return null;
    if (escort.tags.includes(conflict.with_tag)) return conflict;
    return null;
  }

  getAvailableBureauRules() {
    return BUREAU_RULE_OPTIONS.filter(opt => {
      for (const selected of this.bureauRules) {
        const selectedOpt = BUREAU_RULE_OPTIONS.find(o => o.id === selected);
        if (selectedOpt.conflicts.includes(opt.id)) return false;
      }
      return true;
    });
  }

  isGameOver() {
    if (this.bureau.day > this.bureau.max_days) return "time";
    if (this.bureau.money <= 0) return "broke";
    return false;
  }

  getEndingText() {
    const reason = this.isGameOver();
    if (reason === "time") {
      const final = this.bureau.money - this.bureau.debt;
      if (final >= 0) {
        return `入冬了。结余 ${final} 两。义信镖局撑过了这个秋天。${final > 50 ? "还算宽裕。" : "但日子紧巴巴的。"}`;
      } else {
        return `入冬了。还不上债。漕帮的人来敲门了……义信镖局没能撑过这个冬天。`;
      }
    }
    if (reason === "broke") {
      return `银两耗尽。镖师们散了。义信镖局关门大吉。`;
    }
    return "";
  }

  getDaysLeft() {
    return this.bureau.max_days - this.bureau.day;
  }

  getProjectedBalance() {
    return this.bureau.money - (this.getDaysLeft() * this.bureau.daily_cost) - this.bureau.debt;
  }

  // ─── 规矩操作 ───

  toggleBureauRule(id) {
    if (this.bureauRules.includes(id)) {
      this.bureauRules = this.bureauRules.filter(r => r !== id);
      return { action: "removed" };
    }
    if (this.bureauRules.length >= 3) {
      return { action: "full" };
    }
    this.bureauRules.push(id);
    return { action: "added" };
  }

  togglePersonalRule(name, id) {
    const rules = this.personalRules[name];
    if (rules.includes(id)) {
      this.personalRules[name] = rules.filter(r => r !== id);
      return { action: "removed" };
    }
    if (rules.length >= 2) {
      return { action: "full" };
    }
    this.personalRules[name].push(id);
    return { action: "added" };
  }

  clearBureauRules() {
    this.bureauRules = [];
  }

  clearPersonalRules(name) {
    this.personalRules[name] = [];
  }

  // ─── 事件 ───

  pickDailyEvent() {
    const idx = Math.floor(Math.random() * DAILY_EVENTS.length);
    return DAILY_EVENTS[idx];
  }

  applyDailyCost() {
    this.bureau.money -= this.bureau.daily_cost;
    this.bureau.day++;
  }

  applyMissionResult(mission) {
    this.bureau.money -= (mission.deadline_days * this.bureau.daily_cost);
    this.bureau.money += Math.round(mission.reward * 0.6);
    this.bureau.reputation += 3;
    this.bureau.day += mission.deadline_days;
  }

  getActiveRelevantRules(event) {
    return event.relevant_rules.filter(id =>
      this.bureauRules.includes(id) ||
      Object.values(this.personalRules).some(arr => arr.includes(id))
    );
  }

  // ─── Prompt 构建 ───

  buildRulesContext() {
    let text = "## 镖局总规矩\n";
    if (this.bureauRules.length === 0) {
      text += "无。镖师按自己性格行事。\n";
    } else {
      text += this.bureauRules.map(id => `- ${this.getRuleText(id)}`).join("\n") + "\n";
    }

    text += "\n## 镖师个人规矩与服从度\n";
    for (const e of ESCORTS) {
      const rules = this.personalRules[e.name];
      text += `【${e.name}】性格：${e.tags.join("、")}，行事：${e.tendency}\n`;
      if (rules.length === 0) {
        text += `  规矩：无，完全按性格行事\n`;
      } else {
        for (const ruleId of rules) {
          const conflict = this.getComplianceWarning(ruleId, e);
          if (conflict) {
            text += `  规矩：${this.getRuleText(ruleId)}（⚠️ 和性格「${conflict.with_tag}」冲突，服从度${conflict.compliance}%，${conflict.resist_text}）\n`;
          } else {
            text += `  规矩：${this.getRuleText(ruleId)}（服从度高，会认真执行）\n`;
          }
        }
      }
    }
    return text;
  }

  buildDailyPrompt(event) {
    return [
      {
        role: "system",
        content: `你是一个武侠世界镖局日常的叙事引擎。模拟镖师们如何应对日常小事件。

${this.buildRulesContext()}

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
  }

  buildMissionPrompt(mission) {
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
${this.bureau.name}，银两${this.bureau.money}两，声望${this.bureau.reputation}/100。日消耗${this.bureau.daily_cost}两。
欠债${this.bureau.debt}两即将到期。只剩${this.getDaysLeft()}天入冬。

${this.buildRulesContext()}

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

    return [
      { role: "system", content: sysPrompt },
      { role: "user", content: "开始推演。" }
    ];
  }

  buildReviewPrompt(missionMessages, result) {
    return [
      ...missionMessages,
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
  }
}

const engine = new GameEngine();
