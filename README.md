# Neon Notes

A Notion-style site for notes, interview prep and AI conversations. It has folders, ⌘K search, a neon dark theme and a light theme, and an editor that runs in the browser. Every page is a Markdown file in your GitHub repo, and GitHub Pages hosts the site for free.

## 1. Put it on GitHub (one time, ~10 minutes)

1. Create a new **public** repo on GitHub, e.g. `notes`.
2. Edit `site.config.json`:
   ```json
   "title": "Gokul's Notes",
   "repo": "YOUR-USERNAME/notes",
   "url": "https://YOUR-USERNAME.github.io"
   ```
3. Upload this folder to the repo. Either drag-and-drop the files on github.com, or run:
   ```bash
   git init && git add . && git commit -m "First commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/notes.git
   git push -u origin main
   ```
4. On GitHub, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
5. Open the **Actions** tab and wait for "Deploy site" to go green. Your site is live at
   `https://YOUR-USERNAME.github.io/notes/`.

**Custom domain (optional):** add it under Settings → Pages, then set `"url"` to your domain.

## 2. Turn on editing (one time)

1. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with these settings:
   - **Repository access:** only your notes repo
   - **Permissions:** *Contents* → Read and write, *Actions* → Read and write
   - **Expiration:** pick what you're comfortable with
2. On your site, click **Sign in to edit** (bottom of the sidebar) and paste the token.

The token is stored only in that browser. Visitors never see edit buttons, and without your token they can't change anything.

## 3. Everyday use

| You want to… | Do this |
| --- | --- |
| Edit a page | Click **Edit** (top-right). Save with **⌘S / Ctrl+S**. |
| New page | **+** next to "Pages" in the sidebar, or **New page** on any folder |
| New folder | The folder-plus icon next to "Pages", or **⋯ → New sub-folder** |
| Change a folder's icon or colour | Open the folder, then **⋯ → Edit folder** |
| Move / rename / delete a page | **⋯** next to Edit |
| Import an AI chat | **Import AI chat** in the sidebar. Paste a ChatGPT, Claude or Gemini share link. |
| Search | **⌘K / Ctrl+K** |

After you save, the site rebuilds in about a minute. The page you're on updates straight away.

## Writing pages

Pages use normal Markdown (headings, lists, `- [ ]` checklists, tables, code, `$math$`), plus these blocks:

```
::: tip Title          ← callouts: note, tip, info, warning, danger, success
Text
:::

::: qa What is a hash map?      ← interview flashcard (answer hidden until clicked)
The answer…
:::

::: toggle Click to expand      ← collapsible section
Hidden content
:::

::: user                         ← AI conversation, shown as a chat
Your prompt
:::
::: assistant
The reply
:::
```

All of these are on the editor toolbar. Inside a chat, a `::: note` block shows as your own aside between messages.

### Files and folders

```
content/
  index.md                    ← home page
  Interview Prep/
    _folder.json              ← { "icon": "🎯", "color": "lime", "description": "…", "order": 1 }
    DSA/
      hash-map-patterns.md
```

Page settings live at the top of each file:

```yaml
---
title: Hash map patterns
icon: 🗝️
tags: [dsa, must-know]
summary: One line shown under the title
order: 1           # optional: position in the sidebar
draft: true        # optional: hides the page from the site
---
```

Folder colours: `lime`, `cyan`, `pink`, `violet`, `orange`, `yellow`.

## Working on your computer (optional)

```bash
npm install
npm run dev                        # preview at http://localhost:4321
npm run new -- "Graph BFS" --folder "Interview Prep/DSA"

# import a chat locally (first run: npx playwright install chromium)
npm run import -- https://chatgpt.com/share/xxxx --folder "AI Chats" --tags "ideas"
```

**If a share-link import fails** (some sites block automated browsers): run it locally with `--headed`, or create a page and paste the chat into `::: user` / `::: assistant` blocks.
