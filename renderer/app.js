// Navegación simple entre vistas: home -> tcg -> colección
const TCGS = [
  { id: 'magic', name: 'Magic: The Gathering', image: '../assets/tcg/magic.svg', enabled: true, example: 'Lightning Bolt', source: 'Scryfall' },
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
  if (navStack.length) sfx.play('open'); // la pantalla inicial, al arrancar, no suena
  navStack.push([fn, args]);
  fn(...args);
}

backBtn.addEventListener('click', () => {
  if (navStack.length < 2) return;
  sfx.play('back');
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
// Scryfall da la URL de la imagen "normal" (con ?versión al final); en grande se pide la "large".
function cardImage(url, quality = 'low') {
  if (!url) return '';
  if (url.startsWith('https://cards.scryfall.io/')) return quality === 'high' ? url.replace('/normal/', '/large/') : url;
  return /\.(jpe?g|png|webp)$/i.test(url) ? url : `${url}/${quality}.webp`;
}

// ---------- Vista 1: elegir TCG ----------
function showHome() {
  setChrome('Choose your TCG');
  const decksEntry = el('button', { class: 'decks-entry', onclick: () => navigate(showDecks) },
    el('div', { class: 'decks-entry-covers' }),
    el('div', { class: 'decks-entry-text' },
      el('div', { class: 'collection-name' }, 'My decks'),
      el('div', { class: 'collection-meta' }, 'Build decks for Magic, Pokémon and One Piece')),
    el('span', { class: 'decks-entry-go' }, 'Open'));
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
      )),
    el('div', { class: 'home-decks' }, decksEntry)
  );
  // El resumen de los mazos llega después: la pantalla se pinta sin esperar a la base de datos.
  window.tcg.listDecks().then((decks) => {
    const covers = decks.map((d) => deckCover(d, d.cards)).filter((c) => c?.image_url).slice(0, 3);
    setChildren(decksEntry.querySelector('.decks-entry-covers'),
      covers.map((c) => el('img', { src: cardImage(c.image_url), alt: '' })));
    decksEntry.querySelector('.collection-meta').textContent = decks.length
      ? `${decks.length} deck${decks.length === 1 ? '' : 's'} · ${[...new Set(decks.map((d) => tcgById(d.tcg).name))].join(', ')}`
      : 'Build decks for Magic, Pokémon and One Piece';
  }).catch(() => {});
}

const tcgById = (id) => TCGS.find((t) => t.id === id) || TCGS[0];

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
    el('div', { class: 'collection-header tcg-header' },
      el('h1', { class: 'title' }, tcg.name),
      el('div', { class: 'toolbar' }, el('div', { class: 'toolbar-row' }, exportButton(tcg, null)))),
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
      }, [c.set.name, c.rarity || ''])));
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
      // Scryfall da el símbolo del set en SVG negro: se muestra en blanco (ver .mtg-symbol).
      c.logo && c.tcg === 'magic' ? el('img', { class: 'mtg-symbol', src: c.logo, alt: '', loading: 'lazy' })
        : c.logo ? el('img', { src: `${c.logo}.webp`, alt: '', loading: 'lazy' })
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
    order: ['Pokémon', 'Trainer', 'Energy', 'Leader', 'Character', 'Event', 'Stage',
      'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Kindred', 'Land', 'Token', 'Emblem'] },
  { key: 'subtype', label: 'Trainer / Energy type', get: (c) => c.attrs?.subtype,
    order: ['Item', 'Supporter', 'Stadium', 'Tool', 'Basic Energy', 'Special Energy'] },
  // Magic: Legendary, Basic, Snow…
  { key: 'supertype', label: 'Supertype', get: (c) => c.attrs?.supertype, order: ['Legendary', 'Basic', 'Snow', 'World'] },
  { key: 'color', label: (tcg) => (tcg.id === 'pokemon' ? 'Pokémon type' : 'Color'), get: (c) => c.attrs?.colors,
    order: (tcg) => (tcg.id === 'magic' ? ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless']
      : ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless',
        'Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow']) },
  { key: 'rarity', label: 'Rarity', get: (c) => c.rarity,
    display: (v, tcg) => (tcg.id === 'onepiece' && OP_RARITIES[v]) || v,
    order: ['Common', 'Uncommon', 'Rare', 'Mythic Rare', 'Holo Rare', 'Rare Holo', 'Double rare', 'ACE SPEC Rare', 'Ultra Rare',
      'Illustration rare', 'Special illustration rare', 'Shiny rare', 'Shiny Ultra Rare', 'Hyper rare', 'Secret Rare',
      'Special', 'Bonus', 'Promo', 'L', 'C', 'UC', 'R', 'SR', 'SEC', 'SP', 'TR', 'PR'] },
  { key: 'stage', label: 'Stage', get: (c) => c.attrs?.stage, order: ['Basic', 'Stage 1', 'Stage 2'] },
  { key: 'mechanic', label: 'Mechanic', get: (c) => c.attrs?.mechanic, order: ['ex', 'EX', 'GX', 'V', 'VMAX', 'VSTAR'] },
  { key: 'attribute', label: 'Attribute', get: (c) => c.attrs?.attributes, order: ['Slash', 'Strike', 'Ranged', 'Special', 'Wisdom'] },
  { key: 'version', label: 'Version', get: (c) => c.attrs?.version, single: true, order: ['Standard', 'Alternate art'] },
  { key: 'treatment', label: 'Frame / Art', get: (c) => c.attrs?.treatment,
    order: ['Regular', 'Borderless', 'Showcase', 'Extended art', 'Full art', 'Old frame', 'Promo'] },  // Los sets se dejan en el orden en que llegan las cartas (del más nuevo al más antiguo).
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
  el('button', {
    class: 'chip' + (isActive ? ' active' : ''), 'data-label': label,
    onclick: (e) => { sfx.play('check'); onClick(e); },
  }, label);

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

function groupOptions(g, cards, picked, tcg) {
  const values = [...new Set([...cards.flatMap((c) => valuesOf(g, c)), ...picked])];
  if (g.keepOrder) return values;
  const order = typeof g.order === 'function' ? g.order(tcg) : g.order;
  const rank = (v) => { const i = order ? order.indexOf(v) : -1; return i < 0 ? Infinity : i; };
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
        el('button', { class: 'filter-badge-x', title: 'Remove this filter', onclick: () => { sfx.play('uncheck'); removeAndRefresh(f.remove); } },
          el('span', { class: 'icon-x' })))),
      list.length > 1 ? el('button', {
        class: 'link filter-clear',
        onclick: () => { sfx.play('uncheck'); removeAndRefresh(() => { state.status = null; state.values = {}; }); },
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
        // stopPropagation: el clic no llega a document, así que el sonido se pone aquí.
        onclick: (e) => { e.stopPropagation(); sfx.play('click'); if (openPanel?.trigger === trigger) closePanel(); else open(); },
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
                  sfx.play(on && !single ? 'uncheck' : 'check');
                  onPick(v);
                  refresh();
                  if (single) closePanel(); else renderItems();
                },
              }, el('span', { class: single ? 'dropdown-radio' : 'dropdown-check' }), label);
            }),
            !single && selected.length ? el('button', {
              class: 'dropdown-clear', type: 'button',
              onclick: () => { sfx.play('uncheck'); selected.forEach(onPick); refresh(); renderItems(); },
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
        const options = groupOptions(g, cards, picked(), tcg);
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
          el('button', { class: 'link filter-reset', onclick: () => { sfx.play('uncheck'); draft.status = null; draft.values = {}; render(); } },
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
    setLocalTotal(card, quantity);
    // En una colección custom la carta también se añade a su set, para que el set cuente como "con cartas".
    await window.tcg.setOwned(card.id, card.quantity, collection.custom ? draftCard(card) : undefined);
    refreshStats();
    render();
  };

  const setVariant = async (card, key, quantity) => {
    setLocalVariant(card, key, Math.max(0, quantity));
    await window.tcg.setVariantOwned(card.id, key, Math.max(0, quantity), collection.custom ? draftCard(card) : undefined);
    refreshStats();
    render();
  };

  const menuFor = (card) => [
    ...quantityMenuItems(tcg, card, (q) => setQuantity(card, q), (changed) => {
      for (const c of cards) if (changed[c.id] != null) setLocalTotal(c, changed[c.id]);
      refreshStats();
      render();
    }, (key, q) => setVariant(card, key, q)),
    { separator: true },
    card.hidden
      ? { label: 'Add back to set', icon: '↺', onClick: () => setHidden(card, false) }
      : { label: 'Hide from set', icon: '⊘', onClick: () => setHidden(card, true) },
    collection.custom ? { label: 'Remove from collection', icon: '×', sound: 'remove', onClick: () => removeCard(card) } : null,
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
    }, [collection.custom ? card.set_name || card.set_id : null, card.rarity || '', qtyLabel(card)].filter((l) => l != null),
    () => menuFor(card))));
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
          exportButton(tcg, collection),
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

