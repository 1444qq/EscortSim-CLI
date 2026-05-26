# 镖局风云 CLI

> 文字交互版原型 — AI 驱动的镖局经营 + 交涉策略游戏

## 快速开始

```bash
# 1. 配置 API Key (BYOK)
cp .env.example .env
# 编辑 .env，填入你的 OpenRouter key

# 2. 运行
node main.js
```

也可以不配 key，直接跑本地 Ollama（需要先启动 Ollama 服务）。

## LLM 后端

| 后端 | 默认模型 | 说明 |
|------|---------|------|
| OpenRouter | `deepseek/deepseek-chat-v3-0324` | 有 key 自动启用，便宜且中文强 |
| Ollama 本地 | `qwen3-coder:30b` | 无 key 时自动回退，免费但需本地显卡 |

环境变量覆盖：

```bash
LLM_MODEL=anthropic/claude-sonnet-4 node main.js   # 换模型
LLM_BACKEND=ollama node main.js                      # 强制本地
```

## 玩法

- 你经营一家镖局，30 天内还清 100 两欠债
- 通过**设定规矩**间接控制三个性格迥异的镖师
- 日常事件观察镖师行为 → 调整规矩 → 出镖验证
- 规矩槽位有限（总 3 + 每人 2），需要取舍
- 和性格冲突大的规矩，镖师可能不听

## 文件说明

```
main.js           — 游戏主程序（~900行）
package.json      — Node.js 配置
.env.example      — API Key 配置模板
design-history.md — 设计决策演化记录
```

## 相关项目

- [EscortSim5.5](https://github.com/1444qq/EscortSim5.5-main) — UE5 正式版（4X 模拟经营）
