// Navegación simple entre vistas: home -> tcg -> colección
const TCGS = [
  { id: 'magic', name: 'Magic: The Gathering', image: '../assets/tcg/magic.svg', enabled: false },
  { id: 'pokemon', name: 'Pokémon', image: '../assets/tcg/pokemon.svg', enabled: true },
  { id: 'onepiece', name: 'One Piece', image: '../assets/tcg/onepiece.svg', enabled: false },
];

const view = document.getElementById('view');
const backBtn = document.getElementById('back');
const breadcrumb = document.getElementById('breadcrumb');
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

function setChrome(crumb) {
  breadcrumb.textContent = crumb;
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

function cardImage(url, quality = 'low') {
  return url ? `${url}/${quality}.webp` : '';
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
  setChrome(tcg.name);
  setChildren(view, el('p', { class: 'muted' }, 'Loading…'));
  const [collections, dexStats] = await Promise.all([
    window.tcg.listCollections(tcg.id),
    tcg.id === 'pokemon' ? window.tcg.pokedexStats() : null,
  ]);
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
  };
  // Al marcar una carta desde el buscador, el set aparece (o desaparece) de la lista al momento.
  const search = tcg.id === 'pokemon'
    ? cardSearch(async () => renderSets(await window.tcg.listCollections(tcg.id)))
    : null;

  setChildren(view,
    el('h1', { class: 'title' }, tcg.name),
    search,
    tcg.id === 'pokemon' ? el('div', { class: 'section-head collections-head' },
      el('h2', { class: 'section-title' }, 'Collections'),
      el('button', { class: 'btn btn-secondary btn-icon', onclick: () => navigate(showCollectionEditor, tcg, null) },
        el('span', { class: 'icon-plus' }), 'Create collection')) : null,
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
const cardSearchState = { query: '' };

function cardSearch(onChange) {
  const results = el('div', { class: 'search-results' });
  const input = el('input', {
    class: 'search', type: 'search', placeholder: 'Search cards to add, e.g. Charizard', value: cardSearchState.query,
    onkeydown: (e) => { if (e.key === 'Enter') run(); },
    onsearch: (e) => { if (!e.target.value) run(); },
  });
  const run = async () => {
    const q = input.value.trim();
    cardSearchState.query = q;
    if (q.length < 2) { setChildren(results); return; }
    setChildren(results, el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, 'Searching…')));
    let cards;
    try {
      cards = await window.tcg.searchCards(q);
    } catch (err) {
      if (cardSearchState.query === q) setChildren(results, el('p', { class: 'error' }, `Search failed: ${err.message || err}`));
      return;
    }
    if (cardSearchState.query !== q) return; // llegó tarde: ya se buscó otra cosa
    cards = cards.map((c) => ({ ...c, image_url: c.image, local_id: c.localId }));
    const grid = el('div', { class: 'card-grid' });
    const render = () => setChildren(grid, ...cards.map((c) => cardTile(c, async () => {
      if (c.quantity > 1) return; // la cantidad se gestiona desde el set
      c.quantity = c.quantity > 0 ? 0 : 1;
      await window.tcg.setOwned(c.id, c.quantity,
        { id: c.id, setId: c.set.id, localId: c.localId, name: c.name, rarity: c.rarity, image: c.image });
      render();
      onChange?.();
    }, [c.set.name, c.rarity || ''])));
    render();
    setChildren(results,
      el('div', { class: 'section-head' },
        el('h2', { class: 'section-title' }, `${cards.length} card${cards.length === 1 ? '' : 's'} found`),
        el('button', { class: 'chip', onclick: () => { input.value = ''; run(); } }, 'Clear')),
      cards.length ? el('p', { class: 'muted hint' }, 'Click a card to mark it as owned.') : null,
      grid);
  };
  if (cardSearchState.query) run();
  return el('div', { class: 'card-search' },
    el('div', { class: 'search-row' }, input, el('button', { class: 'btn', onclick: run }, 'Search')),
    results);
}

// ---------- Todos los sets ----------
const setsState = { setQuery: '', scroll: 0 };

async function showAllSets(tcg, opts = {}) {
  setChrome(`${tcg.name} › All sets`);
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
      c.logo ? el('img', { src: `${c.logo}.webp`, alt: '', loading: 'lazy' }) : el('span', {}, 'No logo')),
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

// ---------- Vista 3: listado de cartas ----------
let filter = 'all';

