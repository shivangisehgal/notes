#!/usr/bin/env node
// Import a public AI share link as a blog post.
//
//   npm run import -- https://chatgpt.com/share/xxxx
//   npm run import -- https://claude.ai/share/xxxx --tags "science, ideas"
//   npm run import -- <url> --folder "content/Interview Prep" --title "My own title" --headed
//
// Opens the share page in a real browser (Playwright), reads the messages,
// converts them to Markdown and writes content/<folder>/<slug>.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- args ----------
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(`--${name}`);
const url = args.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.log(`Usage: npm run import -- <share-url> [--folder "content/AI Chats"] [--title "…"] [--tags "a, b"] [--headed]

Supported: ChatGPT (chatgpt.com/share), Claude (claude.ai/share), Gemini (gemini.google.com/share, g.co/gemini/share).`);
  process.exit(1);
}

let chromium, TurndownService, gfm;
try {
  ({ chromium } = await import('playwright'));
  TurndownService = (await import('turndown')).default;
  ({ gfm } = await import('turndown-plugin-gfm'));
} catch {
  console.error('Importer dependencies missing. Run:\n  npm install\n  npx playwright install chromium');
  process.exit(1);
}

// ---------- providers ----------
function detect(u) {
  const h = new URL(u).hostname;
  if (/chatgpt\.com|chat\.openai\.com/.test(h)) return 'chatgpt';
  if (/claude\.ai/.test(h)) return 'claude';
  if (/gemini\.google\.com|g\.co|bard\.google\.com/.test(h)) return 'gemini';
  return 'other';
}

const WAIT_FOR = {
  chatgpt: '[data-message-author-role]',
  claude: '[data-testid="user-message"]',
  gemini: 'user-query, .query-text',
  other: 'main',
};

