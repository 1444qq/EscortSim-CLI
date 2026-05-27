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
      // 10秒超时
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { "Authorization": `Bearer ${this.apiKey}` },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          return { valid: false, error: "API Key 无效，请检查后重试" };
        }
        return { valid: false, error: `验证请求失败 (HTTP ${resp.status})` };
      }

      const data = await resp.json();
      console.log("[LLM] /auth/key response:", JSON.stringify(data));

      const info = data.data || data;

      const usage = Number(info.usage) || 0;
      const limit = info.limit != null ? Number(info.limit) : null;
      const remaining = (limit !== null && isFinite(limit)) ? (limit - usage) : null;

      if (remaining !== null && remaining < 0.01) {
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
        credits: remaining,
        limit: limit,
        usage: usage,
        label: info.label || ""
      };
    } catch (e) {
      if (e.name === "AbortError") {
        return { valid: false, error: "验证超时，请检查网络连接" };
      }
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
