// Navegación simple entre vistas: home -> tcg -> colección
const TCGS = [
  { id: 'magic', name: 'Magic: The Gathering', image: '../assets/tcg/magic.svg', enabled: false },
  { id: 'pokemon', name: 'Pokémon', image: '../assets/tcg/pokemon.svg', enabled: true, example: 'Charizard', source: 'TCGdex' },
  { id: 'onepiece', name: 'One Piece', image: '../assets/tcg/onepiece.svg', enabled: true, example: 'Luffy', source: 'OPTCG API' },
];

const view = document.getElementById('view');
const backBtn = document.getElementById('back');
const breadcrumb = document.getElementById('breadcrumb');
const dataSource = document.getElementById('data-source');
const modal = document.getElementById('modal');
const modalImg = document.getElementById('modal-img');

const navStack = [];

function navigate(fn, ...args) {
  navStack.push([fn, args]);
  fn(...args);
}

backBtn.addEventListener('click', () => {
  if (navStack.length < 2) return;
  navStack.pop();
  const [fn, args] = navStack[navStack.length - 1];
  fn(...args);
});

function setChrome(crumb, tcg) {
  breadcrumb.textContent = crumb;
  dataSource.textContent = tcg ? tcg.source : TCGS.filter((t) => t.source).map((t) => t.source).join(' · ');
  backBtn.classList.toggle('hidden', navStack.length < 2);
}

// Como node.replaceChildren, pero ignora null/undefined (replaceChildren los escribiría como texto "null").
function setChildren(node, ...children) {
  node.replaceChildren(...children.flat().filter((c) => c != null));
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v; // CSSOM: permitido por la CSP
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

// TCGdex da la ruta base de la imagen (se elige la calidad); OPTCG API, la URL completa del .jpg.
function cardImage(url, quality = 'low') {
  if (!url) return '';
  return /\.(jpe?g|png|webp)$/i.test(url) ? url : `${url}/${quality}.webp`;
}

// ---------- Vista 1: elegir TCG ----------
function showHome() {
  setChrome('Choose your TCG');
  setChildren(view,
    el('h1', { class: 'title' }, 'Which collection do you want to manage?'),
    el('div', { class: 'tcg-grid' },
      TCGS.map((t) =>
        el('button', {
          class: 'tcg-tile' + (t.enabled ? '' : ' disabled'),
          disabled: !t.enabled,
          onclick: () => navigate(showTcg, t),
        },
          el('img', { src: t.image, alt: t.name }),
          el('span', { class: 'tcg-name' }, t.name),
          t.enabled ? null : el('span', { class: 'soon' }, 'Coming soon'))
      ))
  );
}

// ---------- Vista 2: colecciones de un TCG ----------
async function showTcg(tcg) {
  setChrome(tcg.name, tcg);
  setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }),
    el('p', {}, tcg.id === 'onepiece' ? 'Loading… (the first time it downloads every One Piece card, this takes a few seconds)' : 'Loading…')));
  let collections, dexStats;
  try {
    [collections, dexStats] = await Promise.all([
      window.tcg.listCollections(tcg.id),
      tcg.id === 'pokemon' ? window.tcg.pokedexStats() : null,
    ]);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, 'Could not download the cards. Are you connected to the internet?'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showTcg(tcg) }, 'Retry'));
    return;
  }
  const pokedexItem = tcg.id !== 'pokemon' ? null :
    el('button', { class: 'collection-item pokedex-item', onclick: () => navigate(showPokedex, tcg) },
      itemHeader('Pokédex', dexStats?.owned, dexStats?.with_fullart),
      el('div', { class: 'collection-meta' },
        dexStats ? `${dexStats.owned} / ${dexStats.with_fullart} Pokémon collected`
                 : 'Not downloaded yet'),
      dexStats ? progressBar(dexStats.owned, dexStats.with_fullart) : null);

  // Solo se muestran los sets en los que ya tienes alguna carta; todos, desde "View sets".
  // Las colecciones custom van junto a la Pokédex, siempre visibles aunque no tengan cartas.
  const setGrid = el('div', { class: 'collection-grid' });
  const customGrid = el('div', { class: 'collection-grid' });
  const renderSets = (cols) => {
    setChildren(customGrid, pokedexItem, ...cols.filter((c) => c.custom).map((c) => collectionItem(tcg, c)));
    const active = cols.filter((c) => !c.custom && c.owned > 0);
    setChildren(setGrid, ...active.map((c) => collectionItem(tcg, c)));
    if (!active.length) setGrid.append(el('p', { class: 'muted' },
      'No sets with cards yet. Search for a card above or use View sets to open a set.'));
    if (!customGrid.children.length) customGrid.append(el('p', { class: 'muted' },
      'No collections yet. Use Create collection to group cards from any set.'));
  };
  // Al marcar una carta desde el buscador, el set aparece (o desaparece) de la lista al momento.
  const search = cardSearch(tcg, async () => renderSets(await window.tcg.listCollections(tcg.id)));

  setChildren(view,
    el('h1', { class: 'title' }, tcg.name),
    search,
    el('div', { class: 'section-head collections-head' },
      el('h2', { class: 'section-title' }, 'Collections'),
      el('button', { class: 'btn btn-secondary btn-icon', onclick: () => navigate(showCollectionEditor, tcg, null) },
        el('span', { class: 'icon-plus' }), 'Create collection')),
    customGrid,
    el('div', { class: 'section-head sets-head' },
      el('h2', { class: 'section-title' }, 'Sets'),
      el('button', { class: 'btn btn-secondary', onclick: () => navigate(showAllSets, tcg) }, 'View sets')),
    setGrid
  );
  renderSets(collections);
}

function collectionItem(tcg, c) {
  return el('button', { class: 'collection-item', onclick: () => navigate(showCollection, tcg, c.id) },
    itemHeader(c.name, c.owned, c.total),
    el('div', { class: 'collection-meta' },
      c.total || c.hidden ? `${c.owned} / ${c.total} cards` : c.custom ? 'No cards yet' : 'Not downloaded yet',
      c.hidden ? el('span', { class: 'hidden-count' }, ` · ${c.hidden} hidden`) : null),
    c.total ? progressBar(c.owned, c.total) : null);
}

// ---------- Buscador de cartas en todos los sets ----------
// onChange (opcional): se llama después de marcar o desmarcar una carta.
const cardSearchState = {}; // texto buscado, por TCG