// ---------- Exportar ----------
// collection null = todo el TCG (solo las cartas que tienes); con un set o colección custom se elige además
// si exportar las que tienes o las que faltan y, en las que faltan, si cada versión (foil, reverse…) cuenta aparte.
const EXPORT_FORMATS = [
  { key: 'xlsx', label: 'Excel', hint: 'An .xlsx spreadsheet with set, number, name, version and quantity.' },
  { key: 'csv', label: 'CSV', hint: 'Quantity, name, set and card number: the columns most collection sites read when importing a CSV.' },
  { key: 'moxfield', label: 'Moxfield', tcg: 'magic',
    hint: 'Ready for Moxfield: Collection › Import › CSV. Foil and etched copies keep their finish.' },
  { key: 'moxfieldText', label: 'Moxfield (text)', tcg: 'magic', copy: true,
    hint: 'One card per line, like "2 Aang\'s Journey (TLA) 1", with *F* for foil and *E* for etched. Copy it and paste it in a Moxfield deck or list › Bulk Edit.' },
];

function exportButton(tcg, collection) {
  return el('button', { class: 'btn btn-secondary', title: 'Export the cards to a file', onclick: () => openExportDialog(tcg, collection) },
    '⭳ Export');
}

function openExportDialog(tcg, collection) {
  const opts = { mode: 'owned', splitVariants: true, format: 'xlsx' };
  const withVariants = tcg.id !== 'onepiece'; // en One Piece cada versión ya es una carta distinta
  const body = el('div', { class: 'export-groups' });
  const actions = el('div', { class: 'dialog-actions' });
  const close = () => {
    if (busy) return;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

  const group = (title, options, key) => el('div', { class: 'export-group' },
    el('div', { class: 'filter-field-label' }, title),
    el('div', { class: 'chips' }, options.map(([value, label]) =>
      optionChip(label, opts[key] === value, () => { opts[key] = value; render(); renderActions(); }))));

  const render = () => {
    const formats = EXPORT_FORMATS.filter((f) => !f.tcg || f.tcg === tcg.id);
    setChildren(body,
      collection ? group('Cards', [['owned', 'Cards I own'], ['missing', 'Cards I am missing']], 'mode') : null,
      collection && opts.mode === 'missing' && withVariants ? group(
        tcg.id === 'magic' ? 'Versions (non-foil, foil, etched)' : 'Versions (normal, holo, reverse holo, stamped…)', [
        [true, 'Each missing version'], [false, 'Only cards with no copies'],
      ], 'splitVariants') : null,
      group('Format', formats.map((f) => [f.key, f.label]), 'format'),
      el('p', { class: 'muted export-hint' }, formats.find((f) => f.key === opts.format).hint));
  };

  // Al pulsar "Export…" el diálogo pasa a una pantalla de carga (y no se puede cerrar) mientras se elige dónde
  // guardar y se genera el fichero; al terminar, el resultado con "Show in folder" y "Done".
  let busy = false;
  const loading = (text) => {
    setChildren(body, el('div', { class: 'loading export-loading' }, el('div', { class: 'spinner' }), el('p', {}, text)));
    setChildren(actions);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async () => {
    const request = { tcg: tcg.id, collectionId: collection?.id || null, ...opts };
    busy = true;
    loading('Choose where to save the file…');
    await wait(50); // que se pinte antes de abrir la ventana de guardar (en Windows tarda en aparecer)
    try {
      const filePath = await window.tcg.chooseExportPath(request);
      if (!filePath) { render(); renderActions(); return; } // se canceló la ventana de guardar
      loading('Generating the file…');
      // Con pocas cartas el fichero sale al instante: la carga se muestra un momento para que no parpadee.
      const [result] = await Promise.all([window.tcg.exportCollection({ ...request, filePath }), wait(800)]);
      setChildren(body, el('p', {}, `Exported ${result.rows} row${result.rows === 1 ? '' : 's'} to:`),
        el('p', { class: 'muted export-path' }, result.path));
      setChildren(actions,
        el('button', { class: 'chip', onclick: () => window.tcg.revealFile(result.path) }, 'Show in folder'),
        el('button', { class: 'btn', onclick: close }, 'Done'));
    } catch (err) {
      render();
      body.append(el('p', { class: 'error' }, `Could not export: ${err.message || err}`));
      renderActions();
    } finally {
      busy = false;
    }
  };
  // Copiar: sin ventana de guardar; el texto va directo al portapapeles.
  const copy = async () => {
    busy = true;
    loading('Copying the list…');
    try {
      const [result] = await Promise.all([
        window.tcg.copyExport({ tcg: tcg.id, collectionId: collection?.id || null, ...opts }), wait(400)]);
      setChildren(body, el('p', {}, `Copied ${result.rows} line${result.rows === 1 ? '' : 's'} to the clipboard.`),
        el('p', { class: 'muted' }, 'In Moxfield, open the deck or list, choose Bulk Edit and paste it.'));
      setChildren(actions, el('button', { class: 'btn', onclick: close }, 'Done'));
    } catch (err) {
      render();
      body.append(el('p', { class: 'error' }, `Could not copy: ${err.message || err}`));
      renderActions();
    } finally {
      busy = false;
    }
  };
  const renderActions = () => setChildren(actions,
    el('button', { class: 'chip', onclick: close }, 'Cancel'),
    EXPORT_FORMATS.find((f) => f.key === opts.format)?.copy
      ? el('button', { class: 'chip', onclick: copy }, '📋 Copy to clipboard') : null,
    el('button', { class: 'btn', onclick: run }, 'Export…'));

  const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'dialog export-dialog', role: 'dialog' },
      el('h3', {}, 'Export'),
      el('p', { class: 'muted' }, collection ? collection.name : `Every ${tcg.name} card you own, from all sets`),
      body,
      actions));
  render();
  renderActions();
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
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
    name: card.name, rarity: card.rarity, image: card.image_url, price: card.price, attrs: card.attrs, variants: card.variants,
  };
}

