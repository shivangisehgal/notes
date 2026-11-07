// Reader-side behaviour: theme, sidebar tree, search (⌘K), copy buttons, menus.
// Editing actions lazy-load assets/editor.js.
(function () {
  var root = document.documentElement;
  var body = document.body;
  var BASE = body.dataset.base || '/';
  var layer = document.getElementById('layer');
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var norm = function (p) { return decodeURI(p).replace(/index\.html$/, '').replace(/\/?$/, '/'); };

  // ---------- sidebar tree ----------
  var here = norm(location.pathname);
  var open = JSON.parse(store.get('tree-open', '[]') || '[]');
  document.querySelectorAll('.tree-folder').forEach(function (li) {
    var url = norm(li.dataset.url);
    if (open.indexOf(url) !== -1 || here.indexOf(url) === 0) li.classList.add('open');
  });
  document.querySelectorAll('.sb-tree a, .sidebar .sb-item[href]').forEach(function (a) {
    if (norm(new URL(a.href).pathname) === here) (a.closest('.tree-row') || a).classList.add('active');
  });
  document.addEventListener('click', function (e) {
    var caret = e.target.closest('.tree-caret');
    if (!caret) return;
    var li = caret.closest('.tree-folder');
    li.classList.toggle('open');
    var url = norm(li.dataset.url);
    open = open.filter(function (u) { return u !== url; });
    if (li.classList.contains('open')) open.push(url);
    store.set('tree-open', JSON.stringify(open));
  });
  var active = document.querySelector('.tree-row.active');
  if (active) active.scrollIntoView({ block: 'nearest' });

  // ---------- copy buttons ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.copy-btn');
    if (!b) return;
    var code = b.closest('.code-block').querySelector('code').innerText;
    navigator.clipboard.writeText(code).then(function () {
      b.textContent = 'Copied';
      setTimeout(function () { b.textContent = 'Copy'; }, 1400);
    });
  });

  // ---------- search palette ----------
  var index = null;
  function loadIndex() {
    if (index) return Promise.resolve(index);
    return fetch(BASE + 'assets/search.json').then(function (r) { return r.json(); }).then(function (d) { return (index = d); });
  }
  function openSearch() {
    layer.innerHTML =
      '<div class="overlay" data-close><div class="dialog palette" role="dialog" aria-label="Search">' +
      '<input class="input" placeholder="Search pages…" autocomplete="off" spellcheck="false">' +
      '<ul class="palette-list"></ul></div></div>';
    var input = layer.querySelector('input');
    var list = layer.querySelector('.palette-list');
    var sel = 0;
    var results = [];
    function render() {
      if (!index) return;
      var q = input.value.trim().toLowerCase();
      var words = q.split(/\s+/).filter(Boolean);
      results = (index.pages || [])
        .map(function (p) {
          var title = p.t.toLowerCase();
          var hay = (title + ' ' + (p.g || []).join(' ') + ' ' + p.x).toLowerCase();
          if (!words.every(function (w) { return hay.indexOf(w) !== -1; })) return null;
          var score = words.reduce(function (s, w) { return s + (title.indexOf(w) !== -1 ? 10 : 1); }, 0);
          var snip = '';
          if (words.length) {
            var i = p.x.toLowerCase().indexOf(words[0]);
            if (i !== -1) snip = (i > 40 ? '…' : '') + p.x.slice(Math.max(0, i - 40), i + 80);
          }
          return { p: p, score: score, snip: snip };
        })
        .filter(Boolean)
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 30);
      sel = Math.min(sel, Math.max(0, results.length - 1));
      list.innerHTML = results.length
        ? results.map(function (r, i) {
            return '<li><a href="' + esc(r.p.u) + '"' + (i === sel ? ' class="sel"' : '') + '><span>' + esc(r.p.i) + '</span><span>' + esc(r.p.t) +
              (r.snip ? '<span class="ps">' + esc(r.snip) + '</span>' : '') + '</span><span class="pf">' + esc(r.p.f || '') + '</span></a></li>';
          }).join('')
        : '<li class="palette-empty">No matches.</li>';
    }
    input.addEventListener('input', function () { sel = 0; render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = Math.max(0, Math.min(results.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1)));
        render();
        var s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && results[sel]) location.href = results[sel].p.u;
    });
    loadIndex().then(render);
    input.focus();
  }
  function closeLayer() { layer.innerHTML = ''; }
  layer.addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) closeLayer(); });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    else if (e.key === 'Escape' && layer.firstChild && !document.querySelector('.editor')) closeLayer();
  });

  // ---------- menus ----------
  function menu(anchor, items) {
    var r = anchor.getBoundingClientRect();
    layer.innerHTML = '<div class="overlay" data-close style="background:none;backdrop-filter:none"></div><div class="menu" role="menu"></div>';
    var m = layer.querySelector('.menu');
    m.innerHTML = items.map(function (it, i) {
      return '<button type="button" role="menuitem" data-i="' + i + '"' + (it.danger ? ' class="danger"' : '') + '>' + it.label + '</button>';
    }).join('');
    m.style.top = r.bottom + 6 + 'px';
    m.style.right = Math.max(8, innerWidth - r.right) + 'px';
    m.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (b) { closeLayer(); items[+b.dataset.i].run(); }
    });
  }

  // ---------- actions ----------
  var editor = null;
  function ed() { return editor || (editor = import(BASE + 'assets/editor.js')); }
  function run(name, data) { return ed().then(function (m) { return m.run(name, data || {}); }); }
  window.__run = run;

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    var data = Object.assign({}, body.dataset, el.dataset);
    if (a === 'theme') {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      store.set('theme', root.dataset.theme);
    } else if (a === 'search') openSearch();
    else if (a === 'open-sidebar') body.classList.add('sidebar-open');
    else if (a === 'close-sidebar') body.classList.remove('sidebar-open');
    else if (a === 'page-menu' && data.kind === 'home')
      menu(el, [
        { label: '＋ New page', run: function () { run('new-page', data); } },
        { label: '📁 New folder', run: function () { run('new-folder', data); } },
        { label: '⚡ Import AI chat', run: function () { run('import', data); } },
      ]);
    else if (a === 'page-menu')
      menu(el, [
        { label: '＋ New page in this folder', run: function () { run('new-page', data); } },
        { label: '↪ Move / rename', run: function () { run('move', data); } },
        { label: '🗑 Delete page', danger: true, run: function () { run('delete', data); } },
      ]);
    else if (a === 'folder-menu')
      menu(el, [
        { label: '📁 New sub-folder', run: function () { run('new-folder', data); } },
        { label: '🎨 Edit folder (icon, colour, description)', run: function () { run('edit-folder', data); } },
      ]);
    else { if (el.closest('.sidebar')) body.classList.remove('sidebar-open'); run(a, data); }
  });

  var who = document.querySelector('.who');
  if (who) who.textContent = store.get('gh_login', '') ? '(@' + store.get('gh_login', '') + ')' : '';
})();