function cardSearch(tcg, onChange) {
  const results = el('div', { class: 'search-results' });
  const filters = filterState(`search:${tcg.id}`);
  const input = el('input', {
    class: 'search', type: 'search', placeholder: `Search cards to add, e.g. ${tcg.example}`, value: cardSearchState[tcg.id] || '',
    onkeydown: (e) => { if (e.key === 'Enter') run(); },
    onsearch: (e) => { if (!e.target.value) run(); },
  });
  const run = async () => {
    const q = input.value.trim();
    cardSearchState[tcg.id] = q;
    if (q.length < 2) { setChildren(results); return; }
    setChildren(results, el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, 'Searching…')));
    let cards;
    try {
      cards = await window.tcg.searchCards(q, tcg.id);
    } catch (err) {
      if (cardSearchState[tcg.id] === q) setChildren(results, el('p', { class: 'error' }, `Search failed: ${err.message || err}`));
      return;
    }
    if (cardSearchState[tcg.id] !== q) return; // llegó tarde: ya se buscó otra cosa
    cards = cards.map((c) => ({ ...c, image_url: c.image, local_id: c.localId }));
    const grid = el('div', { class: 'card-grid' });
    const title = el('h2', { class: 'section-title' });
    const advanced = advancedFilter(tcg, filters, { getCards: () => cards, onChange: () => render() });
    const render = () => {
      const list = filterCards(cards, filters);
      const found = `${cards.length} card${cards.length === 1 ? '' : 's'} found`;
      title.textContent = list.length === cards.length ? found : `${found} · ${list.length} shown`;
      setChildren(grid, ...list.map((c) => cardTile(c, async () => {
        if (c.quantity > 1) return; // la cantidad se gestiona desde el set
        c.quantity = c.quantity > 0 ? 0 : 1;
        await window.tcg.setOwned(c.id, c.quantity,
          { id: c.id, setId: c.set.id, localId: c.localId, name: c.name, rarity: c.rarity, image: c.image });
        render();
        onChange?.();
      }, [c.set.name, c.rarity || '', c.price != null ? formatPrice(c) : null].filter((l) => l != null))));
      if (cards.length && !list.length) grid.append(el('p', { class: 'muted' }, 'No cards match these filters.'));
    };
    render();
    setChildren(results,
      el('div', { class: 'section-head' },
        title,
        el('div', { class: 'section-actions' },
          cards.length ? advanced.button : null,
          el('button', { class: 'chip', onclick: () => { input.value = ''; run(); } }, 'Clear'))),
      advanced.badges,
      cards.length ? el('p', { class: 'muted hint' }, 'Click a card to mark it as owned.') : null,
      grid);
  };
  if (cardSearchState[tcg.id]) run();
  return el('div', { class: 'card-search' },
    el('div', { class: 'search-row' }, input, el('button', { class: 'btn', onclick: run }, 'Search')),
    results);
}

// ---------- Todos los sets ----------
const setsState = { setQuery: '', scroll: 0 };

async function showAllSets(tcg, opts = {}) {
  setChrome(`${tcg.name} › All sets`, tcg);
  setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', {}, 'Loading sets…')));

  let collections;
  try {
    collections = await window.tcg.listCollections(tcg.id, opts);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, 'Could not download the set list. Are you connected to the internet?'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showAllSets(tcg, opts) }, 'Retry'));
    return;
  }
  collections = collections.filter((c) => !c.custom); // las custom están en la pantalla principal
  const open = (c) => { setsState.scroll = view.scrollTop; navigate(showCollection, tcg, c.id); };
  const withCards = collections.filter((c) => c.owned > 0).length;

  // Lista de sets agrupada por serie (vienen ordenados del más nuevo al más antiguo).
  const setList = el('div', {});
  const renderSets = () => {
    const q = setsState.setQuery.trim().toLowerCase();
    const groups = new Map();
    for (const c of collections) {
      if (q && !c.name.toLowerCase().includes(q) && !(c.serie_name || '').toLowerCase().includes(q)) continue;
      const key = c.serie_name || 'Collections';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    setChildren(setList, ...[...groups].map(([serie, items]) => el('section', {},
      el('h2', { class: 'section-title' }, serie),
      el('div', { class: 'set-grid' }, items.map((c) => setTile(c, () => open(c)))))));
    if (!groups.size) setList.append(el('p', { class: 'muted' }, 'No sets match.'));
  };

  const setFilter = el('input', {
    class: 'search', type: 'search', placeholder: 'Filter sets…', value: setsState.setQuery,
    oninput: (e) => { setsState.setQuery = e.target.value; renderSets(); },
  });

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, 'All sets'),
        el('div', { class: 'counter' }, `${collections.length} sets · ${withCards} with cards`)),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          el('button', { class: 'btn', onclick: () => { setsState.scroll = 0; showAllSets(tcg, { refreshSets: true }); } },
            'Update set list')),
        el('div', { class: 'toolbar-row' }, setFilter))),
    setList
  );
  renderSets();
  view.scrollTop = setsState.scroll;
}

function setTile(c, onClick) {
  const owned = c.owned > 0;
  return el('button', { class: 'set-tile' + (owned ? ' has-cards' : ''), onclick: onClick },
    el('div', { class: 'set-logo' },
      c.logo ? el('img', { src: `${c.logo}.webp`, alt: '', loading: 'lazy' })
        : c.tcg === 'onepiece' ? el('span', { class: 'set-code' }, c.set_id) : el('span', {}, 'No logo')),
    el('div', { class: 'set-name' }, c.name),
    el('div', { class: 'collection-meta' },
      [c.release_date?.slice(0, 4), owned ? `${c.owned} / ${c.total} cards` : c.total ? `${c.total} cards` : null]
        .filter(Boolean).join(' · ')),
    owned && c.total ? progressBar(c.owned, c.total) : null);
}

// Nombre de la colección con el porcentaje completado a la derecha.
function itemHeader(name, owned, total) {
  return el('div', { class: 'collection-head' },
    el('div', { class: 'collection-name' }, name),
    total ? el('div', { class: 'collection-pct' + (owned >= total ? ' complete' : '') }, formatPct(owned, total)) : null);
}