// ---------- Diálogo "Add cards" (mazos y colecciones custom) ----------
// search: { query, results }, se conserva al cerrar y volver a abrir; mapResult convierte cada resultado del buscador;
// pickTile(carta) pinta cada resultado; subtitle() da el texto bajo el título; hint, la ayuda sobre los resultados.
// Devuelve render, para volver a pintar el diálogo mientras siga abierto (después de cada cambio).
function openCardPicker(tcg, { search, filterKey, mapResult = (c) => c, pickTile, subtitle, hint, onClose }) {
  const body = el('div', { class: 'printings-body' });
  const sub = el('p', { class: 'muted' });
  const filters = filterState(filterKey);
  const advanced = advancedFilter(tcg, filters, { getCards: () => search.results, onChange: () => render() });
  const render = () => {
    sub.textContent = subtitle();
    if (!search.results.length) return;
    const list = filterCards(search.results, filters);
    const found = `${search.results.length} card${search.results.length === 1 ? '' : 's'} found`;
    const top = body.scrollTop;
    setChildren(body,
      el('div', { class: 'section-head picker-head' },
        el('p', { class: 'muted hint' }, list.length === search.results.length ? found : `${found} · ${list.length} shown`, `. ${hint}`),
        advanced.button),
      advanced.badges,
      el('div', { class: 'card-grid' }, list.map(pickTile)),
      list.length ? null : el('p', { class: 'muted' }, 'No cards match these filters.'));
    body.scrollTop = top;
  };
  const input = el('input', {
    class: 'search', type: 'search', placeholder: `Search cards to add, e.g. ${tcg.example}`, value: search.query,
    onkeydown: (e) => { if (e.key === 'Enter') run(); },
  });
  const run = async () => {
    const q = input.value.trim();
    search.query = q;
    if (q.length < 2) { search.results = []; setChildren(body); return; }
    setChildren(body, el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, 'Searching…')));
    try {
      const found = await window.tcg.searchCards(q, tcg.id);
      if (search.query !== q || !overlay.isConnected) return; // ya se buscó otra cosa, o se cerró el diálogo
      search.results = found.map(mapResult);
      if (!search.results.length) setChildren(body, el('p', { class: 'muted' }, 'No cards found.'));
      render();
    } catch (err) {
      setChildren(body, el('p', { class: 'error' }, `Search failed: ${err.message || err}`));
    }
  };
  const close = () => {
    closeCardMenu();
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    // Primero se cierra lo que haya encima: la carta en grande, el menú ⋮ o otro diálogo (filtros, cantidad…).
    if (!modal.classList.contains('hidden')) { e.stopPropagation(); modal.classList.add('hidden'); return; }
    if (openMenu) { e.stopPropagation(); closeCardMenu(); return; }
    if ([...document.querySelectorAll('.dialog-overlay')].pop() !== overlay) return;
    e.stopPropagation();
    close();
  };
  const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'dialog printings-dialog card-picker', role: 'dialog' },
      el('div', { class: 'printings-header' },
        el('div', { class: 'card-picker-head' }, el('h3', {}, 'Add cards'), sub,
          el('div', { class: 'search-row' }, input, el('button', { class: 'btn', onclick: run }, 'Search'))),
        el('button', { class: 'chip', onclick: close }, 'Done')),
      body));
  body.addEventListener('scroll', closeCardMenu);
  render();
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  input.focus();
  input.select();
  return render;
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
    draft.cards = cards.map((c) => ({ ...draftCard(c), quantity: c.quantity, variant_qty: c.variant_qty }));
  }

  const tile = (c) => ({ ...c, image_url: c.image, local_id: c.localId });
  const included = () => new Set(draft.cards.map((c) => c.id));

  // Las cantidades se guardan al momento (son globales, igual que en los sets).
  // La misma carta puede estar en los resultados y en la colección: se copian las cantidades a las dos.
  const syncCopies = (c) => {
    for (const r of [...search.results, ...draft.cards]) if (r.id === c.id) { r.quantity = c.quantity; r.variant_qty = c.variant_qty; }
    renderAll();
  };
  const setQuantity = async (c, quantity) => {
    setLocalTotal(c, quantity);
    await window.tcg.setOwned(c.id, c.quantity, c);
    syncCopies(c);
  };
  const setVariant = async (c, key, quantity) => {
    setLocalVariant(c, key, Math.max(0, quantity));
    await window.tcg.setVariantOwned(c.id, key, Math.max(0, quantity), c);
    syncCopies(c);
  };
  const toggleOwned = (c) => {
    if (c.quantity > 1) return; // con varias copias, la cantidad se cambia desde ⋮
    setQuantity(c, c.quantity > 0 ? 0 : 1);
  };
  const menuFor = (c) => [
    ...quantityMenuItems(tcg, tile(c), (q) => setQuantity(c, q), (changed) => {
      for (const r of [...search.results, ...draft.cards]) if (changed[r.id] != null) setLocalTotal(r, changed[r.id]);
      renderAll();
    }, (key, q) => setVariant(c, key, q)),
    { separator: true },
    { label: 'Remove from collection', icon: '×', sound: 'remove', onClick: () => toggleIncluded(c) },
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
      [c.setName || c.setId, c.rarity || '', qtyLabel(c)], () => menuFor(c))));
    if (!draft.cards.length) selectedGrid.append(el('p', { class: 'muted' }, 'No cards yet. Use Add cards to search for some.'));
  };

  // Diálogo "Add cards": clic (o +/−) = añadir a la colección / quitar; ⋮ (si ya está) = cantidad y más.
  const search = { query: '', results: [] };
  let refreshPicker = null;
  const pickTile = (c) => {
    const isIn = included().has(c.id);
    const t = tile(c);
    return el('div', {
      class: 'card pick' + (isIn ? ' owned' : ''),
      title: isIn ? 'In the collection (click to remove it)' : 'Click to add it to the collection',
      onclick: () => { sfx.play(isIn ? 'remove' : 'add'); toggleIncluded(c); },
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
        el('div', { class: 'card-sub' }, c.quantity ? qtyLabel(c) : '')));
  };
  const openPicker = () => {
    refreshPicker = openCardPicker(tcg, {
      search, filterKey: `editor:${tcg.id}`, pickTile,
      mapResult: (c) => ({
        id: c.id, setId: c.set.id, setName: c.set.name, localId: c.localId,
        name: c.name, rarity: c.rarity, image: c.image, price: c.price, quantity: c.quantity, attrs: c.attrs,
        variants: c.variants, variant_qty: c.variant_qty,
      }),
      subtitle: () => `${draft.name.trim() || 'New collection'} · ${draft.cards.length} card${draft.cards.length === 1 ? '' : 's'}`,
      hint: 'Click a card to add it to the collection or remove it. Use ⋮ on the ones in it to set how many you own.',
      onClose: () => { refreshPicker = null; },
    });
  };

  const renderAll = () => { renderSelected(); refreshPicker?.(); };

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
          el('button', { class: 'btn btn-secondary btn-icon', onclick: openPicker }, el('span', { class: 'icon-plus' }), 'Add cards'),
          el('button', { class: 'btn btn-secondary', onclick: () => backBtn.click() }, 'Cancel'),
          el('button', { class: 'btn', onclick: save }, isNew ? 'Create collection' : 'Save changes')))),
    el('label', { class: 'field-label' }, 'Name', nameInput),
    error,
    el('div', { class: 'section-head sets-head' }, selectedTitle),
    el('p', { class: 'muted hint' }, 'Click a card to mark whether you own it. Use ⋮ to remove it from the collection.'),
    selectedGrid
  );
  renderSelected();
  if (isNew) nameInput.focus();
}

// ---------- Mazos ----------
// Las cartas de un mazo no son cartas que tienes: si la tienes o no sale de tu colección, y en cada mazo se puede
// marcar al revés (p. ej. una sola copia que usas en dos mazos), sin cambiar la colección.

// Formatos de cada TCG. size: nº exacto de cartas; min: mínimo; maxCopies: copias de una misma carta (sin contar
// tierras básicas / Energía básica); commander / leader: hueco aparte para esa carta; legal: formato en Scryfall.
const DECK_FORMATS = {
  magic: [
    { id: 'commander', name: 'Commander', size: 100, maxCopies: 1, commander: true, legal: 'commander' },
    { id: 'standard', name: 'Standard', min: 60, maxCopies: 4, legal: 'standard' },
    { id: 'pioneer', name: 'Pioneer', min: 60, maxCopies: 4, legal: 'pioneer' },
    { id: 'modern', name: 'Modern', min: 60, maxCopies: 4, legal: 'modern' },
    { id: 'legacy', name: 'Legacy', min: 60, maxCopies: 4, legal: 'legacy' },
    { id: 'vintage', name: 'Vintage', min: 60, maxCopies: 4, legal: 'vintage' },
    { id: 'pauper', name: 'Pauper', min: 60, maxCopies: 4, legal: 'pauper' },
    { id: 'casual', name: 'Casual' },
  ],
  pokemon: [
    { id: 'standard', name: 'Standard', size: 60, maxCopies: 4 },
    { id: 'expanded', name: 'Expanded', size: 60, maxCopies: 4 },
    { id: 'casual', name: 'Casual' },
  ],
  onepiece: [
    { id: 'standard', name: 'Standard', size: 50, maxCopies: 4, leader: true },
    { id: 'casual', name: 'Casual', leader: true },
  ],
};
const deckFormat = (deck) => (DECK_FORMATS[deck.tcg] || []).find((f) => f.id === deck.format)
  || { id: deck.format, name: deck.format || 'Casual' };
// Hueco aparte del formato: rol de sus cartas en la base de datos, nombre y cuántas caben (dos commanders con Partner).
const specialSlot = (fmt) => (fmt.commander ? { role: 'commander', label: 'Commander', max: 2 }
  : fmt.leader ? { role: 'leader', label: 'Leader', max: 1 } : null);
const typesOf = (c) => [].concat(c.attrs?.type || []);

function formatHint(fmt) {
  if (fmt.commander) return '100 cards including the commander, one copy of each card (basic lands aside), all in the commander\'s colors.';
  if (fmt.leader) return `1 leader${fmt.size ? ` plus ${fmt.size} cards` : ''}${fmt.maxCopies ? `, up to ${fmt.maxCopies} copies of each card` : ''}, all in the leader's colors.`;
  if (fmt.size) return `${fmt.size} cards, up to ${fmt.maxCopies} copies of each card (basic Energy aside).`;
  if (fmt.min) return `At least ${fmt.min} cards, up to ${fmt.maxCopies} copies of each card (basic lands aside). Card legality comes from Scryfall.`;
  return 'No deck-building rules: any cards, any number of copies.';
}

