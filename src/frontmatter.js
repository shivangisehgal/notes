// Tiny front-matter parser/serializer (works in Node and the browser).
import * as yaml from 'js-yaml';

export function parseFrontMatter(raw) {
  raw = String(raw || '').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---[ \t]*\n?/);
  if (!m) return { data: {}, body: raw };
  let data = {};
  try {
    data = yaml.load(m[1]) || {};
  } catch {
    data = {};
  }
  return { data, body: raw.slice(m[0].length) };
}

export function stringifyFrontMatter(data, body) {
  const clean = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    clean[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
  }
  const head = Object.keys(clean).length ? `---\n${yaml.dump(clean, { lineWidth: -1 })}---\n\n` : '';
  return head + String(body || '').replace(/^\n+/, '');
}
