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

  async validateKey() {
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { "Authorization": `Bearer ${this.apiKey}` }
      });
      return resp.ok;
    } catch {
      return false;
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
