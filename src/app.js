// ============================================================
// 渲染层 — 屏幕路由、DOM 操作、打字机效果
// ============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── 屏幕切换 ───

function showScreen(id) {
  $$(".screen").forEach(s => s.classList.remove("active"));
  $(`#screen-${id}`).classList.add("active");
}

// ─── Login Screen ───

(function initLogin() {
  const keyInput = $("#api-key-input");
  const modelSelect = $("#model-select");
  const btnEnter = $("#btn-enter");
  const errorEl = $("#login-error");
  const hintEl = $("#saved-key-hint");

  // 恢复保存的配置
  const savedKey = localStorage.getItem("openrouter_key") || "";
  const savedModel = localStorage.getItem("llm_model") || "";

  if (savedKey) {
    keyInput.value = savedKey;
    hintEl.textContent = `已保存: ${savedKey.slice(0, 12)}... (点击按钮重新验证)`;
  }
  if (savedModel) {
    modelSelect.value = savedModel;
  }

  btnEnter.addEventListener("click", async () => {
    const key = keyInput.value.trim();
    const model = modelSelect.value;

    if (!key) {
      errorEl.textContent = "请输入 API Key";
      return;
    }

    if (!key.startsWith("sk-or-")) {
      errorEl.textContent = "格式错误：OpenRouter Key 应以 sk-or- 开头";
      return;
    }

    // 显示加载状态
    btnEnter.querySelector(".btn-text").style.display = "none";
    btnEnter.querySelector(".btn-loading").style.display = "inline";
    btnEnter.disabled = true;
    errorEl.textContent = "";

    // 配置 LLM
    llm.configure(key, model);

    // 严格验证 key + 余额
    const result = await llm.validateKey();
    if (!result.valid) {
      errorEl.textContent = result.error;
      btnEnter.querySelector(".btn-text").style.display = "inline";
      btnEnter.querySelector(".btn-loading").style.display = "none";
      btnEnter.disabled = false;
      return;
    }

    // 显示余额信息
    if (result.credits !== null && result.credits !== undefined) {
      hintEl.textContent = `✓ 验证通过 | 余额: $${result.credits.toFixed(3)}`;
      hintEl.style.color = "var(--accent)";
    } else {
      hintEl.textContent = `✓ 验证通过 | 已用: $${(result.usage || 0).toFixed(3)}`;
      hintEl.style.color = "var(--accent)";
    }

    // 保存配置
    localStorage.setItem("openrouter_key", key);
    localStorage.setItem("llm_model", model);

    // 短暂显示验证结果后进入游戏
    await new Promise(r => setTimeout(r, 800));

    // 进入游戏
    showScreen("game");
    initGame();
  });

  // 回车触发
  keyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnEnter.click();
  });
})();

// ─── Game Screen ───

let isProcessing = false;

function initGame() {
  updateStatusBar();
  updateSidebar();
  bindActionButtons();
}

function updateStatusBar() {
  const b = engine.bureau;
  $("#status-day").textContent = `第 ${b.day}/${b.max_days} 天`;
  $("#status-money").textContent = `💰 ${b.money} 两`;
  $("#status-debt").textContent = `📋 欠债 ${b.debt} 两`;
  $("#status-rep").textContent = `📈 声望 ${b.reputation}`;

  const projected = engine.getProjectedBalance();
  if (projected < 0) {
    $("#status-warning").textContent = `⚠ 预计破产`;
  } else {
    $("#status-warning").textContent = "";
  }
}

