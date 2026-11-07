#!/usr/bin/env node
// Create a blank page:  npm run new -- "My title" [--folder "Interview Prep/DSA"]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fi = args.indexOf('--folder');
let folder = fi !== -1 ? args.splice(fi, 2)[1] : '';
folder = folder.replace(/^\/+|\/+$/g, '').replace(/^content\/?/, '');
const title = args.join(' ').trim() || 'Untitled';
const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
const dir = path.join(ROOT, 'content', folder);
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${slug}.md`);
if (fs.existsSync(file)) { console.error(`Already exists: ${path.relative(ROOT, file)}`); process.exit(1); }
fs.writeFileSync(file, `---
title: ${JSON.stringify(title)}
icon: 📄
date: ${new Date().toISOString().slice(0, 10)}
tags: []
---

Start writing…
`);
console.log(`✓ Created ${path.relative(ROOT, file)}`);
