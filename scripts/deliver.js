#!/usr/bin/env node

// ============================================================================
// Follow Builders — Delivery Script
// ============================================================================
// Sends a digest to the user via their chosen delivery method.
// Supports: Telegram bot, Email (via Resend), or stdout (default).
//
// Usage:
//   echo "digest text" | node deliver.js
//   node deliver.js --message "digest text"
//   node deliver.js --file /path/to/digest.txt
//
// The script reads delivery config from ~/.content-signal-radar/config.json
// and API keys from ~/.content-signal-radar/.env
//
// Delivery methods:
//   - "telegram": sends via Telegram Bot API (needs TELEGRAM_BOT_TOKEN + chat ID)
//   - "email": sends via Resend API (needs RESEND_API_KEY + email address)
//   - "stdout" (default): just prints to terminal
// ============================================================================

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

// -- Constants ---------------------------------------------------------------

const USER_DIR = join(homedir(), '.content-signal-radar');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const ENV_PATH = join(USER_DIR, '.env');

// -- Read input --------------------------------------------------------------

// The digest text can come from stdin, --message flag, or --file flag
async function getDigestText() {
  const args = process.argv.slice(2);

  // Check --message flag
  const msgIdx = args.indexOf('--message');
  if (msgIdx !== -1 && args[msgIdx + 1]) {
    return args[msgIdx + 1];
  }

  // Check --file flag
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return await readFile(args[fileIdx + 1], 'utf-8');
  }

  // Read from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// -- Markdown → Telegram HTML -----------------------------------------------