function formatPct(owned, total) {
  const pct = (owned / total) * 100;
  // Con pocos avances mostramos un decimal (1,2 %); nunca redondeamos a 100 % si falta alguna.
  const digits = pct > 0 && pct < 10 ? 1 : 0;
  const factor = 10 ** digits;
  const value = owned >= total ? 100 : Math.floor(pct * factor) / factor;
  return `${value.toLocaleString('en', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}

function progressBar(owned, total) {
  const pct = total ? Math.round((owned / total) * 100) : 0;
  return el('div', { class: 'progress' },
    el('div', { class: 'progress-fill', style: `width:${pct}%` }));
}

// ---------- Filtros avanzados ----------
// Dentro de un grupo vale cualquiera de los valores elegidos; entre grupos, todos a la vez.
// get(carta) devuelve un valor o una lista; order, el orden de las opciones (las que no están, al final);
// single: en el diálogo solo se puede elegir una opción.
const FILTER_GROUPS = [
  { key: 'type', label: 'Card type', get: (c) => c.attrs?.type,
    order: ['Pokémon', 'Trainer', 'Energy', 'Leader', 'Character', 'Event', 'Stage'] },
  { key: 'subtype', label: 'Trainer / Energy type', get: (c) => c.attrs?.subtype,
    order: ['Item', 'Supporter', 'Stadium', 'Tool', 'Basic Energy', 'Special Energy'] },
  { key: 'color', label: (tcg) => (tcg.id === 'pokemon' ? 'Pokémon type' : 'Color'), get: (c) => c.attrs?.colors,
    order: ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless',
      'Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'] },
  { key: 'rarity', label: 'Rarity', get: (c) => c.rarity,
    display: (v, tcg) => (tcg.id === 'onepiece' && OP_RARITIES[v]) || v,
    order: ['Common', 'Uncommon', 'Rare', 'Holo Rare', 'Rare Holo', 'Double rare', 'ACE SPEC Rare', 'Ultra Rare',
      'Illustration rare', 'Special illustration rare', 'Shiny rare', 'Shiny Ultra Rare', 'Hyper rare', 'Secret Rare', 'Promo',
      'L', 'C', 'UC', 'R', 'SR', 'SEC', 'SP', 'TR', 'PR'] },
  { key: 'stage', label: 'Stage', get: (c) => c.attrs?.stage, order: ['Basic', 'Stage 1', 'Stage 2'] },
  { key: 'mechanic', label: 'Mechanic', get: (c) => c.attrs?.mechanic, order: ['ex', 'EX', 'GX', 'V', 'VMAX', 'VSTAR'] },
  { key: 'attribute', label: 'Attribute', get: (c) => c.attrs?.attributes, order: ['Slash', 'Strike', 'Ranged', 'Special', 'Wisdom'] },
  { key: 'version', label: 'Version', get: (c) => c.attrs?.version, single: true, order: ['Standard', 'Alternate art'] },
  // Los sets se dejan en el orden en que llegan las cartas (del más nuevo al más antiguo).
  { key: 'set', label: 'Set', get: (c) => c.set_name || c.setName || c.set?.name, keepOrder: true },
];
const OWNED_STATUS = [['owned', 'Owned'], ['missing', 'Not owned']];
// OPTCG API da la rareza abreviada: en los filtros se muestra el nombre completo.
const OP_RARITIES = {
  L: 'Leader', C: 'Common', UC: 'Uncommon', R: 'Rare', SR: 'Super Rare', SEC: 'Secret Rare',
  SP: 'Special', TR: 'Treasure Rare', PR: 'Promo',
};

// Filtros elegidos de cada pantalla (por set, y por TCG en los buscadores): se conservan al volver.
const filterStates = {};
function filterState(key) {
  return (filterStates[key] ||= { status: null, values: {} });
}

const groupLabel = (g, tcg) => (typeof g.label === 'function' ? g.label(tcg) : g.label);
const valueLabel = (g, v, tcg) => (g.display ? g.display(v, tcg) : v);
const valuesOf = (g, card) => [].concat(g.get(card) ?? []).map(String);

// Chip de opción; data-label reserva el ancho del texto en negrita para que al activarlo no se mueva nada.
const optionChip = (label, isActive, onClick) =>
  el('button', { class: 'chip' + (isActive ? ' active' : ''), 'data-label': label, onclick: onClick }, label);

// El estado 'hidden' lo resuelve quien llama (elige de qué lista de cartas parte).
function filterCards(cards, state) {
  return cards.filter((c) => {
    if (state.status === 'owned' && !(c.quantity > 0)) return false;
    if (state.status === 'missing' && c.quantity > 0) return false;
    return FILTER_GROUPS.every((g) => {
      const picked = state.values[g.key];
      return !picked?.length || valuesOf(g, c).some((v) => picked.includes(v));
    });
  });
}

function groupOptions(g, cards, picked) {
  const values = [...new Set([...cards.flatMap((c) => valuesOf(g, c)), ...picked])];
  if (g.keepOrder) return values;
  const rank = (v) => { const i = g.order ? g.order.indexOf(v) : -1; return i < 0 ? Infinity : i; };
  return values.sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b));
}

// Botón "Filters" (abre el diálogo) y fila de badges con los filtros aplicados, que se quitan uno a uno.
// getCards: cartas de las que salen las opciones; statusOptions: función que da [clave, texto] del grupo "Collection".
// quickStatus: muestra además los chips All / Owned / Not owned mientras no haya otros filtros aplicados.
function advancedFilter(tcg, state, { getCards, statusOptions = () => OWNED_STATUS, quickStatus = false, onChange }) {
  const button = el('button', {
    class: 'btn btn-secondary btn-icon filter-btn', title: 'Advanced filters',
    onclick: async () => {
      const next = await openFilterDialog(tcg, getCards(), state, statusOptions());
      if (!next) return;
      Object.assign(state, next);
      onChange();
      update();
    },
  });
  const badges = el('div', { class: 'filter-badges' });
  const chips = el('div', { class: 'chips' });
  const showQuick = () => quickStatus && !FILTER_GROUPS.some((g) => state.values[g.key]?.length);

  // Con los chips rápidos a la vista, el estado elegido en ellos no se repite como badge.
  const active = () => {
    const list = [];
    const status = statusOptions().find(([k]) => k === state.status);
    if (status && !showQuick()) list.push({ label: status[1], remove: () => { state.status = null; } });
    for (const g of FILTER_GROUPS) {
      for (const v of state.values[g.key] || []) {
        list.push({ label: `${groupLabel(g, tcg)}: ${valueLabel(g, v, tcg)}`, remove: () => {
          state.values[g.key] = state.values[g.key].filter((x) => x !== v);
        } });
      }
    }
    return list;
  };
  const removeAndRefresh = (fn) => { fn(); onChange(); update(); };

  const update = () => {
    const list = active();
    setChildren(button, el('span', { class: 'icon-filter' }), 'Filters',
      list.length ? el('span', { class: 'filter-count' }, String(list.length)) : null);
    setChildren(badges,
      list.map((f) => el('span', { class: 'filter-badge' }, f.label,
        el('button', { class: 'filter-badge-x', title: 'Remove this filter', onclick: () => removeAndRefresh(f.remove) },
          el('span', { class: 'icon-x' })))),
      list.length > 1 ? el('button', {
        class: 'link filter-clear',
        onclick: () => removeAndRefresh(() => { state.status = null; state.values = {}; }),
      }, 'Clear all') : null);
    badges.classList.toggle('hidden', !list.length);
    setChildren(chips, showQuick() ? [['', 'All'], ...statusOptions()].map(([k, label]) =>
      optionChip(label, (state.status || '') === k, () => removeAndRefresh(() => { state.status = k || null; }))) : null);
    chips.classList.toggle('hidden', !showQuick());
  };
  update();
  return { button, badges, chips, update };
}

// Trabaja sobre una copia: devuelve el estado nuevo al pulsar "Apply", o null si se cancela.
// Cada grupo es un desplegable: de selección múltiple, o de una sola opción si el grupo es single.
function openFilterDialog(tcg, cards, state, statusOptions) {
  return new Promise((resolve) => {
    const draft = {
      status: state.status,
      values: Object.fromEntries(Object.entries(state.values).map(([k, v]) => [k, [...v]])),
    };
    const body = el('div', { class: 'filter-groups' });

    // El panel abierto va en <body> con posición fija, para que no lo recorte el scroll del diálogo.
    let openPanel = null;
    const closePanel = () => {
      if (!openPanel) return;
      openPanel.panel.remove();
      openPanel.trigger.classList.remove('open');
      openPanel = null;
    };

    // options: [valor, texto]; getSelected() da los valores elegidos; onPick(valor) cambia la selección
    // (en los de una sola opción, valor null = "All"). Sin nada elegido, el campo muestra su nombre.
    const dropdown = (title, options, single, getSelected, onPick) => {
      const value = el('span', { class: 'dropdown-value' });
      const trigger = el('button', {
        class: 'dropdown-trigger', type: 'button', 'aria-haspopup': 'listbox',
        onclick: (e) => { e.stopPropagation(); if (openPanel?.trigger === trigger) closePanel(); else open(); },
      }, value, el('span', { class: 'dropdown-caret' }));
      const items = single ? [[null, 'All'], ...options] : options;

      const refresh = () => {
        const labels = options.filter(([v]) => getSelected().includes(v)).map(([, l]) => l);
        value.textContent = !labels.length ? title : labels.length <= 2 ? labels.join(', ') : `${labels.length} selected`;
        trigger.classList.toggle('has-value', labels.length > 0);
      };

      const open = () => {
        closePanel();
        const panel = el('div', {
          class: 'dropdown-panel', role: 'listbox', 'aria-multiselectable': String(!single),
          onclick: (e) => e.stopPropagation(),
        });
        const renderItems = () => {
          const selected = getSelected();
          setChildren(panel,
            items.map(([v, label]) => {
              const on = v === null ? !selected.length : selected.includes(v);
              return el('button', {
                class: 'dropdown-item' + (on ? ' selected' : ''), type: 'button', role: 'option', 'aria-selected': String(on),
                onclick: () => {
                  onPick(v);
                  refresh();
                  if (single) closePanel(); else renderItems();
                },
              }, el('span', { class: single ? 'dropdown-radio' : 'dropdown-check' }), label);
            }),
            !single && selected.length ? el('button', {
              class: 'dropdown-clear', type: 'button',
              onclick: () => { selected.forEach(onPick); refresh(); renderItems(); },
            }, 'Clear selection') : null);
        };
        renderItems();
        document.body.append(panel);
        // Debajo del campo si cabe; si no, encima. Si no cabe entero, con scroll.
        const r = trigger.getBoundingClientRect();
        const below = window.innerHeight - r.bottom - 12;
        const above = r.top - 12;
        const up = panel.offsetHeight > below && above > below;
        panel.style.minWidth = `${r.width}px`;
        panel.style.maxHeight = `${Math.max(120, up ? above : below)}px`;
        panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8))}px`;
        panel.style.top = up ? `${Math.max(8, r.top - 4 - panel.offsetHeight)}px` : `${r.bottom + 4}px`;
        trigger.classList.add('open');
        openPanel = { panel, trigger };
      };

      refresh();
      return el('div', { class: 'filter-field' }, el('span', { class: 'filter-field-label' }, title), trigger);
    };

    const render = () => {
      closePanel();
      const groups = FILTER_GROUPS.map((g) => {
        const picked = () => draft.values[g.key] || [];
        const options = groupOptions(g, cards, picked());
        if (options.length < 2 && !picked().length) return null; // una sola opción no filtra nada
        return dropdown(groupLabel(g, tcg), options.map((v) => [v, valueLabel(g, v, tcg)]), g.single, picked, (v) => {
          const now = picked();
          draft.values[g.key] = g.single ? (v === null ? [] : [v]) : now.includes(v) ? now.filter((x) => x !== v) : [...now, v];
        });
      }).filter(Boolean);
      setChildren(body,
        dropdown('Collection', statusOptions, true, () => (draft.status ? [draft.status] : []), (v) => { draft.status = v; }),
        groups,
        groups.length ? null : el('p', { class: 'muted filter-empty' }, 'There is no card data to filter by type, rarity or color here.'));
    };

    const close = (value) => {
      closePanel();
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    const apply = () => {
      for (const [k, v] of Object.entries(draft.values)) if (!v.length) delete draft.values[k];
      close(draft);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (openPanel) closePanel(); else close(null);
      }
      // Enter sobre un botón (p. ej. una opción del desplegable) lo pulsa; en cualquier otro sitio, aplica.
      if (e.key === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); apply(); }
    };
    const overlay = el('div', {
      class: 'dialog-overlay',
      onclick: (e) => { if (openPanel) closePanel(); else if (e.target === overlay) close(null); },
    },
      el('div', { class: 'dialog filter-dialog', role: 'dialog' },
        el('h3', {}, 'Filters'),
        el('p', { class: 'muted' }, 'Leave a field empty to not filter by it.'),
        body,
        el('div', { class: 'dialog-actions' },
          el('button', { class: 'link filter-reset', onclick: () => { draft.status = null; draft.values = {}; render(); } },
            'Clear all'),
          el('button', { class: 'chip', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn', onclick: apply }, 'Apply'))));
    body.addEventListener('scroll', closePanel);
    render();
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
  });
}

// ---------- Vista 3: listado de cartas ----------

async function showCollection(tcg, collectionId, opts = {}) {
  setChrome(`${tcg.name} › …`, tcg);
  setChildren(view, el('div', { class: 'loading' },
    el('div', { class: 'spinner' }),
    el('p', {}, opts.refresh ? `Updating cards from ${tcg.source}…` : 'Loading cards…')));

  let data;
  try {
    data = await window.tcg.getCollection(collectionId, opts);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, 'Could not download the cards. Are you connected to the internet?'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showCollection(tcg, collectionId, opts) }, 'Retry'));
    return;
  }
  const { collection, cards } = data;
  setChrome(`${tcg.name} › ${collection.name}`, tcg);

  const counter = el('div', { class: 'counter' });
  const bar = el('div', { class: 'progress-fill' });
  const grid = el('div', { class: 'card-grid' });

  // Las cartas ocultas no cuentan para el total ni para el porcentaje.
  const shown = () => cards.filter((c) => !c.hidden);
  const hiddenCount = () => cards.length - shown().length;

  const filters = filterState(`collection:${collectionId}`);
  const advanced = advancedFilter(tcg, filters, {
    getCards: () => cards,
    statusOptions: () => [...OWNED_STATUS, ...(hiddenCount() ? [['hidden', `Hidden (${hiddenCount()})`]] : [])],
    quickStatus: true,
    onChange: () => render(),
  });

  const refreshStats = () => {
    const visible = shown();
    const owned = visible.filter((c) => c.quantity > 0).length;
    const hidden = hiddenCount();
    setChildren(counter, `${owned} / ${visible.length} collected`,
      hidden ? el('span', { class: 'hidden-count' }, ` · ${hidden} hidden`) : null);
    bar.style.width = `${visible.length ? (owned / visible.length) * 100 : 0}%`;
  };

  const setHidden = async (card, hidden) => {
    await window.tcg.setHidden(collectionId, card.id, hidden);
    card.hidden = hidden ? 1 : 0;
    refreshStats();
    render();
  };

  const setQuantity = async (card, quantity) => {
    card.quantity = Math.max(0, quantity);
    // En una colección custom la carta también se añade a su set, para que el set cuente como "con cartas".
    await window.tcg.setOwned(card.id, card.quantity, collection.custom ? draftCard(card) : undefined);
    refreshStats();
    render();
  };

  const menuFor = (card) => [
    ...quantityMenuItems(tcg, card, (q) => setQuantity(card, q), (changed) => {
      for (const c of cards) if (changed[c.id] != null) c.quantity = changed[c.id];
      refreshStats();
      render();
    }),
    { separator: true },
    card.hidden
      ? { label: 'Add back to set', icon: '↺', onClick: () => setHidden(card, false) }
      : { label: 'Hide from set', icon: '⊘', onClick: () => setHidden(card, true) },
    collection.custom ? { label: 'Remove from collection', icon: '×', onClick: () => removeCard(card) } : null,
  ];

  const removeCard = async (card) => {
    const rest = cards.filter((c) => c !== card);
    await window.tcg.saveCustomCollection({ id: collection.id, tcg: tcg.id, name: collection.name, cards: rest.map(draftCard) });
    cards.splice(cards.indexOf(card), 1);
    refreshStats();
    render();
  };

  const removeCollection = async () => {
    if (!await deleteCustomCollection(collectionId, collection.name)) return;
    navStack.pop();
    const [fn, args] = navStack[navStack.length - 1];
    fn(...args);
  };

  const render = () => {
    if (filters.status === 'hidden' && !hiddenCount()) filters.status = null;
    advanced.update();
    const list = filterCards(filters.status === 'hidden' ? cards.filter((c) => c.hidden) : shown(), filters);
    // Con más de una copia el clic no hace nada, para no perder la cantidad por error: se cambia desde ⋮.
    setChildren(grid, ...list.map((card) => cardTile(card, () => {
      if (card.quantity <= 1) setQuantity(card, card.quantity ? 0 : 1);
    }, [collection.custom ? card.set_name || card.set_id : null, card.rarity || '', `Quantity: ${card.quantity}`,
      card.price != null ? formatPrice(card) : null].filter((l) => l != null), () => menuFor(card))));
    if (!list.length) grid.append(el('p', { class: 'muted' }, !cards.length && collection.custom
      ? 'This collection has no cards yet. Use Edit Collection to add some.' : 'No cards match this filter.'));
  };

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, collection.name),
        counter,
        el('div', { class: 'progress wide' }, bar)),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          notesButton(collection),
          collection.custom
            ? el('button', { class: 'btn', onclick: () => navigate(showCollectionEditor, tcg, collectionId) }, 'Edit Collection')
            : el('button', { class: 'btn', onclick: () => showCollection(tcg, collectionId, { refresh: true }) },
              'Update from API'),
          collection.custom ? el('button', { class: 'btn btn-danger', onclick: removeCollection }, 'Delete Collection') : null),
        el('div', { class: 'toolbar-row' }, advanced.chips, advanced.button))),
    advanced.badges,
    el('p', { class: 'muted hint' },
      'Click a card to mark or unmark it. Hover over it and use ⤢ to view it larger, or ⋮ to change the quantity and more options.'),
    grid
  );
  refreshStats();
  render();
}

