// Shared page-body renderer — used by the static build AND the in-browser editor preview.
//
// Body = Markdown plus blocks:
//   ::: user / ::: assistant          AI conversation turns (rendered as a chat thread)
//   ::: note | tip | info | warning | danger | success   callouts
//   ::: toggle Some heading           collapsible section
//   ::: qa What is a hash map?        interview flashcard (answer hidden until clicked)
//   :::                               closes a block
import { renderMarkdown, escapeHtml as esc } from './markdown.js';

export const SOURCES = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok',
  copilot: 'Copilot',
  deepseek: 'DeepSeek',
  meta: 'Meta AI',
  mistral: 'Le Chat',
  other: 'AI',
};

const NEON = ['lime', 'cyan', 'pink', 'violet', 'orange', 'yellow'];
export const tagColor = (t) => NEON[[...String(t)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % NEON.length];

export const CALLOUTS = { note: '📝', tip: '💡', info: 'ℹ️', warning: '⚠️', danger: '🚨', success: '✅' };
const CHAT = new Set(['user', 'assistant']);
const KNOWN = new Set([...CHAT, ...Object.keys(CALLOUTS), 'toggle', 'qa']);

export function splitBlocks(body) {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const parts = [];
  let cur = { type: 'prose', arg: '', lines: [] };
  let fence = null;
  const flush = () => {
    const md = cur.lines.join('\n').trim();
    if (md || cur.type !== 'prose') parts.push({ type: cur.type, arg: cur.arg, md });
  };
  for (const line of lines) {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (!fence) fence = f[1];
      else if (line.trim().startsWith(fence)) fence = null;
    }
    if (!fence) {
      const open = line.match(/^:::\s*([a-zA-Z]+)\s*(.*)$/);
      if (open && cur.type === 'prose' && KNOWN.has(open[1].toLowerCase())) {
        flush();
        cur = { type: open[1].toLowerCase(), arg: open[2].trim(), lines: [] };
        continue;
      }
      if (/^:::\s*$/.test(line) && cur.type !== 'prose') {
        flush();
        cur = { type: 'prose', arg: '', lines: [] };
        continue;
      }
    }
    cur.lines.push(line);
  }
  flush();
  return parts;
}

export const sourceName = (meta = {}) => {
  const s = String(meta.source || '').toLowerCase();
  return meta.sourceName || SOURCES[s] || (s ? s : 'AI');
};

export function countPrompts(body) {
  return splitBlocks(body).filter((p) => p.type === 'user').length;
}

export function plainText(body) {
  return String(body || '')
    .replace(/^:::.*$/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\[\]()!|$\\{}-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function threadHtml(items, meta) {
  const src = String(meta.source || 'other').toLowerCase();
  const name = sourceName(meta);
  const prompts = items.filter((p) => p.type === 'user').length;
  let n = 0;
  const msgs = items
    .map((p) => {
      const id = `m${++n}`;
      const html = renderMarkdown(p.md);
      if (p.type === 'user')
        return `<div class="msg msg-user" id="${id}"><div class="msg-label">You</div><div class="bubble">${html}</div></div>`;
      if (p.type === 'assistant')
        return `<div class="msg msg-ai src-${esc(src)}" id="${id}"><div class="msg-label"><span class="dot"></span>${esc(name)}${meta.model ? ` <span class="muted">· ${esc(meta.model)}</span>` : ''}</div><div class="md">${html}</div></div>`;
      return calloutHtml({ ...p, type: 'note', arg: p.arg || "Author's note" }, 'msg');
    })
    .join('\n');
  return `<section class="thread">
<div class="thread-head"><span><span class="dot src-${esc(src)}"></span>Conversation with ${esc(name)} · ${prompts} ${prompts === 1 ? 'prompt' : 'prompts'}</span>${
    meta.shareUrl ? `<a href="${esc(meta.shareUrl)}" target="_blank" rel="noopener nofollow">View original ↗</a>` : ''
  }</div>
${msgs}
</section>`;
}

function calloutHtml(p, extra = '') {
  const icon = CALLOUTS[p.type] || '📝';
  return `<div class="callout callout-${p.type} ${extra}"><div class="callout-icon">${icon}</div><div class="callout-body">${
    p.arg ? `<div class="callout-title">${esc(p.arg)}</div>` : ''
  }<div class="md">${renderMarkdown(p.md)}</div></div></div>`;
}

/** Render a page body (markdown + blocks) to HTML. */
export function renderBody(body, meta = {}) {
  const parts = splitBlocks(body);
  const out = [];
  let thread = null;
  const close = () => {
    if (thread) out.push(threadHtml(thread, meta));
    thread = null;
  };
  for (const p of parts) {
    if (CHAT.has(p.type)) {
      (thread ||= []).push(p);
      continue;
    }
    if (p.type === 'note' && thread) {
      thread.push(p);
      continue;
    }
    close();
    if (p.type === 'prose') out.push(`<div class="md">${renderMarkdown(p.md)}</div>`);
    else if (p.type === 'toggle')
      out.push(`<details class="toggle"><summary>${esc(p.arg || 'Details')}</summary><div class="md">${renderMarkdown(p.md)}</div></details>`);
    else if (p.type === 'qa')
      out.push(
        `<details class="qa"><summary><span class="qa-badge q">Q</span><span>${esc(p.arg || 'Question')}</span></summary><div class="qa-answer"><span class="qa-badge a">A</span><div class="md">${renderMarkdown(p.md)}</div></div></details>`
      );
    else out.push(calloutHtml(p));
  }
  close();
  return out.join('\n');
}
