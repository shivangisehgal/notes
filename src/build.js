// Static build: content/** → dist/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { loadContent, allFolders, countPages } from './content.js';
import { renderBody, sourceName, tagColor } from './render.js';
import { escapeHtml as esc } from './markdown.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

let base = process.env.BASE_PATH ?? config.basePath ?? '/';
if (!base.startsWith('/')) base = '/' + base;
if (!base.endsWith('/')) base += '/';
const siteUrl = (process.env.SITE_URL || config.url || '').replace(/\/$/, '');
const href = (p) => (/^[a-z]+:\/\//i.test(p) ? p : base + String(p).replace(/^\//, ''));
const absolute = (p) => siteUrl + href(p);

const { tree, pages } = loadContent(path.join(ROOT, 'content'));
const folders = allFolders(tree);

const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const tagPill = (t) => `<span class="pill c-${tagColor(t)}">${esc(t)}</span>`;

// ---------- sidebar ----------
function treeHtml(folder) {
  const items = [
    ...folder.folders.map(
      (f) => `<li class="tree-folder" data-url="${esc(href(f.url))}">
<div class="tree-row"><button class="tree-caret" type="button" aria-label="Expand ${esc(f.title)}"></button><a href="${esc(href(f.url))}"><span class="ti">${esc(f.icon)}</span><span class="tt">${esc(f.title)}</span></a></div>
${treeHtml(f)}</li>`
    ),
    ...folder.pages.map(
      (p) => `<li class="tree-page"><div class="tree-row"><span class="tree-caret-spacer"></span><a href="${esc(href(p.url))}"><span class="ti">${esc(p.icon)}</span><span class="tt">${esc(p.title)}</span></a></div></li>`
    ),
  ];
  if (!items.length && folder.parent) return `<ul class="tree-children"><li class="tree-empty">Empty</li></ul>`;
  return `<ul class="${folder.parent ? 'tree-children' : 'tree'}">${items.join('')}</ul>`;
}
const SIDEBAR_TREE = treeHtml(tree);

const ICON = {
  search: '<svg viewBox="0 0 20 20" width="16" height="16"><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m13.2 13.2 3.6 3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  home: '<svg viewBox="0 0 20 20" width="16" height="16"><path d="M3.5 9 10 3.5 16.5 9v7a1 1 0 0 1-1 1h-3.5v-5h-4v5H4.5a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 20 20" width="16" height="16"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  folderPlus: '<svg viewBox="0 0 20 20" width="16" height="16"><path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.5 2h7.5a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 9v4.5M7.75 11.25h4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  bolt: '<svg viewBox="0 0 20 20" width="16" height="16"><path d="M11 2.5 4.5 11H10l-1 6.5L15.5 9H10Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  sun: '<svg class="i-sun" viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  moon: '<svg class="i-moon" viewBox="0 0 24 24" width="16" height="16"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  menu: '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M3.5 6h13M3.5 10h13M3.5 14h13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  dots: '<svg viewBox="0 0 20 20" width="18" height="18"><circle cx="5" cy="10" r="1.5" fill="currentColor"/><circle cx="10" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/></svg>',
  pen: '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};

const headScript = `<script>try{var d=document.documentElement,t=localStorage.getItem('theme');d.dataset.theme=t||'dark';if(localStorage.getItem('gh_token'))d.classList.add('is-owner')}catch(e){document.documentElement.dataset.theme='dark'}</script>`;

function crumbs(node) {
  const chain = [];
  let f = node.kind === 'page' ? node.folder : node;
  while (f) {
    chain.unshift(f);
    f = f.parent;
  }
  const links = chain.map((f) =>
    f.parent ? `<a href="${esc(href(f.url))}">${esc(f.icon)} ${esc(f.title)}</a>` : `<a href="${esc(href('/'))}">${ICON.home}<span>Home</span></a>`
  );
  if (node.kind === 'page' && node !== tree.home) links.push(`<span aria-current="page">${esc(node.icon)} ${esc(node.title)}</span>`);
  return links.join('<span class="sep">/</span>');
}

function layout({ title, description = config.description, canonical = '/', node, body, actions = '' }) {
  const fullTitle = title ? `${title} · ${config.title}` : config.title;
  const dir = node.kind === 'page' ? node.folder.dir : node.dir;
  const file = node.kind === 'page' ? node.file : `${node.dir}/_folder.json`;
  return `<!doctype html>
<html lang="${esc(config.language || 'en')}" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(absolute(canonical))}">
<meta property="og:title" content="${esc(title || config.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(absolute(canonical))}">
<link rel="alternate" type="application/rss+xml" title="${esc(config.title)}" href="${href('feed.xml')}">
<link rel="icon" href="${href('assets/favicon.svg')}" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${href('assets/katex/katex.min.css')}">
<link rel="stylesheet" href="${href('assets/style.css')}">
${headScript}
</head>
<body data-base="${esc(base)}" data-repo="${esc(config.repo || '')}" data-branch="${esc(config.branch || 'main')}" data-kind="${node === tree.home || node === tree ? 'home' : node.kind}" data-file="${esc(file)}" data-dir="${esc(dir)}" data-url="${esc(href(node.url))}">
<a class="skip" href="#main">Skip to content</a>
<div class="app">
  <aside class="sidebar" id="sidebar" aria-label="Workspace">
    <a class="ws" href="${href('/')}"><span class="ws-logo">${esc((config.title || 'W').trim()[0])}</span><span class="ws-name">${esc(config.title)}</span></a>
    <button type="button" class="sb-item sb-search" data-action="search">${ICON.search}<span>Search</span><kbd>⌘K</kbd></button>
    <a class="sb-item" href="${href('/')}" data-url="${esc(href('/'))}">${ICON.home}<span>Home</span></a>
    <button type="button" class="sb-item owner-only" data-action="import">${ICON.bolt}<span>Import AI chat</span></button>
    <div class="sb-section"><span>Pages</span>
      <span class="sb-section-actions owner-only">
        <button type="button" class="icon-btn" data-action="new-folder" data-dir="content" title="New folder">${ICON.folderPlus}</button>
        <button type="button" class="icon-btn" data-action="new-page" data-dir="content" title="New page">${ICON.plus}</button>
      </span>
    </div>
    <nav class="sb-tree">${SIDEBAR_TREE}</nav>
    <div class="sb-foot">
      <button type="button" class="sb-item theme-toggle" data-action="theme">${ICON.sun}${ICON.moon}<span class="theme-label">Theme</span></button>
      <button type="button" class="sb-item guest-only" data-action="signin">${ICON.pen}<span>Sign in to edit</span></button>
      <button type="button" class="sb-item owner-only" data-action="signout">${ICON.pen}<span>Sign out <span class="who"></span></span></button>
    </div>
  </aside>
  <div class="scrim" data-action="close-sidebar"></div>
  <div class="main">
    <header class="topbar">
      <button type="button" class="icon-btn hamburger" data-action="open-sidebar" aria-label="Open sidebar">${ICON.menu}</button>
      <nav class="crumbs" aria-label="Breadcrumb">${crumbs(node)}</nav>
      <div class="top-actions owner-only">${actions}</div>
    </header>
    <main id="main" class="page">
${body}
    </main>
    <footer class="page-foot">© ${new Date().getFullYear()} ${esc(config.author || '')} · Built from Markdown · AI responses may contain mistakes.</footer>
  </div>
</div>
<div id="layer"></div>
<script src="${href('assets/app.js')}" defer></script>
</body>
</html>`;
}

// ---------- pages ----------
const pageActions = `<button type="button" class="btn btn-primary" data-action="edit">${ICON.pen}Edit</button>
<button type="button" class="icon-btn" data-action="page-menu" aria-label="More">${ICON.dots}</button>`;
const folderActions = `<button type="button" class="btn" data-action="new-page">${ICON.plus}New page</button>
<button type="button" class="icon-btn" data-action="folder-menu" aria-label="More">${ICON.dots}</button>`;

function props(p) {
  const rows = [];
  if (p.tags.length) rows.push(['Tags', `<div class="pills">${p.tags.map(tagPill).join('')}</div>`]);
  if (p.prompts)
    rows.push([
      'Source',
      `<span class="chip src-${esc(String(p.data.source || 'other').toLowerCase())}"><span class="dot"></span>${esc(sourceName(p.data))}${p.data.model ? ` · ${esc(p.data.model)}` : ''}</span>`,
    ]);
  rows.push(['Created', `<time>${fmtDate(p.created)}</time>`]);
  if (+p.updated !== +p.created) rows.push(['Edited', `<time>${fmtDate(p.updated)}</time>`]);
  return `<dl class="props">${rows.map(([k, v]) => `<div class="prop"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function docHead(icon, title, extra = '') {
  return `<div class="doc-icon">${esc(icon)}</div><h1 class="doc-title">${esc(title)}</h1>${extra}`;
}

function pageHtml(p) {
  return layout({
    title: p.title,
    description: p.data.summary || p.text.slice(0, 160),
    canonical: p.url,
    node: p,
    actions: pageActions,
    body: `<article class="doc">
${docHead(p.icon, p.title, props(p))}
${p.data.summary ? `<p class="doc-lead">${esc(p.data.summary)}</p>` : ''}
<div class="doc-body">${renderBody(p.body, p.data)}</div>
</article>`,
  });
}

function folderCard(f) {
  const n = countPages(f);
  return `<a class="fcard c-${esc(f.color)}" href="${esc(href(f.url))}"><span class="fcard-icon">${esc(f.icon)}</span><span class="fcard-title">${esc(f.title)}</span>${
    f.description ? `<span class="fcard-desc">${esc(f.description)}</span>` : ''
  }<span class="fcard-count">${n} ${n === 1 ? 'page' : 'pages'}</span></a>`;
}

function pageRows(list, showFolder = false) {
  if (!list.length) return `<p class="empty">No pages yet.</p>`;
  return `<ul class="rows">${list
    .map(
      (p) => `<li><a class="row" href="${esc(href(p.url))}"><span class="row-icon">${esc(p.icon)}</span><span class="row-title">${esc(p.title)}</span>${
        showFolder && p.folder.parent ? `<span class="row-folder">${esc(p.folder.icon)} ${esc(p.folder.title)}</span>` : ''
      }<span class="row-tags">${p.tags.slice(0, 3).map(tagPill).join('')}</span><time class="row-date">${fmtDate(p.updated)}</time></a></li>`
    )
    .join('')}</ul>`;
}

function folderHtml(f) {
  return layout({
    title: f.title,
    description: f.description || `${f.title} — ${config.title}`,
    canonical: f.url,
    node: f,
    actions: folderActions,
    body: `<article class="doc">
${docHead(f.icon, f.title, f.description ? `<p class="doc-lead">${esc(f.description)}</p>` : '')}
${f.folders.length ? `<h2 class="sec-title">Folders</h2><div class="fgrid">${f.folders.map(folderCard).join('')}</div>` : ''}
<h2 class="sec-title">Pages</h2>
${pageRows(f.pages)}
</article>`,
  });
}

function homeHtml() {
  const h = tree.home;
  const recent = [...pages].sort((a, b) => b.updated - a.updated).slice(0, 8);
  const node = h || tree;
  return layout({
    node,
    actions: h ? pageActions : folderActions,
    body: `<article class="doc">
<div class="hero-glow" aria-hidden="true"></div>
${docHead(h ? h.icon : '✨', h ? h.title : config.title)}
${h ? `<div class="doc-body">${renderBody(h.body, h.data)}</div>` : `<p class="doc-lead">${esc(config.description)}</p>`}
${tree.folders.length ? `<h2 class="sec-title">Folders</h2><div class="fgrid">${tree.folders.map(folderCard).join('')}</div>` : ''}
<h2 class="sec-title">Recently edited</h2>
${pageRows(recent, true)}
${tree.pages.length ? `<h2 class="sec-title">Loose pages</h2>${pageRows(tree.pages)}` : ''}
</article>`,
  });
}

// ---------- write ----------
function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
const urlToFile = (u) => (u === '/' ? 'index.html' : `${u.replace(/^\//, '')}index.html`);

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'src/style.css'), path.join(OUT, 'assets/style.css'));
fs.copyFileSync(path.join(ROOT, 'src/app.js'), path.join(OUT, 'assets/app.js'));
const katexDist = path.join(ROOT, 'node_modules/katex/dist');
fs.mkdirSync(path.join(OUT, 'assets/katex'), { recursive: true });
fs.copyFileSync(path.join(katexDist, 'katex.min.css'), path.join(OUT, 'assets/katex/katex.min.css'));
fs.cpSync(path.join(katexDist, 'fonts'), path.join(OUT, 'assets/katex/fonts'), { recursive: true });

// In-browser editor bundle (loaded only when you click Edit / New …)
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/editor/editor.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  outfile: path.join(OUT, 'assets/editor.js'),
  logLevel: 'warning',
});