// Runs inside the page. Returns { title, model, messages: [{role, html|text}] }
function extractInPage(provider) {
  const clean = (el) => {
    const node = el.cloneNode(true);
    // Math → placeholders (keep the TeX source)
    node.querySelectorAll('.katex-display').forEach((k) => {
      const tex = k.querySelector('annotation[encoding="application/x-tex"]');
      const span = document.createElement('div');
      span.setAttribute('data-math', 'block');
      span.textContent = tex ? tex.textContent : k.textContent;
      k.replaceWith(span);
    });
    node.querySelectorAll('.katex').forEach((k) => {
      const tex = k.querySelector('annotation[encoding="application/x-tex"]');
      const span = document.createElement('span');
      span.setAttribute('data-math', 'inline');
      span.textContent = tex ? tex.textContent : k.textContent;
      k.replaceWith(span);
    });
    // Code blocks → plain <pre><code class="language-x">
    node.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code');
      let lang = '';
      const cls = (code && code.className) || '';
      const m = cls.match(/language-([\w+#-]+)/);
      if (m) lang = m[1];
      else {
        const label = pre.querySelector('div, span');
        const t = label && label.textContent.trim();
        if (t && /^[\w+#-]{1,20}$/.test(t)) lang = t.toLowerCase();
      }
      const fresh = document.createElement('pre');
      const c = document.createElement('code');
      if (lang) c.className = `language-${lang}`;
      c.textContent = code ? code.textContent : pre.textContent;
      fresh.appendChild(c);
      pre.replaceWith(fresh);
    });
    // UI chrome
    node.querySelectorAll('button, svg, style, script, [role="button"], .sr-only, [data-testid*="copy"], [data-testid*="action"]').forEach((x) => x.remove());
    return node.innerHTML;
  };

  // Keep only outermost matches, in document order.
  const outermost = (els) => els.filter((e) => !els.some((o) => o !== e && o.contains(e)));

  // Plain text of a user message, keeping line breaks.
  const textOf = (el) => (el.querySelector('p, br, div') ? el.innerText : el.textContent).trim();

  const messages = [];
  let model = '';
  let title = document.title || '';

  if (provider === 'chatgpt') {
    title = title.replace(/^ChatGPT\s*[-–—|:]\s*/i, '').replace(/\s*[-–—|]\s*ChatGPT$/i, '');
    document.querySelectorAll('[data-message-author-role]').forEach((el) => {
      const role = el.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') return;
      if (role === 'assistant' && !model) model = el.getAttribute('data-message-model-slug') || '';
      if (role === 'user') {
        const t = el.querySelector('.whitespace-pre-wrap') || el;
        messages.push({ role, text: textOf(t) });
      } else {
        const md = el.querySelector('.markdown') || el;
        const html = clean(md);
        // Consecutive assistant chunks (tool calls, etc.) merge into one reply.
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant') last.html += '\n' + html;
        else messages.push({ role, html });
      }
    });
  } else if (provider === 'claude') {
    title = title.replace(/\s*[-–—|]\s*Claude$/i, '');
    const els = outermost([...document.querySelectorAll('[data-testid="user-message"], .font-claude-response, .font-claude-message')]);
    els.forEach((el) => {
      if (el.matches('[data-testid="user-message"]')) messages.push({ role: 'user', text: textOf(el) });
      else {
        const last = messages[messages.length - 1];
        const html = clean(el);
        if (last && last.role === 'assistant') last.html += '\n' + html;
        else messages.push({ role: 'assistant', html });
      }
    });
  } else if (provider === 'gemini') {
    title = (document.querySelector('h1')?.innerText || title).replace(/\s*[-–—|]\s*Gemini$/i, '');
    const els = outermost([...document.querySelectorAll('user-query, message-content, model-response')]);
    els.forEach((el) => {
      if (el.matches('user-query')) {
        const t = el.querySelector('.query-text') || el;
        messages.push({ role: 'user', text: textOf(t) });
      } else {
        const md = el.querySelector('.markdown') || el;
        messages.push({ role: 'assistant', html: clean(md) });
      }
    });
  }
  return { title: title.trim(), model, messages };
}

async function scrape(target, provider, headed) {
  const browser = await chromium.launch({ headless: !headed });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(WAIT_FOR[provider], { timeout: headed ? 90000 : 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // Some pages lazy-render long chats.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 1200) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
    });
    return await page.evaluate(extractInPage, provider);
  } finally {
    await browser.close();
  }
}

// ---------- markdown ----------
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
td.use(gfm);
td.addRule('math', {
  filter: (n) => n.getAttribute && n.getAttribute('data-math'),
  replacement: (content, n) =>
    n.getAttribute('data-math') === 'block' ? `\n\n$$\n${n.textContent.trim()}\n$$\n\n` : `$${n.textContent.trim()}$`,
});
td.addRule('fencedCode', {
  filter: (n) => n.nodeName === 'PRE',
  replacement: (_, n) => {
    const code = n.querySelector ? n.querySelector('code') : null;
    const lang = ((code && code.getAttribute('class')) || '').replace(/.*language-([\w+#-]+).*/, '$1').replace(/^.*\s.*$/, '');
    const text = (code || n).textContent.replace(/\n$/, '');
    const fence = text.includes('```') ? '````' : '```';
    return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
  },
});

const escapeUser = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/^:::/gm, '\\:::');

const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'conversation';

// ---------- run ----------
const provider = opt('provider') || detect(url);
if (provider === 'other') console.warn('⚠ Unknown site — will try anyway, but you may need to paste the chat in by hand.');

console.log(`Opening ${url} …`);
let data = await scrape(url, provider, flag('headed'));
if (!data.messages.length && !flag('headed')) {
  console.log('No messages found headlessly (the site may be blocking bots). Retrying in a visible browser window…');
  data = await scrape(url, provider, true);
}
if (!data.messages.length) {
  console.error(
    '✗ Could not find any messages on that page.\n  • Make sure the link is a public share link.\n  • Or create a post by hand: npm run new -- "My title"'
  );
  process.exit(1);
}

const title = opt('title') || data.title || (data.messages[0].text || 'Conversation').split('\n')[0].slice(0, 80);
const tags = (opt('tags') || '').split(',').map((t) => t.trim()).filter(Boolean);
const today = new Date().toISOString().slice(0, 10);

const body = data.messages
  .map((m) =>
    m.role === 'user'
      ? `::: user\n${escapeUser(m.text)}\n:::`
      : `::: assistant\n${td.turndown(m.html).replace(/^:::/gm, '\\:::').trim()}\n:::`
  )
  .join('\n\n');

const front = [
  '---',
  `title: ${JSON.stringify(title)}`,
  `icon: 💬`,
  `date: ${today}`,
  tags.length ? `tags: [${tags.map((t) => JSON.stringify(t)).join(', ')}]` : null,
  `source: ${provider}`,
  data.model ? `model: ${JSON.stringify(data.model)}` : null,
  `shareUrl: ${JSON.stringify(url)}`,
  '---',
]
  .filter(Boolean)
  .join('\n');

// Folder: --folder "content/Interview Prep" (or just "Interview Prep")
let folder = (opt('folder') || 'content/AI Chats').replace(/^\/+|\/+$/g, '');
if (!folder.startsWith('content')) folder = `content/${folder}`;
const dirAbs = path.join(ROOT, folder);
fs.mkdirSync(dirAbs, { recursive: true });
let file = path.join(dirAbs, `${slugify(title)}.md`);
for (let n = 2; fs.existsSync(file); n++) file = path.join(dirAbs, `${slugify(title)}-${n}.md`);
fs.writeFileSync(file, `${front}\n\n${body}\n`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${title.replace(/\n/g, ' ')}\n`);

const turns = data.messages.filter((m) => m.role === 'user').length;
console.log(`✓ Imported ${turns} prompt(s) → ${path.relative(ROOT, file)}
  Next: add a summary or your own notes, then run "npm run dev" to preview.`);