// Botón "Notes" del set: abre un diálogo para ver o editar la nota.
function notesButton(collection) {
  return el('button', {
    class: 'btn btn-secondary', title: 'View or edit the notes',
    onclick: async () => {
      const value = await editNotes(collection);
      if (value == null || value === (collection.notes || '')) return;
      await window.tcg.setCollectionNotes(collection.id, value);
      collection.notes = value;
    },
  }, '📝 Notes');
}

// Devuelve el texto nuevo, o null si se cancela.
function editNotes(collection) {
  return new Promise((resolve) => {
    const textarea = el('textarea', { class: 'notes-input', rows: '10', placeholder: 'Write anything about this set…' });
    textarea.value = collection.notes || '';
    const close = (value) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    };
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
      el('div', { class: 'dialog notes-dialog', role: 'dialog' },
        el('h3', {}, 'Notes'),
        el('p', { class: 'muted' }, collection.name),
        textarea,
        el('div', { class: 'dialog-actions' },
          el('button', { class: 'chip', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn', onclick: () => close(textarea.value) }, 'Save'))));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    textarea.focus();
  });
}

// ---------- Crear / editar una colección custom ----------
// Carta en el formato que guarda el editor (desde una fila de getCards).
function draftCard(card) {
  return {
    id: card.id, setId: card.set_id, setName: card.set_name, localId: card.local_id,
    name: card.name, rarity: card.rarity, image: card.image_url, price: card.price, attrs: card.attrs,
  };
}

// collectionId null = colección nueva. Los cambios solo se guardan al pulsar "Save".
async function showCollectionEditor(tcg, collectionId) {
  const isNew = !collectionId;
  setChrome(`${tcg.name} › ${isNew ? 'New collection' : 'Edit collection'}`, tcg);
  const draft = { id: collectionId, name: '', cards: [] };
  if (!isNew) {
    setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', {}, 'Loading collection…')));
    const { collection, cards } = await window.tcg.getCollection(collectionId);
    draft.name = collection.name;
    draft.cards = cards.map((c) => ({ ...draftCard(c), quantity: c.quantity }));
  }

  const tile = (c) => ({ ...c, image_url: c.image, local_id: c.localId });
  const included = () => new Set(draft.cards.map((c) => c.id));

  // Las cantidades se guardan al momento (son globales, igual que en los sets).
  const setQuantity = async (c, quantity) => {
    c.quantity = Math.max(0, quantity);
    await window.tcg.setOwned(c.id, c.quantity, c);
    for (const r of [...results, ...draft.cards]) if (r.id === c.id) r.quantity = c.quantity;
    renderAll();
  };
  const toggleOwned = (c) => {
    if (c.quantity > 1) return; // con varias copias, la cantidad se cambia desde ⋮
    setQuantity(c, c.quantity > 0 ? 0 : 1);
  };
  const menuFor = (c) => [
    ...quantityMenuItems(tcg, tile(c), (q) => setQuantity(c, q), (changed) => {
      for (const r of [...results, ...draft.cards]) if (changed[r.id] != null) r.quantity = changed[r.id];
      renderAll();
    }),
    { separator: true },
    { label: 'Remove from collection', icon: '×', onClick: () => toggleIncluded(c) },
  ];
  const toggleIncluded = (c) => {
    draft.cards = included().has(c.id) ? draft.cards.filter((x) => x.id !== c.id) : [...draft.cards, c];
    renderAll();
  };

  // Cartas de la colección: clic = la tengo / no la tengo; ⋮ = cantidad, enlaces y quitar de la colección.
  const selectedTitle = el('h2', { class: 'section-title' });
  const selectedGrid = el('div', { class: 'card-grid' });
  const renderSelected = () => {
    selectedTitle.textContent = `Cards in this collection (${draft.cards.length})`;
    setChildren(selectedGrid, ...draft.cards.map((c) => cardTile(tile(c), () => toggleOwned(c),
      [c.setName || c.setId, c.rarity || '', `Quantity: ${c.quantity || 0}`], () => menuFor(c))));
    if (!draft.cards.length) selectedGrid.append(el('p', { class: 'muted' }, 'No cards yet. Search above to add some.'));
  };

  // Resultados de búsqueda: clic (o +/−) = añadir a la colección / quitar; ⋮ (si ya está) = cantidad y más.
  let results = [];
  const resultsBox = el('div', {});
  const pickTile = (c) => {
    const isIn = included().has(c.id);
    const t = tile(c);
    return el('div', {
      class: 'card pick' + (isIn ? ' owned' : ''),
      title: isIn ? 'In the collection (click to remove it)' : 'Click to add it to the collection',
      onclick: () => toggleIncluded(c),
    },
      el('div', { class: 'card-img-wrap' },
        t.image_url
          ? el('img', { src: cardImage(t.image_url), alt: c.name, loading: 'lazy' })
          : el('div', { class: 'no-image' }, c.name, el('br'), 'No image'),
        expandButton(t),
        el('div', { class: 'check pick-toggle', title: isIn ? 'Remove from the collection' : 'Add to the collection' },
          el('span', { class: isIn ? 'icon-minus' : 'icon-plus' })),
        isIn ? el('button', {
          class: 'card-menu-btn', title: 'Actions',
          onclick: (e) => { e.stopPropagation(); openCardMenu(e.currentTarget, menuFor(c)); },
        }, el('span', { class: 'dots' })) : null),
      el('div', { class: 'card-info' },
        el('div', { class: 'card-name' }, `#${c.localId} ${c.name}`),
        el('div', { class: 'card-sub' }, c.setName || ''),
        el('div', { class: 'card-sub' }, c.quantity ? `Quantity: ${c.quantity}` : '')));
  };
  const searchFilters = filterState(`editor:${tcg.id}`);
  const advanced = advancedFilter(tcg, searchFilters, { getCards: () => results, onChange: () => renderResults() });
  const renderResults = () => {
    if (!results.length) return;
    const list = filterCards(results, searchFilters);
    const found = `${results.length} card${results.length === 1 ? '' : 's'} found`;
    setChildren(resultsBox,
      el('div', { class: 'section-head' },
        el('p', { class: 'muted hint' }, list.length === results.length ? found : `${found} · ${list.length} shown`,
          '. Click a card to add it to the collection or remove it.'),
        advanced.button),
      advanced.badges,
      el('div', { class: 'card-grid' }, list.map(pickTile)),
      list.length ? null : el('p', { class: 'muted' }, 'No cards match these filters.'));
  };
  const searchInput = el('input', {
    class: 'search', type: 'search', placeholder: `Search cards to add, e.g. ${tcg.example}`,
    onkeydown: (e) => { if (e.key === 'Enter') runSearch(); },
  });
  const runSearch = async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) { results = []; setChildren(resultsBox); return; }
    setChildren(resultsBox, el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, 'Searching…')));
    try {
      const found = await window.tcg.searchCards(q, tcg.id);
      if (searchInput.value.trim() !== q) return; // ya se buscó otra cosa
      results = found.map((c) => ({
        id: c.id, setId: c.set.id, setName: c.set.name, localId: c.localId,
        name: c.name, rarity: c.rarity, image: c.image, price: c.price, quantity: c.quantity, attrs: c.attrs,
      }));
      if (!results.length) setChildren(resultsBox, el('p', { class: 'muted' }, 'No cards found.'));
      renderResults();
    } catch (err) {
      setChildren(resultsBox, el('p', { class: 'error' }, `Search failed: ${err.message || err}`));
    }
  };

  const renderAll = () => { renderSelected(); renderResults(); };

  const nameInput = el('input', {
    class: 'search name-input', placeholder: `Collection name, e.g. My ${tcg.example} cards`, value: draft.name, maxlength: '80',
    oninput: (e) => { draft.name = e.target.value; error.textContent = ''; },
  });
  const error = el('p', { class: 'error' });

  // Al guardar o borrar, el editor se quita del historial para que "atrás" no vuelva a él.
  const leave = (fn, ...args) => {
    navStack.pop();
    const top = navStack[navStack.length - 1];
    if (top && top[0] === showCollection && top[1][1] === collectionId) navStack.pop();
    navigate(fn, ...args);
  };
  const save = async () => {
    if (!draft.name.trim()) { error.textContent = 'Give the collection a name.'; nameInput.focus(); return; }
    const id = await window.tcg.saveCustomCollection({ id: draft.id, tcg: tcg.id, name: draft.name.trim(), cards: draft.cards });
    leave(showCollection, tcg, id);
  };

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('h1', { class: 'title' }, isNew ? 'New collection' : 'Edit collection'),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          el('button', { class: 'btn btn-secondary', onclick: () => backBtn.click() }, 'Cancel'),
          el('button', { class: 'btn', onclick: save }, isNew ? 'Create collection' : 'Save changes')))),
    el('label', { class: 'field-label' }, 'Name', nameInput),
    error,
    el('h2', { class: 'section-title' }, 'Add cards'),
    el('div', { class: 'search-row' }, searchInput, el('button', { class: 'btn', onclick: runSearch }, 'Search')),
    resultsBox,
    el('div', { class: 'section-head sets-head' }, selectedTitle),
    el('p', { class: 'muted hint' }, 'Click a card to mark whether you own it. Use ⋮ to remove it from the collection.'),
    selectedGrid
  );
  renderSelected();
  (isNew ? nameInput : searchInput).focus();
}

