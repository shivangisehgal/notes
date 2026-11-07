// In-browser editor. Loaded on demand by app.js. Saves to GitHub via the REST API
// using a fine-grained personal access token stored in this browser only.
import { parseFrontMatter, stringifyFrontMatter } from '../frontmatter.js';
import { renderBody, SOURCES, tagColor } from '../render.js';
import { escapeHtml as esc } from '../markdown.js';

const body = document.body;
const BASE = body.dataset.base || '/';
const layer = document.getElementById('layer');
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
const repo = () => ls.get('gh_repo') || body.dataset.repo;
const branch = () => body.dataset.branch || 'main';
const token = () => ls.get('gh_token');
const today = () => new Date().toISOString().slice(0, 10);

export const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
const dirToUrl = (dir) => {
  const parts = dir.split('/').slice(1).map(slugify);
  return BASE + parts.map((p) => p + '/').join('');
};
const cleanName = (s) => String(s).replace(/[\\/:*?"<>|#%]/g, ' ').replace(/^[._\s]+/, '').replace(/\s+/g, ' ').trim();

// ---------- GitHub API ----------
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const b64encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function gh(path, { method = 'GET', body: data, auth = token() } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || `GitHub error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}
async function getFile(path) {
  const j = await gh(`/repos/${repo()}/contents/${encPath(path)}?ref=${encodeURIComponent(branch())}`);
  return { text: b64decode(j.content || ''), sha: j.sha };
}
async function exists(path) {
  try { await getFile(path); return true; } catch (e) { if (e.status === 404) return false; throw e; }
}
const putFile = (path, text, message, sha) =>
  gh(`/repos/${repo()}/contents/${encPath(path)}`, { method: 'PUT', body: { message, content: b64encode(text), branch: branch(), ...(sha ? { sha } : {}) } });
const deleteFile = (path, sha, message) =>
  gh(`/repos/${repo()}/contents/${encPath(path)}`, { method: 'DELETE', body: { message, sha, branch: branch() } });

// ---------- UI helpers ----------
let toastTimer;
export function toast(html, { error = false, ms = 5000 } = {}) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (error ? ' err' : '');
  t.setAttribute('role', 'status');
  t.innerHTML = html;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => t.remove(), ms);
}
const LIVE = 'Live on the site in about a minute.';

function dialog({ title, html, ok = 'Save', danger = false, onOk, wide = false }) {
  return new Promise((resolve) => {
    layer.innerHTML = `<div class="overlay" data-close><form class="dialog"${wide ? ' style="max-width:640px"' : ''}>
<div class="dialog-body"><h2>${title}</h2>${html}<p class="error" hidden></p></div>
<div class="dialog-foot"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${ok}</button></div>
</form></div>`;
    const form = layer.querySelector('form');
    const errEl = form.querySelector('.error');
    const close = (v) => { layer.innerHTML = ''; resolve(v); };
    form.querySelector('[data-cancel]').onclick = () => close(null);
    form.addEventListener('keydown', (e) => e.key === 'Escape' && close(null));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      errEl.hidden = true;
      try {
        const v = onOk ? await onOk(form) : true;
        if (v !== false) close(v ?? true);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
    setTimeout(() => form.querySelector('input, select, textarea, button[type=submit]')?.focus(), 20);
  });
}

let indexCache;
async function folderOptions(selected) {
  indexCache ||= await fetch(BASE + 'assets/search.json').then((r) => r.json());
  return indexCache.folders
    .map((f) => {
      const depth = f.d.split('/').length - 1;
      return `<option value="${esc(f.d)}"${f.d === selected ? ' selected' : ''}>${' '.repeat(Math.max(0, depth - 1))}${esc(f.i)} ${esc(f.t)}</option>`;
    })
    .join('');
}

const EMOJI = '📄📝📌📚📖🧠💡🎯🧩🏗️⚙️🔧🧪📊📈🗂️📁💬🤖✨🚀🔥⭐️✅❓💼🧑‍💻🖥️🌐🔒🗃️🧮📐🎨🎧🎬🏃🍳🌱🌙☕️🧭🗺️🏆💎🪐🛸⚡️'.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu);
function pickEmoji(current) {
  return dialog({
    title: 'Choose an icon',
    ok: 'Use',
    html: `<div class="emoji-grid">${EMOJI.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
<label class="field">Or type / paste any emoji<input class="input" name="e" value="${esc(current || '')}" maxlength="8"></label>`,
    onOk: (f) => f.e.value.trim() || current,
  }).then((v) => v || current);
}
layer.addEventListener('click', (e) => {
  const b = e.target.closest('.emoji-grid button');
  if (b) {
    const input = layer.querySelector('input[name=e]');
    input.value = b.dataset.e;
    input.form.requestSubmit();
  }
});

// ---------- auth ----------
async function signIn() {
  const hasRepo = !!body.dataset.repo;
  const ok = await dialog({
    title: 'Sign in to edit',
    ok: 'Connect',
    html: `<p>Edits are saved as commits to your GitHub repo. Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a> for this repo with <b>Contents: Read and write</b> and <b>Actions: Read and write</b>. It's stored only in this browser.</p>
${hasRepo ? '' : '<label class="field">Repository (owner/name)<input class="input" name="repo" required placeholder="yourname/notes"></label>'}
<label class="field">Token<input class="input" name="token" type="password" required autocomplete="off" placeholder="github_pat_…"></label>`,
    onOk: async (f) => {
      const t = f.token.value.trim();
      const r = hasRepo ? body.dataset.repo : f.repo.value.trim();
      const info = await gh(`/repos/${r}`, { auth: t }).catch((e) => {
        throw new Error(e.status === 404 ? `Can't see ${r}. Check the repo name and token access.` : e.message);
      });
      if (info.permissions && !info.permissions.push) throw new Error('This token can read but not write to the repo.');
      const user = await gh('/user', { auth: t }).catch(() => ({}));
      ls.set('gh_token', t);
      ls.set('gh_login', user.login || '');
      if (!hasRepo) ls.set('gh_repo', r);
      return true;
    },
  });
  if (ok) {
    document.documentElement.classList.add('is-owner');
    const who = document.querySelector('.who');
    if (who && ls.get('gh_login')) who.textContent = `(@${ls.get('gh_login')})`;
    toast('Signed in. You can edit now ✨');
  }
  return !!ok;
}
function signOut() {
  ['gh_token', 'gh_login', 'gh_repo'].forEach(ls.del);
  document.documentElement.classList.remove('is-owner');
  toast('Signed out on this browser.');
}

