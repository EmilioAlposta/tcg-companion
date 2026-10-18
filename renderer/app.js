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
  setChrome('Elige tu TCG');
  view.replaceChildren(
    el('h1', { class: 'title' }, '¿Qué colección quieres gestionar?'),
    el('div', { class: 'tcg-grid' },
      TCGS.map((t) =>
        el('button', {
          class: 'tcg-tile' + (t.enabled ? '' : ' disabled'),
          disabled: !t.enabled,
          onclick: () => navigate(showTcg, t),
        },
          el('img', { src: t.image, alt: t.name }),
          el('span', { class: 'tcg-name' }, t.name),
          t.enabled ? null : el('span', { class: 'soon' }, 'Próximamente'))
      ))
  );
}

// ---------- Vista 2: colecciones de un TCG ----------
async function showTcg(tcg) {
  setChrome(tcg.name);
  view.replaceChildren(el('p', { class: 'muted' }, 'Cargando…'));
  const [collections, dexStats] = await Promise.all([
    window.tcg.listCollections(tcg.id),
    tcg.id === 'pokemon' ? window.tcg.pokedexStats() : null,
  ]);
  const pokedexItem = tcg.id !== 'pokemon' ? null :
    el('button', { class: 'collection-item pokedex-item', onclick: () => navigate(showPokedex, tcg) },
      itemHeader('Pokédex', dexStats?.owned, dexStats?.with_fullart),
      el('div', { class: 'collection-meta' },
        dexStats ? `${dexStats.owned} / ${dexStats.with_fullart} Pokémon conseguidos`
                 : 'Sin descargar todavía'),
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
            c.total ? `${c.owned} / ${c.total} cartas` : 'Sin descargar todavía'),
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
  return `${value.toLocaleString('es', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
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
    el('p', {}, opts.refresh ? 'Actualizando cartas desde TCGdex…' : 'Cargando cartas…')));

  let data;
  try {
    data = await window.tcg.getCollection(collectionId, opts);
  } catch (err) {
    view.replaceChildren(
      el('p', { class: 'error' }, 'No se pudieron descargar las cartas. ¿Hay conexión a internet?'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showCollection(tcg, collectionId, opts) }, 'Reintentar'));
    return;
  }
  const { collection, cards } = data;
  setChrome(`${tcg.name} › ${collection.name}`);

  const counter = el('div', { class: 'counter' });
  const bar = el('div', { class: 'progress-fill' });
  const grid = el('div', { class: 'card-grid' });

  const refreshStats = () => {
    const owned = cards.filter((c) => c.quantity > 0).length;
    counter.textContent = `${owned} / ${cards.length} conseguidas`;
    bar.style.width = `${cards.length ? (owned / cards.length) * 100 : 0}%`;
  };

  const render = () => {
    const visible = cards.filter((c) =>
      filter === 'all' ? true : filter === 'owned' ? c.quantity > 0 : c.quantity === 0);
    grid.replaceChildren(...visible.map((card) => cardTile(card, async () => {
      card.quantity = card.quantity > 0 ? 0 : 1;
      await window.tcg.setOwned(card.id, card.quantity);
      refreshStats();
      render();
    })));
    if (!visible.length) grid.append(el('p', { class: 'muted' }, 'No hay cartas en este filtro.'));
  };

  const filterBtn = (key, label) =>
    el('button', {
      class: 'chip' + (filter === key ? ' active' : ''),
      onclick: (e) => {
        filter = key;
        e.currentTarget.parentElement.querySelectorAll('.chip').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        render();
      },
    }, label);

  view.replaceChildren(
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, collection.name),
        counter,
        el('div', { class: 'progress wide' }, bar)),
      el('div', { class: 'toolbar' },
        el('div', { class: 'chips' },
          filterBtn('all', 'Todas'), filterBtn('owned', 'Las tengo'), filterBtn('missing', 'Me faltan')),
        el('button', { class: 'btn', onclick: () => showCollection(tcg, collectionId, { refresh: true }) },
          'Actualizar desde la API'))),
    el('p', { class: 'muted hint' }, 'Haz clic en una carta para marcarla como conseguida. Doble clic para verla en grande.'),
    grid
  );
  refreshStats();
  render();
}

function cardTile(card, onToggle, lines) {
  const owned = card.quantity > 0;
  lines = lines || [card.rarity || '', card.illustrator ? `Ilustr.: ${card.illustrator}` : ''];
  return el('div', {
    class: 'card' + (owned ? ' owned' : ''),
    title: owned ? 'La tengo (clic para desmarcar)' : 'Me falta (clic para marcar)',
    onclick: onToggle,
    ondblclick: (e) => { e.stopPropagation(); if (card.image_url) openModal(card); },
  },
    el('div', { class: 'card-img-wrap' },
      card.image_url
        ? el('img', { src: cardImage(card.image_url), alt: card.name, loading: 'lazy' })
        : el('div', { class: 'no-image' }, card.name, el('br'), 'Sin imagen'),
      el('div', { class: 'check' }, owned ? '✓' : '')),
    el('div', { class: 'card-info' },
      el('div', { class: 'card-name' }, `#${card.local_id} ${card.name}`),
      lines.map((l) => el('div', { class: 'card-sub' }, l))));
}

// ---------- Pokédex ----------
const spriteUrl = (dexId) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexId}.png`;
const dexNum = (n) => `#${String(n).padStart(4, '0')}`;
const dexState = { filter: 'all', search: '', scroll: 0 };