// Pide confirmación y borra la colección custom. Devuelve true si se ha borrado.
async function deleteCustomCollection(collectionId, name) {
  const ok = await confirmDialog('Delete collection',
    `Delete "${name || 'this collection'}"? The cards you own stay marked in their sets.`, 'Delete');
  if (ok) await window.tcg.deleteCustomCollection(collectionId);
  return ok;
}

// Diálogo de confirmación con el estilo de la app. Devuelve true si se acepta.
function confirmDialog(title, text, okLabel) {
  return new Promise((resolve) => {
    const close = (value) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } };
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(false); } },
      el('div', { class: 'dialog', role: 'dialog' },
        el('h3', {}, title),
        el('p', { class: 'muted' }, text),
        el('div', { class: 'dialog-actions' },
          el('button', { class: 'chip', onclick: () => close(false) }, 'Cancel'),
          el('button', { class: 'btn btn-danger', onclick: () => close(true) }, okLabel))));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
  });
}

// Opciones comunes del menú ⋮: cantidad, versiones y enlaces externos. setQuantity(n) guarda la nueva cantidad;
// onPrintingsChange({ cardId: cantidad }) recibe las cantidades cambiadas desde el diálogo de versiones.
function quantityMenuItems(tcg, card, setQuantity, onPrintingsChange) {
  const link = { id: card.id, name: card.name, localId: card.local_id, official: card.set_official, tcg: tcg.id };
  return [
    { label: 'Add 1', icon: '+', onClick: () => setQuantity(card.quantity + 1) },
    {
      label: 'Add several…', icon: '++',
      onClick: async () => {
        const n = await askQuantity(card);
        if (n) setQuantity(card.quantity + n);
      },
    },
    card.quantity > 0 ? { label: 'Remove 1', icon: '−', onClick: () => setQuantity(card.quantity - 1) } : null,
    card.quantity > 1 ? { label: `Remove all (${card.quantity})`, icon: '×', onClick: () => setQuantity(0) } : null,
    { separator: true },
    {
      label: 'View all arts', icon: '❐',
      onClick: async () => {
        const changed = await showPrintings(tcg, card);
        if (Object.keys(changed).length) onPrintingsChange?.(changed);
      },
    },
    tcg.id === 'pokemon' ? { label: 'View on TCG Collector', icon: '↗', onClick: () => window.tcg.openTcgCollector(link) } : null,
    { label: 'View on TCGplayer', icon: '↗', onClick: () => window.tcg.openTcgplayer(link) },
  ];
}