// ---------- editor ----------
const TOOLS = [
  ['H1', 'Heading 1', { prefix: '# ' }],
  ['H2', 'Heading 2', { prefix: '## ' }],
  ['H3', 'Heading 3', { prefix: '### ' }],
  '|',
  ['B', 'Bold (⌘B)', { wrap: ['**', '**', 'bold'] }],
  ['<i>I</i>', 'Italic (⌘I)', { wrap: ['*', '*', 'italic'] }],
  ['<s>S</s>', 'Strikethrough', { wrap: ['~~', '~~', 'text'] }],
  ['🖍', 'Highlight', { wrap: ['<mark>', '</mark>', 'highlight'] }],
  ['&lt;/&gt;', 'Inline code', { wrap: ['`', '`', 'code'] }],
  ['🔗', 'Link (⌘K)', { wrap: ['[', '](https://)', 'link text'] }],
  '|',
  ['•', 'Bulleted list', { prefix: '- ' }],
  ['1.', 'Numbered list', { prefix: '1. ' }],
  ['☑', 'To-do', { prefix: '- [ ] ' }],
  ['❝', 'Quote', { prefix: '> ' }],
  ['―', 'Divider', { block: '---' }],
  '|',
  ['{ }', 'Code block', { block: '```js\n\n```', caret: 6 }],
  ['▦', 'Table', { block: '| Column | Column |\n| --- | --- |\n|  |  |' }],
  ['💡', 'Callout', { block: '::: tip Title\nWrite something…\n:::' }],
  ['▸', 'Toggle', { block: '::: toggle Click to expand\nHidden content\n:::' }],
  ['Q&A', 'Interview flashcard', { block: '::: qa Question?\nAnswer…\n:::' }],
  ['💬', 'AI chat turn', { block: '::: user\nYour prompt\n:::\n\n::: assistant\nThe reply\n:::' }],
];

