// Markdown → HTML with syntax highlighting, KaTeX math and wrapped tables.
import { Marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import katex from 'katex';

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    // ChatGPT writes "~450 nm"; only treat ~~double~~ tildes as strikethrough.
    del({ tokens, raw }) {
      const inner = this.parser.parseInline(tokens);
      return raw.startsWith('~~') ? `<del>${inner}</del>` : `~${inner}~`;
    },
    code({ text, lang }) {
      const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
      let body;
      if (language && hljs.getLanguage(language)) {
        body = hljs.highlight(text, { language, ignoreIllegals: true }).value;
      } else {
        body = escapeHtml(text);
      }
      const label = language || 'text';
      return (
        `<figure class="code-block"><figcaption><span>${escapeHtml(label)}</span>` +
        `<button type="button" class="copy-btn" aria-label="Copy code">Copy</button></figcaption>` +
        `<pre><code class="hljs language-${escapeHtml(label)}">${body}</code></pre></figure>\n`
      );
    },
  },
});

/** Render markdown (with $…$ / $$…$$ / \(…\) / \[…\] math) to HTML. */
export function renderMarkdown(src) {
  src = (src || '').replace(/<!--[\s\S]*?-->/g, '');
  if (!src.trim()) return '';
  const stash = [];
  const hold = (s) => `\u0000${stash.push(s) - 1}\u0000`;

  // 1. Protect code so math regexes never touch it.
  let text = src
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, hold)
    .replace(/`[^`\n]+`/g, hold);

  // 2. Pull out math and pre-render it.
  const math = [];
  const mathHold = (tex, display) => {
    let html;
    try {
      html = katex.renderToString(tex.trim(), { displayMode: display, throwOnError: false, output: 'html' });
    } catch {
      html = escapeHtml(tex);
    }
    const id = math.push({ html, display }) - 1;
    return display ? `\n\nMATHBLOCK${id}X\n\n` : `MATHINLINE${id}X`;
  };
  text = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => mathHold(t, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => mathHold(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => mathHold(t, false))
    // Inline $…$: no space just inside the dollars, and not "$5 and $10".
    .replace(/(^|[^\\$\w])\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g, (_, pre, t) => pre + mathHold(t, false));

  // 3. Restore code, render markdown.
  text = text.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]).replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
  let html = marked.parse(text);

  // 4. Put math back.
  html = html
    .replace(/<p>MATHBLOCK(\d+)X<\/p>/g, (_, i) => `<div class="math-block">${math[+i].html}</div>`)
    .replace(/MATHBLOCK(\d+)X/g, (_, i) => `<div class="math-block">${math[+i].html}</div>`)
    .replace(/MATHINLINE(\d+)X/g, (_, i) => math[+i].html);

  // 5. Make wide tables scroll instead of breaking the layout.
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return html;
}

export { escapeHtml };