// getMenu (opcional): función que devuelve las opciones del menú ⋮ de la carta.
function cardTile(card, onToggle, lines, getMenu) {
  const owned = card.quantity > 0;
  lines = lines || [card.rarity || ''];
  return el('div', {
    class: 'card' + (owned ? ' owned' : '') + (card.hidden ? ' is-hidden' : ''),
    title: card.quantity > 1 ? `You have ${card.quantity} (change the quantity from ⋮)`
      : owned ? 'Owned (click to unmark)' : 'Missing (click to mark)',
    onclick: onToggle,
  },
    el('div', { class: 'card-img-wrap' },
      card.image_url
        ? el('img', { src: cardImage(card.image_url), alt: card.name, loading: 'lazy' })
        : el('div', { class: 'no-image' }, card.name, el('br'), 'No image'),
      expandButton(card),
      el('div', { class: 'check' }, owned ? '✓' : ''),
      getMenu ? el('button', {
        class: 'card-menu-btn', title: 'Actions',
        onclick: (e) => { e.stopPropagation(); openCardMenu(e.currentTarget, getMenu()); },
      }, el('span', { class: 'dots' })) : null),
    el('div', { class: 'card-info' },
      el('div', { class: 'card-name' }, `#${card.local_id} ${card.name}`),
      lines.map((l) => el('div', { class: 'card-sub' }, l))));
}