function insert(ta, text, selectFrom, selectTo) {
  ta.focus();
  if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
  if (selectFrom != null) {
    const start = ta.selectionStart - text.length;
    ta.setSelectionRange(start + selectFrom, start + selectTo);
  }
  ta.dispatchEvent(new Event('input'));
}
function applyTool(ta, t) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  if (t.wrap) {
    const [a, b, ph] = t.wrap;
    const sel = v.slice(s, e) || ph;
    insert(ta, a + sel + b, a.length, a.length + sel.length);
  } else if (t.prefix) {
    const ls0 = v.lastIndexOf('\n', s - 1) + 1;
    const le = v.indexOf('\n', e) === -1 ? v.length : v.indexOf('\n', e);
    ta.setSelectionRange(ls0, le);
    const lines = v.slice(ls0, le).split('\n');
    const all = lines.every((l) => l.startsWith(t.prefix));
    const out = lines
      .map((l, i) => {
        const stripped = l.replace(/^(#{1,6} |[-*] \[[ x]\] |[-*] |\d+\. |> )/, '');
        if (all) return stripped;
        return (t.prefix === '1. ' ? `${i + 1}. ` : t.prefix) + stripped;
      })
      .join('\n');
    insert(ta, out);
  } else if (t.block) {
    const before = v.slice(0, s);
    const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const text = lead + t.block + '\n';
    insert(ta, text);
    if (t.caret != null) {
      const p = ta.selectionStart - text.length + lead.length + t.caret;
      ta.setSelectionRange(p, p);
    }
  }
}

function handleKeys(ta, e, save) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); applyTool(ta, { wrap: ['**', '**', 'bold'] }); return; }
  if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); applyTool(ta, { wrap: ['*', '*', 'italic'] }); return; }
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); applyTool(ta, { wrap: ['[', '](https://)', 'link text'] }); return; }
  if (e.target !== ta) return;
  if (e.key === 'Tab') {
    e.preventDefault();
    const v = ta.value, s = ta.selectionStart;
    const ls0 = v.lastIndexOf('\n', s - 1) + 1;
    if (e.shiftKey) {
      if (v.slice(ls0, ls0 + 2) === '  ') { ta.setSelectionRange(ls0, ls0 + 2); insert(ta, ''); ta.setSelectionRange(s - 2, s - 2); }
    } else if (/^\s*([-*]|\d+\.) /.test(v.slice(ls0))) { const off = s - ls0; ta.setSelectionRange(ls0, ls0); insert(ta, '  '); ta.setSelectionRange(ls0 + off + 2, ls0 + off + 2); }
    else insert(ta, '  ');
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey && !mod && ta.selectionStart === ta.selectionEnd) {
    const v = ta.value, s = ta.selectionStart;
    const ls0 = v.lastIndexOf('\n', s - 1) + 1;
    const line = v.slice(ls0, s);
    const m = line.match(/^(\s*)([-*] \[[ x]\] |[-*] |(\d+)\. |> )/);
    if (!m) return;
    e.preventDefault();
    if (line.trim() === m[2].trim()) { ta.setSelectionRange(ls0, s); insert(ta, ''); return; } // empty item ends the list
    let next = m[2];
    if (m[3]) next = `${+m[3] + 1}. `;
    if (/\[x\]/.test(next)) next = next.replace('[x]', '[ ]');
    insert(ta, '\n' + m[1] + next);
  }
}

const FM_ORDER = ['title', 'icon', 'date', 'updated', 'tags', 'summary', 'source', 'model', 'shareUrl', 'order'];