function updateSidebar() {
  // Escorts panel
  const escortsHtml = ESCORTS.map(e => {
    const rules = engine.personalRules[e.name];
    const rulesText = rules.length === 0
      ? '<span class="dim">暂无规矩</span>'
      : rules.map(id => {
          const w = engine.getComplianceWarning(id, e);
          const warn = w ? ` <span style="color:var(--warning)">(${w.compliance}%)</span>` : "";
          return engine.getRuleText(id) + warn;
        }).join("<br>");

    return `
      <div class="escort-card">
        <div class="escort-name">【${e.name}】${e.title}</div>
        <div class="escort-tags">${e.tags.join(" · ")}</div>
        <div class="stat-bar"><span class="stat-label">口</span><div class="bar"><div class="bar-fill" style="width:${e.speech}%"></div></div></div>
        <div class="stat-bar"><span class="stat-label">武</span><div class="bar"><div class="bar-fill" style="width:${e.combat}%"></div></div></div>
        <div class="stat-bar"><span class="stat-label">胆</span><div class="bar"><div class="bar-fill" style="width:${e.courage}%"></div></div></div>
        <div class="stat-bar"><span class="stat-label">义</span><div class="bar"><div class="bar-fill" style="width:${e.loyalty}%"></div></div></div>
        <div class="escort-rules">${rulesText}</div>
      </div>`;
  }).join("");
  $("#escorts-panel").innerHTML = `<h3>镖师</h3>${escortsHtml}`;

  // Rules panel
  const rulesHtml = engine.bureauRules.length === 0
    ? '<li class="dim">暂无规矩</li>'
    : engine.bureauRules.map(id => `<li>${engine.getRuleText(id)}</li>`).join("");
  $("#rules-count").textContent = `(${engine.bureauRules.length}/3)`;
  $("#rules-list").innerHTML = rulesHtml;
}

function bindActionButtons() {
  $$(".btn-action").forEach(btn => {
    btn.addEventListener("click", () => {
      if (isProcessing) return;
      const action = btn.dataset.action;
      handleAction(action);
    });
  });
}

async function handleAction(action) {
  // 检查游戏结束
  const over = engine.isGameOver();
  if (over) {
    appendNarrative(`<hr class="separator"><p style="color:var(--gold);font-size:16px">${engine.getEndingText()}</p>`);
    disableActions();
    return;
  }

  switch (action) {
    case "daily": await handleDaily(); break;
    case "rules": showRulesModal(); break;
    case "escorts": showEscortsModal(); break;
    case "mission": showMissionModal(); break;
  }
}

// ─── Daily Event ───

async function handleDaily() {
  isProcessing = true;
  disableActions();

  const event = engine.pickDailyEvent();
  const activeRules = engine.getActiveRelevantRules(event);

  // 显示事件信息
  let html = `<hr class="separator">`;
  html += `<div class="event-title">☀️ 第 ${engine.bureau.day} 天 · ${event.title} <span class="event-category">(${event.category})</span></div>`;
  html += `<p>${event.description}</p>`;

  if (activeRules.length > 0) {
    html += `<div class="event-rules">📋 相关规矩: ${activeRules.map(id => engine.getRuleText(id)).join("、")}</div>`;
  } else {
    html += `<div class="event-rules" style="border-color:var(--warning)">📋 无相关规矩生效（镖师将按性格自由行事）</div>`;
  }
  appendNarrative(html);

  // 调用 LLM
  showLoading(true);
  try {
    const messages = engine.buildDailyPrompt(event);
    const result = await llm.chatStream(messages, 0.9, (chunk, full) => {
      updateStreamingText(full);
    });
    finalizeStreamingText(result);
  } catch (e) {
    appendNarrative(`<p style="color:var(--danger)">[LLM 调用失败: ${e.message}]</p>`);
  }
  showLoading(false);

  // 扣费
  engine.applyDailyCost();
  appendNarrative(`<div class="event-cost">💰 日常开销 -${engine.bureau.daily_cost} 两（剩余 ${engine.bureau.money} 两）</div>`);

  updateStatusBar();
  updateSidebar();
  isProcessing = false;
  enableActions();

  // 检查游戏结束
  if (engine.isGameOver()) {
    appendNarrative(`<hr class="separator"><p style="color:var(--gold);font-size:16px">${engine.getEndingText()}</p>`);
    disableActions();
  }
}

// ─── Mission ───