async function showCollection(tcg, collectionId, opts = {}) {
  setChrome(`${tcg.name} › …`);
  setChildren(view, el('div', { class: 'loading' },
    el('div', { class: 'spinner' }),
    el('p', {}, opts.refresh ? 'Updating cards from TCGdex…' : 'Loading cards…')));

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
  setChrome(`${tcg.name} › ${collection.name}`);

  const counter = el('div', { class: 'counter' });
  const bar = el('div', { class: 'progress-fill' });
  const chips = el('div', { class: 'chips' });
  const grid = el('div', { class: 'card-grid' });

  // Las cartas ocultas no cuentan para el total ni para el porcentaje.
  const shown = () => cards.filter((c) => !c.hidden);
  const hiddenCount = () => cards.length - shown().length;

  const refreshStats = () => {
    const visible = shown();
    const owned = visible.filter((c) => c.quantity > 0).length;
    const hidden = hiddenCount();
    setChildren(counter, `${owned} / ${visible.length} collected`,
      hidden ? el('span', { class: 'hidden-count' }, ` · ${hidden} hidden`) : null);
    bar.style.width = `${visible.length ? (owned / visible.length) * 100 : 0}%`;
  };

  const filterBtn = (key, label) =>
    el('button', { class: 'chip' + (filter === key ? ' active' : ''), onclick: () => { filter = key; render(); } }, label);

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
    ...quantityMenuItems(card, (q) => setQuantity(card, q)),
    { separator: true },
    card.hidden
      ? { label: 'Add back to set', icon: '↺', onClick: () => setHidden(card, false) }
      : { label: 'Hide from set', icon: '⊘', onClick: () => setHidden(card, true) },
    collection.custom ? { label: 'Remove from collection', icon: '×', onClick: () => removeCard(card) } : null,
  ];

  const removeCard = async (card) => {
    const rest = cards.filter((c) => c !== card);
    await window.tcg.saveCustomCollection({ id: collection.id, name: collection.name, cards: rest.map(draftCard) });
    cards.splice(cards.indexOf(card), 1);
    refreshStats();
    render();
  };

  const render = () => {
    const hidden = hiddenCount();
    if (filter === 'hidden' && !hidden) filter = 'all';
    setChildren(chips,
      filterBtn('all', 'All'), filterBtn('owned', 'Owned'), filterBtn('missing', 'Missing'),
      hidden ? filterBtn('hidden', `Hidden (${hidden})`) : null);

    const list = filter === 'hidden' ? cards.filter((c) => c.hidden) : shown().filter((c) =>
      filter === 'all' ? true : filter === 'owned' ? c.quantity > 0 : c.quantity === 0);
    // Con más de una copia el clic no hace nada, para no perder la cantidad por error: se cambia desde ⋮.
    setChildren(grid, ...list.map((card) => cardTile(card, () => {
      if (card.quantity <= 1) setQuantity(card, card.quantity ? 0 : 1);
    }, [collection.custom ? card.set_name || card.set_id : null, card.rarity || '', `Quantity: ${card.quantity}`]
      .filter((l) => l != null), () => menuFor(card))));
    if (!list.length) grid.append(el('p', { class: 'muted' }, !cards.length && collection.custom
      ? 'This collection has no cards yet. Use Edit collection to add some.' : 'No cards match this filter.'));
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
            ? el('button', { class: 'btn', onclick: () => navigate(showCollectionEditor, tcg, collectionId) }, 'Edit collection')
            : el('button', { class: 'btn', onclick: () => showCollection(tcg, collectionId, { refresh: true }) },
              'Update from API')),
        el('div', { class: 'toolbar-row' }, chips))),
    el('p', { class: 'muted hint' },
      'Click a card to mark or unmark it. Double-click to view it larger. Hover over it and use ⋮ to change the quantity and more options.'),
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
    name: card.name, rarity: card.rarity, image: card.image_url,
  };
}