// Copias que tienes en tu colección. En Magic y One Piece vale cualquier impresión de la carta; en Pokémon, solo esa.
const deckHave = (deck, c) => (deck.tcg === 'pokemon' ? c.have_exact : c.have_any);
// 'owned' | 'partial' | 'missing' según tu colección (sin lo marcado en el mazo).
function collectionStatus(deck, c) {
  const have = deckHave(deck, c);
  return have >= c.quantity ? 'owned' : have > 0 ? 'partial' : 'missing';
}
// Lo mismo, con lo que marcaste en este mazo por encima.
function deckCardStatus(deck, c) {
  if (c.owned_override != null) return c.owned_override ? 'owned' : 'missing';
  return collectionStatus(deck, c);
}

function deckStats(deck, cards) {
  const fmt = deckFormat(deck);
  const sum = (list, fn) => list.reduce((n, c) => n + fn(c), 0);
  // El commander cuenta dentro de las 100 cartas; el líder de One Piece va aparte de las 50.
  const total = sum(cards.filter((c) => c.role !== 'leader'), (c) => c.quantity);
  const copies = sum(cards, (c) => c.quantity);
  const owned = sum(cards, (c) => {
    const status = deckCardStatus(deck, c);
    return status === 'owned' ? c.quantity : status === 'partial' ? deckHave(deck, c) : 0;
  });
  return { fmt, total, copies, owned };
}

// La carta elegida como portada; si no hay, el commander / líder o la primera carta.
function deckCover(deck, cards) {
  return cards.find((c) => c.id === deck.cover_card_id) || cards.find((c) => c.role !== 'main') || cards[0] || null;
}

const isBasic = (deck, c) => (deck.tcg === 'magic'
  ? [].concat(c.attrs?.supertype || []).includes('Basic') && typesOf(c).includes('Land')
  : deck.tcg === 'pokemon' && c.attrs?.subtype === 'Basic Energy');
const nameList = (cards) => {
  const names = [...new Set(cards.map((c) => c.name))];
  return names.length > 5 ? `${names.slice(0, 5).join(', ')} and ${names.length - 5} more` : names.join(', ');
};

// Lo que no cumple las reglas del formato: issues, frases para el recuadro de avisos; problems, por cada carta
// que incumple alguna regla, { id de la carta: [motivos] } (para marcarla en el mazo).
function deckIssues(deck, cards) {
  const { fmt, total } = deckStats(deck, cards);
  const slot = specialSlot(fmt);
  const special = slot ? cards.filter((c) => c.role === slot.role) : [];
  const main = cards.filter((c) => c.role === 'main');
  const issues = [];
  const problems = new Map();
  const flag = (list, reason) => {
    for (const c of list) problems.set(c.id, [...(problems.get(c.id) || []), reason]);
  };
  if (slot && !special.length) issues.push(`Choose a ${slot.label.toLowerCase()}.`);
  if (fmt.size && total !== fmt.size) {
    issues.push(`The deck needs exactly ${fmt.size} cards${fmt.commander ? ' including the commander' : fmt.leader ? ' plus the leader' : ''}: it has ${total}.`);
  }
  if (fmt.min && total < fmt.min) issues.push(`The deck needs at least ${fmt.min} cards: it has ${total}.`);
  if (fmt.maxCopies) {
    // La misma carta: mismo código en One Piece (artes alternativos incluidos), mismo nombre en Magic y Pokémon.
    const counts = new Map();
    for (const c of cards.filter((x) => x.role !== 'leader' && !isBasic(deck, x))) {
      const key = deck.tcg === 'onepiece' ? c.local_id : c.name.toLowerCase();
      const entry = counts.get(key) || { name: c.name, n: 0, cards: [] };
      entry.n += c.quantity;
      entry.cards.push(c);
      counts.set(key, entry);
    }
    const over = [...counts.values()].filter((e) => e.n > fmt.maxCopies);
    for (const e of over) flag(e.cards, `${e.n} copies: at most ${fmt.maxCopies} allowed`);
    const basics = deck.tcg === 'magic' ? ' (basic lands aside)' : deck.tcg === 'pokemon' ? ' (basic Energy aside)' : '';
    if (over.length) {
      issues.push(fmt.maxCopies === 1 ? `Only one copy of each card${basics}: ${nameList(over)}.`
        : `At most ${fmt.maxCopies} copies of each card${basics}: ${nameList(over)}.`);
    }
  }
  if (fmt.legal) {
    const illegal = cards.filter((c) => Array.isArray(c.legal) && !c.legal.includes(fmt.legal));
    if (illegal.length) issues.push(`Not legal in ${fmt.name}: ${nameList(illegal)}.`);
    flag(illegal, `Not legal in ${fmt.name}`);
  }
  if (fmt.commander && special.length && special.every((c) => Array.isArray(c.color_identity))) {
    const identity = new Set(special.flatMap((c) => c.color_identity));
    const outside = main.filter((c) => Array.isArray(c.color_identity) && c.color_identity.some((x) => !identity.has(x)));
    if (outside.length) issues.push(`Outside the commander's colors: ${nameList(outside)}.`);
    flag(outside, "Outside the commander's colors");
  }
  if (fmt.leader) {
    const leaders = main.filter((c) => typesOf(c).includes('Leader'));
    if (leaders.length) issues.push(`Leaders can't go in the main deck: ${nameList(leaders)}.`);
    flag(leaders, "Leaders can't go in the main deck");
    const colors = new Set(special.flatMap((c) => c.attrs?.colors || []));
    const outside = colors.size ? main.filter((c) => !typesOf(c).includes('Leader') && c.attrs?.colors?.length
      && !c.attrs.colors.some((x) => colors.has(x))) : [];
    if (outside.length) issues.push(`Not in the leader's colors: ${nameList(outside)}.`);
    flag(outside, "Not in the leader's colors");
  }
  return { issues, problems };
}

// Carta de un resultado de búsqueda en el formato que guarda el mazo.
function deckDraftCard(c) {
  return {
    id: c.id, setId: c.set?.id, setName: c.set?.name, localId: c.localId, name: c.name, rarity: c.rarity, image: c.image,
    price: c.price ?? c.market_price, attrs: c.attrs, colorIdentity: c.color_identity, legal: c.legal,
    tcgplayerId: c.tcgplayer_id, scryfallUri: c.scryfall_uri,
  };
}

// Tarjeta de un mazo: la portada difuminada de fondo y la carta encima, para distinguirla de un set.
function deckTile(deck) {
  const cover = deckCover(deck, deck.cards);
  const { fmt, total, copies, owned } = deckStats(deck, deck.cards);
  const tcg = tcgById(deck.tcg);
  const image = cover?.image_url ? cardImage(cover.image_url) : null;
  return el('button', { class: 'deck-tile', onclick: () => navigate(showDeck, deck.id) },
    el('div', { class: 'deck-tile-bg' }, image ? el('img', { src: image, alt: '', loading: 'lazy' }) : null),
    el('img', { class: 'deck-tcg-badge', src: tcg.image, alt: tcg.name, title: tcg.name }),
    el('div', { class: 'deck-tile-cover' },
      image ? el('img', { src: image, alt: cover.name, loading: 'lazy' }) : el('div', { class: 'deck-empty-cover' }, 'No cards yet')),
    el('div', { class: 'deck-tile-info' },
      el('div', { class: 'set-name' }, deck.name),
      el('div', { class: 'collection-meta' }, `${tcg.name} · ${fmt.name}`),
      el('div', { class: 'collection-meta' },
        `${total}${fmt.size ? ` / ${fmt.size}` : ''} card${total === 1 && !fmt.size ? '' : 's'}`
        + (copies ? ` · ${owned} / ${copies} owned` : '')),
      copies ? progressBar(owned, copies) : null));
}

// ---------- Lista de mazos ----------
const decksState = { tcg: '' };