function showMissionModal() {
  const html = `
    <h2>📋 可接任务</h2>
    ${MISSIONS.map((m, i) => `
      <div class="mission-card" data-idx="${i}">
        <div class="mission-title">${m.title}（${m.difficulty}）</div>
        <div class="mission-detail">委托: ${m.client} | 报酬: ${m.reward}两 | 违约赔: ${m.penalty}两</div>
        <div class="mission-detail">期限: ${m.deadline_days}天 | 货物: ${m.cargo.type}(${m.cargo.value}两)</div>
        <div class="mission-risk">风险: ${m.route_risks.map(r => `${r.location}-${r.threat}(${r.likelihood})`).join(" | ")}</div>
        <div class="mission-detail" style="color:var(--text)">${m.special}</div>
      </div>
    `).join("")}
    <div class="modal-actions">
      <button class="btn-modal" onclick="closeModal()">返回</button>
    </div>
  `;
  showModal(html);

  // 绑定任务选择
  $$(".mission-card").forEach(card => {
    card.addEventListener("click", async () => {
      const idx = parseInt(card.dataset.idx);
      const mission = MISSIONS[idx];
      closeModal();
      await handleMission(mission);
    });
  });
}

async function handleMission(mission) {
  isProcessing = true;
  disableActions();

  let html = `<hr class="separator">`;
  html += `<div class="event-title">🚩 出镖：${mission.title}</div>`;
  html += `<p>委托: ${mission.client} | 货: ${mission.cargo.type}(${mission.cargo.value}两)</p>`;
  html += `<p>报酬: ${mission.reward}两 | 违约: ${mission.penalty}两 | 期限: ${mission.deadline_days}天</p>`;
  html += `<p style="color:var(--danger)">风险: ${mission.route_risks.map(r => `${r.location}-${r.threat}(${r.likelihood})`).join(" | ")}</p>`;
  html += `<p class="dim">镖队出发了……</p>`;
  appendNarrative(html);

  // 推演
  showLoading(true);
  try {
    const messages = engine.buildMissionPrompt(mission);
    const result = await llm.chatStream(messages, 0.85, (chunk, full) => {
      updateStreamingText(full);
    });
    finalizeStreamingText(result);

    // 复盘
    appendNarrative(`<div class="event-title">📊 策略复盘</div>`);
    const reviewMessages = engine.buildReviewPrompt(messages, result);
    const review = await llm.chatStream(reviewMessages, 0.6, (chunk, full) => {
      updateStreamingText(full);
    });
    finalizeStreamingText(review);
  } catch (e) {
    appendNarrative(`<p style="color:var(--danger)">[LLM 调用失败: ${e.message}]</p>`);
  }
  showLoading(false);

  // 更新状态
  engine.applyMissionResult(mission);
  updateStatusBar();
  updateSidebar();
  isProcessing = false;
  enableActions();

  if (engine.isGameOver()) {
    appendNarrative(`<hr class="separator"><p style="color:var(--gold);font-size:16px">${engine.getEndingText()}</p>`);
    disableActions();
  }
}

// ─── Rules Modal ───

function showRulesModal() {
  let html = `<h2>📜 规矩管理</h2>`;

  // 总规矩
  html += `<h3 style="color:var(--accent);margin:12px 0 8px">镖局总规矩 (${engine.bureauRules.length}/3)</h3>`;
  const available = engine.getAvailableBureauRules();
  html += available.map(opt => {
    const selected = engine.bureauRules.includes(opt.id);
    return `<div class="rule-option ${selected ? 'selected' : ''}" data-type="bureau" data-id="${opt.id}">
      <span class="rule-check">${selected ? '✓' : '○'}</span>
      <span class="rule-text">${opt.text}</span>
    </div>`;
  }).join("");

  // 个人规矩
  for (const e of ESCORTS) {
    const rules = engine.personalRules[e.name];
    html += `<h3 style="color:var(--accent);margin:16px 0 8px">【${e.name}】的规矩 (${rules.length}/2)</h3>`;
    html += PERSONAL_RULE_OPTIONS[e.name].map(opt => {
      const selected = rules.includes(opt.id);
      const conflict = engine.getComplianceWarning(opt.id, e);
      const warn = conflict ? `⚠️ 服从度${conflict.compliance}%` : "";
      return `<div class="rule-option ${selected ? 'selected' : ''}" data-type="personal" data-name="${e.name}" data-id="${opt.id}">
        <span class="rule-check">${selected ? '✓' : '○'}</span>
        <span class="rule-text">${opt.text}</span>
        ${warn ? `<span class="rule-warn">${warn}</span>` : ''}
      </div>`;
    }).join("");
  }

  html += `<div class="modal-actions">
    <button class="btn-modal primary" onclick="closeModal()">确定</button>
  </div>`;

  showModal(html);

  // 绑定规矩切换
  $$(".rule-option").forEach(el => {
    el.addEventListener("click", () => {
      const type = el.dataset.type;
      const id = el.dataset.id;

      let result;
      if (type === "bureau") {
        result = engine.toggleBureauRule(id);
      } else {
        result = engine.togglePersonalRule(el.dataset.name, id);
      }

      if (result.action === "full") {
        // 闪烁提示
        el.style.borderColor = "var(--danger)";
        setTimeout(() => el.style.borderColor = "", 500);
        return;
      }

      // 刷新 modal
      showRulesModal();
      updateSidebar();
    });
  });
}