function openEditor({ file, sha, fm = {}, text = '', dir, isNew = false, pageUrl }) {
  document.querySelector('.editor')?.remove();
  const draftKey = `draft:${file || dir + '/__new__'}`;
  let draft = null;
  try { draft = JSON.parse(ls.get(draftKey) || 'null'); } catch {}
  const restored = draft && draft.sha === (sha || null) && (draft.text !== text || draft.title !== (fm.title || ''));
  const state = {
    file, sha, dir: dir || (file ? file.split('/').slice(0, -1).join('/') : 'content'), isNew,
    icon: (restored ? draft.icon : fm.icon) || '📄',
    title: (restored ? draft.title : fm.title) || '',
    tags: (restored ? draft.tags : (Array.isArray(fm.tags) ? fm.tags.join(', ') : fm.tags)) || '',
    summary: (restored ? draft.summary : fm.summary) || '',
    source: (restored ? draft.source : fm.source) || '',
    model: (restored ? draft.model : fm.model) || '',
    text: restored ? draft.text : text,
    dirty: !!restored,
  };

  const wrap = document.createElement('div');
  wrap.className = 'editor';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Editor');
  const sourceOpts = ['<option value="">— none —</option>', ...Object.entries(SOURCES).map(([k, n]) => `<option value="${k}"${k === state.source ? ' selected' : ''}>${n}</option>`)].join('');
  wrap.innerHTML = `<div class="ed-bar">
  <button type="button" class="btn" data-ed="close">✕<span>&nbsp;Close</span></button>
  <span class="ed-status"></span>
  <div class="seg" role="group" aria-label="View"><button type="button" data-mode="write">Write</button><button type="button" data-mode="split">Split</button><button type="button" data-mode="preview">Preview</button></div>
  <button type="button" class="btn btn-primary" data-ed="save">Save</button>
</div>
<div class="ed-main">
  <div class="ed-pane write"><div class="ed-doc">
    <button type="button" class="ed-icon" data-ed="icon" title="Change icon">${esc(state.icon)}</button>
    <input class="ed-title" placeholder="Untitled" value="${esc(state.title)}" aria-label="Title">
    <div class="ed-meta">
      ${isNew ? `<span>Folder</span><select class="input select" data-f="dir"></select>` : ''}
      <span>Tags</span><input class="input" data-f="tags" placeholder="Empty — comma separated" value="${esc(state.tags)}">
      <span>Summary</span><input class="input" data-f="summary" placeholder="Empty" value="${esc(state.summary)}">
      <span>AI source</span><select class="input select" data-f="source">${sourceOpts}</select>
      <span>Model</span><input class="input" data-f="model" placeholder="Empty — e.g. GPT-5" value="${esc(state.model)}">
    </div>
    <div class="ed-tools" role="toolbar">${TOOLS.map((t, i) => (t === '|' ? '<span class="sep"></span>' : `<button type="button" data-tool="${i}" title="${t[1]}" aria-label="${t[1]}">${t[0]}</button>`)).join('')}</div>
    <textarea class="ed-text" spellcheck="true" placeholder="Start writing… Markdown works. Use the toolbar for callouts, Q&A cards and chat blocks."></textarea>
  </div></div>
  <div class="ed-pane preview"><div class="ed-doc ed-preview-doc"></div></div>
</div>`;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';

  const $ = (s) => wrap.querySelector(s);
  const ta = $('.ed-text');
  const titleEl = $('.ed-title');
  const status = $('.ed-status');
  const main = $('.ed-main');
  const previewEl = $('.ed-preview-doc');
  ta.value = state.text;
  if (isNew) folderOptions(state.dir).then((o) => ($('[data-f=dir]').innerHTML = o));

  const setStatus = (s) => (status.innerHTML = s);
  setStatus(restored ? 'Restored your unsaved draft.' : isNew ? 'New page' : esc(file));

  let mode = ls.get('ed-mode') || (innerWidth > 1100 ? 'split' : 'write');
  const setMode = (m) => {
    mode = m;
    ls.set('ed-mode', m);
    main.className = `ed-main mode-${m}${m === 'split' ? ' split' : ''}`;
    wrap.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    renderPreview();
  };

  const collect = () => {
    state.title = titleEl.value.trim();
    state.text = ta.value;
    state.tags = $('[data-f=tags]').value;
    state.summary = $('[data-f=summary]').value.trim();
    state.source = $('[data-f=source]').value;
    state.model = $('[data-f=model]').value.trim();
    if (isNew && $('[data-f=dir]').value) state.dir = $('[data-f=dir]').value;
  };
  const tagList = () => state.tags.split(',').map((t) => t.trim()).filter(Boolean);
  let pt;
  function renderPreview() {
    if (mode === 'write') return;
    clearTimeout(pt);
    pt = setTimeout(() => {
      collect();
      const meta = { source: state.source, model: state.model, shareUrl: fm.shareUrl };
      previewEl.innerHTML = `<div class="doc-icon">${esc(state.icon)}</div><h1 class="doc-title">${esc(state.title || 'Untitled')}</h1>${
        tagList().length ? `<div class="pills" style="margin-bottom:16px">${tagList().map((t) => `<span class="pill c-${tagColor(t)}">${esc(t)}</span>`).join('')}</div>` : ''
      }${state.summary ? `<p class="doc-lead">${esc(state.summary)}</p>` : ''}<div class="doc-body">${renderBody(state.text, meta)}</div>`;
    }, 120);
  }
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  let dt;
  const changed = () => {
    state.dirty = true;
    autosize();
    renderPreview();
    clearTimeout(dt);
    dt = setTimeout(() => {
      collect();
      ls.set(draftKey, JSON.stringify({ sha: state.sha || null, icon: state.icon, title: state.title, tags: state.tags, summary: state.summary, source: state.source, model: state.model, text: state.text }));
    }, 400);
  };

  async function save() {
    collect();
    if (!state.title) { titleEl.focus(); setStatus('<span class="error">Give the page a title first.</span>'); return; }
    const btn = $('[data-ed=save]');
    btn.disabled = true;
    setStatus('Saving…');
    try {
      const data = {};
      const merged = { ...fm, title: state.title, icon: state.icon, tags: tagList(), summary: state.summary, source: state.source, model: state.model, date: fm.date || today(), updated: today() };
      for (const k of FM_ORDER) if (k in merged) data[k] = merged[k];
      for (const k of Object.keys(merged)) if (!(k in data)) data[k] = merged[k];
      const out = stringifyFrontMatter(data, state.text.replace(/\s*$/, '\n'));

      if (state.isNew) {
        let path = `${state.dir}/${slugify(state.title)}.md`;
        for (let n = 2; await exists(path); n++) path = `${state.dir}/${slugify(state.title)}-${n}.md`;
        state.file = path;
      }
      const res = await putFile(state.file, out, `${state.isNew ? '✨ New page' : '📝 Edit'}: ${state.title}`, state.sha);
      state.sha = res.content.sha;
      const url = state.isNew ? dirToUrl(state.dir) + slugify(state.title) + '/' : pageUrl;
      ls.del(draftKey);
      state.dirty = false;
      if (state.isNew) {
        state.isNew = false;
        $('[data-f=dir]').disabled = true;
      }
      fm.title = state.title;
      setStatus(`Saved ✓ · ${LIVE}`);
      // Reflect the change on the page behind the editor right away.
      if (!isNew && body.dataset.file === state.file) {
        const docBody = document.querySelector('.doc .doc-body');
        if (docBody) docBody.innerHTML = renderBody(state.text, { source: state.source, model: state.model, shareUrl: fm.shareUrl });
        const t = document.querySelector('.doc .doc-title');
        if (t) t.textContent = state.title;
        const i = document.querySelector('.doc .doc-icon');
        if (i) i.textContent = state.icon;
      }
      toast(`Saved “${esc(state.title)}”. ${LIVE}${isNew ? ` <a href="${esc(url)}">Open page</a>` : ''}`);
    } catch (e) {
      setStatus(`<span class="error">Couldn't save: ${esc(e.message)}</span>`);
      if (e.status === 409) setStatus('<span class="error">This page changed on GitHub since you opened it. Copy your text, close and reopen the editor.</span>');
    } finally {
      btn.disabled = false;
    }
  }
  async function close() {
    collect();
    if (state.dirty) {
      const ok = await dialog({ title: 'Discard unsaved changes?', html: '<p>Your draft stays in this browser and comes back next time you edit this page.</p>', ok: 'Close anyway', danger: true });
      if (!ok) return;
    }
    wrap.remove();
    document.body.style.overflow = '';
    removeEventListener('beforeunload', guard);
  }
  const guard = (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } };
  addEventListener('beforeunload', guard);

  wrap.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tool],[data-mode],[data-ed]');
    if (!t) return;
    if (t.dataset.tool) applyTool(ta, TOOLS[+t.dataset.tool][2]);
    else if (t.dataset.mode) setMode(t.dataset.mode);
    else if (t.dataset.ed === 'save') save();
    else if (t.dataset.ed === 'close') close();
    else if (t.dataset.ed === 'icon') {
      state.icon = await pickEmoji(state.icon);
      t.textContent = state.icon;
      changed();
    }
  });
  wrap.addEventListener('input', changed);
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !layer.firstChild) close();
    else handleKeys(ta, e, save);
  });
  titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ta.focus(); } });

  setMode(mode);
  autosize();
  if (isNew) titleEl.focus();
  else { ta.setSelectionRange(0, 0); ta.focus({ preventScroll: true }); }
  wrap.querySelectorAll('.ed-pane').forEach((p) => (p.scrollTop = 0));
}