write('index.html', homeHtml());
folders.filter((f) => f.parent).forEach((f) => write(urlToFile(f.url), folderHtml(f)));
pages.forEach((p) => write(urlToFile(p.url), pageHtml(p)));

write(
  'assets/search.json',
  JSON.stringify({
    pages: pages.map((p) => ({ t: p.title, i: p.icon, u: href(p.url), f: p.folder.parent ? p.folder.title : '', g: p.tags, x: p.text.slice(0, 4000) })),
    folders: folders.map((f) => ({ t: f.parent ? f.title : 'Home (top level)', i: f.parent ? f.icon : '🏠', u: href(f.url), d: f.dir })),
  })
);

write(
  '404.html',
  layout({
    title: 'Not found',
    node: tree,
    body: `<article class="doc">${docHead('🛸', 'Page not found')}<p class="doc-lead">If you just created or edited this page, it'll show up after the site rebuilds (about a minute). <a href="${href('/')}">Go home →</a></p></article>`,
  })
);
write(
  'feed.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${esc(config.title)}</title><link>${esc(absolute('/'))}</link><description>${esc(config.description)}</description>
${[...pages]
  .sort((a, b) => b.created - a.created)
  .slice(0, 30)
  .map(
    (p) =>
      `<item><title>${esc(p.title)}</title><link>${esc(absolute(p.url))}</link><guid>${esc(absolute(p.url))}</guid><pubDate>${p.created.toUTCString()}</pubDate><description>${esc(p.data.summary || p.text.slice(0, 200))}</description></item>`
  )
  .join('\n')}
</channel></rss>`
);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', ...folders.filter((f) => f.parent).map((f) => f.url), ...pages.map((p) => p.url)]
    .map((u) => `<url><loc>${esc(absolute(u))}</loc></url>`)
    .join('\n')}\n</urlset>`
);
write('.nojekyll', '');

console.log(`Built ${pages.length} page(s) in ${folders.length - 1} folder(s) → dist/ (base: ${base})`);