// Botón de la esquina superior izquierda (visible al pasar el ratón) que abre la carta en grande.
function expandButton(card) {
  if (!card.image_url) return null;
  // Cuatro flechas hacia las esquinas; el SVG se crea con createElementNS porque el() crea elementos HTML.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7M3 9V3h6M21 15v6h-6M3 3l7 7M21 21l-7-7');
  svg.append(path);
  return el('button', {
    class: 'card-expand-btn', title: 'View larger',
    onclick: (e) => { e.stopPropagation(); openModal(card); },
  }, svg);
}

// ---------- Diálogo "View all arts" ----------
// Muestra todos los artes de la carta (la misma carta en cualquier set); clic = la tengo / no la tengo.
// Devuelve las cantidades que se cambiaron, { cardId: cantidad }, para que la vista que lo abrió se actualice.
function showPrintings(tcg, card) {
  return new Promise((resolve) => {
    const changed = {};
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(changed); };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (!modal.classList.contains('hidden')) modal.classList.add('hidden'); // primero se cierra la carta en grande
      else close();
    };
    const subtitle = el('p', { class: 'muted' }, `#${card.local_id} ${card.name}`);
    const body = el('div', { class: 'printings-body' },
      el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, 'Looking for other arts…')));
    // El header queda fijo arriba y solo se desplaza el cuerpo, para que "Close" siempre se vea.
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
      el('div', { class: 'dialog printings-dialog', role: 'dialog' },
        el('div', { class: 'printings-header' },
          el('div', {}, el('h3', {}, 'All arts'), subtitle),
          el('button', { class: 'chip', onclick: close }, 'Close')),
        body));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);

    window.tcg.getPrintings({ id: card.id, name: card.name, localId: card.local_id, tcg: tcg.id }).then((found) => {
      const cards = found.map((c) => ({ ...c, image_url: c.image, local_id: c.localId }));
      if (!cards.length) cards.push({ ...card }); // la API no la encontró: al menos se muestra la propia carta
      subtitle.textContent = `#${card.local_id} ${card.name} · ${cards.length} art${cards.length === 1 ? '' : 's'}`;
      const grid = el('div', { class: 'card-grid' });
      const render = () => setChildren(grid, ...cards.map((c) => {
        const tile = cardTile(c, async () => {
          if (c.quantity > 1) return; // la cantidad se gestiona desde el set
          c.quantity = c.quantity > 0 ? 0 : 1;
          await window.tcg.setOwned(c.id, c.quantity, c.set
            ? { id: c.id, setId: c.set.id, localId: c.localId, name: c.name, rarity: c.rarity, image: c.image }
            : undefined);
          changed[c.id] = c.quantity;
          render();
        }, [c.set?.name || c.set_name || '', c.rarity || '', c.price != null ? formatPrice(c) : null].filter((l) => l != null));
        if (c.id === card.id) tile.classList.add('current');
        return tile;
      }));
      render();
      setChildren(body, el('p', { class: 'muted hint' }, 'Click an art to mark it as owned. The highlighted one is this card.'), grid);
    }).catch((err) => {
      setChildren(body, el('p', { class: 'error' }, `Could not load the other arts: ${err.message || err}`));
    });
  });
}

// ---------- Diálogo "Agregar varias" ----------
// Devuelve el número elegido (1-999) o null si se cancela.
function askQuantity(card) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'qty-input', type: 'number', min: '1', max: '999', value: '2' });
    const close = (value) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
    const accept = () => {
      const n = Math.floor(Number(input.value));
      if (n >= 1 && n <= 999) close(n); else input.focus();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter') { e.preventDefault(); accept(); }
    };
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
      el('div', { class: 'dialog', role: 'dialog' },
        el('h3', {}, 'Add several'),
        el('p', { class: 'muted' }, `#${card.local_id} ${card.name} · you currently have ${card.quantity}`),
        el('label', { class: 'dialog-label' }, 'How many do you want to add?', input),
        el('div', { class: 'dialog-actions' },
          el('button', { class: 'chip', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn', onclick: accept }, 'Add'))));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    input.focus();
    input.select();
  });
}

// ---------- Menú de acciones de una carta ----------
let openMenu = null;

function closeCardMenu() {
  if (!openMenu) return;
  openMenu.anchor.classList.remove('active');
  openMenu.menu.remove();
  openMenu = null;
}

function openCardMenu(anchor, items) {
  const wasOpen = openMenu && openMenu.anchor === anchor;
  closeCardMenu();
  if (wasOpen) return; // segundo clic en ⋮: solo cierra
  const menu = el('div', { class: 'card-menu', role: 'menu' },
    items.filter(Boolean).map((it) => it.separator ? el('div', { class: 'card-menu-sep' }) : el('button', {
      class: 'card-menu-item', role: 'menuitem',
      onclick: (e) => { e.stopPropagation(); closeCardMenu(); it.onClick(); },
    }, el('span', { class: 'card-menu-icon' }, it.icon || ''), it.label)));
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8);
  const top = r.bottom + 4 + menu.offsetHeight > window.innerHeight ? r.top - menu.offsetHeight - 4 : r.bottom + 4;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${top}px`;
  anchor.classList.add('active');
  openMenu = { anchor, menu };
}

document.addEventListener('click', (e) => { if (openMenu && !openMenu.menu.contains(e.target)) closeCardMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCardMenu(); });
view.addEventListener('scroll', closeCardMenu);
window.addEventListener('resize', closeCardMenu);

// ---------- Pokédex ----------
const spriteUrl = (dexId) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexId}.png`;
const dexNum = (n) => `#${String(n).padStart(4, '0')}`;
const dexState = { filter: 'all', search: '', scroll: 0 };

async function showPokedex(tcg, opts = {}) {
  setChrome(`${tcg.name} › Pokédex`, tcg);
  setChildren(view, el('div', { class: 'loading' },
    el('div', { class: 'spinner' }),
    el('p', {}, 'Loading the Pokédex… (the first time it downloads every Full Art card, this takes a few seconds)')));

  let dex, dexNotes;
  try {
    // La nota de la Pokédex se guarda como la de un set más, con id 'pokedex'.
    const [list, notes] = await Promise.all([window.tcg.getPokedex(opts), window.tcg.getNotes('pokedex')]);
    dex = list;
    dexNotes = { id: 'pokedex', name: 'Pokédex', notes };
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, 'Could not download the Pokédex. Are you connected to the internet?'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showPokedex(tcg, opts) }, 'Retry'));
    return;
  }

  const withCards = dex.filter((p) => p.fullart_count + p.promo_count > 0);
  const owned = dex.filter((p) => p.owned_count > 0);
  const grid = el('div', { class: 'dex-grid' });

  const render = () => {
    const q = dexState.search.trim().toLowerCase();
    const visible = dex.filter((p) => {
      if (dexState.filter === 'owned' && !p.owned_count) return false;
      if (dexState.filter === 'missing' && (p.owned_count || !(p.fullart_count + p.promo_count))) return false;
      if (!q) return true;
      return p.name_en.toLowerCase().includes(q) || String(p.dex_id) === q;
    });
    setChildren(grid, ...visible.map((p) => dexTile(tcg, p)));
    if (!visible.length) grid.append(el('p', { class: 'muted' }, 'No Pokémon match.'));
  };

  const filterBtn = (key, label) =>
    el('button', {
      class: 'chip' + (dexState.filter === key ? ' active' : ''),
      onclick: (e) => {
        dexState.filter = key;
        e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        render();
      },
    }, label);

  const search = el('input', {
    class: 'search', type: 'search', placeholder: 'Search by name or number…', value: dexState.search,
    oninput: (e) => { dexState.search = e.target.value; render(); },
  });

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, 'Pokédex'),
        el('div', { class: 'counter' }, `${owned.length} / ${withCards.length} Pokémon collected`),
        el('div', { class: 'progress wide' },
          el('div', { class: 'progress-fill', style: `width:${withCards.length ? (owned.length / withCards.length) * 100 : 0}%` }))),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          notesButton(dexNotes),
          el('button', { class: 'btn', onclick: () => { dexState.scroll = 0; showPokedex(tcg, { refresh: true }); } },
            'Update from API')),
        el('div', { class: 'toolbar-row' },
          search,
          el('div', { class: 'chips' },
            filterBtn('all', 'All'), filterBtn('owned', 'Collected'), filterBtn('missing', 'Missing'))))),
    el('p', { class: 'muted hint' },
      'Greyed out: Pokémon without any Full Art card (those with promos can still be opened). Click a Pokémon to see its cards and mark the ones you own.'),
    grid
  );
  render();
  view.scrollTop = dexState.scroll;
}

