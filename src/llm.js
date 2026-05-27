// ============================================================
// LLM 客户端 — 支持 OpenRouter + Ollama
// ============================================================

class LLMClient {
  constructor() {
    this.backend = "openrouter"; // "openrouter" | "ollama"
    this.apiKey = "";
    this.model = "deepseek/deepseek-chat-v3-0324";
    this.openrouterUrl = "https://openrouter.ai/api/v1/chat/completions";
    this.ollamaUrl = "http://localhost:11434";
  }

  configure({ backend, apiKey, model, ollamaUrl }) {
    this.backend = backend || "openrouter";
    if (apiKey) this.apiKey = apiKey;
    if (model) this.model = model;
    if (ollamaUrl) this.ollamaUrl = ollamaUrl;
  }

  // ─── 验证 ───

  async validate() {
    if (this.backend === "ollama") {
      return await this._validateOllama();
    }
    return await this._validateOpenRouter();
  }

  async _validateOpenRouter() {
    try {
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
      const info = data.data || data;
      const usage = Number(info.usage) || 0;
      const limit = info.limit != null ? Number(info.limit) : null;
      const remaining = (limit !== null && isFinite(limit)) ? (limit - usage) : null;

      if (remaining !== null && remaining < 0.01) {
        return {
          valid: false,
          error: `额度不足：已用 $${usage.toFixed(3)} / 限额 $${limit.toFixed(2)}，请充值`
        };
      }

      return {
        valid: true,
        credits: remaining,
        usage: usage,
        info: `余额: ${remaining !== null ? '$' + remaining.toFixed(3) : '无限额'}`
      };
    } catch (e) {
      if (e.name === "AbortError") {
        return { valid: false, error: "验证超时，请检查网络连接" };
      }
      return { valid: false, error: `网络错误: ${e.message}` };
    }
  }

  async _validateOllama() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      // 检查 Ollama 服务是否在运行
      const resp = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        return { valid: false, error: `Ollama 服务返回错误 (HTTP ${resp.status})` };
      }

      const data = await resp.json();
      const models = (data.models || []).map(m => m.name);

      // 检查目标模型是否已拉取
      const found = models.some(m => m === this.model || m.startsWith(this.model + ":"));

      if (!found) {
        const suggestion = models.length > 0 ? `\n可用模型: ${models.slice(0, 5).join(", ")}` : "";
        return {
          valid: false,
          error: `模型 "${this.model}" 未安装。请先运行: ollama pull ${this.model}${suggestion}`
        };
      }

      return { valid: true, info: `Ollama 就绪 · 模型: ${this.model}` };
    } catch (e) {
      if (e.name === "AbortError") {
        return { valid: false, error: "连接 Ollama 超时，请确认服务已启动 (ollama serve)" };
      }
      return { valid: false, error: `无法连接 Ollama (${this.ollamaUrl})：${e.message}` };
    }
  }

  // ─── Chat ───

  async chat(messages, temperature = 0.8) {
    if (this.backend === "ollama") {
      return await this._chatOllama(messages, temperature);
    }
    return await this._chatOpenRouter(messages, temperature);
  }

  async chatStream(messages, temperature = 0.8, onChunk) {
    if (this.backend === "ollama") {
      return await this._chatStreamOllama(messages, temperature, onChunk);
    }
    return await this._chatStreamOpenRouter(messages, temperature, onChunk);
  }

  // ─── OpenRouter ───

  async _chatOpenRouter(messages, temperature) {
    if (!this.apiKey) throw new Error("API Key 未设置");

    const resp = await fetch(this.openrouterUrl, {
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
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return content;
  }

  async _chatStreamOpenRouter(messages, temperature, onChunk) {
    if (!this.apiKey) throw new Error("API Key 未设置");

    const resp = await fetch(this.openrouterUrl, {
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

    return await this._readSSEStream(resp, onChunk);
  }

  // ─── Ollama ───

  async _chatOllama(messages, temperature) {
    const resp = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: { temperature, num_predict: 2000 }
      })
    });

    if (!resp.ok) {
      if (resp.status === 404) {
        throw new Error(`模型 "${this.model}" 不存在，请检查模型名称或运行 ollama pull ${this.model}`);
      }
      throw new Error(`Ollama 错误 (HTTP ${resp.status})`);
    }

    const data = await resp.json();
    let content = data.message?.content || "";
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return content;
  }

  async _chatStreamOllama(messages, temperature, onChunk) {
    const resp = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        options: { temperature, num_predict: 2000 }
      })
    });

    if (!resp.ok) {
      if (resp.status === 404) {
        throw new Error(`模型 "${this.model}" 不存在，请检查模型名称或运行 ollama pull ${this.model}`);
      }
      throw new Error(`Ollama 错误 (HTTP ${resp.status})`);
    }

    // Ollama uses newline-delimited JSON (not SSE)
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
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const chunk = parsed.message?.content || "";
          if (chunk) {
            full += chunk;
            if (onChunk) onChunk(chunk, full);
          }
        } catch { /* skip */ }
      }
    }

    full = full.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return full;
  }

  // ─── 工具 ───

  async _readSSEStream(resp, onChunk) {
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
        } catch { /* skip */ }
      }
    }

    full = full.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return full;
  }
}

const llm = new LLMClient();