// ---------- actions ----------
async function editPage(d) {
  toast('Opening…', { ms: 0 });
  try {
    const { text, sha } = await getFile(d.file);
    const { data, body: md } = parseFrontMatter(text);
    document.querySelector('.toast')?.remove();
    openEditor({ file: d.file, sha, fm: data, text: md, pageUrl: d.url });
  } catch (e) {
    toast(e.status === 404 ? "This page isn't on GitHub yet (or the site hasn't rebuilt). Try again in a minute." : esc(e.message), { error: true });
  }
}

async function folderDialog({ title, ok, parent, meta = {}, name = '', showName = true, showParent = true }) {
  const colors = ['lime', 'cyan', 'pink', 'violet', 'orange', 'yellow'];
  const opts = showParent ? await folderOptions(parent) : '';
  return dialog({
    title,
    ok,
    html: `${showName ? `<label class="field">Name<input class="input" name="name" required value="${esc(name)}" placeholder="e.g. Interview Prep"></label>` : ''}
${showParent ? `<label class="field">Inside<select class="input select" name="parent">${opts}</select></label>` : ''}
<div style="display:grid;grid-template-columns:90px 1fr;gap:12px">
<label class="field">Icon<input class="input" name="icon" value="${esc(meta.icon || '📁')}" maxlength="8"></label>
<label class="field">Description<input class="input" name="description" value="${esc(meta.description || '')}" placeholder="Optional"></label></div>
<div class="field">Colour<div class="swatches">${colors.map((c) => `<button type="button" class="swatch c-${c}" style="--c:var(--${c})" data-c="${c}" aria-label="${c}" aria-pressed="${c === (meta.color || 'cyan')}"></button>`).join('')}</div></div>`,
    onOk: (f) => ({
      name: showName ? cleanName(f.name.value) : name,
      parent: showParent ? f.parent.value : parent,
      meta: { ...meta, icon: f.icon.value.trim() || '📁', color: f.querySelector('.swatch[aria-pressed=true]')?.dataset.c || 'cyan', description: f.description.value.trim() || undefined },
    }),
  });
}
layer.addEventListener('click', (e) => {
  const s = e.target.closest('.swatch');
  if (!s) return;
  s.parentElement.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === s)));
});
const folderJson = (meta) => JSON.stringify(Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined && v !== '')), null, 2) + '\n';