async function showDecks() {
  setChrome('My decks');
  setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', {}, 'Loading decks…')));
  let decks;
  try {
    decks = await window.tcg.listDecks();
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, 'Could not load the decks.'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showDecks() }, 'Retry'));
    return;
  }
  if (!decks.some((d) => d.tcg === decksState.tcg)) decksState.tcg = '';

  const chips = el('div', { class: 'chips' });
  const grid = el('div', { class: 'deck-grid' });
  const render = () => {
    const count = (id) => decks.filter((d) => d.tcg === id).length;
    setChildren(chips, decks.length ? [['', `All (${decks.length})`],
      ...TCGS.filter((t) => count(t.id)).map((t) => [t.id, `${t.name} (${count(t.id)})`])].map(([key, label]) =>
      optionChip(label, decksState.tcg === key, () => { decksState.tcg = key; render(); })) : null);
    const list = decks.filter((d) => !decksState.tcg || d.tcg === decksState.tcg);
    setChildren(grid, list.map(deckTile));
    if (!list.length) grid.append(el('p', { class: 'muted' }, 'No decks yet. Use Create deck to build your first one.'));
  };

  const create = async () => {
    const draft = await deckDialog({ title: 'New deck', okLabel: 'Create deck', tcg: decksState.tcg || 'magic' });
    if (!draft) return;
    navigate(showDeck, await window.tcg.createDeck(draft));
  };

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, 'My decks'),
        el('div', { class: 'counter' }, `${decks.length} deck${decks.length === 1 ? '' : 's'}`)),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          el('button', { class: 'btn btn-icon', onclick: create }, el('span', { class: 'icon-plus' }), 'Create deck')),
        el('div', { class: 'toolbar-row' }, chips))),
    el('p', { class: 'muted hint' },
      'A card added to a deck is not added to your collection: the deck shows whether you own it or not.'),
    grid);
  render();
}

