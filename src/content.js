// Walks content/ and builds the folder tree.
//   content/index.md               → home page
//   content/<Folder>/_folder.json  → { icon, color, description, order }   (optional)
//   content/<Folder>/<page>.md     → a page
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontMatter } from './frontmatter.js';
import { countPrompts, plainText } from './render.js';

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';

const toDate = (v) => (v ? new Date(v) : null);
const validDate = (d) => (d && !isNaN(d) ? d : null);

function readPage(abs, rel, folder) {
  const { data, body } = parseFrontMatter(fs.readFileSync(abs, 'utf8'));
  const base = path.basename(abs, '.md');
  const slug = slugify(data.slug || base.replace(/^\d{4}-\d{2}-\d{2}-/, ''));
  const stat = fs.statSync(abs);
  const prompts = countPrompts(body);
  return {
    kind: 'page',
    file: rel, // repo-relative path, e.g. "content/Notes/foo.md"
    slug,
    url: folder.url + slug + '/',
    folder,
    data,
    body,
    title: data.title || base,
    icon: data.icon || (prompts ? '💬' : '📄'),
    tags: (Array.isArray(data.tags) ? data.tags : data.tags ? String(data.tags).split(',') : []).map((t) => String(t).trim()).filter(Boolean),
    created: validDate(toDate(data.date)) || stat.mtime,
    updated: validDate(toDate(data.updated)) || validDate(toDate(data.date)) || stat.mtime,
    order: Number.isFinite(+data.order) ? +data.order : 1000,
    prompts,
    text: plainText(body),
    words: body.split(/\s+/).filter(Boolean).length,
  };
}

export function loadContent(root, rootRel = 'content') {
  const all = [];
  function walk(dirAbs, dirRel, parent) {
    const name = parent ? path.basename(dirAbs) : 'Home';
    let meta = {};
    const metaFile = path.join(dirAbs, '_folder.json');
    if (fs.existsSync(metaFile)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      } catch {}
    }
    const folder = {
      kind: 'folder',
      name,
      dir: dirRel, // repo-relative
      title: meta.title || name,
      icon: meta.icon || '📁',
      color: meta.color || 'cyan',
      description: meta.description || '',
      order: Number.isFinite(+meta.order) ? +meta.order : 1000,
      url: parent ? parent.url + slugify(name) + '/' : '/',
      parent,
      folders: [],
      pages: [],
    };
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      const abs = path.join(dirAbs, entry.name);
      const rel = `${dirRel}/${entry.name}`;
      if (entry.isDirectory()) folder.folders.push(walk(abs, rel, folder));
      else if (entry.name.endsWith('.md') && !(parent === null && entry.name === 'index.md')) {
        const p = readPage(abs, rel, folder);
        if (!p.data.draft || process.argv.includes('--drafts')) {
          folder.pages.push(p);
          all.push(p);
        }
      }
    }
    const byOrder = (a, b) => a.order - b.order || a.title.localeCompare(b.title);
    folder.folders.sort(byOrder);
    folder.pages.sort(byOrder);
    return folder;
  }
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  const tree = walk(root, rootRel, null);
  const homeFile = path.join(root, 'index.md');
  tree.home = fs.existsSync(homeFile) ? readPage(homeFile, `${rootRel}/index.md`, tree) : null;
  if (tree.home) tree.home.url = '/';
  return { tree, pages: all };
}

export function allFolders(tree) {
  const out = [];
  (function rec(f) {
    out.push(f);
    f.folders.forEach(rec);
  })(tree);
  return out;
}

export function countPages(folder) {
  return folder.pages.length + folder.folders.reduce((n, f) => n + countPages(f), 0);
}
