# Content Signal Radar

> Not a news digest. A decision system built on top of your feed.

Built from a fork of [follow-builders](https://github.com/zarazhangrui/follow-builders), but redesigned from the ground up to answer a different set of questions.

[中文文档](./README.zh-CN.md)

## What it does

Runs daily via GitHub Actions. Pulls signals from multiple source types, scores them, filters noise, and produces a structured signal report — ready for stdout, Telegram, dashboard integration, or repo-based archiving. It helps you decide:

- What should I pay attention to today?
- What can I write about on X?
- What can become a Xiaohongshu post?
- What should influence my product or workflow decisions?
- What's my concrete next action?

## Sources supported

| Type | Method |
|------|--------|
| X (Twitter) | RSS via nitter instances |
| Blogs / newsletters | RSS |
| Podcasts | RSS |
| 即刻 (Jike) | API |
| 公众号 (WeChat MP) | wewe-rss |

Sources are split into `config/default-sources.json` (public, version-controlled) and `config/custom-sources.json` (private, git-ignored). Add your own accounts in the custom file.

## How it works

```
fetch feeds
  → deduplicate (seen-signals with daily TTL reset, Asia/Shanghai timezone)
  → score signals (focusTopics × contentGoals × scoring config)
  → prepare digest (platform sections: X drafts, Xiaohongshu angles, product signals)
  → deliver via stdout / Telegram
  → write dashboard-signals.json (for dashboard integration)
  → commit feed state back to repo
```

Key scripts:
- `scripts/generate-feed.js` — fetches and deduplicates all sources
- `scripts/prepare-digest.js` — scores, sections, and formats the report
- `scripts/deliver.js` — pushes to Telegram

## Configuration

Copy `config/maple.config.example.json` → `config/maple.config.json` (git-ignored).

Key fields:
```json
{
  "focusTopics": ["AI agents", "creator economy", "personal brand"],
  "contentGoals": ["X post drafts", "Xiaohongshu topics", "product signals"],
  "outputSections": ["signals", "x-drafts", "xiaohongshu", "product"],
  "scoring": {
    "minScore": 3,
    "boostKeywords": ["agent", "workflow", "creator"]
  }
}
```

Full schema: `config/config-schema.json`

## Setup

1. Fork this repo
2. Add repository secrets used by feed generation:
   - `X_BEARER_TOKEN`
   - `SUPADATA_API_KEY`
3. For local report preparation / delivery, copy `config/maple.config.example.json` to `~/.content-signal-radar/config.json`
4. Add private sources to `~/.content-signal-radar/custom-sources.json` (see `config/custom-sources.example.json`)
5. GitHub Actions runs automatically once daily via `.github/workflows/generate-feed.yml`

Optional Telegram delivery uses `TELEGRAM_BOT_TOKEN` in `~/.content-signal-radar/.env` plus `delivery.chatId` in your local config.

See `examples/sample-digest.md` for a sample output.

## Output

| Output | Description |
|--------|-------------|
| stdout / Telegram | Structured signal report, depending on delivery config |
| `dashboard-signals.json` | Structured signal data for external integrations |
| `output/` | Historical reports committed to the repo when enabled |

## Credits

Original project: [zarazhangrui/follow-builders](https://github.com/zarazhangrui/follow-builders)
This fork: signal extraction over generic summarization, tuned for content + product decisions.