function dexTile(tcg, p) {
  const enabled = p.fullart_count + p.promo_count > 0;
  const name = p.name_en;
  const owned = p.owned_count > 0;
  return el('button', {
    class: 'dex-tile' + (enabled ? '' : ' disabled') + (!p.fullart_count && !owned ? ' no-fullart' : '') + (owned ? ' owned' : ''),
    disabled: !enabled,
    title: !enabled ? `${name}: no Full Art cards`
      : `${name}: ${p.fullart_count} Full Art · ${p.promo_count} promos · you own ${p.owned_count}`,
    onclick: () => { dexState.scroll = view.scrollTop; navigate(showPokemon, tcg, p.dex_id); },
  },
    el('div', { class: 'dex-img-wrap' + (p.best_image ? ' is-card' : '') },
      el('img', { src: p.best_image ? cardImage(p.best_image) : spriteUrl(p.dex_id), alt: name, loading: 'lazy' })),
    el('div', { class: 'dex-num' }, dexNum(p.dex_id)),
    el('div', { class: 'dex-name' }, name),
    enabled ? el('div', { class: 'dex-count' },
      dexCountText(p)) : null);
}

function dexCountText(p) {
  const fa = p.owned_count - p.owned_promo_count;
  const promos = p.owned_promo_count ? ` + ${p.owned_promo_count} promo${p.owned_promo_count > 1 ? 's' : ''}` : '';
  return p.fullart_count ? `${fa} / ${p.fullart_count}${promos}` : (promos ? promos.slice(3) : 'Promos only');
}

function formatPrice(card) {
  if (card.price == null) return card.price_fetched_at ? 'No price' : '';
  return new Intl.NumberFormat('en', { style: 'currency', currency: card.currency || 'USD' }).format(card.price);
}

async function showPokemon(tcg, dexId) {
  setChrome(`${tcg.name} › Pokédex › …`, tcg);
  view.scrollTop = 0;
  setChildren(view, el('div', { class: 'loading' },
    el('div', { class: 'spinner' }), el('p', {}, 'Loading cards and prices…')));

  let data;
  try {
    data = await window.tcg.getPokemon(dexId);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, 'Could not load the cards.'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showPokemon(tcg, dexId) }, 'Retry'));
    return;
  }
  const { pokemon, cards } = data;
  const name = pokemon.name_en;
  setChrome(`${tcg.name} › Pokédex › ${name}`, tcg);

  const fullArts = cards.filter((c) => c.kind !== 'promo');
  const promos = cards.filter((c) => c.kind === 'promo');
  const counter = el('div', { class: 'counter' });
  const grid = el('div', { class: 'card-grid' });
  const promoGrid = el('div', { class: 'card-grid' });
  const promoCounter = el('span', { class: 'muted' });
  const tiles = (list) => list.map((card) => cardTile(card, async () => {
    if (card.quantity > 1) return; // la cantidad se gestiona desde el set
    card.quantity = card.quantity > 0 ? 0 : 1;
    await window.tcg.setOwned(card.id, card.quantity);
    render();
  }, [`${card.set_name || card.set_id} · #${card.local_id}`, card.rarity || '', formatPrice(card)]));
  const render = () => {
    const ownedOf = (list) => list.filter((c) => c.quantity > 0).length;
    counter.textContent = `${ownedOf(fullArts)} / ${fullArts.length} Full Art cards collected`
      + (promos.length ? ` · ${ownedOf(promos)} / ${promos.length} promos` : '');
    promoCounter.textContent = ` (${ownedOf(promos)} / ${promos.length})`;
    setChildren(grid, ...tiles(fullArts));
    if (!fullArts.length) grid.append(el('p', { class: 'muted' }, 'This Pokémon has no Full Art cards.'));
    setChildren(promoGrid, ...tiles(promos));
  };

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', { class: 'pokemon-head' },
        el('img', { class: 'pokemon-sprite', src: spriteUrl(dexId), alt: '' }),
        el('div', {},
          el('div', { class: 'dex-num' }, dexNum(dexId)),
          el('h1', { class: 'title' }, name),
          counter))),
    el('p', { class: 'muted hint' },
      'Mark the cards you own. The Pokédex will show the most expensive one you own. Hover over a card and use ⤢ to view it larger.'),
    el('h2', { class: 'section-title' }, 'Full Art'),
    grid,
    promos.length ? el('h2', { class: 'section-title promos-title' }, 'Promos', promoCounter) : null,
    promos.length ? el('p', { class: 'muted hint' },
      'All promos for this Pokémon: the API does not say which ones are Full Art, so all of them are shown.') : null,
    promos.length ? promoGrid : null
  );
  render();
}

function openModal(card) {
  modalImg.src = cardImage(card.image_url, 'high');
  modalImg.alt = card.name;
  modal.classList.remove('hidden');
}
modal.addEventListener('click', () => modal.classList.add('hidden'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.add('hidden'); });

// ---------- Pie: ruta de la base de datos ----------
(async () => {
  const dbBtn = document.getElementById('db-path');
  dbBtn.textContent = `DB: ${await window.tcg.dbPath()}`;
  dbBtn.addEventListener('click', () => window.tcg.revealDb());
})();

navigate(showHome);