// Telegram 仅支持有限 HTML 子集：<b>, <i>, <u>, <s>, <code>, <pre>,
// <a href="...">, <blockquote>, <tg-spoiler>。不支持 ## / ### / <sub> / --- 等。
// 此函数把 digest 的 Markdown 转换为 Telegram 友好的 HTML。
function mdToTelegramHtml(md) {
  // 1) 行级转换：先按行处理标题、引用、分隔符、列表
  const lines = md.split('\n');
  const out = [];
  let inBlockquote = false;
  let inList = false;

  const closeList = () => { if (inList) { inList = false; } };
  const closeBlockquote = () => {
    if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
  };

  for (let raw of lines) {
    const line = raw;

    // 分隔线 → 空行
    if (/^\s*-{3,}\s*$/.test(line)) {
      closeList();
      closeBlockquote();
      out.push('');
      continue;
    }

    // <sub>...</sub> → 去掉标签保留内容
    let processed = line.replace(/<\/?sub>/g, '');

    // 标题 # / ## / ### → <b>加粗 + emoji 装饰</b>
    let m;
    if ((m = processed.match(/^###\s+(.*)$/))) {
      closeList();
      closeBlockquote();
      out.push(`<b>▸ ${escapeHtml(m[1])}</b>`);
      continue;
    }
    if ((m = processed.match(/^##\s+(.*)$/)) {
      closeList();
      closeBlockquote();
      out.push('');
      out.push(`<b>━━ ${escapeHtml(m[1])} ━━</b>`);
      continue;
    }
    if ((m = processed.match(/^#\s+(.*)$/))) {
      closeList();
      closeBlockquote();
      out.push(`<b>${escapeHtml(m[1])}</b>`);
      continue;
    }

    // 引用 > xxx → <blockquote>
    if ((m = processed.match(/^>\s?(.*)$/)) {
      closeList();
      if (!inBlockquote) { out.push('<blockquote>'); inBlockquote = true; }
      out.push(escapeHtml(m[1]));
      continue;
    } else {
      closeBlockquote();
    }

    // 无序列表 - xxx / * xxx → • xxx
    if ((m = processed.match(/^\s*[-*]\s+(.*)$/))) {
      out.push(`• ${inlineMd(m[1])}`);
      inList = true;
      continue;
    } else {
      closeList();
    }

    // 空行原样保留
    if (processed.trim() === '') {
      out.push('');
      continue;
    }

    // 普通行：处理行内 markdown
    out.push(inlineMd(processed));
  }
  closeList();
  closeBlockquote();

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// 行内 markdown：加粗、斜体、链接、code。先转义再插标签。
function inlineMd(text) {
  // 先用占位符保护链接和 code，避免后续转义破坏
  const placeholders = [];
  const protect = (html) => {
    const key = `\u0000${placeholders.length}\u0000`;
    placeholders.push(html);
    return key;
  };

  // 行内 code: `xxx`
  text = text.replace(/`([^`]+)`/g, (_, c) =>
    protect(`<code>${escapeHtml(c)}</code>`));

  // 链接: [text](url)
  text = text.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (_, t, u) =>
    protect(`<a href="${escapeHtml(u)}">${escapeHtml(t)}</a>`));

  // 加粗 **xxx**
  text = text.replace(/\*\*([^*]+)\*\*/g, (_, t) =>
    protect(`<b>${escapeHtml(t)}</b>`));

  // 斜体 *xxx* 或 _xxx_
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, (_, pre, t) =>
    `${pre}${protect(`<i>${escapeHtml(t)}</i>`)}`);
  text = text.replace(/(^|\W)_([^_\n]+)_/g, (_, pre, t) =>
    `${pre}${protect(`<i>${escapeHtml(t)}</i>`)}`);

  // 其余字符转义
  text = escapeHtml(text);

  // 还原占位符（占位符本身是不变的 \u0000N\u0000，escapeHtml 不会破坏）
  text = text.replace(/\u0000(\d+)\u0000/g, (_, n) => placeholders[Number(n)]);
  return text;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// -- Telegram Delivery -------------------------------------------------------

// Sends the digest via Telegram Bot API.
// The user creates a bot via @BotFather and provides the token.
// The chat ID is obtained when the user sends their first message to the bot.
async function sendTelegram(text, botToken, chatId) {
  // 把 Markdown 转成 Telegram 友好的 HTML
  const html = mdToTelegramHtml(text);

  // Telegram 单条消息上限 4096 字符。按段落尽量长切。
  const MAX_LEN = 3800;
  const chunks = [];
  let remaining = html;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    // 优先在 </blockquote> 或 空行 处切，避免破坏标签
    let splitAt = -1;
    const candidates = [
      remaining.lastIndexOf('\n\n', MAX_LEN),
      remaining.lastIndexOf('</blockquote>', MAX_LEN),
      remaining.lastIndexOf('\n', MAX_LEN),
    ];
    for (const c of candidates) {
      if (c > MAX_LEN * 0.5) { splitAt = c; break; }
    }
    if (splitAt < 0) splitAt = MAX_LEN;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, '');
  }

  for (const chunk of chunks) {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // HTML 解析失败时降级为纯文本（去掉标签）重发
      if (err.description && err.description.includes("can't parse")) {
        const plain = chunk.replace(/<[^>]+>/g, '');
        await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: plain,
              disable_web_page_preview: true
            })
          }
        );
      } else {
        throw new Error(`Telegram API error: ${err.description || res.status}`);
      }
    }

    // 多条消息之间稍微停顿，避免触发 rate limit
    if (chunks.length > 1) await new Promise(r => setTimeout(r, 500));
  }
}

// -- Email Delivery (Resend) -------------------------------------------------

// Sends the digest via Resend's email API.
// The user provides their own Resend API key and email address.
async function sendEmail(text, apiKey, toEmail) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      from: 'AI Builders Digest <digest@resend.dev>',
      to: [toEmail],
      subject: `AI Builders Digest — ${new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      })}`,
      text: text
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend API error: ${err.message || JSON.stringify(err)}`);
  }
}

// -- Main --------------------------------------------------------------------

async function main() {
  // Load env and config
  loadEnv({ path: ENV_PATH });

  let config = {};
  if (existsSync(CONFIG_PATH)) {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  }

  const delivery = config.delivery || { method: 'stdout' };
  const digestText = await getDigestText();

  if (!digestText || digestText.trim().length === 0) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'Empty digest text' }));
    return;
  }

  try {
    switch (delivery.method) {
      case 'telegram': {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = delivery.chatId;
        if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not found in .env');
        if (!chatId) throw new Error('delivery.chatId not found in config.json');
        await sendTelegram(digestText, botToken, chatId);
        console.log(JSON.stringify({
          status: 'ok',
          method: 'telegram',
          message: 'Digest sent to Telegram'
        }));
        break;
      }

      case 'email': {
        const apiKey = process.env.RESEND_API_KEY;
        const toEmail = delivery.email;
        if (!apiKey) throw new Error('RESEND_API_KEY not found in .env');
        if (!toEmail) throw new Error('delivery.email not found in config.json');
        await sendEmail(digestText, apiKey, toEmail);
        console.log(JSON.stringify({
          status: 'ok',
          method: 'email',
          message: `Digest sent to ${toEmail}`
        }));
        break;
      }

      case 'stdout':
      default:
        // Just print to terminal — the agent or OpenClaw handles delivery
        console.log(digestText);
        break;
    }
  } catch (err) {
    console.log(JSON.stringify({
      status: 'error',
      method: delivery.method,
      message: err.message
    }));
    process.exit(1);
  }
}

main();