async function showPokedex(tcg, opts = {}) {
  setChrome(`${tcg.name} › Pokédex`);
  view.replaceChildren(el('div', { class: 'loading' },
    el('div', { class: 'spinner' }),
    el('p', {}, 'Cargando la Pokédex… (la primera vez descarga todas las cartas Full Art, tarda unos segundos)')));

  let dex;
  try {
    dex = await window.tcg.getPokedex(opts);
  } catch (err) {
    view.replaceChildren(
      el('p', { class: 'error' }, 'No se pudo descargar la Pokédex. ¿Hay conexión a internet?'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showPokedex(tcg, opts) }, 'Reintentar'));
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
      return p.name_es.toLowerCase().includes(q) || p.name_en.toLowerCase().includes(q) || String(p.dex_id) === q;
    });
    grid.replaceChildren(...visible.map((p) => dexTile(tcg, p)));
    if (!visible.length) grid.append(el('p', { class: 'muted' }, 'Ningún Pokémon coincide.'));
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
    class: 'search', type: 'search', placeholder: 'Buscar por nombre o número…', value: dexState.search,
    oninput: (e) => { dexState.search = e.target.value; render(); },
  });

  view.replaceChildren(
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, 'Pokédex'),
        el('div', { class: 'counter' }, `${owned.length} / ${withCards.length} Pokémon conseguidos`),
        el('div', { class: 'progress wide' },
          el('div', { class: 'progress-fill', style: `width:${withCards.length ? (owned.length / withCards.length) * 100 : 0}%` }))),
      el('div', { class: 'toolbar' },
        search,
        el('div', { class: 'chips' },
          filterBtn('all', 'Todos'), filterBtn('owned', 'Conseguidos'), filterBtn('missing', 'Me faltan')),
        el('button', { class: 'btn', onclick: () => { dexState.scroll = 0; showPokedex(tcg, { refresh: true }); } },
          'Actualizar desde la API'))),
    el('p', { class: 'muted hint' },
      'En gris: Pokémon sin ninguna carta Full Art (los que tienen promos se pueden abrir igualmente). Haz clic en un Pokémon para ver sus cartas y marcar las que tienes.'),
    grid
  );
  render();
  view.scrollTop = dexState.scroll;
}

function dexTile(tcg, p) {
  const enabled = p.fullart_count + p.promo_count > 0;
  const name = p.name_es || p.name_en;
  const owned = p.owned_count > 0;
  return el('button', {
    class: 'dex-tile' + (enabled ? '' : ' disabled') + (!p.fullart_count && !owned ? ' no-fullart' : '') + (owned ? ' owned' : ''),
    disabled: !enabled,
    title: !enabled ? `${name}: sin cartas Full Art`
      : `${name}: ${p.fullart_count} Full Art · ${p.promo_count} promos · tienes ${p.owned_count}`,
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
  return p.fullart_count ? `${fa} / ${p.fullart_count}${promos}` : (promos ? promos.slice(3) : 'Solo promos');
}

function formatPrice(card) {
  if (card.price == null) return card.price_fetched_at ? 'Sin precio' : '';
  return new Intl.NumberFormat('es', { style: 'currency', currency: card.currency || 'USD' }).format(card.price);
}

async function showPokemon(tcg, dexId) {
  setChrome(`${tcg.name} › Pokédex › …`);
  view.scrollTop = 0;
  view.replaceChildren(el('div', { class: 'loading' },
    el('div', { class: 'spinner' }), el('p', {}, 'Cargando cartas y precios…')));

  let data;
  try {
    data = await window.tcg.getPokemon(dexId);
  } catch (err) {
    view.replaceChildren(
      el('p', { class: 'error' }, 'No se pudieron cargar las cartas.'),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showPokemon(tcg, dexId) }, 'Reintentar'));
    return;
  }
  const { pokemon, cards } = data;
  const name = pokemon.name_es || pokemon.name_en;
  setChrome(`${tcg.name} › Pokédex › ${name}`);

  const fullArts = cards.filter((c) => c.kind !== 'promo');
  const promos = cards.filter((c) => c.kind === 'promo');
  const counter = el('div', { class: 'counter' });
  const grid = el('div', { class: 'card-grid' });
  const promoGrid = el('div', { class: 'card-grid' });
  const promoCounter = el('span', { class: 'muted' });
  const tiles = (list) => list.map((card) => cardTile(card, async () => {
    card.quantity = card.quantity > 0 ? 0 : 1;
    await window.tcg.setOwned(card.id, card.quantity);
    render();
  }, [`${card.set_name || card.set_id} · #${card.local_id}`, card.rarity || '', formatPrice(card)]));
  const render = () => {
    const ownedOf = (list) => list.filter((c) => c.quantity > 0).length;
    counter.textContent = `${ownedOf(fullArts)} / ${fullArts.length} cartas Full Art conseguidas`
      + (promos.length ? ` · ${ownedOf(promos)} / ${promos.length} promos` : '');
    promoCounter.textContent = ` (${ownedOf(promos)} / ${promos.length})`;
    grid.replaceChildren(...tiles(fullArts));
    if (!fullArts.length) grid.append(el('p', { class: 'muted' }, 'Este Pokémon no tiene cartas Full Art.'));
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
      'Marca las cartas que tienes. En la Pokédex se mostrará la más cara de las que tengas. Doble clic para verla en grande.'),
    el('h2', { class: 'section-title' }, 'Full Art'),
    grid,
    promos.length ? el('h2', { class: 'section-title promos-title' }, 'Promos', promoCounter) : null,
    promos.length ? el('p', { class: 'muted hint' },
      'Todas las promos de este Pokémon: la API no indica cuáles son Full Art, así que aparecen todas.') : null,
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
  dbBtn.textContent = `BD: ${await window.tcg.dbPath()}`;
  dbBtn.addEventListener('click', () => window.tcg.revealDb());
})();

navigate(showHome);
