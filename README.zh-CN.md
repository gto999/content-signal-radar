# Content Signal Radar · 内容信号雷达

> 不是新闻摘要，是一套基于你的订阅源的决策系统。

从 [follow-builders](https://github.com/zarazhangrui/follow-builders) fork 而来，但从骨架到逻辑已经完全重写，解决的是一组不同的问题。

[English](./README.md)

## 它做什么

每天通过 GitHub Actions 自动运行。从多个信源拉取内容，评分过滤噪音，生成结构化信号报告，可输出到 stdout、Telegram、dashboard 或 repo 归档。它帮你判断：

- 今天值得关注什么？
- 哪些角度适合发 X？
- 哪些方向可以做小红书选题？
- 哪些变化值得影响产品或工作流判断？
- 今天的下一步具体该干什么？

## 支持的信源

| 类型 | 抓取方式 |
|------|----------|
| X（推特） | RSS via nitter 实例 |
| 博客 / 邮件订阅 | RSS |
| 播客 | RSS |
| 即刻 | API |
| 微信公众号 | wewe-rss |

信源分两个文件：`config/default-sources.json`（公开，版本控制）和 `config/custom-sources.json`（私有，git-ignored）。你自己的账号加在 custom 文件里。

## 运行流程

```
拉取 feeds
  → 去重（seen-signals，按上海时区每天清零）
  → 信号评分（focusTopics × contentGoals × scoring 配置）
  → 生成摘要（分平台输出：X 草稿、小红书选题、产品信号）
  → 输出到 stdout / Telegram
  → 写入 dashboard-signals.json（供 dashboard 集成）
  → 提交 feed 状态回 repo
```

核心脚本：
- `scripts/generate-feed.js` — 拉取并去重所有信源
- `scripts/prepare-digest.js` — 评分、分栏、格式化报告
- `scripts/deliver.js` — 推送到 Telegram

## 配置方式

把 `config/maple.config.example.json` 复制为 `config/maple.config.json`（已 git-ignored）。

关键字段：
```json
{
  "focusTopics": ["AI agents", "创作者经济", "个人品牌"],
  "contentGoals": ["X 发帖草稿", "小红书选题", "产品信号"],
  "outputSections": ["signals", "x-drafts", "xiaohongshu", "product"],
  "scoring": {
    "minScore": 3,
    "boostKeywords": ["agent", "workflow", "创作者"]
  }
}
```

完整 schema 见 `config/config-schema.json`

## 部署步骤

1. Fork 本仓库
2. 添加 feed 生成所需的 repository secrets：
   - `X_BEARER_TOKEN`
   - `SUPADATA_API_KEY`
3. 本地生成报告 / 推送时，把 `config/maple.config.example.json` 复制到 `~/.content-signal-radar/config.json`
4. 私有信源添加到 `~/.content-signal-radar/custom-sources.json`（参考 `config/custom-sources.example.json`）
5. GitHub Actions 会根据 `.github/workflows/generate-feed.yml` 每天自动运行一次

可选：Telegram 推送需要在 `~/.content-signal-radar/.env` 中配置 `TELEGRAM_BOT_TOKEN`，并在本地 config 里设置 `delivery.chatId`。

输出样例见 `examples/sample-digest.md`

## 输出格式

| 输出 | 说明 |
|------|------|
| stdout / Telegram | 取决于 delivery 配置的结构化信号报告 |
| `dashboard-signals.json` | 结构化信号数据，供外部集成使用 |
| `output/` | 启用时用于保存历史报告 |

## 致谢

原项目：[zarazhangrui/follow-builders](https://github.com/zarazhangrui/follow-builders)
本 fork 方向：从通用摘要转向信号提炼，服务于内容创作和产品决策。