async function newFolder(d) {
  const r = await folderDialog({ title: 'New folder', ok: 'Create', parent: d.dir || 'content' });
  if (!r || !r.name) return;
  const path = `${r.parent}/${r.name}/_folder.json`;
  if (await exists(path)) return toast('A folder with that name already exists there.', { error: true });
  await putFile(path, folderJson(r.meta), `📁 New folder: ${r.name}`);
  toast(`Created “${esc(r.name)}”. ${LIVE}`);
}

async function editFolder(d) {
  const path = `${d.dir}/_folder.json`;
  let meta = {}, sha;
  try { const f = await getFile(path); meta = JSON.parse(f.text); sha = f.sha; } catch (e) { if (e.status !== 404) throw e; }
  const r = await folderDialog({ title: 'Edit folder', ok: 'Save', parent: d.dir, meta, name: d.dir.split('/').pop(), showName: false, showParent: false });
  if (!r) return;
  await putFile(path, folderJson(r.meta), `🎨 Edit folder: ${d.dir.split('/').pop()}`, sha);
  toast(`Folder updated. ${LIVE}`);
}

async function movePage(d) {
  const { text, sha } = await getFile(d.file);
  const { data, body: md } = parseFrontMatter(text);
  const opts = await folderOptions(d.dir);
  const r = await dialog({
    title: 'Move / rename page',
    ok: 'Move',
    html: `<label class="field">Title<input class="input" name="title" required value="${esc(data.title || '')}"></label>
<label class="field">Folder<select class="input select" name="dir">${opts}</select></label>`,
    onOk: (f) => ({ title: f.title.value.trim(), dir: f.dir.value }),
  });
  if (!r) return;
  data.title = r.title;
  data.updated = today();
  const out = stringifyFrontMatter(data, md);
  let path = `${r.dir}/${slugify(r.title)}.md`;
  if (path === d.file) {
    await putFile(path, out, `✏️ Rename: ${r.title}`, sha);
  } else {
    for (let n = 2; await exists(path); n++) path = `${r.dir}/${slugify(r.title)}-${n}.md`;
    await putFile(path, out, `↪ Move: ${r.title}`);
    await deleteFile(d.file, sha, `↪ Move: ${r.title} (remove old)`);
  }
  const url = dirToUrl(r.dir) + slugify(path.split('/').pop().replace(/\.md$/, '')) + '/';
  toast(`Moved. ${LIVE} <a href="${esc(url)}">New location</a>`, { ms: 9000 });
}