// Diálogo para crear un mazo (nombre, TCG y formato) o, con deck, cambiarle el nombre y el formato.
// Devuelve { name, tcg, format } o null si se cancela.
function deckDialog({ title, okLabel, deck = null, tcg = 'magic' }) {
  return new Promise((resolve) => {
    const draft = { name: deck?.name || '', tcg: deck?.tcg || tcg, format: deck?.format || null };
    const error = el('p', { class: 'error deck-dialog-error' });
    const input = el('input', {
      class: 'qty-input', placeholder: 'e.g. Mono red aggro', maxlength: '80', value: draft.name,
      oninput: (e) => { draft.name = e.target.value; error.textContent = ''; },
    });
    const body = el('div', { class: 'export-groups' });
    const group = (label, options, active, onPick) => el('div', { class: 'export-group' },
      el('div', { class: 'filter-field-label' }, label),
      el('div', { class: 'chips' }, options.map(([value, text]) =>
        optionChip(text, value === active, () => { onPick(value); render(); }))));
    const render = () => {
      const formats = DECK_FORMATS[draft.tcg];
      if (!formats.some((f) => f.id === draft.format)) draft.format = formats[0].id;
      setChildren(body,
        deck ? null : group('TCG', TCGS.filter((t) => t.enabled).map((t) => [t.id, t.name]), draft.tcg, (v) => { draft.tcg = v; }),
        group('Format', formats.map((f) => [f.id, f.name]), draft.format, (v) => { draft.format = v; }),
        el('p', { class: 'muted export-hint' }, formatHint(formats.find((f) => f.id === draft.format))));
    };
    const close = (value) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
    const accept = () => {
      if (!draft.name.trim()) { error.textContent = 'Give the deck a name.'; input.focus(); return; }
      close({ name: draft.name.trim(), tcg: draft.tcg, format: draft.format });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); accept(); }
    };
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
      el('div', { class: 'dialog export-dialog', role: 'dialog' },
        el('h3', {}, title),
        el('p', { class: 'muted' }, deck ? tcgById(deck.tcg).name : 'Choose a name, the TCG and the format. You can change the name and format later.'),
        el('label', { class: 'dialog-label deck-name-label' }, 'Name', input),
        error,
        body,
        el('div', { class: 'dialog-actions' },
          el('button', { class: 'chip', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn', onclick: accept }, okLabel))));
    render();
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    input.focus();
  });
}

// ---------- Un mazo ----------
// Grupos de cartas del mazo, en orden. En Magic una carta con varios tipos va al primero de priority
// (una Artifact Creature con las criaturas, una Artifact Land con las tierras).
const DECK_GROUPS = {
  magic: {
    order: ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land'],
    priority: ['Creature', 'Land', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'],
  },
  pokemon: { order: ['Pokémon', 'Trainer', 'Energy'] },
  onepiece: { order: ['Character', 'Event', 'Stage'] },
};
const GROUP_TITLES = {
  Creature: 'Creatures', Planeswalker: 'Planeswalkers', Battle: 'Battles', Instant: 'Instants', Sorcery: 'Sorceries',
  Artifact: 'Artifacts', Enchantment: 'Enchantments', Land: 'Lands', Trainer: 'Trainers', Character: 'Characters',
  Event: 'Events', Stage: 'Stages',
};
const deckViewState = {}; // filtro All / Owned / Not owned, por mazo

async function showDeck(deckId) {
  setChrome('My decks › …');
  setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', {}, 'Loading deck…')));
  let data;
  try {
    data = await window.tcg.getDeck(deckId);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, 'Could not load the deck.'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showDeck(deckId) }, 'Retry'));
    return;
  }
  if (!data) { setChildren(view, el('p', { class: 'error' }, 'This deck no longer exists.')); return; }
  let { deck, cards } = data;
  const tcg = tcgById(deck.tcg);
  const state = (deckViewState[deckId] ||= { status: '' });

  // Cada cambio devuelve la lista de cartas nueva del mazo. Los cambios van de uno en uno, para que varios
  // clics seguidos (p. ej. en −) partan siempre de la cantidad que dejó el anterior.
  const apply = (next) => { cards = next; renderAll(); };
  let queue = Promise.resolve();
  const enqueue = (fn) => (queue = queue.then(fn).catch((err) => console.error(err)));
  const addCard = (c, role = 'main') => enqueue(async () => apply(await window.tcg.addDeckCard(deck.id, deckDraftCard(c), { role })));
  const updateCard = (c, changes) => enqueue(async () => apply(await window.tcg.updateDeckCard(deck.id, c.id, changes)));
  // Suma o quita una copia según lo que hay en el mazo en ese momento; sin copias, la carta sale del mazo.
  const changeCopies = (c, delta) => enqueue(async () => {
    const entry = cards.find((x) => x.id === c.id);
    if (entry) apply(await window.tcg.updateDeckCard(deck.id, entry.id, { quantity: entry.quantity + delta }));
  });
  const removeCopy = (c) => changeCopies(c, -1);
  const slot = () => specialSlot(deckFormat(deck));
  const special = () => (slot() ? cards.filter((c) => c.role === slot().role) : []);
  const canBeSpecial = (c) => (slot()?.role === 'leader' ? typesOf(c).includes('Leader')
    : !c.attrs || [].concat(c.attrs.supertype || []).includes('Legendary'));

  // Marcar si la tienes solo cambia este mazo: si coincide con tu colección, se quita la marca.
  const toggleOwned = (c) => {
    const next = deckCardStatus(deck, c) !== 'owned';
    updateCard(c, { ownedOverride: next === (collectionStatus(deck, c) === 'owned') ? null : next });
  };
  const setCover = async (c) => {
    ({ deck, cards } = await window.tcg.updateDeck(deck.id, { coverCardId: c.id }));
    renderAll();
  };
  // replace: la carta sustituye al commander / líder actual (que sale del mazo); si no, se suma (Partner).
  const setSpecial = async (c, replace = slot().max === 1) => {
    if (replace) for (const old of special()) if (old.id !== c.id) await window.tcg.updateDeckCard(deck.id, old.id, { quantity: 0 });
    await addCard(c, slot().role);
  };
  const chooseSpecial = async (replace) => {
    const c = await pickSpecialCard(tcg, slot());
    if (c) { sfx.play('add'); setSpecial(c, replace); }
  };

  const menuFor = (c) => {
    const s = slot();
    const owned = deckCardStatus(deck, c) === 'owned';
    return [
      c.role === 'main' ? { label: 'Add 1 copy', icon: '+', sound: 'add', onClick: () => changeCopies(c, 1) } : null,
      c.role === 'main' && c.quantity > 1
        ? { label: 'Remove 1 copy', icon: '−', sound: 'remove', onClick: () => removeCopy(c) } : null,
      { separator: true },
      { label: owned ? 'Mark as not owned in this deck' : 'Mark as owned in this deck', icon: owned ? '○' : '✓',
        sound: owned ? 'remove' : 'add', onClick: () => toggleOwned(c) },
      c.owned_override != null ? { label: 'Follow my collection again', icon: '↺', onClick: () => updateCard(c, { ownedOverride: null }) } : null,
      deckCover(deck, cards)?.id === c.id ? null : { label: 'Set as deck cover', icon: '★', onClick: () => setCover(c) },
      s && c.role === 'main' && canBeSpecial(c) && (s.max === 1 || special().length < s.max)
        ? { label: `Set as ${s.label.toLowerCase()}`, icon: '♛', onClick: () => setSpecial(c) } : null,
      s?.role === 'commander' && c.role === 'commander'
        ? { label: 'Move to the main deck', icon: '↓', onClick: () => updateCard(c, { role: 'main' }) } : null,
      { separator: true },
      ...cardLinkItems(tcg, c),
      { separator: true },
      { label: 'Remove from deck', icon: '×', sound: 'remove', onClick: () => updateCard(c, { quantity: 0 }) },
    ];
  };

  let problems = new Map(); // cartas que incumplen las reglas del formato (se calcula en renderHeader)
  const tile = (c) => {
    const status = deckCardStatus(deck, c);
    const reasons = problems.get(c.id);
    const have = deckHave(deck, c);
    const ownLine = c.owned_override === 0 ? 'Not owned in this deck'
      : c.owned_override === 1 ? 'Owned in this deck'
      : !have ? 'Not in your collection'
      : status === 'partial' ? `You have ${have} of ${c.quantity}`
      : `You have ${have}${c.have_exact < c.quantity && deck.tcg !== 'pokemon' ? ' (another print)' : ''}`;
    return el('div', {
      class: 'card deck-card' + (status === 'owned' ? ' owned' : status === 'partial' ? ' partial' : '')
        + (c.owned_override != null ? ' overridden' : '') + (reasons ? ' has-problem' : ''),
      title: status === 'owned' ? 'Owned (click to mark it as not owned in this deck)' : 'Not owned (click to mark it as owned in this deck)',
      onclick: () => { sfx.play(status === 'owned' ? 'remove' : 'add'); toggleOwned(c); },
    },
      el('div', { class: 'card-img-wrap' },
        c.image_url ? el('img', { src: cardImage(c.image_url), alt: c.name, loading: 'lazy' })
          : el('div', { class: 'no-image' }, c.name, el('br'), 'No image'),
        expandButton(c),
        el('div', { class: 'check' }, status === 'owned' ? '✓' : ''),
        el('button', {
          class: 'card-menu-btn', title: 'Actions',
          onclick: (e) => { e.stopPropagation(); openCardMenu(e.currentTarget, menuFor(c)); },
        }, el('span', { class: 'dots' })),
        // En rojo si la carta incumple alguna regla del formato (copias de más, color, legalidad…).
        c.role === 'main' ? el('div', { class: 'deck-qty' + (reasons ? ' problem' : ''), title: reasons?.join(' · ') }, `×${c.quantity}`) : null,
        // Al pasar el ratón, − / + para cambiar las copias sin abrir el menú (el commander / líder no lleva).
        c.role === 'main' ? el('div', { class: 'deck-stepper', onclick: (e) => e.stopPropagation() },
          el('button', {
            class: 'deck-step', title: c.quantity > 1 ? 'Remove a copy' : 'Remove from the deck',
            onclick: () => { sfx.play('remove'); removeCopy(c); },
          }, el('span', { class: 'icon-minus' })),
          el('span', { class: 'deck-step-qty' }, `×${c.quantity}`),
          el('button', {
            class: 'deck-step', title: 'Add a copy',
            onclick: () => { sfx.play('add'); changeCopies(c, 1); },
          }, el('span', { class: 'icon-plus' }))) : null,
        deckCover(deck, cards)?.id === c.id ? el('div', { class: 'deck-cover-badge', title: 'Deck cover' }, '★') : null),
      el('div', { class: 'card-info' },
        el('div', { class: 'card-name' }, `#${c.local_id} ${c.name}`),
        el('div', { class: 'card-sub' }, c.set_name || c.set_id || ''),
        el('div', { class: 'card-sub deck-own-line' }, ownLine),
        reasons ? el('div', { class: 'card-sub deck-problem-line' }, reasons.join(' · ')) : null));
  };

  // ---- Cabecera, avisos y hueco del commander / líder ----
  const title = el('h1', { class: 'title' });
  const meta = el('div', { class: 'counter' });
  const counter = el('div', { class: 'counter' });
  const bar = el('div', { class: 'progress-fill' });
  const issuesBox = el('div', { class: 'deck-issues' });
  const slotBox = el('div', {});
  const renderHeader = () => {
    const { fmt, total, copies, owned } = deckStats(deck, cards);
    setChrome(`My decks › ${deck.name}`, tcg);
    title.textContent = deck.name;
    meta.textContent = `${tcg.name} · ${fmt.name}`;
    counter.textContent = `${total}${fmt.size ? ` / ${fmt.size}` : ''} cards · ${owned} / ${copies} owned`;
    bar.style.width = `${copies ? (owned / copies) * 100 : 0}%`;
    let issues;
    ({ issues, problems } = deckIssues(deck, cards));
    issuesBox.classList.toggle('ok', !issues.length);
    setChildren(issuesBox, !cards.length ? null : issues.length
      ? [el('div', { class: 'deck-issues-title' }, `${fmt.name} check`), el('ul', {}, issues.map((t) => el('li', {}, t)))]
      : el('div', { class: 'deck-issues-title' }, `✓ Ready for ${fmt.name}`));
    issuesBox.classList.toggle('hidden', !cards.length || (!issues.length && !fmt.size && !fmt.min && !specialSlot(fmt)));
  };
  const renderSlot = () => {
    const s = slot();
    if (!s) { setChildren(slotBox); return; }
    const list = special();
    setChildren(slotBox,
      el('div', { class: 'section-head sets-head' },
        el('h2', { class: 'section-title' }, list.length > 1 ? `${s.label}s` : s.label),
        el('div', { class: 'section-actions' },
          list.length && list.length < s.max
            ? el('button', { class: 'chip', title: 'Add a second commander (Partner, Background…)', onclick: () => chooseSpecial(false) },
              'Add partner') : null,
          el('button', { class: 'btn btn-secondary', onclick: () => chooseSpecial(true) },
            `${list.length ? 'Change' : 'Choose'} ${s.label.toLowerCase()}`))),
      el('div', { class: 'card-grid' },
        list.map(tile),
        list.length ? null : el('button', { class: 'deck-slot-empty', onclick: () => chooseSpecial(true) },
          el('span', { class: 'icon-plus' }), `Choose ${s.label.toLowerCase()}`)));
  };

  // ---- Cartas del mazo, agrupadas por tipo ----
  const cardsTitle = el('h2', { class: 'section-title' });
  const quickChips = el('div', { class: 'chips' });
  const cardsBox = el('div', {});
  const renderCards = () => {
    const main = cards.filter((c) => c.role === 'main');
    cardsTitle.textContent = `Deck (${main.reduce((n, c) => n + c.quantity, 0)})`;
    setChildren(quickChips, [['', 'All'], ['owned', 'Owned'], ['missing', 'Not owned']].map(([k, label]) =>
      optionChip(label, state.status === k, () => { state.status = k; renderCards(); })));
    const visible = main.filter((c) => !state.status || (deckCardStatus(deck, c) === 'owned') === (state.status === 'owned'));
    const { order, priority = order } = DECK_GROUPS[deck.tcg];
    const groupOf = (c) => priority.find((t) => typesOf(c).includes(t)) || 'Other';
    setChildren(cardsBox, [...order, 'Other'].map((type) => {
      const list = visible.filter((c) => groupOf(c) === type).sort((a, b) => a.name.localeCompare(b.name));
      if (!list.length) return null;
      return el('section', { class: 'deck-group' },
        el('h3', { class: 'deck-group-title' }, `${GROUP_TITLES[type] || type} (${list.reduce((n, c) => n + c.quantity, 0)})`),
        el('div', { class: 'card-grid' }, list.map(tile)));
    }));
    if (!visible.length) cardsBox.append(el('p', { class: 'muted' },
      main.length ? 'No cards match this filter.' : 'No cards yet. Use Add cards to search for some.'));
  };

  // ---- Diálogo "Add cards" ----
  // Dentro del buscador, las cartas que ya están en el mazo se ven en color, como las que tienes; en el mazo
  // se ve si las tienes de verdad.
  const search = { query: '', results: [] };
  let refreshPicker = null; // vuelve a pintar el diálogo abierto después de cada cambio en el mazo
  const deckEntry = (c) => cards.find((x) => x.id === c.id);
  const pickerTile = (c) => {
    const entry = deckEntry(c);
    // El commander / líder no se suma desde aquí: tiene su propio hueco en el mazo.
    const special = entry && entry.role !== 'main';
    const t = { ...c, image_url: c.image, local_id: c.localId };
    return el('div', {
      class: 'card pick deck-pick' + (entry ? ' owned' : ''),
      title: special ? `This card is the deck's ${entry.role}` : 'Click to add a copy to the deck',
      onclick: () => { if (special) return; sfx.play('add'); addCard(c); },
    },
      el('div', { class: 'card-img-wrap' },
        t.image_url ? el('img', { src: cardImage(t.image_url), alt: c.name, loading: 'lazy' })
          : el('div', { class: 'no-image' }, c.name, el('br'), 'No image'),
        expandButton(t),
        special ? null : el('div', { class: 'check pick-toggle', title: 'Add a copy' }, el('span', { class: 'icon-plus' })),
        entry && !special ? el('button', {
          class: 'pick-minus', title: 'Remove a copy',
          onclick: (e) => { e.stopPropagation(); sfx.play('remove'); removeCopy(c); },
        }, el('span', { class: 'icon-minus' })) : null,
        entry ? el('div', { class: 'deck-qty' }, special ? (entry.role === 'leader' ? 'Leader' : 'Commander') : `×${entry.quantity} in deck`) : null),
      el('div', { class: 'card-info' },
        el('div', { class: 'card-name' }, `#${c.localId} ${c.name}`),
        el('div', { class: 'card-sub' }, c.set?.name || ''),
        el('div', { class: 'card-sub' }, c.quantity > 0 ? `In your collection: ${c.quantity}` : 'Not in your collection')));
  };
  const openPicker = () => {
    refreshPicker = openCardPicker(tcg, {
      search, filterKey: `deck-search:${deck.tcg}`, pickTile: pickerTile,
      subtitle: () => {
        const { fmt, total } = deckStats(deck, cards);
        return `${deck.name} · ${total}${fmt.size ? ` / ${fmt.size}` : ''} cards`;
      },
      hint: 'Click a card (or +) to add a copy, − to take one out. Your collection does not change.',
      onClose: () => { refreshPicker = null; },
    });
  };

  const renderAll = () => { renderHeader(); renderSlot(); renderCards(); refreshPicker?.(); };

  const editDeck = async () => {
    const next = await deckDialog({ title: 'Edit deck', okLabel: 'Save', deck });
    if (!next) return;
    ({ deck, cards } = await window.tcg.updateDeck(deck.id, { name: next.name, format: next.format }));
    // Si el formato nuevo no tiene el hueco del anterior (p. ej. de Commander a Modern), sus cartas pasan al mazo.
    const keep = slot()?.role;
    for (const c of cards.filter((x) => x.role !== 'main' && x.role !== keep)) {
      cards = await window.tcg.updateDeckCard(deck.id, c.id, { role: 'main' });
    }
    renderAll();
  };
  const removeDeck = async () => {
    const ok = await confirmDialog('Delete deck',
      `Delete "${deck.name}"? Your collection does not change: the cards you own stay marked in their sets.`, 'Delete');
    if (!ok) return;
    await window.tcg.deleteDeck(deck.id);
    navStack.pop();
    const [fn, args] = navStack[navStack.length - 1];
    fn(...args);
  };

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', {}, title, meta, counter, el('div', { class: 'progress wide' }, bar)),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          el('button', { class: 'btn btn-icon', onclick: openPicker }, el('span', { class: 'icon-plus' }), 'Add cards'),
          el('button', { class: 'btn btn-secondary', onclick: editDeck }, 'Edit deck'),
          el('button', { class: 'btn btn-danger', onclick: removeDeck }, 'Delete deck')))),
    issuesBox,
    slotBox,
    el('div', { class: 'section-head sets-head' }, cardsTitle, quickChips),
    el('p', { class: 'muted hint' }, 'Click a card to mark whether you own it in this deck: your collection does not change. '
      + 'Hover over it and use − / + to change the copies, or ⋮ for the deck cover and more.'),
    cardsBox);
  renderAll();
}