// ─── Escorts Modal ───

function showEscortsModal() {
  let html = `<h2>镖师详情</h2>`;
  html += ESCORTS.map(e => {
    const rules = engine.personalRules[e.name];
    const rulesText = rules.length === 0
      ? "暂无规矩"
      : rules.map(id => {
          const w = engine.getComplianceWarning(id, e);
          return engine.getRuleText(id) + (w ? ` (服从度${w.compliance}%)` : "");
        }).join("、");

    return `
      <div style="margin:12px 0;padding:12px;border:1px solid var(--border)">
        <div style="color:var(--text-bright);font-size:14px">【${e.name}】${e.title}</div>
        <div style="color:var(--accent);font-size:12px;margin:4px 0">${e.tags.join(" · ")}</div>
        <div style="font-size:12px;margin:4px 0">口才${e.speech} 武力${e.combat} 胆量${e.courage} 义气${e.loyalty}</div>
        <div style="font-size:12px;color:var(--text-dim);margin:4px 0">${e.bio}</div>
        <div style="font-size:12px;margin:4px 0">行事: ${e.tendency}</div>
        <div style="font-size:12px;margin-top:6px;padding-top:6px;border-top:1px dashed var(--border)">规矩: ${rulesText}</div>
      </div>`;
  }).join("");

  html += `<div class="modal-actions">
    <button class="btn-modal" onclick="closeModal()">返回</button>
  </div>`;
  showModal(html);
}

// ─── UI 辅助 ───

function appendNarrative(html) {
  const content = $("#narrative-content");
  const div = document.createElement("div");
  div.className = "fade-in";
  div.innerHTML = html;
  content.appendChild(div);
  content.scrollTop = content.scrollHeight;
}

let streamingEl = null;

function updateStreamingText(text) {
  if (!streamingEl) {
    streamingEl = document.createElement("div");
    streamingEl.className = "event-body";
    $("#narrative-content").appendChild(streamingEl);
  }
  streamingEl.textContent = text;
  $("#narrative-content").scrollTop = $("#narrative-content").scrollHeight;
}

function finalizeStreamingText(finalText) {
  if (streamingEl) {
    streamingEl.innerHTML = formatNarrativeText(finalText);
    streamingEl = null;
  }
  $("#narrative-content").scrollTop = $("#narrative-content").scrollHeight;
}

function formatNarrativeText(text) {
  // 简单格式化：换行 → <br>，加粗标记
  return text
    .replace(/\n/g, "<br>")
    .replace(/\[([^\]]+)\]/g, '<span style="color:var(--accent)">[$1]</span>');
}

function showLoading(show) {
  $("#narrative-loading").style.display = show ? "block" : "none";
}

function showModal(html) {
  $("#modal-content").innerHTML = html;
  $("#modal-overlay").style.display = "flex";
}

function closeModal() {
  $("#modal-overlay").style.display = "none";
}

function disableActions() {
  $$(".btn-action").forEach(b => b.disabled = true);
}

function enableActions() {
  $$(".btn-action").forEach(b => b.disabled = false);
}

// ESC 关闭 modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// 外部链接用系统浏览器打开
document.addEventListener("click", (e) => {
  const link = e.target.closest("a[href^='http']");
  if (link) {
    e.preventDefault();
    // Electron 中通过 preload 暴露的 API 打开
    if (window.electronAPI && window.electronAPI.openExternal) {
      window.electronAPI.openExternal(link.href);
    } else {
      window.open(link.href, "_blank");
    }
  }
});
