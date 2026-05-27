// ============================================================
// LLM 客户端 — OpenRouter API 调用
// ============================================================

class LLMClient {
  constructor() {
    this.apiKey = "";
    this.model = "deepseek/deepseek-chat-v3-0324";
    this.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
  }

  configure(apiKey, model) {
    this.apiKey = apiKey;
    if (model) this.model = model;
  }

  /**
   * 验证 API Key 有效性并检查余额
   * @returns {{ valid: boolean, error?: string, credits?: number, limit?: number, usage?: number }}
   */
  async validateKey() {
    try {
      // OpenRouter /auth/key 端点返回 key 信息（余额、用量等）
      const resp = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { "Authorization": `Bearer ${this.apiKey}` }
      });

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          return { valid: false, error: "API Key 无效，请检查后重试" };
        }
        return { valid: false, error: `验证请求失败 (${resp.status})` };
      }

      const data = await resp.json();
      const info = data.data || data;

      // 检查额度信息
      // OpenRouter 返回格式: { data: { label, usage, limit, is_free_tier, rate_limit } }
      const usage = info.usage ?? 0;       // 已用金额 (美元)
      const limit = info.limit ?? null;    // 额度上限 (null = 无限)
      const remaining = limit !== null ? (limit - usage) : Infinity;

      // 如果有额度限制且余量不足 $0.01（约几千 tokens），拒绝
      if (limit !== null && remaining < 0.01) {
        return {
          valid: false,
          error: `额度不足：已用 $${usage.toFixed(3)} / 限额 $${limit.toFixed(2)}，请充值`,
          credits: remaining,
          limit,
          usage
        };
      }

      return {
        valid: true,
        credits: remaining === Infinity ? null : remaining,
        limit: limit,
        usage: usage,
        label: info.label || ""
      };
    } catch (e) {
      return { valid: false, error: `网络错误: ${e.message}` };
    }
  }

  async chat(messages, temperature = 0.8) {
    if (!this.apiKey) throw new Error("API Key 未设置");

    const resp = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/escort-sim",
        "X-Title": "EscortSim"
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: 2000,
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API 错误 ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || "";
    // 清理 thinking tags
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return content;
  }

  async chatStream(messages, temperature = 0.8, onChunk) {
    if (!this.apiKey) throw new Error("API Key 未设置");

    const resp = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/escort-sim",
        "X-Title": "EscortSim"
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: 2000,
        stream: true,
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API 错误 ${resp.status}: ${err}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.choices?.[0]?.delta?.content || "";
          if (chunk) {
            full += chunk;
            if (onChunk) onChunk(chunk, full);
          }
        } catch { /* skip parse errors */ }
      }
    }

    // 清理 thinking tags
    full = full.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return full;
  }
}

const llm = new LLMClient();