// Diálogo para elegir el commander (cartas que pueden serlo, según Scryfall) o el líder de One Piece.
// Devuelve la carta elegida (como un resultado de búsqueda) o null.
function pickSpecialCard(tcg, slot) {
  return new Promise((resolve) => {
    const isCommander = slot.role === 'commander';
    const close = (value) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (!modal.classList.contains('hidden')) modal.classList.add('hidden'); else close(null);
    };
    const body = el('div', { class: 'printings-body' });
    const input = el('input', {
      class: 'search', type: 'search',
      placeholder: isCommander ? 'Search commanders, e.g. Atraxa' : 'Search leaders, e.g. Luffy',
      onkeydown: (e) => { if (e.key === 'Enter') run(); },
    });
    const run = async () => {
      const q = input.value.trim();
      if (q.length < 2) { setChildren(body); return; }
      setChildren(body, el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, 'Searching…')));
      try {
        // Scryfall: is:commander = cartas que pueden ser commander (legendarias, o que lo dicen en su texto).
        const found = (await window.tcg.searchCards(isCommander ? `${q} is:commander` : q, tcg.id))
          .filter((c) => isCommander || typesOf(c).includes('Leader'));
        if (input.value.trim() !== q) return;
        setChildren(body, !found.length ? el('p', { class: 'muted' }, `No ${isCommander ? 'commanders' : 'leaders'} found.`) : [
          el('p', { class: 'muted hint' }, `Click a card to make it the ${slot.label.toLowerCase()}.`),
          el('div', { class: 'card-grid' }, found.map((c) => {
            const t = { ...c, image_url: c.image, local_id: c.localId };
            return el('div', { class: 'card pick deck-pick' + (c.quantity > 0 ? ' owned' : ''), onclick: () => close(c) },
              el('div', { class: 'card-img-wrap' },
                t.image_url ? el('img', { src: cardImage(t.image_url), alt: c.name, loading: 'lazy' })
                  : el('div', { class: 'no-image' }, c.name, el('br'), 'No image'),
                expandButton(t)),
              el('div', { class: 'card-info' },
                el('div', { class: 'card-name' }, `#${c.localId} ${c.name}`),
                el('div', { class: 'card-sub' }, c.set?.name || ''),
                el('div', { class: 'card-sub' }, c.quantity > 0 ? `In your collection: ${c.quantity}` : 'Not in your collection')));
          }))]);
      } catch (err) {
        setChildren(body, el('p', { class: 'error' }, `Search failed: ${err.message || err}`));
      }
    };
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
      el('div', { class: 'dialog printings-dialog', role: 'dialog' },
        el('div', { class: 'printings-header' },
          el('div', {}, el('h3', {}, `Choose ${slot.label.toLowerCase()}`),
            el('div', { class: 'search-row' }, input, el('button', { class: 'btn', onclick: run }, 'Search'))),
          el('button', { class: 'chip', onclick: () => close(null) }, 'Close')),
        body));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    input.focus();
  });
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

// ---------- Versiones de una carta (normal, reverse holo, con sello…) ----------
// card.variants: versiones que existen (la primera es la principal); card.variant_qty: { versión: copias }, '' = la principal.
const hasVariants = (card) => card.variants?.length > 1;
const variantQty = (card) => card.variant_qty || (card.quantity ? { '': card.quantity } : {});
const sumValues = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

// Cambia en memoria las copias de una versión, igual que la base de datos (el total es la suma).
function setLocalVariant(card, key, quantity) {
  const qty = { ...variantQty(card) };
  if (quantity > 0) qty[key] = quantity; else delete qty[key];
  card.variant_qty = qty;
  card.quantity = sumValues(qty);
}

// Cambia en memoria el total: la diferencia va a la versión principal (nunca baja de las otras versiones).
function setLocalTotal(card, total) {
  const qty = { ...variantQty(card) };
  delete qty[''];
  const extras = sumValues(qty);
  if (total <= 0) { card.variant_qty = {}; card.quantity = 0; return; }
  if (total > extras) qty[''] = total - extras;
  card.variant_qty = qty;
  card.quantity = Math.max(total, extras);
}