async function deletePage(d) {
  const title = document.querySelector('.doc-title')?.textContent || d.file;
  const ok = await dialog({
    title: 'Delete this page?',
    html: `<p>“${esc(title)}” will be removed from the site. You can still recover it from your repo's Git history.</p>`,
    ok: 'Delete',
    danger: true,
    onOk: async () => {
      const { sha } = await getFile(d.file);
      await deleteFile(d.file, sha, `🗑 Delete: ${title}`);
      return true;
    },
  });
  if (ok) {
    toast(`Deleted. ${LIVE}`);
    setTimeout(() => (location.href = dirToUrl(d.dir)), 1500);
  }
}

async function importChat(d) {
  const opts = await folderOptions(d.kind === 'page' || d.kind === 'folder' ? d.dir : 'content/AI Chats');
  const r = await dialog({
    title: 'Import an AI chat',
    ok: 'Import',
    html: `<p>Paste a public share link from ChatGPT, Claude or Gemini. GitHub fetches it, turns it into a page and publishes it, which takes 2–3 minutes.</p>
<label class="field">Share link<input class="input" name="url" type="url" required placeholder="https://chatgpt.com/share/…"></label>
<label class="field">Save into<select class="input select" name="dir">${opts}</select></label>
<label class="field">Tags (optional)<input class="input" name="tags" placeholder="e.g. system design, notes"></label>`,
    onOk: async (f) => {
      await gh(`/repos/${repo()}/actions/workflows/import.yml/dispatches`, {
        method: 'POST',
        body: { ref: branch(), inputs: { url: f.url.value.trim(), folder: f.dir.value, tags: f.tags.value.trim() } },
      }).catch((e) => {
        throw new Error(e.status === 404 || e.status === 403 ? 'Could not start the import. Your token needs "Actions: Read and write".' : e.message);
      });
      return true;
    },
  });
  if (r) toast(`Import started. It'll appear in 2–3 minutes. <a href="https://github.com/${esc(repo())}/actions" target="_blank" rel="noopener">Watch progress</a>`, { ms: 12000 });
}

const NEEDS_AUTH = new Set(['edit', 'new-page', 'new-folder', 'edit-folder', 'move', 'delete', 'import']);

export async function run(action, d) {
  if (action === 'signin') return signIn();
  if (action === 'signout') return signOut();
  if (NEEDS_AUTH.has(action) && !token()) {
    if (!(await signIn())) return;
  }
  if (!repo()) return toast('Set "repo" in site.config.json first.', { error: true });
  try {
    if (action === 'edit') return await editPage(d);
    if (action === 'new-page') return openEditor({ dir: d.dir || 'content', isNew: true, text: '' });
    if (action === 'new-folder') return await newFolder(d);
    if (action === 'edit-folder') return await editFolder(d);
    if (action === 'move') return await movePage(d);
    if (action === 'delete') return await deletePage(d);
    if (action === 'import') return await importChat(d);
  } catch (e) {
    if (e.status === 401) {
      ls.del('gh_token');
      document.documentElement.classList.remove('is-owner');
      return toast('Your GitHub token expired or was revoked. Sign in again.', { error: true });
    }
    toast(esc(e.message), { error: true });
  }
}
