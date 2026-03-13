// Jednoduchý SPA router přes query string:
// index.html?table=<table>&category=<category>
(() => {
  'use strict';

  const contentEl = document.getElementById('content');
  if (!contentEl) throw new Error('Chybí <main id="content">');

  const crumbsEl = document.getElementById('breadcrumbs') ?? (() => {
    const el = document.createElement('nav');
    el.id = 'breadcrumbs';
    el.className = 'breadcrumbs';
    el.setAttribute('aria-label', 'breadcrumb');
    contentEl.insertAdjacentElement('afterbegin', el);
    return el;
  })();

  const slotEl = document.getElementById('content-slot') ?? (() => {
    const el = document.createElement('div');
    el.id = 'content-slot';
    crumbsEl.insertAdjacentElement('afterend', el);
    return el;
  })();

  const subnavHost = document.getElementById('subnav');
  if (!subnavHost) throw new Error('Chybí #subnav');

  // Map šablon kategorií (table -> <template>)
  const subnavTpl = new Map();
  document.querySelectorAll('template.subnav-tpl').forEach(tpl => {
    subnavTpl.set(tpl.dataset.table, tpl);
  });

  // Stav
  const cache = new Map();
  let requestId = 0;

  // Utils
  const cssEscape = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : v);

  function getQuery() {
    const u = new URL(window.location.href);
    return {
      table: u.searchParams.get('table'),
      category: u.searchParams.get('category'),
    };
  }

  function setQuery(table, category, replace = false) {
    const u = new URL(window.location.href);
    if (table) u.searchParams.set('table', table); else u.searchParams.delete('table');
    if (category) u.searchParams.set('category', category); else u.searchParams.delete('category');
    const fn = replace ? history.replaceState : history.pushState;
    fn.call(history, {}, '', `${u.pathname}${u.search}`);
  }

  function joinPath(base, file) {
    const b = base ? (base.endsWith('/') ? base : base + '/') : '';
    const f = (file || '').replace(/^\/+/, '');
    return b + f;
  }

  // Render subnav jen pro aktivní table (z template → DOM)
  function renderSubnav(tableKey) {
    subnavHost.innerHTML = '';
    subnavHost.dataset.table = tableKey || '';
    const tpl = subnavTpl.get(tableKey);
    if (tpl) {
      subnavHost.dataset.base = tpl.dataset.base || '';
      subnavHost.appendChild(tpl.content.cloneNode(true));
    } else {
      subnavHost.dataset.base = '';
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'Zatím bez položek.';
      subnavHost.appendChild(empty);
    }
  }

  // UI
  function highlight(tableKey, linkEl) {
    // levé menu
    document.querySelectorAll('.nav-cats a[data-cat]').forEach(a => {
      a.classList.toggle('active', a.dataset.cat === tableKey);
    });
    // pravé menu – jen v rámci hosta
    subnavHost.querySelectorAll('a[data-category]').forEach(a => {
      a.classList.toggle('active', a === linkEl);
    });
  }

  function updateBreadcrumbs(tableKey, categoryKey, linkEl) {
    const tableLabel =
      document.querySelector(`.nav-cats a[data-cat="${tableKey}"]`)?.textContent?.trim() ||
      tableKey || '—';
    const catLabel = linkEl?.textContent?.trim() || categoryKey || '';

    crumbsEl.innerHTML = '';
    const span = (txt, cls) => {
      const s = document.createElement('span');
      s.textContent = txt;
      if (cls) s.className = cls;
      return s;
    };
    const sep = () => span('›', 'crumb-sep');

    crumbsEl.append(span('Cypress'), sep(), span(tableLabel));
    if (categoryKey) crumbsEl.append(sep(), span(catLabel));
  }

  // Načítání
  function clearSlot() { slotEl.innerHTML = ''; }

  async function loadHTML(path) {
    const myReq = ++requestId;

    const render = (html) => {
      if (myReq !== requestId) return; // přebitý request (rychlé prokliky)
      clearSlot();
      if (html) slotEl.innerHTML = html;
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    if (!path) { render(''); return; }
    if (cache.has(path)) { render(cache.get(path)); return; }

    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      cache.set(path, html);
      render(html);
    } catch (e) {
      render(`
        <section class="card">
          <h2 class="h2">Chyba při načítání</h2>
          <p class="muted">${path}</p>
          <pre><code>${String(e)}</code></pre>
        </section>
      `);
    }
  }

  // Routing
  function openFirstCategory(tableKey, replace = false) {
    renderSubnav(tableKey);
    const first = subnavHost.querySelector('a[data-category]');
    if (first) {
      setQuery(tableKey, first.dataset.category, replace);
      handleRoute();
      return;
    }
    highlight(tableKey, null);
    updateBreadcrumbs(tableKey, null, null);
    loadHTML('');
    slotEl.innerHTML = `
      <section class="card">
        <h2 class="h2">${tableKey || '—'}</h2>
        <p class="muted">Zatím bez položek.</p>
      </section>`;
  }

  function handleRoute() {
    const { table, category } = getQuery();
    const defaultTable = document.querySelector('.nav-cats a[data-cat]')?.dataset.cat || 'installation';
    const t = table || defaultTable;

    if (!category) {
      openFirstCategory(t, !table);
      return;
    }

    // nejdřív vygeneruj subnav pro daný table
    renderSubnav(t);

    const safeCategory = cssEscape(category);
    const link = subnavHost.querySelector(`a[data-category="${safeCategory}"]`);

    if (!link) {
      // skupina existuje, ale kategorie ne → otevři první
      return openFirstCategory(t, true);
    }

    highlight(t, link);
    updateBreadcrumbs(t, category, link);

    const base = subnavHost.dataset.base || '';
    const file = link.dataset.file || '';
    if (!file) {
      loadHTML('');
      slotEl.innerHTML = `
        <section class="card">
          <h2 class="h2">Chybí data-file</h2>
          <p class="muted">Položka kategorie nemá atribut <code>data-file</code>.</p>
        </section>`;
      return;
    }

    loadHTML(joinPath(base, file));
  }

  // Delegace kliků
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;

    // Levé menu
    if (a.matches('.nav-cats a[data-cat]')) {
      e.preventDefault();
      setQuery(a.dataset.cat, null);
      handleRoute();
      return;
    }

    // Pravé menu (host)
    if (a.matches('#subnav a[data-category]')) {
      e.preventDefault();
      const tableKey = subnavHost.dataset.table || getQuery().table;
      setQuery(tableKey, a.dataset.category);
      handleRoute();
      return;
    }

    // Ostatní odkazy necháváme být; breadcrumbs jsou neklikací
  });

  // Historie
  window.addEventListener('popstate', handleRoute);

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleRoute);
  } else {
    handleRoute();
  }
})();
