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
  view.replaceChildren(
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
  view.replaceChildren(el('p', { class: 'muted' }, 'Loading…'));
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
  view.replaceChildren(
    el('h1', { class: 'title' }, tcg.name),
    el('div', { class: 'collection-list' },
      pokedexItem,
      collections.length ? el('h2', { class: 'section-title' }, 'Sets') : null,
      collections.map((c) =>
        el('button', { class: 'collection-item', onclick: () => navigate(showCollection, tcg, c.id) },
          itemHeader(c.name, c.owned, c.total),
          el('div', { class: 'collection-meta' },
            c.total || c.hidden ? `${c.owned} / ${c.total} cards` : 'Not downloaded yet',
            c.hidden ? el('span', { class: 'hidden-count' }, ` · ${c.hidden} hidden`) : null),
          c.total ? progressBar(c.owned, c.total) : null)
      ))
  );
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
  view.replaceChildren(el('div', { class: 'loading' },
    el('div', { class: 'spinner' }),
    el('p', {}, opts.refresh ? 'Updating cards from TCGdex…' : 'Loading cards…')));

  let data;
  try {
    data = await window.tcg.getCollection(collectionId, opts);
  } catch (err) {
    view.replaceChildren(
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
    counter.replaceChildren(`${owned} / ${visible.length} collected`,
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
    await window.tcg.setOwned(card.id, card.quantity);
    refreshStats();
    render();
  };

  const linkInfo = (card) => ({ id: card.id, name: card.name, localId: card.local_id, official: card.set_official });

  const menuFor = (card) => [
    { label: 'Add 1', icon: '+', onClick: () => setQuantity(card, card.quantity + 1) },
    {
      label: 'Add several…', icon: '++',
      onClick: async () => {
        const n = await askQuantity(card);
        if (n) setQuantity(card, card.quantity + n);
      },
    },
    card.quantity > 0 ? { label: 'Remove 1', icon: '−', onClick: () => setQuantity(card, card.quantity - 1) } : null,
    card.quantity > 1 ? { label: `Remove all (${card.quantity})`, icon: '×', onClick: () => setQuantity(card, 0) } : null,
    { separator: true },
    { label: 'View on TCG Collector', icon: '↗', onClick: () => window.tcg.openTcgCollector(linkInfo(card)) },
    { label: 'View on TCGplayer', icon: '↗', onClick: () => window.tcg.openTcgplayer(linkInfo(card)) },
    { separator: true },
    card.hidden
      ? { label: 'Add back to set', icon: '↺', onClick: () => setHidden(card, false) }
      : { label: 'Hide from set', icon: '⊘', onClick: () => setHidden(card, true) },
  ];

  const render = () => {
    const hidden = hiddenCount();
    if (filter === 'hidden' && !hidden) filter = 'all';
    chips.replaceChildren(
      filterBtn('all', 'All'), filterBtn('owned', 'Owned'), filterBtn('missing', 'Missing'),
      hidden ? filterBtn('hidden', `Hidden (${hidden})`) : null);

    const list = filter === 'hidden' ? cards.filter((c) => c.hidden) : shown().filter((c) =>
      filter === 'all' ? true : filter === 'owned' ? c.quantity > 0 : c.quantity === 0);
    // Con más de una copia el clic no hace nada, para no perder la cantidad por error: se cambia desde ⋮.
    grid.replaceChildren(...list.map((card) => cardTile(card, () => {
      if (card.quantity <= 1) setQuantity(card, card.quantity ? 0 : 1);
    }, [card.rarity || '', `Quantity: ${card.quantity}`], () => menuFor(card))));
    if (!list.length) grid.append(el('p', { class: 'muted' }, 'No cards match this filter.'));
  };

  view.replaceChildren(
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, collection.name),
        counter,
        el('div', { class: 'progress wide' }, bar)),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          notesButton(collection),
          el('button', { class: 'btn', onclick: () => showCollection(tcg, collectionId, { refresh: true }) },
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
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); close(textarea.value); }
    };
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
      el('div', { class: 'dialog notes-dialog', role: 'dialog' },
        el('h3', {}, 'Notes'),
        el('p', { class: 'muted' }, collection.name),
        textarea,
        el('div', { class: 'dialog-actions' },
          el('span', { class: 'muted notes-shortcut' }, 'Ctrl+Enter to save'),
          el('button', { class: 'chip', onclick: () => close(null) }, 'Cancel'),
          el('button', { class: 'btn', onclick: () => close(textarea.value) }, 'Save'))));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    textarea.focus();
  });
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
  view.replaceChildren(el('div', { class: 'loading' },
    el('div', { class: 'spinner' }),
    el('p', {}, 'Loading the Pokédex… (the first time it downloads every Full Art card, this takes a few seconds)')));

  let dex, dexNotes;
  try {
    // La nota de la Pokédex se guarda como la de un set más, con id 'pokedex'.
    const [list, notes] = await Promise.all([window.tcg.getPokedex(opts), window.tcg.getNotes('pokedex')]);
    dex = list;
    dexNotes = { id: 'pokedex', name: 'Pokédex', notes };
  } catch (err) {
    view.replaceChildren(
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
    grid.replaceChildren(...visible.map((p) => dexTile(tcg, p)));
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

  view.replaceChildren(
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
  view.replaceChildren(el('div', { class: 'loading' },
    el('div', { class: 'spinner' }), el('p', {}, 'Loading cards and prices…')));

  let data;
  try {
    data = await window.tcg.getPokemon(dexId);
  } catch (err) {
    view.replaceChildren(
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
    grid.replaceChildren(...tiles(fullArts));
    if (!fullArts.length) grid.append(el('p', { class: 'muted' }, 'This Pokémon has no Full Art cards.'));
    promoGrid.replaceChildren(...tiles(promos));
  };

  view.replaceChildren(
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
