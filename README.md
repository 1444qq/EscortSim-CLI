# 镖局风云

一款模拟经营游戏。设定非严肃中国古代，你需要运营一个镖局，通过镖师管理、各方势力的协调，达成运镖任务。

主要玩法是给镖师设定各种处事的原则，以及镖局运行的规矩（Prompt），然后在无法微操的情况下派出镖师，和途中江湖各色人等交涉（LLM 对话）。最终会得出一个评价（Token 消耗、LLM 轮数）。系统会不断进化、成长、改变（System Rule）。

玩家会建立和镖师的感情，或者招募新的镖师，并通过 LLM 消耗 Token，生成他们的故事、形象、特点等。

---

## 快速开始

```bash
# 桌面应用（推荐）
npm install
npm run dev

# 或者命令行版
node main.js
```

也可直接安装：`dist/镖局风云 Setup 0.2.0.exe`

## 连接方式

| 方式 | 说明 |
|------|------|
| OpenRouter (BYOK) | 云端模型，需 API Key，支持免费/付费模型 |
| Ollama 本地 | 免费，需本机运行 Ollama 服务 |

游戏内可随时切换模型。

## 项目结构

```
electron/          — Electron 主进程
src/               — 游戏 UI + 逻辑
  ├── index.html   — 界面结构
  ├── style.css    — 像素终端风样式
  ├── app.js       — 渲染层
  ├── llm.js       — LLM 客户端（双后端）
  ├── game-data.js — 游戏数据
  └── game-engine.js — 状态机 + 规矩系统
assets/            — 立绘、字体
main.js            — CLI 版（保留）
design-history.md  — 设计决策演化记录
```

## 相关项目

- [EscortSim5.5](https://github.com/1444qq/EscortSim5.5-main) — UE5 正式版（4X 模拟经营）