// Línea de cantidad bajo la carta: "Qty: 2", o por versión "Qty: 1 Normal · 2 Reverse".
function qtyLabel(card) {
  const qty = variantQty(card);
  if (!hasVariants(card) || !card.quantity) return `Qty: ${card.quantity || 0}`;
  const order = (key) => { const i = key ? card.variants.findIndex((v) => v.key === key) : 0; return i < 0 ? Infinity : i; };
  const name = (key) => (key ? card.variants.find((v) => v.key === key)?.short || key : card.variants[0].short);
  return 'Qty: ' + Object.keys(qty).sort((a, b) => order(a) - order(b)).map((k) => `${qty[k]} ${name(k)}`).join(' · ');
}

// Opciones comunes del menú ⋮: cantidad, versiones y enlaces externos. setQuantity(n) guarda la nueva cantidad total;
// onPrintingsChange({ cardId: cantidad }) recibe las cantidades cambiadas desde el diálogo de artes;
// setVariant(versión, n) guarda las copias de una versión (solo se usa si la carta tiene varias versiones).
function quantityMenuItems(tcg, card, setQuantity, onPrintingsChange, setVariant) {
  const variants = hasVariants(card) && setVariant ? card.variants : null;
  const qty = variantQty(card);
  const main = variants ? qty[''] || 0 : card.quantity;
  const setMain = (n) => (variants ? setVariant('', n) : setQuantity(n));
  const mainName = variants ? ` ${variants[0].label}` : '';
  return [
    { label: `Add 1${mainName}`, icon: '+', sound: 'add', onClick: () => setMain(main + 1) },
    {
      label: `Add several${mainName}…`, icon: '++',
      onClick: async () => {
        const n = await askQuantity(card, main, variants?.[0].label);
        if (n) { sfx.play('add'); setMain(main + n); }
      },
    },
    main > 0 ? { label: `Remove 1${mainName}`, icon: '−', sound: 'remove', onClick: () => setMain(main - 1) } : null,
    ...(variants ? [{ separator: true }, ...variants.slice(1).flatMap((v) => [
      { label: `Add 1 ${v.label}`, icon: '+', sound: 'add', onClick: () => setVariant(v.key, (qty[v.key] || 0) + 1) },
      qty[v.key] > 0 ? { label: `Remove 1 ${v.label} (${qty[v.key]})`, icon: '−', sound: 'remove', onClick: () => setVariant(v.key, qty[v.key] - 1) } : null,
    ])] : []),
    card.quantity > 1 ? { label: `Remove all (${card.quantity})`, icon: '×', sound: 'remove', onClick: () => setQuantity(0) } : null,
    { separator: true },
    ...cardLinkItems(tcg, card, async () => {
      const changed = await showPrintings(tcg, card);
      if (Object.keys(changed).length) onPrintingsChange?.(changed);
    }),
  ];
}

// Precio, artes y enlaces externos de una carta. onAllArts (opcional) abre "View all arts".
function cardLinkItems(tcg, card, onAllArts) {
  const link = { id: card.id, name: card.name, localId: card.local_id, official: card.set_official, tcg: tcg.id,
    tcgplayerId: card.tcgplayer_id, scryfallUri: card.scryfall_uri, setId: card.set_id || card.setId || card.set?.id };
  return [
    { label: 'View price', icon: '$', onClick: () => showPrices(tcg, card) },
    onAllArts ? { label: 'View all arts', icon: '❐', onClick: onAllArts } : null,
    tcg.id === 'pokemon' ? { label: 'View on TCG Collector', icon: '↗', onClick: () => window.tcg.openTcgCollector(link) } : null,
    tcg.id === 'magic' ? { label: 'View on Scryfall', icon: '↗', onClick: () => window.tcg.openScryfall(link) } : null,
    tcg.id === 'magic' ? { label: 'View on Moxfield', icon: '↗', onClick: () => window.tcg.openMoxfield(link) } : null,
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
    // Con más de una copia el clic no cambia nada (se gestiona desde ⋮), así que tampoco suena.
    onclick: (e) => { if (!(card.quantity > 1)) sfx.play(card.quantity > 0 ? 'remove' : 'add'); onToggle(e); },
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
    onclick: (e) => { e.stopPropagation(); sfx.play('zoom'); openModal(card); },
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
        }, [c.set?.name || c.set_name || '', c.rarity || '']);
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

// ---------- Diálogo "View price" ----------
// Precios actuales de cada versión de la carta (normal, foil, reverse, arte alternativo…), según la API de cada TCG.
function showPrices(tcg, card) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const body = el('div', { class: 'printings-body' },
    el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, 'Loading prices…')));
  const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'dialog printings-dialog prices-dialog', role: 'dialog' },
      el('div', { class: 'printings-header' },
        el('div', {}, el('h3', {}, 'Prices'), el('p', { class: 'muted' }, `#${card.local_id} ${card.name}`)),
        el('button', { class: 'chip', onclick: close }, 'Close')),
      body));
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);

  const money = (p) => (p.value == null ? '—'
    : new Intl.NumberFormat('en', { style: 'currency', currency: p.currency }).format(p.value));
  window.tcg.getPrices({ id: card.id, tcg: tcg.id, localId: card.local_id }).then((versions) => {
    if (!versions.length) {
      setChildren(body, el('p', { class: 'muted' }, 'There are no prices for this card yet.'));
      return;
    }
    setChildren(body, el('div', { class: 'price-list' }, versions.map((v) =>
      el('div', { class: 'price-version' + (v.current ? ' current' : '') },
        v.image ? el('img', { src: cardImage(v.image), alt: '', loading: 'lazy' }) : null,
        el('div', { class: 'price-info' },
          el('div', { class: 'price-title' }, v.title),
          el('div', { class: 'price-sub' }, [v.subtitle, v.source].filter(Boolean).join(' · ')),
          el('div', { class: 'price-values' }, v.prices.map((p, i) =>
            el('div', { class: 'price-value' + (i === 0 ? ' main' : '') }, p.label, el('strong', {}, money(p))))))))),
      versions.some((v) => v.current) ? el('p', { class: 'muted hint' }, 'The highlighted one is this card.') : null);
  }).catch((err) => {
    setChildren(body, el('p', { class: 'error' }, `Could not load the prices: ${err.message || err}`));
  });
}

// ---------- Diálogo "Agregar varias" ----------
// Devuelve el número elegido (1-999) o null si se cancela.
function askQuantity(card, current = card.quantity, variantLabel = null) {
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
        el('p', { class: 'muted' }, `#${card.local_id} ${card.name}${variantLabel ? ` (${variantLabel})` : ''}`
          + ` · you currently have ${current}`),
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
  sfx.play('click');
  if (wasOpen) return; // segundo clic en ⋮: solo cierra
  // Sin separadores al principio, al final ni dos seguidos (pasa cuando se omiten las opciones de un grupo).
  items = items.filter(Boolean).reduce((out, it) =>
    (it.separator && (!out.length || out[out.length - 1].separator) ? out : [...out, it]), []);
  if (items[items.length - 1]?.separator) items.pop();
  const menu = el('div', { class: 'card-menu', role: 'menu' },
    items.map((it) => it.separator ? el('div', { class: 'card-menu-sep' }) : el('button', {
      class: 'card-menu-item', role: 'menuitem',
      onclick: (e) => { e.stopPropagation(); closeCardMenu(); sfx.play(it.sound || 'click'); it.onClick(); },
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
        sfx.play('check');
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

// ---------- Sonidos ----------
// Cualquier botón suena con un "clic"; los que tienen sonido propio (abrir, marcar una carta…) ya sonaron
// en su manejador y sfx ignora este segundo efecto.
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('button');
  if (btn && !btn.disabled) sfx.play('click');
});

// "Tic" suave al pasar el ratón por una carta o una casilla de la cuadrícula (solo al entrar, no al moverse dentro).
const HOVER_TARGETS = '.card, .tcg-tile:not(.disabled), .collection-item, .set-tile, .dex-tile:not(.disabled), .deck-tile, .decks-entry';
document.addEventListener('mouseover', (e) => {
  const target = e.target.closest?.(HOVER_TARGETS);
  if (target && !target.contains(e.relatedTarget)) sfx.play('hover');
});

const soundBtn = document.getElementById('sound-toggle');
const renderSoundBtn = () => {
  soundBtn.textContent = sfx.muted ? '🔇' : '🔊';
  soundBtn.title = sfx.muted ? 'Turn sounds on' : 'Turn sounds off';
};
soundBtn.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  renderSoundBtn();
  sfx.play('add');
});
renderSoundBtn();

navigate(showHome);