// collectionId null = colección nueva. Los cambios solo se guardan al pulsar "Save".
async function showCollectionEditor(tcg, collectionId) {
  const isNew = !collectionId;
  setChrome(`${tcg.name} › ${isNew ? 'New collection' : 'Edit collection'}`);
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
    ...quantityMenuItems(tile(c), (q) => setQuantity(c, q)),
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
      ondblclick: (e) => { e.stopPropagation(); if (t.image_url) openModal(t); },
    },
      el('div', { class: 'card-img-wrap' },
        t.image_url
          ? el('img', { src: cardImage(t.image_url), alt: c.name, loading: 'lazy' })
          : el('div', { class: 'no-image' }, c.name, el('br'), 'No image'),
        el('div', { class: 'check pick-toggle', title: isIn ? 'Remove from the collection' : 'Add to the collection' },
          el('span', { class: isIn ? 'icon-minus' : 'icon-plus' })),
        isIn ? el('button', {
          class: 'card-menu-btn', title: 'Actions',
          onclick: (e) => { e.stopPropagation(); openCardMenu(e.currentTarget, menuFor(c)); },
          ondblclick: (e) => e.stopPropagation(),
        }, el('span', { class: 'dots' })) : null),
      el('div', { class: 'card-info' },
        el('div', { class: 'card-name' }, `#${c.localId} ${c.name}`),
        el('div', { class: 'card-sub' }, c.setName || ''),
        el('div', { class: 'card-sub' }, c.quantity ? `Quantity: ${c.quantity}` : '')));
  };
  const renderResults = () => {
    if (!results.length) return;
    setChildren(resultsBox,
      el('p', { class: 'muted hint' }, `${results.length} card${results.length === 1 ? '' : 's'} found. Click a card to add it to the collection or remove it.`),
      el('div', { class: 'card-grid' }, results.map(pickTile)));
  };
  const searchInput = el('input', {
    class: 'search', type: 'search', placeholder: 'Search cards to add, e.g. Pikachu',
    onkeydown: (e) => { if (e.key === 'Enter') runSearch(); },
  });
  const runSearch = async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) { results = []; setChildren(resultsBox); return; }
    setChildren(resultsBox, el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, 'Searching…')));
    try {
      const found = await window.tcg.searchCards(q);
      if (searchInput.value.trim() !== q) return; // ya se buscó otra cosa
      results = found.map((c) => ({
        id: c.id, setId: c.set.id, setName: c.set.name, localId: c.localId,
        name: c.name, rarity: c.rarity, image: c.image, quantity: c.quantity,
      }));
      if (!results.length) setChildren(resultsBox, el('p', { class: 'muted' }, 'No cards found.'));
      renderResults();
    } catch (err) {
      setChildren(resultsBox, el('p', { class: 'error' }, `Search failed: ${err.message || err}`));
    }
  };

  const renderAll = () => { renderSelected(); renderResults(); };

  const nameInput = el('input', {
    class: 'search name-input', placeholder: 'Collection name, e.g. My Pikachus', value: draft.name, maxlength: '80',
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
    const id = await window.tcg.saveCustomCollection({ id: draft.id, name: draft.name.trim(), cards: draft.cards });
    leave(showCollection, tcg, id);
  };
  const remove = async () => {
    const ok = await confirmDialog('Delete collection',
      `Delete "${draft.name || 'this collection'}"? The cards you own stay marked in their sets.`, 'Delete');
    if (!ok) return;
    await window.tcg.deleteCustomCollection(collectionId);
    navStack.pop();
    const top = navStack[navStack.length - 1];
    if (top && top[0] === showCollection) navStack.pop();
    const [fn, args] = navStack[navStack.length - 1];
    fn(...args);
  };

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('h1', { class: 'title' }, isNew ? 'New collection' : 'Edit collection'),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          isNew ? null : el('button', { class: 'btn btn-danger', onclick: remove }, 'Delete collection'),
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

// Opciones comunes del menú ⋮: cantidad y enlaces externos. setQuantity(n) guarda la nueva cantidad.
function quantityMenuItems(card, setQuantity) {
  const link = { id: card.id, name: card.name, localId: card.local_id, official: card.set_official };
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
    { label: 'View on TCG Collector', icon: '↗', onClick: () => window.tcg.openTcgCollector(link) },
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
    ondblclick: (e) => { e.stopPropagation(); if (card.image_url) openModal(card); },
  },
    el('div', { class: 'card-img-wrap' },
      card.image_url
        ? el('img', { src: cardImage(card.image_url), alt: card.name, loading: 'lazy' })
        : el('div', { class: 'no-image' }, card.name, el('br'), 'No image'),
      el('div', { class: 'check' }, owned ? '✓' : ''),
      getMenu ? el('button', {
        class: 'card-menu-btn', title: 'Actions',
        onclick: (e) => { e.stopPropagation(); openCardMenu(e.currentTarget, getMenu()); },
        ondblclick: (e) => e.stopPropagation(),
      }, el('span', { class: 'dots' })) : null),
    el('div', { class: 'card-info' },
      el('div', { class: 'card-name' }, `#${card.local_id} ${card.name}`),
      lines.map((l) => el('div', { class: 'card-sub' }, l))));
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
  setChrome(`${tcg.name} › Pokédex`);
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
  setChrome(`${tcg.name} › Pokédex › …`);
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
  setChrome(`${tcg.name} › Pokédex › ${name}`);

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
      'Mark the cards you own. The Pokédex will show the most expensive one you own. Double-click to view it larger.'),
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
