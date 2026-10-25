// Navegación simple entre vistas: home -> tcg -> colección
// Menú principal: art, el arte de la franja (encuadre en artFrame: tamaño y posición para que se vea la cara);
// cover, la carta grande de la derecha (coverFrame / coverRatio: su encuadre y proporción si no es la de siempre).
// image es el dorso de la carta; logo, el emblema (Mis mazos, Settings).
// catalog: todas las cartas se descargan de una vez al entrar; variants: las cartas tienen versiones (foil, reverse…)
// y versionsLabel las nombra al exportar; rarities: nombre completo de las rarezas abreviadas;
// colorLabel / subtypeLabel: nombre de esos filtros en este TCG.
const TCGS = [
  { id: 'magic', name: 'Magic: The Gathering', short: 'Magic', image: '../assets/tcg/magic.svg', logo: '../assets/tcg/magic-logo.svg', enabled: true, example: 'Lightning Bolt', source: 'Scryfall',
    variants: true, versionsLabel: 'Versions (non-foil, foil, etched)',
    color: '#c46a2b',
    art: 'https://cards.scryfall.io/art_crop/front/c/8/c8817585-0d32-4d56-9142-0d29512e86a9.jpg?1783930196',
    artFrame: 'center 12% / cover',
    cover: 'https://cards.scryfall.io/large/front/c/5/c5408607-af8f-48fe-bc40-32828d1976de.jpg?1783913282' },
  { id: 'pokemon', name: 'Pokémon', short: 'Pokémon', image: '../assets/tcg/pokemon.svg', logo: '../assets/tcg/pokemon-logo.svg', enabled: true, example: 'Charizard', source: 'TCGdex',
    variants: true, versionsLabel: 'Versions (normal, holo, reverse holo, stamped…)', colorLabel: 'Pokémon type', subtypeLabel: 'Trainer / Energy type',
    color: '#2f6fe0',
    art: 'https://assets.tcgdex.net/en/swsh/swsh12.5/160/high.webp',
    artFrame: '0% 47% / 110% auto',
    cover: 'https://assets.tcgdex.net/en/swsh/swsh3/20/high.webp' },
  { id: 'onepiece', name: 'One Piece', short: 'One Piece', image: '../assets/tcg/onepiece.svg', logo: '../assets/tcg/onepiece-logo.svg', enabled: true, example: 'Luffy', source: 'OPTCG API',
    catalog: true,
    // OPTCG API da la rareza abreviada: en los filtros se muestra el nombre completo.
    rarities: { L: 'Leader', C: 'Common', UC: 'Uncommon', R: 'Rare', SR: 'Super Rare', SEC: 'Secret Rare', SP: 'Special', TR: 'Treasure Rare', PR: 'Promo' },
    color: '#6b3fd1',
    art: 'https://optcgapi.com/media/static/Card_Images/OP05-119_p1.jpg',
    artFrame: '50% 26% / 110% auto',
    cover: 'https://optcgapi.com/media/static/Card_Images/OP05-119.jpg' },
  { id: 'yugioh', name: 'Yu-Gi-Oh!', short: 'Yu-Gi-Oh!', image: '../assets/tcg/yugioh.svg', logo: '../assets/tcg/yugioh-logo.svg', enabled: true, example: 'Dark Magician', source: 'YGOPRODeck',
    colorLabel: 'Attribute', subtypeLabel: 'Subtype',
    color: '#8c5a1e',
    // Dark Magician Girl: el arte recortado (624 × 624) se ve nítido; las Skill Cards con Yugi solo están en baja resolución.
    art: 'https://images.ygoprodeck.com/images/cards_cropped/38033121.jpg',
    artFrame: 'center 55% / cover',
    cover: 'https://images.ygoprodeck.com/images/cards/46986414.jpg',
    // La imagen de YGOPRODeck lleva un marco gris alrededor y la carta es más estrecha (59 × 86): se amplía para recortarlo.
    coverFrame: 'center / 107.5% auto', coverRatio: '59 / 86' },
  { id: 'lorcana', name: 'Disney Lorcana', short: 'Lorcana', image: '../assets/tcg/lorcana.svg', logo: '../assets/tcg/lorcana-logo.svg', enabled: true, example: 'Elsa', source: 'Lorcast',
    catalog: true, variants: true, versionsLabel: 'Versions (normal, foil)', colorLabel: 'Ink',
    color: '#b03a7a',
    art: 'https://cards.lorcast.io/card/digital/large/crd_1a8604b7ba6c45e2bc8b32b0a70d08b5.avif?1709690747',
    artFrame: '50% 22% / 110% auto',
    cover: 'https://cards.lorcast.io/card/digital/large/crd_cbc18e77d7ec4d50bf19650a9a559686.avif?1709690747' },
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
  dataSource.textContent = tcg ? tcg.source : visibleTcgs().map((t) => t.source).join(' · ');
  backBtn.classList.toggle('hidden', navStack.length < 2);
}

// Textos fijos de index.html: se ponen desde aquí para que cambien con el idioma.
function renderStaticTexts() {
  document.documentElement.lang = i18n.lang;
  backBtn.title = tr('Back');
  document.getElementById('data-source-label').textContent = tr('Card data:');
  document.getElementById('db-path').title = tr('Show the database in the file explorer');
}

// ---------- TCGs ocultos (Settings) ----------
// Los TCG que no coleccionas se pueden ocultar del menú principal; sus datos no se borran.
const hiddenTcgs = (() => {
  const STORAGE_KEY = 'hidden-tcgs';
  let hidden = [];
  try { hidden = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { /* sin almacenamiento: se ven todos */ }
  return {
    has: (id) => hidden.includes(id),
    set(id, value) {
      hidden = value ? [...new Set([...hidden, id])] : hidden.filter((x) => x !== id);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden)); } catch { /* no se recuerda, da igual */ }
    },
  };
})();
const visibleTcgs = () => TCGS.filter((t) => t.enabled && !hiddenTcgs.has(t.id));

// ---------- Ajustes de cada TCG (Settings) ----------
// Formatos de mazo desactivados (no se ofrecen al crear un mazo) y opciones de la Pokédex: si se ve y qué tipos de
// carta cuentan (DEX_KINDS). Sin nada guardado: todos los formatos, Pokédex visible con Full Arts y promos.
// help: qué cartas entran en cada tipo (se explica en Settings).
const DEX_KINDS = [
  { id: 'fullart', label: 'Full Art', help: 'Ultra Rare, Illustration Rare, Special Illustration Rare, Hyper Rare, Secret Rare, Shiny Ultra Rare…' },
  { id: 'promo', label: 'Promos', help: 'Promotional cards from boxes, events and magazines (Black Star Promos).' },
  { id: 'other', label: 'Regular cards', help: 'The rest of the cards in the sets: common, uncommon, rare, holo rare, V, VMAX, double rare…' },
];
const tcgPrefs = (() => {
  const STORAGE_KEY = 'tcg-prefs';
  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { /* sin almacenamiento: por defecto */ }
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* no se recuerda, da igual */ } };
  const offFormats = (tcg) => prefs.offFormats?.[tcg] || [];
  return {
    formatOn: (tcg, id) => !offFormats(tcg).includes(id),
    setFormat(tcg, id, on) {
      prefs.offFormats = { ...prefs.offFormats, [tcg]: on ? offFormats(tcg).filter((x) => x !== id) : [...new Set([...offFormats(tcg), id])] };
      save();
    },
    get pokedexShown() { return prefs.pokedexHidden !== true; },
    setPokedexShown(shown) { prefs.pokedexHidden = !shown; save(); },
    get pokedexKinds() {
      const kinds = DEX_KINDS.map((k) => k.id).filter((k) => prefs.pokedexKinds?.includes(k));
      return kinds.length ? kinds : ['fullart', 'promo'];
    },
    setPokedexKinds(kinds) { prefs.pokedexKinds = kinds; save(); },
  };
})();

// ---------- Wishlist ----------
// Ids de las cartas de la wishlist (de todos los TCG), para que el menú ⋮ sepa al momento si ofrece añadir o quitar.
// Al cambiar se lanza el evento "wishlist-change" en document (la vista de la wishlist se vuelve a pintar).
const wishlist = (() => {
  const ids = new Map(); // card_id -> tcg
  window.tcg.wishlistIds().then((rows) => { for (const r of rows) ids.set(r.card_id, r.tcg); }).catch(() => {});
  const changed = () => document.dispatchEvent(new CustomEvent('wishlist-change'));
  return {
    has: (id) => ids.has(id),
    count: (tcg) => [...ids.values()].filter((t) => t === tcg).length,
    async add(tcg, card) { await window.tcg.addToWishlist(tcg, wishCard(card)); ids.set(card.id, tcg); changed(); },
    async remove(id) { await window.tcg.removeFromWishlist(id); ids.delete(id); changed(); },
  };
})();

// Carta en el formato que guarda la wishlist, venga de un set, del buscador, del editor o de un mazo.
const wishCard = (c) => ({
  id: c.id, name: c.name, rarity: c.rarity,
  setId: c.set_id || c.setId || c.set?.id, setName: c.set_name || c.setName || c.set?.name,
  localId: c.local_id ?? c.localId, image: c.image_url || c.image, price: c.price, attrs: c.attrs, variants: c.variants,
  setOfficial: c.set_official, tcgplayerId: c.tcgplayer_id, scryfallUri: c.scryfall_uri,
});
const listNames = (names) => (names.length > 1 ? tr('{list} and {last}', { list: names.slice(0, -1).join(', '), last: names.at(-1) }) : names[0] || '');

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

// TCGdex da la ruta base de la imagen (se elige la calidad); el resto de APIs, la URL completa (a veces con ?versión).
// Scryfall y Lorcast dan la imagen "normal": en grande se pide la "large"; YGOPRODeck da la pequeña.
function cardImage(url, quality = 'low') {
  if (!url) return '';
  if (/^https:\/\/cards\.(scryfall|lorcast)\.io\//.test(url)) return quality === 'high' ? url.replace('/normal/', '/large/') : url;
  if (url.startsWith('https://images.ygoprodeck.com/')) return quality === 'high' ? url.replace('/cards_small/', '/cards/') : url;
  return /\.(jpe?g|png|webp|avif)(\?|$)/i.test(url) ? url : `${url}/${quality}.webp`;
}

// ---------- Vista 1: menú principal ----------
// Franjas diagonales (una por TCG, Mis mazos y Settings) estilo menú de videojuego: la elegida se despliega
// con su arte y a la derecha se ve una vista previa. Se elige con el ratón o con ↑ ↓ y Enter.
const SVG_NS = 'http://www.w3.org/2000/svg';
function gearIcon(cls) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  for (const [tag, attrs] of [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }]]) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}

// Estrella en SVG: el carácter ★ no queda centrado en su caja (depende de la fuente).
function starIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95z');
  svg.append(path);
  return svg;
}

// Fondo con imagen y encuadre ("posición / tamaño"); bajo la imagen, el color del TCG por si no carga.
const artStyle = (url, frame = 'center / cover', color = '#1d3352') =>
  `background: url("${url}") ${frame} no-repeat, ${color}`;

let homeSelect = null; // (delta) => mueve la selección; null si el menú principal no está en pantalla

function showHome() {
  setChrome(tr('Choose your TCG'));
  const count = (n, one, many) => tr(n === 1 ? one : many, { n: n.toLocaleString(i18n.lang) });
  const tcgSub = (s) => (s?.cards ? `${count(s.cards, '{n} card', '{n} cards')} · ${count(s.sets, '{n} set', '{n} sets')}` : tr('No cards yet'));
  const buildText = tr('Build decks for {tcgs}', { tcgs: listNames(visibleTcgs().map((t) => t.short)) });

  // Vista previa de la derecha de cada franja; los datos de la base de datos llegan después y la rellenan.
  const items = [
    ...visibleTcgs().map((t) => ({
      kind: 'tcg', color: t.color, title: t.short, sub: '', open: () => navigate(showTcg, t),
      bg: () => el('div', { class: 'home-bg', style: artStyle(t.art, t.artFrame, t.color) }),
      preview: () => {
        const ratio = t.coverRatio ? `; aspect-ratio: ${t.coverRatio}` : '';
        const card = el('div', { class: 'home-pv-card', style: artStyle(t.cover, t.coverFrame, t.color) + ratio });
        // Sin conexión no carga el arte: se queda el dorso de siempre.
        const probe = new Image();
        probe.onerror = () => { card.style.cssText = artStyle(t.image, 'center / cover', t.color) + ratio; };
        probe.src = t.cover;
        return card;
      },
      tcg: t,
    })),
    { kind: 'decks', color: '#d8262f', title: tr('My decks'), sub: buildText, open: () => navigate(showDecks), small: true },
    { kind: 'settings', color: '#1d3352', title: tr('Settings'), sub: tr('Sound, language and the TCGs you collect'), open: () => navigate(showSettings), small: true },
  ];
  let decks = [];
  let stats = null;

  const deckCovers = () => decks.map((d) => deckCover(d, d.cards)).filter((c) => c?.image_url).slice(0, 3);
  const deckTcgs = () => [...new Set(decks.map((d) => tcgById(d.tcg).short))].join(', ');
  const icon = (item) => {
    if (item.kind === 'settings') return gearIcon('home-gear');
    if (item.kind !== 'decks') return null;
    const covers = deckCovers();
    return el('span', { class: 'home-minifan' + (covers.length ? '' : ' empty') },
      covers.map((c) => el('img', { src: cardImage(c.image_url), alt: '' })));
  };
  const background = (item) => {
    if (item.bg) return item.bg();
    if (item.kind !== 'decks' || !deckCovers().length) return null;
    return el('div', { class: 'home-bg collage' },
      deckCovers().map((c) => el('div', { style: artStyle(cardImage(c.image_url), 'center 8% / cover') })));
  };

  const preview = (item) => {
    if (item.kind === 'tcg') return item.preview();
    if (item.kind === 'decks') {
      const covers = deckCovers();
      if (!decks.length) {
        return el('div', { class: 'home-pv-decks' },
          el('div', { class: 'home-pv-fan' }, el('div', { class: 'home-pv-deck empty' }, '+')),
          el('div', { class: 'home-pv-more' }, tr('No decks yet')));
      }
      return el('div', { class: 'home-pv-decks' },
        el('div', { class: 'home-pv-fan n' + covers.length },
          covers.map((c) => el('div', { class: 'home-pv-deck', style: artStyle(cardImage(c.image_url)) }))),
        el('div', { class: 'home-pv-list' },
          decks.slice(0, 3).map((d) => el('div', {},
            el('span', { class: 'home-pv-name' }, d.name),
            el('small', {}, `${tcgById(d.tcg).short} · ${fmtName(deckFormat(d))}`)))),
        decks.length > 3 ? el('div', { class: 'home-pv-more' }, count(decks.length - 3, '+{n} more deck', '+{n} more decks')) : null);
    }
    const row = (label, value) => el('div', { class: 'home-pv-row' }, el('span', {}, label), value);
    return el('div', { class: 'home-pv-settings' },
      el('h3', { class: 'home-display' }, gearIcon('home-gear'), tr('Settings')),
      row(tr('Sound effects'), el('span', { class: 'home-pv-toggle' + (sfx.muted ? '' : ' on') })),
      row(tr('Language'), el('b', {}, i18n.lang === 'es' ? 'Español' : 'English')),
      row(tr('TCGs'), el('div', { class: 'home-pv-tcgs' },
        TCGS.filter((t) => t.enabled).map((t) =>
          el('b', { class: hiddenTcgs.has(t.id) ? 'off' : '', style: `--c: ${t.color}` }, t.short)))),
      row(tr('Cards downloaded'), el('b', {}, stats ? stats.catalog.toLocaleString(i18n.lang) : '…')),
      el('div', { class: 'home-pv-foot' }, tr('Open it to change any option')));
  };

  const list = el('div', { class: 'home-list' });
  const pv = el('div', { class: 'home-preview' });
  let selected = 0;
  let swapTimer = null;
  const renderItem = (item, i) => el('button', {
    class: 'home-item' + (item.small ? ' small' : '') + (i === selected ? ' sel' : ''),
    style: `--c: ${item.color}; animation-delay: ${i * 0.05}s`,
    onmouseenter: () => select(i),
    onclick: item.open,
  },
    background(item), el('div', { class: 'home-glow' }),
    el('span', { class: 'home-title home-display' }, icon(item), item.title),
    el('span', { class: 'home-sub' }, item.sub));
  const renderList = () => setChildren(list, items.map(renderItem));
  // La vista previa sale con una pequeña animación; al cambiar de franja muy rápido solo cuenta la última.
  const renderPreview = (animate) => {
    clearTimeout(swapTimer);
    if (!animate) return setChildren(pv, preview(items[selected]));
    pv.classList.add('swap');
    swapTimer = setTimeout(() => { setChildren(pv, preview(items[selected])); pv.classList.remove('swap'); }, 180);
  };
  function select(i) {
    i = (i + items.length) % items.length;
    if (i === selected) return;
    selected = i;
    list.querySelectorAll('.home-item').forEach((b, j) => b.classList.toggle('sel', j === i));
    renderPreview(true);
  }
  homeSelect = (delta) => {
    if (delta) { select(selected + delta); sfx.play('hover'); } else items[selected].open();
  };

  renderList();
  renderPreview(false);
  list.classList.toggle('many', visibleTcgs().length > 4);
  setChildren(view, el('div', { class: 'home' }, list, pv));

  // Los datos llegan después: la pantalla se pinta sin esperar a la base de datos.
  Promise.all([window.tcg.homeStats(), window.tcg.listDecks()]).then(([s, d]) => {
    if (!view.contains(list)) return;
    stats = s;
    decks = d;
    for (const item of items) {
      if (item.kind === 'tcg') item.sub = tcgSub(stats.tcgs[item.tcg.id]);
      if (item.kind === 'decks' && decks.length) item.sub = `${count(decks.length, '{n} deck', '{n} decks')} · ${deckTcgs()}`;
    }
    // Se repinta sin la animación de entrada: las franjas ya estaban en pantalla.
    list.classList.add('ready');
    renderList();
    if (items[selected].kind !== 'tcg') renderPreview(false);
  }).catch(() => {});
}

// ↑ ↓ y Enter en el menú principal (con otro diálogo o un campo de texto activo no se hace nada).
document.addEventListener('keydown', (e) => {
  if (!homeSelect || !view.querySelector('.home') || e.target.closest?.('input, textarea, select')) return;
  const delta = { ArrowUp: -1, ArrowDown: 1 }[e.key];
  if (delta) { e.preventDefault(); homeSelect(delta); } else if (e.key === 'Enter' && !e.target.closest?.('button')) homeSelect(0);
});

// ---------- Settings ----------
function showSettings() {
  setChrome(tr('Settings'));
  // Cada ajuste: título, explicación y, a la derecha, sus opciones.
  const row = (title, text, control) => el('div', { class: 'settings-row' },
    el('div', { class: 'settings-text' },
      el('div', { class: 'settings-title' }, title),
      el('div', { class: 'collection-meta' }, text)),
    control);
  const chips = (options, active, onPick) => el('div', { class: 'chips' },
    options.map(([value, label]) => optionChip(label, value === active, () => onPick(value))));

  // Opciones que se pueden activar varias a la vez (siempre queda al menos una activa).
  const toggles = (options, isOn, onToggle) => {
    const active = options.filter(([value]) => isOn(value)).length;
    return el('div', { class: 'chips' }, options.map(([value, label]) => {
      const on = isOn(value);
      return optionChip(label, on, () => {
        if (on && active === 1) return;
        onToggle(value, !on);
        showSettings();
      });
    }));
  };

  // Un bloque por TCG: mostrarlo u ocultarlo y, si se muestra, sus opciones (formatos de mazo, Pokédex…).
  const tcgRows = TCGS.filter((t) => t.enabled).map((t) => {
    const shown = !hiddenTcgs.has(t.id);
    // Siempre queda al menos un TCG a la vista.
    const last = shown && visibleTcgs().length === 1;
    const head = el('div', { class: 'settings-tcg' + (shown ? '' : ' off') },
      el('img', { src: t.logo, alt: '' }),
      el('div', { class: 'settings-tcg-name' },
        el('div', { class: 'settings-title' }, t.name),
        el('div', { class: 'collection-meta' }, tr('Show {tcg} in the main menu. If you hide it, your cards and decks are kept.', { tcg: t.short }))),
      last ? el('span', { class: 'muted settings-tcg-note' }, tr('At least one TCG stays visible')) : null,
      chips([[true, tr('Show')], [false, tr('Hide')]], shown, (v) => {
        if (v === shown || last) return;
        hiddenTcgs.set(t.id, !v);
        showSettings();
      }));
    if (!shown) return el('div', { class: 'settings-tcg-block off', style: `--c: ${t.color}` }, head);

    const options = [
      el('div', { class: 'settings-row stacked' },
        el('div', { class: 'settings-text' },
          el('div', { class: 'settings-title' }, tr('Deck formats')),
          el('div', { class: 'collection-meta' }, tr('Only the active formats are offered when you create a deck. Decks you already have keep their format.'))),
        toggles(DECK_FORMATS[t.id].map((f) => [f.id, fmtName(f)]), (id) => tcgPrefs.formatOn(t.id, id),
          (id, on) => tcgPrefs.setFormat(t.id, id, on))),
    ];
    if (t.id === 'pokemon') {
      options.push(row(tr('Pokédex'), tr('Show the Pokédex next to your collections.'),
        chips([[true, tr('Show')], [false, tr('Hide')]], tcgPrefs.pokedexShown, (v) => {
          tcgPrefs.setPokedexShown(v);
          showSettings();
        })));
      if (tcgPrefs.pokedexShown) {
        options.push(el('div', { class: 'settings-row stacked' },
          el('div', { class: 'settings-text' },
            el('div', { class: 'settings-title' }, tr('Cards to include in your Pokédex collection')),
            el('div', { class: 'collection-meta' }, tr('Which cards of each Pokémon count. Turn on all three to count any card.')),
            el('ul', { class: 'collection-meta settings-list' },
              DEX_KINDS.map((k) => el('li', {}, el('b', {}, tr(k.label)), `: ${tr(k.help)}`)))),
          toggles(DEX_KINDS.map((k) => [k.id, tr(k.label)]), (k) => tcgPrefs.pokedexKinds.includes(k),
            (k, on) => tcgPrefs.setPokedexKinds(on ? [...tcgPrefs.pokedexKinds, k] : tcgPrefs.pokedexKinds.filter((x) => x !== k)))));
      }
    }
    return el('div', { class: 'settings-tcg-block', style: `--c: ${t.color}` }, head, el('div', { class: 'settings-tcg-options' }, options));
  });

  setChildren(view, el('div', { class: 'settings-page' },
    el('h1', { class: 'title' }, tr('Settings')),
    el('section', { class: 'settings-section' },
      el('h2', { class: 'section-title' }, tr('General')),
      row(tr('Sound effects'), tr('Sounds when browsing, marking cards and using filters.'),
        chips([[true, tr('On')], [false, tr('Off')]], !sfx.muted, (on) => {
          sfx.setMuted(!on);
          sfx.play('add');
          showSettings();
        })),
      row(tr('Language'), tr('Language of the app. Card names and card data stay as the source gives them.'),
        chips([['en', 'English'], ['es', 'Español']], i18n.lang, (lang) => {
          i18n.setLang(lang);
          renderStaticTexts();
          showSettings();
        }))),
    el('section', { class: 'settings-section' },
      el('h2', { class: 'section-title' }, tr('TCGs')),
      el('p', { class: 'muted hint' }, tr('Hide the TCGs you do not collect: they disappear from the main menu. Your cards and decks are kept.')),
      el('div', { class: 'settings-tcgs' }, tcgRows))));
}

const tcgById = (id) => TCGS.find((t) => t.id === id) || TCGS[0];

// ---------- Vista 2: colecciones de un TCG ----------
async function showTcg(tcg) {
  setChrome(tcg.name, tcg);
  setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }),
    el('p', {}, tcg.catalog ? tr('Loading… (the first time it downloads every {tcg} card, this takes a few seconds)', { tcg: tcg.short }) : tr('Loading…'))));
  let collections, dexStats;
  try {
    [collections, dexStats] = await Promise.all([
      window.tcg.listCollections(tcg.id),
      tcg.id === 'pokemon' && tcgPrefs.pokedexShown ? window.tcg.pokedexStats(tcgPrefs.pokedexKinds) : null,
    ]);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, tr('Could not download the cards. Are you connected to the internet?')),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showTcg(tcg) }, tr('Retry')));
    return;
  }
  const pokedexItem = tcg.id !== 'pokemon' || !tcgPrefs.pokedexShown ? null :
    el('button', { class: 'collection-item pokedex-item', onclick: () => navigate(showPokedex, tcg) },
      itemHeader('Pokédex', dexStats?.owned, dexStats?.with_fullart),
      el('div', { class: 'collection-meta' },
        dexStats ? tr('{owned} / {total} Pokémon collected', { owned: dexStats.owned, total: dexStats.with_fullart })
                 : tr('Not downloaded yet')),
      dexStats ? progressBar(dexStats.owned, dexStats.with_fullart) : null);

  // Solo se muestran los sets en los que ya tienes alguna carta; todos, desde "View sets".
  // Las colecciones custom van junto a la Pokédex, siempre visibles aunque no tengan cartas.
  const setGrid = el('div', { class: 'collection-grid' });
  const customGrid = el('div', { class: 'collection-grid' });
  // La wishlist solo aparece si tiene cartas (se le añaden desde el ⋮ de cualquier carta).
  const wishCount = wishlist.count(tcg.id);
  const wishlistItem = !wishCount ? null :
    el('button', { class: 'collection-item wishlist-item', onclick: () => navigate(showWishlist, tcg) },
      itemHeader(`✦ ${tr('Wishlist')}`),
      el('div', { class: 'collection-meta' }, tr(wishCount === 1 ? '{n} card' : '{n} cards', { n: wishCount })));

  const renderSets = (cols) => {
    setChildren(customGrid, wishlistItem, pokedexItem, ...cols.filter((c) => c.custom).map((c) => collectionItem(tcg, c)));
    const active = cols.filter((c) => !c.custom && c.owned > 0);
    setChildren(setGrid, ...active.map((c) => collectionItem(tcg, c)));
    if (!active.length) setGrid.append(el('p', { class: 'muted' },
      tr('No sets with cards yet. Search for a card above or use View sets to open a set.')));
    if (!cols.some((c) => c.custom)) customGrid.append(el('p', { class: 'muted' },
      tr('No collections yet. Use Create collection to group cards from any set.')));
  };
  // Al marcar una carta desde el buscador, el set aparece (o desaparece) de la lista al momento.
  const search = cardSearch(tcg, async () => renderSets(await window.tcg.listCollections(tcg.id)));

  setChildren(view,
    el('div', { class: 'collection-header tcg-header' },
      el('h1', { class: 'title' }, tcg.name),
      el('div', { class: 'toolbar' }, el('div', { class: 'toolbar-row' }, exportButton(tcg, null)))),
    search,
    el('div', { class: 'section-head collections-head' },
      el('h2', { class: 'section-title' }, tr('Collections')),
      el('button', { class: 'btn btn-secondary btn-icon', onclick: () => navigate(showCollectionEditor, tcg, null) },
        el('span', { class: 'icon-plus' }), tr('Create collection'))),
    customGrid,
    el('div', { class: 'section-head sets-head' },
      el('h2', { class: 'section-title' }, tr('Sets')),
      el('button', { class: 'btn btn-secondary', onclick: () => navigate(showAllSets, tcg) }, tr('View sets'))),
    setGrid
  );
  renderSets(collections);
}

function collectionItem(tcg, c) {
  return el('button', { class: 'collection-item', onclick: () => navigate(showCollection, tcg, c.id) },
    itemHeader(c.name, c.owned, c.total),
    el('div', { class: 'collection-meta' },
      c.total || c.hidden ? tr('{owned} / {total} cards', { owned: c.owned, total: c.total }) : c.custom ? tr('No cards yet') : tr('Not downloaded yet'),
      c.hidden ? el('span', { class: 'hidden-count' }, ` · ${tr('{n} hidden', { n: c.hidden })}`) : null),
    c.total ? progressBar(c.owned, c.total) : null);
}

// ---------- Buscador de cartas en todos los sets ----------
// onChange (opcional): se llama después de marcar o desmarcar una carta.
const cardSearchState = {}; // texto buscado, por TCG

function cardSearch(tcg, onChange) {
  const results = el('div', { class: 'search-results' });
  const filters = filterState(`search:${tcg.id}`);
  const input = el('input', {
    class: 'search', type: 'search', placeholder: tr('Search cards to add, e.g. {example}', { example: tcg.example }), value: cardSearchState[tcg.id] || '',
    onkeydown: (e) => { if (e.key === 'Enter') run(); },
    onsearch: (e) => { if (!e.target.value) run(); },
  });
  const run = async () => {
    const q = input.value.trim();
    cardSearchState[tcg.id] = q;
    if (q.length < 2) { setChildren(results); return; }
    setChildren(results, el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, tr('Searching…'))));
    let cards;
    try {
      cards = await window.tcg.searchCards(q, tcg.id);
    } catch (err) {
      if (cardSearchState[tcg.id] === q) setChildren(results, el('p', { class: 'error' }, tr('Search failed: {error}', { error: err.message || err })));
      return;
    }
    if (cardSearchState[tcg.id] !== q) return; // llegó tarde: ya se buscó otra cosa
    cards = cards.map((c) => ({ ...c, image_url: c.image, local_id: c.localId }));
    const grid = el('div', { class: 'card-grid' });
    const title = el('h2', { class: 'section-title' });
    const advanced = advancedFilter(tcg, filters, { getCards: () => cards, onChange: () => render() });
    const render = () => {
      const list = filterCards(cards, filters);
      const found = foundText(cards.length);
      title.textContent = list.length === cards.length ? found : `${found} · ${tr('{n} shown', { n: list.length })}`;
      setChildren(grid, ...list.map((c) => cardTile(c, async () => {
        if (c.quantity > 1) return; // la cantidad se gestiona desde el set
        c.quantity = c.quantity > 0 ? 0 : 1;
        await window.tcg.setOwned(c.id, c.quantity,
          { id: c.id, setId: c.set.id, localId: c.localId, name: c.name, rarity: c.rarity, image: c.image });
        render();
        onChange?.();
      }, [c.set.name, c.rarity || ''], () => cardLinkItems(tcg, c))));
      if (cards.length && !list.length) grid.append(el('p', { class: 'muted' }, tr('No cards match these filters.')));
    };
    render();
    setChildren(results,
      el('div', { class: 'section-head' },
        title,
        el('div', { class: 'section-actions' },
          cards.length ? advanced.button : null,
          el('button', { class: 'chip', onclick: () => { input.value = ''; run(); } }, tr('Clear')))),
      advanced.badges,
      cards.length ? el('p', { class: 'muted hint' }, tr('Click a card to mark it as owned.')) : null,
      grid);
  };
  if (cardSearchState[tcg.id]) run();
  return el('div', { class: 'card-search' },
    el('div', { class: 'search-row' }, input, el('button', { class: 'btn', onclick: run }, tr('Search'))),
    results);
}

const foundText = (n) => tr(n === 1 ? '{n} card found' : '{n} cards found', { n });

// ---------- Todos los sets ----------
const setsState = { setQuery: '', scroll: 0 };

async function showAllSets(tcg, opts = {}) {
  setChrome(`${tcg.name} › ${tr('All sets')}`, tcg);
  setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', {}, tr('Loading sets…'))));

  let collections;
  try {
    collections = await window.tcg.listCollections(tcg.id, opts);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, tr('Could not download the set list. Are you connected to the internet?')),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showAllSets(tcg, opts) }, tr('Retry')));
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
      const key = c.serie_name || tr('Collections');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    setChildren(setList, ...[...groups].map(([serie, items]) => el('section', {},
      el('h2', { class: 'section-title' }, serie),
      el('div', { class: 'set-grid' }, items.map((c) => setTile(c, () => open(c)))))));
    if (!groups.size) setList.append(el('p', { class: 'muted' }, tr('No sets match.')));
  };

  const setFilter = el('input', {
    class: 'search', type: 'search', placeholder: tr('Filter sets…'), value: setsState.setQuery,
    oninput: (e) => { setsState.setQuery = e.target.value; renderSets(); },
  });

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, tr('All sets')),
        el('div', { class: 'counter' }, tr('{n} sets · {withCards} with cards', { n: collections.length, withCards }))),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          el('button', { class: 'btn', onclick: () => { setsState.scroll = 0; showAllSets(tcg, { refreshSets: true }); } },
            tr('Update set list'))),
        el('div', { class: 'toolbar-row' }, setFilter))),
    setList
  );
  renderSets();
  view.scrollTop = setsState.scroll;
}

// Código corto del set para las casillas sin logo (OP01, P1…).
function setCode(c) {
  return tcgById(c.tcg).catalog && c.set_id.length <= 12 ? c.set_id : null;
}

function setTile(c, onClick) {
  const owned = c.owned > 0;
  return el('button', { class: 'set-tile' + (owned ? ' has-cards' : ''), onclick: onClick },
    el('div', { class: 'set-logo' },
      // Scryfall da el símbolo del set en SVG negro: se muestra en blanco (ver .mtg-symbol).
      // TCGdex da la ruta del logo sin extensión; YGOPRODeck, la imagen del sobre (.jpg). Sin logo, el código del set.
      c.logo && c.tcg === 'magic' ? el('img', { class: 'mtg-symbol', src: c.logo, alt: '', loading: 'lazy' })
        : c.logo ? el('img', { src: /\.(jpe?g|png|webp)$/i.test(c.logo) ? c.logo : `${c.logo}.webp`, alt: '', loading: 'lazy' })
        : setCode(c) ? el('span', { class: 'set-code' }, setCode(c)) : el('span', {}, tr('No logo'))),
    el('div', { class: 'set-name' }, c.name),
    el('div', { class: 'collection-meta' },
      [c.release_date?.slice(0, 4), owned ? tr('{owned} / {total} cards', { owned: c.owned, total: c.total })
        : c.total ? tr('{n} cards', { n: c.total }) : null]
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
  return `${value.toLocaleString(i18n.lang, { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
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
      'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Kindred', 'Land', 'Token', 'Emblem',
      'Monster', 'Spell', 'Trap', 'Action', 'Song', 'Item', 'Location'] },
  { key: 'subtype', label: (tcg) => tcg.subtypeLabel || 'Subtype', get: (c) => c.attrs?.subtype,
    order: ['Item', 'Supporter', 'Stadium', 'Tool', 'Basic Energy', 'Special Energy',
      'Normal', 'Effect', 'Ritual', 'Fusion', 'Synchro', 'Xyz', 'Link', 'Pendulum'] },
  // Magic: Legendary, Basic, Snow…
  { key: 'supertype', label: 'Supertype', get: (c) => c.attrs?.supertype, order: ['Legendary', 'Basic', 'Snow', 'World'] },
  { key: 'color', label: (tcg) => tcg.colorLabel || 'Color', get: (c) => c.attrs?.colors,
    order: (tcg) => (tcg.id === 'magic' ? ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless']
      : ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless',
        'Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow']) },
  { key: 'rarity', label: 'Rarity', get: (c) => c.rarity,
    display: (v, tcg) => tcg.rarities?.[v] || v,
    order: ['Leader', 'Common', 'Uncommon', 'Rare', 'Mythic Rare', 'Holo Rare', 'Rare Holo', 'Double rare', 'ACE SPEC Rare',
      'Super Rare', 'Legendary', 'Epic', 'Ultra Rare', 'Illustration rare', 'Special illustration rare',
      'Shiny rare', 'Shiny Ultra Rare', 'Hyper rare', 'Secret Rare', 'Enchanted', 'Iconic', 'Showcase',
      'Special', 'Bonus', 'Promo', 'L', 'C', 'UC', 'R', 'SR', 'SEC', 'SP', 'TR', 'PR'] },
  { key: 'stage', label: 'Stage', get: (c) => c.attrs?.stage, order: ['Basic', 'Stage 1', 'Stage 2'] },
  { key: 'mechanic', label: 'Mechanic', get: (c) => c.attrs?.mechanic, order: ['ex', 'EX', 'GX', 'V', 'VMAX', 'VSTAR'] },
  { key: 'attribute', label: 'Attribute', get: (c) => c.attrs?.attributes, order: ['Slash', 'Strike', 'Ranged', 'Special', 'Wisdom'] },
  { key: 'version', label: 'Version', get: (c) => c.attrs?.version, single: true, translate: true, order: ['Standard', 'Alternate art'] },
  { key: 'treatment', label: 'Frame / Art', get: (c) => c.attrs?.treatment, translate: true,
    order: ['Regular', 'Borderless', 'Showcase', 'Extended art', 'Full art', 'Old frame', 'Promo'] },  // Los sets se dejan en el orden en que llegan las cartas (del más nuevo al más antiguo).
  { key: 'set', label: 'Set', get: (c) => c.set_name || c.setName || c.set?.name, keepOrder: true },
];
const ownedStatus = () => [['owned', tr('Owned')], ['missing', tr('Not owned')]];

// Filtros elegidos de cada pantalla (por set, y por TCG en los buscadores): se conservan al volver.
const filterStates = {};
function filterState(key) {
  return (filterStates[key] ||= { status: null, values: {} });
}

const groupLabel = (g, tcg) => tr(typeof g.label === 'function' ? g.label(tcg) : g.label);
// Los valores salen de los datos de la carta y no se traducen, salvo en los grupos con translate.
const valueLabel = (g, v, tcg) => (g.display ? g.display(v, tcg) : g.translate ? tr(v) : v);
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
    if (state.minQty && !(c.quantity >= state.minQty)) return false;
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
function advancedFilter(tcg, state, { getCards, statusOptions = ownedStatus, quickStatus = false, onChange }) {
  const button = el('button', {
    class: 'btn btn-secondary btn-icon filter-btn', title: tr('Advanced filters'),
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
    if (state.minQty) list.push({ label: tr('Copies: {n}+', { n: state.minQty }), remove: () => { state.minQty = null; } });
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
    setChildren(button, el('span', { class: 'icon-filter' }), tr('Filters'),
      list.length ? el('span', { class: 'filter-count' }, String(list.length)) : null);
    setChildren(badges,
      list.map((f) => el('span', { class: 'filter-badge' }, f.label,
        el('button', { class: 'filter-badge-x', title: tr('Remove this filter'), onclick: () => { sfx.play('uncheck'); removeAndRefresh(f.remove); } },
          el('span', { class: 'icon-x' })))),
      list.length > 1 ? el('button', {
        class: 'link filter-clear',
        onclick: () => { sfx.play('uncheck'); removeAndRefresh(() => { state.status = null; state.minQty = null; state.values = {}; }); },
      }, tr('Clear all')) : null);
    badges.classList.toggle('hidden', !list.length);
    setChildren(chips, showQuick() ? [['', tr('All')], ...statusOptions()].map(([k, label]) =>
      optionChip(label, (state.status || '') === k, () => removeAndRefresh(() => { state.status = k || null; }))) : null);
    chips.classList.toggle('hidden', !showQuick());
  };
  update();
  return { button, badges, chips, update };
}

// ---------- Desplegables ----------
// Campo con etiqueta y desplegable con el estilo de la app (un <select> nativo no se puede adaptar). Cada diálogo crea
// su grupo con dropdownGroup(): solo hay un panel abierto a la vez, y va en <body> con posición fija para que no lo
// recorte el scroll del diálogo. El diálogo cierra el panel abierto (closePanel) con Escape o con un clic fuera.
function dropdownGroup() {
  let openPanel = null;
  const closePanel = () => {
    if (!openPanel) return;
    openPanel.panel.remove();
    openPanel.trigger.classList.remove('open');
    openPanel = null;
  };

  // options: [valor, texto]; getSelected() da los valores elegidos; onPick(valor) cambia la selección. single: una sola
  // opción; con allOption además la opción "All" (valor null). Sin nada elegido, el campo muestra su nombre.
  // field: campo de un formulario (siempre tiene valor), sin el resaltado de los filtros aplicados.
  const dropdown = (title, options, single, getSelected, onPick, { allOption = single, field = false } = {}) => {
    const value = el('span', { class: 'dropdown-value' });
    const trigger = el('button', {
      class: 'dropdown-trigger' + (field ? ' field' : ''), type: 'button', 'aria-haspopup': 'listbox',
      // stopPropagation: el clic no llega a document, así que el sonido se pone aquí.
      onclick: (e) => { e.stopPropagation(); sfx.play('click'); if (openPanel?.trigger === trigger) closePanel(); else open(); },
    }, value, el('span', { class: 'dropdown-caret' }));
    const items = allOption ? [[null, tr('All')], ...options] : options;

    const refresh = () => {
      const labels = options.filter(([v]) => getSelected().includes(v)).map(([, l]) => l);
      value.textContent = !labels.length ? title : labels.length <= 2 ? labels.join(', ') : tr('{n} selected', { n: labels.length });
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
                if (single) closePanel();
                onPick(v);
                refresh();
                if (!single) renderItems();
              },
            }, el('span', { class: single ? 'dropdown-radio' : 'dropdown-check' }), label);
          }),
          !single && selected.length ? el('button', {
            class: 'dropdown-clear', type: 'button',
            onclick: () => { sfx.play('uncheck'); selected.forEach(onPick); refresh(); renderItems(); },
          }, tr('Clear selection')) : null);
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

  return { dropdown, closePanel, isOpen: () => !!openPanel };
}

// Trabaja sobre una copia: devuelve el estado nuevo al pulsar "Apply", o null si se cancela.
// Cada grupo es un desplegable: de selección múltiple, o de una sola opción si el grupo es single.
function openFilterDialog(tcg, cards, state, statusOptions) {
  return new Promise((resolve) => {
    const draft = {
      status: state.status,
      minQty: state.minQty || null,
      values: Object.fromEntries(Object.entries(state.values).map(([k, v]) => [k, [...v]])),
    };
    const body = el('div', { class: 'filter-groups' });
    const { dropdown, closePanel, isOpen } = dropdownGroup();

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
      // Cantidad mínima de copias: vacío o 0 = sin filtro. Botones − / + propios en lugar de las flechas nativas.
      const setMinQty = (n) => {
        draft.minQty = n > 0 ? n : null;
        minQtyInput.value = draft.minQty ? String(draft.minQty) : '';
        minQty.classList.toggle('has-value', !!draft.minQty);
      };
      const minQtyInput = el('input', {
        type: 'number', min: '1', step: '1', placeholder: tr('Any'), value: draft.minQty ? String(draft.minQty) : '',
        oninput: (e) => {
          const n = Math.floor(Number(e.target.value));
          draft.minQty = n > 0 ? n : null;
          minQty.classList.toggle('has-value', !!draft.minQty);
        },
      });
      const stepButton = (label, title, delta) => el('button', {
        class: 'filter-step', type: 'button', title,
        onclick: () => { sfx.play('click'); setMinQty((draft.minQty || 0) + delta); },
      }, label);
      const minQty = el('div', { class: 'filter-number' + (draft.minQty ? ' has-value' : '') },
        stepButton('−', tr('Fewer copies'), -1), minQtyInput, stepButton('+', tr('More copies'), 1));
      setChildren(body,
        dropdown(tr('Collection'), statusOptions, true, () => (draft.status ? [draft.status] : []), (v) => { draft.status = v; }),
        el('div', { class: 'filter-field' }, el('span', { class: 'filter-field-label' }, tr('Min. copies')), minQty),
        groups,
        groups.length ? null : el('p', { class: 'muted filter-empty' }, tr('There is no card data to filter by type, rarity or color here.')));
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
        if (isOpen()) closePanel(); else close(null);
      }
      // Enter sobre un botón (p. ej. una opción del desplegable) lo pulsa; en cualquier otro sitio, aplica.
      if (e.key === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); apply(); }
    };
    const overlay = el('div', {
      class: 'dialog-overlay',
      onclick: (e) => { if (isOpen()) closePanel(); else if (e.target === overlay) close(null); },
    },
      el('div', { class: 'dialog filter-dialog', role: 'dialog' },
        el('h3', {}, tr('Filters')),
        el('p', { class: 'muted' }, tr('Leave a field empty to not filter by it.')),
        body,
        el('div', { class: 'dialog-actions' },
          el('button', { class: 'link filter-reset', onclick: () => { sfx.play('uncheck'); draft.status = null; draft.minQty = null; draft.values = {}; render(); } },
            tr('Clear all')),
          el('button', { class: 'chip', onclick: () => close(null) }, tr('Cancel')),
          el('button', { class: 'btn', onclick: apply }, tr('Apply')))));
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
    el('p', {}, opts.refresh ? tr('Updating cards from {source}…', { source: tcg.source }) : tr('Loading cards…'))));

  let data;
  try {
    data = await window.tcg.getCollection(collectionId, opts);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, tr('Could not download the cards. Are you connected to the internet?')),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showCollection(tcg, collectionId, opts) }, tr('Retry')));
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
    statusOptions: () => [...ownedStatus(), ...(hiddenCount() ? [['hidden', tr('Hidden ({n})', { n: hiddenCount() })]] : [])],
    quickStatus: true,
    onChange: () => render(),
  });

  const refreshStats = () => {
    const visible = shown();
    const owned = visible.filter((c) => c.quantity > 0).length;
    const hidden = hiddenCount();
    setChildren(counter, tr('{owned} / {total} collected', { owned, total: visible.length }),
      hidden ? el('span', { class: 'hidden-count' }, ` · ${tr('{n} hidden', { n: hidden })}`) : null);
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
      ? { label: tr('Add back to set'), icon: '↺', onClick: () => setHidden(card, false) }
      : { label: tr('Hide from set'), icon: '⊘', onClick: () => setHidden(card, true) },
    collection.custom ? { label: tr('Remove from collection'), icon: '×', sound: 'remove', onClick: () => removeCard(card) } : null,
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
      ? tr('This collection has no cards yet. Use Edit collection to add some.') : tr('No cards match this filter.')));
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
            ? el('button', { class: 'btn', onclick: () => navigate(showCollectionEditor, tcg, collectionId) }, tr('Edit collection'))
            : el('button', { class: 'btn', onclick: () => showCollection(tcg, collectionId, { refresh: true }) },
              tr('Update from API')),
          collection.custom ? el('button', { class: 'btn btn-danger', onclick: removeCollection }, tr('Delete collection')) : null),
        el('div', { class: 'toolbar-row' }, advanced.chips, advanced.button))),
    advanced.badges,
    el('p', { class: 'muted hint' },
      tr('Click a card to mark or unmark it. Hover over it and use ⤢ to view it larger, or ⋮ to change the quantity and more options.')),
    grid
  );
  refreshStats();
  render();
}

// Botón "Notes" del set: abre un diálogo para ver o editar la nota.
function notesButton(collection) {
  return el('button', {
    class: 'btn btn-secondary', title: tr('View or edit the notes'),
    onclick: async () => {
      const value = await editNotes(collection);
      if (value == null || value === (collection.notes || '')) return;
      await window.tcg.setCollectionNotes(collection.id, value);
      collection.notes = value;
    },
  }, `📝 ${tr('Notes')}`);
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
  return el('button', { class: 'btn btn-secondary', title: tr('Export the cards to a file'), onclick: () => openExportDialog(tcg, collection) },
    `⭳ ${tr('Export')}`);
}

function openExportDialog(tcg, collection) {
  const opts = { mode: 'owned', splitVariants: true, format: 'xlsx' };
  const withVariants = !!tcg.variants; // en los otros TCG cada versión ya es una carta distinta
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
      collection ? group(tr('Cards'), [['owned', tr('Cards I own')], ['missing', tr('Cards I am missing')]], 'mode') : null,
      collection && opts.mode === 'missing' && withVariants ? group(
        tr(tcg.versionsLabel), [
        [true, tr('Each missing version')], [false, tr('Only cards with no copies')],
      ], 'splitVariants') : null,
      group(tr('Format'), formats.map((f) => [f.key, tr(f.label)]), 'format'),
      el('p', { class: 'muted export-hint' }, tr(formats.find((f) => f.key === opts.format).hint)));
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
    loading(tr('Choose where to save the file…'));
    await wait(50); // que se pinte antes de abrir la ventana de guardar (en Windows tarda en aparecer)
    try {
      const filePath = await window.tcg.chooseExportPath({ ...request, dialogTitle: tr('Export collection') });
      if (!filePath) { render(); renderActions(); return; } // se canceló la ventana de guardar
      loading(tr('Generating the file…'));
      // Con pocas cartas el fichero sale al instante: la carga se muestra un momento para que no parpadee.
      const [result] = await Promise.all([window.tcg.exportCollection({ ...request, filePath }), wait(800)]);
      setChildren(body, el('p', {}, tr(result.rows === 1 ? 'Exported {n} row to:' : 'Exported {n} rows to:', { n: result.rows })),
        el('p', { class: 'muted export-path' }, result.path));
      setChildren(actions,
        el('button', { class: 'chip', onclick: () => window.tcg.revealFile(result.path) }, tr('Show in folder')),
        el('button', { class: 'btn', onclick: close }, tr('Done')));
    } catch (err) {
      render();
      body.append(el('p', { class: 'error' }, tr('Could not export: {error}', { error: err.message || err })));
      renderActions();
    } finally {
      busy = false;
    }
  };
  // Copiar: sin ventana de guardar; el texto va directo al portapapeles.
  const copy = async () => {
    busy = true;
    loading(tr('Copying the list…'));
    try {
      const [result] = await Promise.all([
        window.tcg.copyExport({ tcg: tcg.id, collectionId: collection?.id || null, ...opts }), wait(400)]);
      setChildren(body, el('p', {}, tr(result.rows === 1 ? 'Copied {n} line to the clipboard.' : 'Copied {n} lines to the clipboard.', { n: result.rows })),
        el('p', { class: 'muted' }, tr('In Moxfield, open the deck or list, choose Bulk Edit and paste it.')));
      setChildren(actions, el('button', { class: 'btn', onclick: close }, tr('Done')));
    } catch (err) {
      render();
      body.append(el('p', { class: 'error' }, tr('Could not copy: {error}', { error: err.message || err })));
      renderActions();
    } finally {
      busy = false;
    }
  };
  const renderActions = () => setChildren(actions,
    el('button', { class: 'chip', onclick: close }, tr('Cancel')),
    EXPORT_FORMATS.find((f) => f.key === opts.format)?.copy
      ? el('button', { class: 'chip', onclick: copy }, `📋 ${tr('Copy to clipboard')}`) : null,
    el('button', { class: 'btn', onclick: run }, tr('Export…')));

  const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'dialog export-dialog', role: 'dialog' },
      el('h3', {}, tr('Export')),
      el('p', { class: 'muted' }, collection ? collection.name : tr('Every {tcg} card you own, from all sets', { tcg: tcg.name })),
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
    const textarea = el('textarea', { class: 'notes-input', rows: '10', placeholder: tr('Write anything about this set…') });
    textarea.value = collection.notes || '';
    const close = (value) => { overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    };
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
      el('div', { class: 'dialog notes-dialog', role: 'dialog' },
        el('h3', {}, tr('Notes')),
        el('p', { class: 'muted' }, collection.name),
        textarea,
        el('div', { class: 'dialog-actions' },
          el('button', { class: 'chip', onclick: () => close(null) }, tr('Cancel')),
          el('button', { class: 'btn', onclick: () => close(textarea.value) }, tr('Save')))));
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
    const found = foundText(search.results.length);
    const top = body.scrollTop;
    setChildren(body,
      el('div', { class: 'section-head picker-head' },
        el('p', { class: 'muted hint' }, list.length === search.results.length ? found : `${found} · ${tr('{n} shown', { n: list.length })}`, `. ${hint}`),
        advanced.button),
      advanced.badges,
      el('div', { class: 'card-grid' }, list.map(pickTile)),
      list.length ? null : el('p', { class: 'muted' }, tr('No cards match these filters.')));
    body.scrollTop = top;
  };
  const input = el('input', {
    class: 'search', type: 'search', placeholder: tr('Search cards to add, e.g. {example}', { example: tcg.example }), value: search.query,
    onkeydown: (e) => { if (e.key === 'Enter') run(); },
  });
  const run = async () => {
    const q = input.value.trim();
    search.query = q;
    if (q.length < 2) { search.results = []; setChildren(body); return; }
    setChildren(body, el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, tr('Searching…'))));
    try {
      const found = await window.tcg.searchCards(q, tcg.id);
      if (search.query !== q || !overlay.isConnected) return; // ya se buscó otra cosa, o se cerró el diálogo
      search.results = found.map(mapResult);
      if (!search.results.length) setChildren(body, el('p', { class: 'muted' }, tr('No cards found.')));
      render();
    } catch (err) {
      setChildren(body, el('p', { class: 'error' }, tr('Search failed: {error}', { error: err.message || err })));
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
        el('div', { class: 'card-picker-head' }, el('h3', {}, tr('Add cards')), sub,
          el('div', { class: 'search-row' }, input, el('button', { class: 'btn', onclick: run }, tr('Search')))),
        el('button', { class: 'chip', onclick: close }, tr('Done'))),
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
  setChrome(`${tcg.name} › ${tr(isNew ? 'New collection' : 'Edit collection')}`, tcg);
  const draft = { id: collectionId, name: '', cards: [] };
  if (!isNew) {
    setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', {}, tr('Loading collection…'))));
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
    { label: tr('Remove from collection'), icon: '×', sound: 'remove', onClick: () => toggleIncluded(c) },
  ];
  const toggleIncluded = (c) => {
    draft.cards = included().has(c.id) ? draft.cards.filter((x) => x.id !== c.id) : [...draft.cards, c];
    renderAll();
  };

  // Cartas de la colección: clic = la tengo / no la tengo; ⋮ = cantidad, enlaces y quitar de la colección.
  const selectedTitle = el('h2', { class: 'section-title' });
  const selectedGrid = el('div', { class: 'card-grid' });
  const renderSelected = () => {
    selectedTitle.textContent = tr('Cards in this collection ({n})', { n: draft.cards.length });
    setChildren(selectedGrid, ...draft.cards.map((c) => cardTile(tile(c), () => toggleOwned(c),
      [c.setName || c.setId, c.rarity || '', qtyLabel(c)], () => menuFor(c))));
    if (!draft.cards.length) selectedGrid.append(el('p', { class: 'muted' }, tr('No cards yet. Use Add cards to search for some.')));
  };

  // Diálogo "Add cards": clic (o +/−) = añadir a la colección / quitar; ⋮ (si ya está) = cantidad y más.
  const search = { query: '', results: [] };
  let refreshPicker = null;
  const pickTile = (c) => {
    const isIn = included().has(c.id);
    const t = tile(c);
    return el('div', {
      class: 'card pick' + (isIn ? ' owned' : ''),
      title: tr(isIn ? 'In the collection (click to remove it)' : 'Click to add it to the collection'),
      onclick: () => { sfx.play(isIn ? 'remove' : 'add'); toggleIncluded(c); },
    },
      el('div', { class: 'card-img-wrap' },
        t.image_url
          ? el('img', { src: cardImage(t.image_url), alt: c.name, loading: 'lazy' })
          : el('div', { class: 'no-image' }, c.name, el('br'), tr('No image')),
        expandButton(t),
        el('div', { class: 'check pick-toggle', title: tr(isIn ? 'Remove from the collection' : 'Add to the collection') },
          el('span', { class: isIn ? 'icon-minus' : 'icon-plus' })),
        isIn ? el('button', {
          class: 'card-menu-btn', title: tr('Actions'),
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
      subtitle: () => `${draft.name.trim() || tr('New collection')} · ${tr(draft.cards.length === 1 ? '{n} card' : '{n} cards', { n: draft.cards.length })}`,
      hint: tr('Click a card to add it to the collection or remove it. Use ⋮ on the ones in it to set how many you own.'),
      onClose: () => { refreshPicker = null; },
    });
  };

  const renderAll = () => { renderSelected(); refreshPicker?.(); };

  const nameInput = el('input', {
    class: 'search name-input', placeholder: tr('Collection name, e.g. My {example} cards', { example: tcg.example }), value: draft.name, maxlength: '80',
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
    if (!draft.name.trim()) { error.textContent = tr('Give the collection a name.'); nameInput.focus(); return; }
    const id = await window.tcg.saveCustomCollection({ id: draft.id, tcg: tcg.id, name: draft.name.trim(), cards: draft.cards });
    leave(showCollection, tcg, id);
  };

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('h1', { class: 'title' }, tr(isNew ? 'New collection' : 'Edit collection')),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          el('button', { class: 'btn btn-secondary btn-icon', onclick: openPicker }, el('span', { class: 'icon-plus' }), tr('Add cards')),
          el('button', { class: 'btn btn-secondary', onclick: () => backBtn.click() }, tr('Cancel')),
          el('button', { class: 'btn', onclick: save }, tr(isNew ? 'Create collection' : 'Save changes'))))),
    el('label', { class: 'field-label' }, tr('Name'), nameInput),
    error,
    el('div', { class: 'section-head sets-head' }, selectedTitle),
    el('p', { class: 'muted hint' }, tr('Click a card to mark whether you own it. Use ⋮ to remove it from the collection.')),
    selectedGrid
  );
  renderSelected();
  if (isNew) nameInput.focus();
}

// ---------- Wishlist de un TCG ----------
// Cartas que quieres conseguir. Clic = la tengo / no la tengo (igual que en un set); ⋮ = cantidad, enlaces y quitarla.
// "Add cards" abre el buscador: clic = añadir a la wishlist / quitar.
async function showWishlist(tcg) {
  setChrome(`${tcg.name} › ${tr('Wishlist')}`, tcg);
  setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', {}, tr('Loading…'))));
  let cards = await window.tcg.getWishlist(tcg.id);

  const counter = el('div', { class: 'counter' });
  const grid = el('div', { class: 'card-grid' });

  const setQuantity = async (card, quantity) => {
    setLocalTotal(card, quantity);
    await window.tcg.setOwned(card.id, card.quantity, wishCard(card));
    render();
  };
  const setVariant = async (card, key, quantity) => {
    setLocalVariant(card, key, Math.max(0, quantity));
    await window.tcg.setVariantOwned(card.id, key, Math.max(0, quantity), wishCard(card));
    render();
  };
  const menuFor = (card) => quantityMenuItems(tcg, card, (q) => setQuantity(card, q), (changed) => {
    for (const c of cards) if (changed[c.id] != null) setLocalTotal(c, changed[c.id]);
    render();
  }, (key, q) => setVariant(card, key, q));

  const render = () => {
    const owned = cards.filter((c) => c.quantity > 0).length;
    counter.textContent = tr(cards.length === 1 ? '{n} card' : '{n} cards', { n: cards.length })
      + (owned ? ` · ${tr('{n} already owned', { n: owned })}` : '');
    setChildren(grid, ...cards.map((card) => cardTile(card, () => {
      if (card.quantity <= 1) setQuantity(card, card.quantity ? 0 : 1);
    }, [card.set_name || card.set_id, card.rarity || '', qtyLabel(card)], () => menuFor(card))));
    if (!cards.length) grid.append(el('p', { class: 'muted' }, tr('Your wishlist is empty. Use Add cards to search for some.')));
  };

  // Cualquier cambio en la wishlist (desde el ⋮ de aquí o desde el buscador) vuelve a leerla.
  const reload = async () => {
    if (!grid.isConnected) { document.removeEventListener('wishlist-change', reload); return; }
    cards = await window.tcg.getWishlist(tcg.id);
    render();
    refreshPicker?.();
  };
  document.addEventListener('wishlist-change', reload);

  const search = { query: '', results: [] };
  let refreshPicker = null;
  const pickTile = (c) => {
    const isIn = wishlist.has(c.id);
    const t = { ...c, image_url: c.image, local_id: c.localId };
    return el('div', {
      class: 'card pick' + (isIn ? ' owned' : ''),
      title: tr(isIn ? 'In the wishlist (click to remove it)' : 'Click to add it to the wishlist'),
      onclick: () => { sfx.play(isIn ? 'remove' : 'add'); isIn ? wishlist.remove(c.id) : wishlist.add(tcg.id, t); },
    },
      el('div', { class: 'card-img-wrap' },
        t.image_url
          ? el('img', { src: cardImage(t.image_url), alt: c.name, loading: 'lazy' })
          : el('div', { class: 'no-image' }, c.name, el('br'), tr('No image')),
        expandButton(t),
        el('div', { class: 'check pick-toggle', title: tr(isIn ? 'Remove from wishlist' : 'Add to wishlist') },
          el('span', { class: isIn ? 'icon-minus' : 'icon-plus' }))),
      el('div', { class: 'card-info' },
        el('div', { class: 'card-name' }, `#${c.localId} ${c.name}`),
        el('div', { class: 'card-sub' }, c.setName || ''),
        el('div', { class: 'card-sub' }, c.quantity ? qtyLabel(c) : '')));
  };
  const openPicker = () => {
    refreshPicker = openCardPicker(tcg, {
      search, filterKey: `wishlist:${tcg.id}`, pickTile,
      mapResult: (c) => ({
        id: c.id, setId: c.set.id, setName: c.set.name, localId: c.localId,
        name: c.name, rarity: c.rarity, image: c.image, price: c.price, quantity: c.quantity, attrs: c.attrs,
        variants: c.variants, variant_qty: c.variant_qty,
      }),
      subtitle: () => `${tr('Wishlist')} · ${tr(cards.length === 1 ? '{n} card' : '{n} cards', { n: cards.length })}`,
      hint: tr('Click a card to add it to the wishlist or remove it.'),
      onClose: () => { refreshPicker = null; },
    });
  };

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', {}, el('h1', { class: 'title' }, tr('Wishlist')), counter),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          el('button', { class: 'btn btn-secondary btn-icon', onclick: openPicker }, el('span', { class: 'icon-plus' }), tr('Add cards'))))),
    el('p', { class: 'muted hint' },
      tr('Click a card to mark it as owned once you get it. Use ⋮ to change the quantity or remove it from the wishlist. From any set or deck, ⋮ › Add to wishlist adds a card here.')),
    grid
  );
  render();
}

// ---------- Mazos ----------
// Las cartas de un mazo no son cartas que tienes: si la tienes o no sale de tu colección, y en cada mazo se puede
// marcar al revés (p. ej. una sola copia que usas en dos mazos), sin cambiar la colección.

// Formatos de cada TCG. size: nº exacto de cartas; min: mínimo; maxCopies: copias de una misma carta (sin contar
// tierras básicas / Energía básica); commander / leader: hueco aparte para esa carta; legal: formato en el que la API
// dice que la carta es legal (Scryfall, Lorcast).
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
  // El mínimo cuenta también el Extra Deck (la app no los separa).
  yugioh: [
    { id: 'advanced', name: 'Advanced', min: 40, maxCopies: 3 },
    { id: 'casual', name: 'Casual' },
  ],
  lorcana: [
    { id: 'core', name: 'Core Constructed', min: 60, maxCopies: 4, legal: 'core' },
    { id: 'infinity', name: 'Infinity Constructed', min: 60, maxCopies: 4, legal: 'infinity' },
    { id: 'casual', name: 'Casual' },
  ],
};
// Cada formato sabe de qué TCG es (para los textos de ayuda).
for (const [tcg, formats] of Object.entries(DECK_FORMATS)) for (const f of formats) f.tcg = tcg;
// Cartas que no cuentan para el máximo de copias, por TCG (el texto va entre paréntesis en los avisos).
const deckBasicsNote = { magic: '(basic lands aside)', pokemon: '(basic Energy aside)' };
const deckFormat = (deck) => (DECK_FORMATS[deck.tcg] || []).find((f) => f.id === deck.format)
  || { id: deck.format, name: deck.format || 'Casual' };
// Hueco aparte del formato: rol de sus cartas en la base de datos, nombre, cuántas caben (dos commanders con Partner)
// y tipo de carta que puede ir en él.
const specialSlot = (fmt) => (fmt.commander ? { role: 'commander', label: 'Commander', max: 2 }
  : fmt.leader ? { role: 'leader', label: 'Leader', type: 'Leader', max: 1 } : null);
const typesOf = (c) => [].concat(c.attrs?.type || []);
// Nombre traducido del formato y del hueco aparte (en minúscula para usarlo dentro de una frase).
const fmtName = (fmt) => tr(fmt.name);
const slotName = (s) => tr(s.label).toLowerCase();

function formatHint(fmt) {
  if (fmt.commander) return tr('100 cards including the commander, one copy of each card (basic lands aside), all in the commander\'s colors.');
  if (fmt.leader) {
    return fmt.size ? tr('1 leader plus {size} cards, up to {max} copies of each card, all in the leader\'s colors.', { size: fmt.size, max: fmt.maxCopies })
      : tr('1 leader, all in the leader\'s colors.');
  }
  if (fmt.size) return tr('{size} cards, up to {max} copies of each card (basic Energy aside).', { size: fmt.size, max: fmt.maxCopies });
  if (fmt.min && fmt.legal) {
    return tr(deckBasicsNote[fmt.tcg] ? 'At least {min} cards, up to {max} copies of each card (basic lands aside). Card legality comes from Scryfall.'
      : 'At least {min} cards, up to {max} copies of each card. Card legality comes from {source}.', { min: fmt.min, max: fmt.maxCopies, source: tcgById(fmt.tcg).source });
  }
  if (fmt.min) return tr('At least {min} cards, up to {max} copies of each card.', { min: fmt.min, max: fmt.maxCopies });
  return tr('No deck-building rules: any cards, any number of copies.');
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
  return names.length > 5 ? tr('{list} and {n} more', { list: names.slice(0, 5).join(', '), n: names.length - 5 }) : names.join(', ');
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
  if (slot && !special.length) issues.push(tr('Choose a {slot}.', { slot: slotName(slot) }));
  if (fmt.size && total !== fmt.size) {
    issues.push(tr(fmt.commander ? 'The deck needs exactly {size} cards including the commander: it has {total}.'
      : fmt.leader ? 'The deck needs exactly {size} cards plus the leader: it has {total}.'
      : 'The deck needs exactly {size} cards: it has {total}.', { size: fmt.size, total }));
  }
  if (fmt.min && total < fmt.min) issues.push(tr('The deck needs at least {min} cards: it has {total}.', { min: fmt.min, total }));
  if (fmt.maxCopies) {
    // La misma carta: mismo código en One Piece (artes alternativos incluidos), mismo nombre en el resto.
    const counts = new Map();
    for (const c of cards.filter((x) => x.role !== 'leader' && !isBasic(deck, x))) {
      const key = deck.tcg === 'onepiece' ? c.local_id : c.name.toLowerCase();
      const entry = counts.get(key) || { name: c.name, n: 0, cards: [] };
      entry.n += c.quantity;
      entry.cards.push(c);
      counts.set(key, entry);
    }
    const over = [...counts.values()].filter((e) => e.n > fmt.maxCopies);
    for (const e of over) flag(e.cards, tr('{n} copies: at most {max} allowed', { n: e.n, max: fmt.maxCopies }));
    const basics = deckBasicsNote[deck.tcg] ? ` ${tr(deckBasicsNote[deck.tcg])}` : '';
    if (over.length) {
      issues.push(fmt.maxCopies === 1 ? tr('Only one copy of each card{basics}: {cards}.', { basics, cards: nameList(over) })
        : tr('At most {max} copies of each card{basics}: {cards}.', { max: fmt.maxCopies, basics, cards: nameList(over) }));
    }
  }
  if (fmt.legal) {
    const illegal = cards.filter((c) => Array.isArray(c.legal) && !c.legal.includes(fmt.legal));
    if (illegal.length) issues.push(tr('Not legal in {format}: {cards}.', { format: fmtName(fmt), cards: nameList(illegal) }));
    flag(illegal, tr('Not legal in {format}', { format: fmtName(fmt) }));
  }
  if (fmt.commander && special.length && special.every((c) => Array.isArray(c.color_identity))) {
    const identity = new Set(special.flatMap((c) => c.color_identity));
    const outside = main.filter((c) => Array.isArray(c.color_identity) && c.color_identity.some((x) => !identity.has(x)));
    if (outside.length) issues.push(tr('Outside the commander\'s colors: {cards}.', { cards: nameList(outside) }));
    flag(outside, tr("Outside the commander's colors"));
  }
  if (slot?.type) {
    // El líder va en su hueco; las demás cartas tienen que compartir alguno de sus colores.
    const leaders = main.filter((c) => typesOf(c).includes(slot.type));
    if (leaders.length) issues.push(tr('Leaders can\'t go in the main deck: {cards}.', { cards: nameList(leaders) }));
    flag(leaders, tr("Leaders can't go in the main deck"));
    const colors = new Set(special.flatMap((c) => c.attrs?.colors || []));
    const outside = colors.size ? main.filter((c) => !typesOf(c).includes(slot.type) && c.attrs?.colors?.length
      && !c.attrs.colors.some((x) => colors.has(x))) : [];
    if (outside.length) issues.push(tr('Not in the leader\'s colors: {cards}.', { cards: nameList(outside) }));
    flag(outside, tr("Not in the leader's colors"));
  }
  return { issues, problems };
}

const collectionLine = (c) => (c.quantity > 0 ? tr('In your collection: {n}', { n: c.quantity }) : tr('Not in your collection'));

// Carta de un resultado de búsqueda en el formato que guarda el mazo.
function deckDraftCard(c) {
  return {
    id: c.id, setId: c.set?.id, setName: c.set?.name, localId: c.localId, name: c.name, rarity: c.rarity, image: c.image,
    price: c.price ?? c.market_price, attrs: c.attrs, colorIdentity: c.color_identity, legal: c.legal,
    tcgplayerId: c.tcgplayer_id, scryfallUri: c.scryfall_uri,
  };
}

// "40 / 60 cards · 12 / 40 owned" (sin tamaño fijo, solo el total de cartas).
function deckCountText(fmt, total, owned, copies) {
  const count = fmt.size ? tr('{owned} / {total} cards', { owned: total, total: fmt.size })
    : tr(total === 1 ? '{n} card' : '{n} cards', { n: total });
  return count + (copies ? ` · ${tr('{owned} / {total} owned', { owned, total: copies })}` : '');
}

// Tarjeta de un mazo: la portada difuminada de fondo y la carta encima, para distinguirla de un set.
function deckTile(deck) {
  const cover = deckCover(deck, deck.cards);
  const { fmt, total, copies, owned } = deckStats(deck, deck.cards);
  const tcg = tcgById(deck.tcg);
  const image = cover?.image_url ? cardImage(cover.image_url) : null;
  return el('button', { class: 'deck-tile', onclick: () => navigate(showDeck, deck.id) },
    el('div', { class: 'deck-tile-bg' }, image ? el('img', { src: image, alt: '', loading: 'lazy' }) : null),
    el('img', { class: 'deck-tcg-badge', src: tcg.logo, alt: tcg.name, title: tcg.name }),
    el('div', { class: 'deck-tile-cover' },
      image ? el('img', { src: image, alt: cover.name, loading: 'lazy' }) : el('div', { class: 'deck-empty-cover' }, tr('No cards yet'))),
    el('div', { class: 'deck-tile-info' },
      el('div', { class: 'set-name' }, deck.name),
      el('div', { class: 'collection-meta' }, `${tcg.name} · ${fmtName(fmt)}`),
      el('div', { class: 'collection-meta' }, deckCountText(fmt, total, owned, copies)),
      copies ? progressBar(owned, copies) : null));
}

// ---------- Lista de mazos ----------
const decksState = { tcg: '' };

async function showDecks() {
  setChrome(tr('My decks'));
  setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', {}, tr('Loading decks…'))));
  let decks;
  try {
    decks = await window.tcg.listDecks();
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, tr('Could not load the decks.')),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showDecks() }, tr('Retry')));
    return;
  }
  if (!decks.some((d) => d.tcg === decksState.tcg)) decksState.tcg = '';

  const chips = el('div', { class: 'chips' });
  const grid = el('div', { class: 'deck-grid' });
  const render = () => {
    const count = (id) => decks.filter((d) => d.tcg === id).length;
    setChildren(chips, decks.length ? [['', tr('All ({n})', { n: decks.length })],
      ...TCGS.filter((t) => count(t.id)).map((t) => [t.id, `${t.name} (${count(t.id)})`])].map(([key, label]) =>
      optionChip(label, decksState.tcg === key, () => { decksState.tcg = key; render(); })) : null);
    const list = decks.filter((d) => !decksState.tcg || d.tcg === decksState.tcg);
    setChildren(grid, list.map(deckTile));
    if (!list.length) grid.append(el('p', { class: 'muted' }, tr('No decks yet. Use Create deck to build your first one.')));
  };

  const create = async () => {
    const draft = await deckDialog({ title: tr('New deck'), okLabel: tr('Create deck'), tcg: decksState.tcg && !hiddenTcgs.has(decksState.tcg) ? decksState.tcg : visibleTcgs()[0].id });
    if (!draft) return;
    navigate(showDeck, await window.tcg.createDeck(draft));
  };

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, tr('My decks')),
        el('div', { class: 'counter' }, tr(decks.length === 1 ? '{n} deck' : '{n} decks', { n: decks.length }))),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          el('button', { class: 'btn btn-icon', onclick: create }, el('span', { class: 'icon-plus' }), tr('Create deck'))),
        el('div', { class: 'toolbar-row' }, chips))),
    el('p', { class: 'muted hint' },
      tr('A card added to a deck is not added to your collection: the deck shows whether you own it or not.')),
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
      class: 'qty-input', placeholder: tr('e.g. Mono red aggro'), maxlength: '80', value: draft.name,
      oninput: (e) => { draft.name = e.target.value; error.textContent = ''; },
    });
    const body = el('div', { class: 'export-groups' });
    const { dropdown, closePanel, isOpen } = dropdownGroup();
    const field = (label, options, active, onPick) => dropdown(label, options, true, () => [active], (value) => {
      onPick(value);
      render();
    }, { allOption: false, field: true });
    const render = () => {
      // Solo los formatos activados en Settings (al editar un mazo, también el que ya tiene).
      const formats = DECK_FORMATS[draft.tcg].filter((f) => tcgPrefs.formatOn(draft.tcg, f.id) || f.id === deck?.format);
      if (!formats.some((f) => f.id === draft.format)) draft.format = formats[0].id;
      setChildren(body,
        el('div', { class: 'deck-dialog-fields' + (deck ? ' single' : '') },
          deck ? null : field('TCG', visibleTcgs().map((t) => [t.id, t.name]), draft.tcg, (v) => { draft.tcg = v; }),
          field(tr('Format'), formats.map((f) => [f.id, fmtName(f)]), draft.format, (v) => { draft.format = v; })),
        el('p', { class: 'muted export-hint' }, formatHint(formats.find((f) => f.id === draft.format))));
    };
    const close = (value) => { closePanel(); overlay.remove(); document.removeEventListener('keydown', onKey, true); resolve(value); };
    const accept = () => {
      if (!draft.name.trim()) { error.textContent = tr('Give the deck a name.'); input.focus(); return; }
      close({ name: draft.name.trim(), tcg: draft.tcg, format: draft.format });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (isOpen()) closePanel(); else close(null); }
      if (e.key === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); accept(); }
    };
    const overlay = el('div', {
      class: 'dialog-overlay',
      onclick: (e) => { if (isOpen()) closePanel(); else if (e.target === overlay) close(null); },
    },
      el('div', { class: 'dialog export-dialog', role: 'dialog' },
        el('h3', {}, title),
        el('p', { class: 'muted' }, deck ? tcgById(deck.tcg).name : tr('Choose a name, the TCG and the format. You can change the name and format later.')),
        el('label', { class: 'dialog-label deck-name-label' }, tr('Name'), input),
        error,
        body,
        el('div', { class: 'dialog-actions' },
          el('button', { class: 'chip', onclick: () => close(null) }, tr('Cancel')),
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
  yugioh: { order: ['Monster', 'Spell', 'Trap'] },
  lorcana: { order: ['Character', 'Action', 'Song', 'Item', 'Location'], priority: ['Character', 'Song', 'Action', 'Item', 'Location'] },
};
const GROUP_TITLES = {
  Creature: 'Creatures', Planeswalker: 'Planeswalkers', Battle: 'Battles', Instant: 'Instants', Sorcery: 'Sorceries',
  Artifact: 'Artifacts', Enchantment: 'Enchantments', Land: 'Lands', Trainer: 'Trainers', Character: 'Characters',
  Event: 'Events', Stage: 'Stages', Monster: 'Monsters', Spell: 'Spells', Trap: 'Traps', Action: 'Actions', Song: 'Songs',
  Item: 'Items', Location: 'Locations',
};
const deckViewState = {}; // filtro All / Owned / Not owned, por mazo

async function showDeck(deckId) {
  setChrome(`${tr('My decks')} › …`);
  setChildren(view, el('div', { class: 'loading' }, el('div', { class: 'spinner' }), el('p', {}, tr('Loading deck…'))));
  let data;
  try {
    data = await window.tcg.getDeck(deckId);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, tr('Could not load the deck.')),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showDeck(deckId) }, tr('Retry')));
    return;
  }
  if (!data) { setChildren(view, el('p', { class: 'error' }, tr('This deck no longer exists.'))); return; }
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
  const canBeSpecial = (c) => (slot()?.type ? typesOf(c).includes(slot().type)
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
      c.role === 'main' ? { label: tr('Add 1 copy'), icon: '+', sound: 'add', onClick: () => changeCopies(c, 1) } : null,
      c.role === 'main' && c.quantity > 1
        ? { label: tr('Remove 1 copy'), icon: '−', sound: 'remove', onClick: () => removeCopy(c) } : null,
      { separator: true },
      { label: tr(owned ? 'Mark as not owned in this deck' : 'Mark as owned in this deck'), icon: owned ? '○' : '✓',
        sound: owned ? 'remove' : 'add', onClick: () => toggleOwned(c) },
      c.owned_override != null ? { label: tr('Follow my collection again'), icon: '↺', onClick: () => updateCard(c, { ownedOverride: null }) } : null,
      deckCover(deck, cards)?.id === c.id ? null : { label: tr('Set as deck cover'), icon: '★', onClick: () => setCover(c) },
      s && c.role === 'main' && canBeSpecial(c) && (s.max === 1 || special().length < s.max)
        ? { label: tr('Set as {slot}', { slot: slotName(s) }), icon: '♛', onClick: () => setSpecial(c) } : null,
      s?.role === 'commander' && c.role === 'commander'
        ? { label: tr('Move to the main deck'), icon: '↓', onClick: () => updateCard(c, { role: 'main' }) } : null,
      { separator: true },
      ...cardLinkItems(tcg, c),
      { separator: true },
      { label: tr('Remove from deck'), icon: '×', sound: 'remove', onClick: () => updateCard(c, { quantity: 0 }) },
    ];
  };

  let problems = new Map(); // cartas que incumplen las reglas del formato (se calcula en renderHeader)
  const tile = (c) => {
    const status = deckCardStatus(deck, c);
    const reasons = problems.get(c.id);
    const have = deckHave(deck, c);
    const ownLine = c.owned_override === 0 ? tr('Not owned in this deck')
      : c.owned_override === 1 ? tr('Owned in this deck')
      : !have ? tr('Not in your collection')
      : status === 'partial' ? tr('You have {have} of {n}', { have, n: c.quantity })
      : c.have_exact < c.quantity && deck.tcg !== 'pokemon' ? tr('You have {have} (another print)', { have })
      : tr('You have {have}', { have });
    return el('div', {
      class: 'card deck-card' + (status === 'owned' ? ' owned' : status === 'partial' ? ' partial' : '')
        + (c.owned_override != null ? ' overridden' : '') + (reasons ? ' has-problem' : ''),
      title: tr(status === 'owned' ? 'Owned (click to mark it as not owned in this deck)' : 'Not owned (click to mark it as owned in this deck)'),
      onclick: () => { sfx.play(status === 'owned' ? 'remove' : 'add'); toggleOwned(c); },
    },
      el('div', { class: 'card-img-wrap' },
        c.image_url ? el('img', { src: cardImage(c.image_url), alt: c.name, loading: 'lazy' })
          : el('div', { class: 'no-image' }, c.name, el('br'), tr('No image')),
        expandButton(c),
        el('div', { class: 'check' }, status === 'owned' ? '✓' : ''),
        el('button', {
          class: 'card-menu-btn', title: tr('Actions'),
          onclick: (e) => { e.stopPropagation(); openCardMenu(e.currentTarget, menuFor(c)); },
        }, el('span', { class: 'dots' })),
        // En rojo si la carta incumple alguna regla del formato (copias de más, color, legalidad…).
        c.role === 'main' ? el('div', { class: 'deck-qty' + (reasons ? ' problem' : ''), title: reasons?.join(' · ') }, `×${c.quantity}`) : null,
        // Al pasar el ratón, − / + para cambiar las copias sin abrir el menú (el commander / líder no lleva).
        c.role === 'main' ? el('div', { class: 'deck-stepper', onclick: (e) => e.stopPropagation() },
          el('button', {
            class: 'deck-step', title: tr(c.quantity > 1 ? 'Remove a copy' : 'Remove from the deck'),
            onclick: () => { sfx.play('remove'); removeCopy(c); },
          }, el('span', { class: 'icon-minus' })),
          el('span', { class: 'deck-step-qty' }, `×${c.quantity}`),
          el('button', {
            class: 'deck-step', title: tr('Add a copy'),
            onclick: () => { sfx.play('add'); changeCopies(c, 1); },
          }, el('span', { class: 'icon-plus' }))) : null,
        deckCover(deck, cards)?.id === c.id ? el('div', { class: 'deck-cover-badge', title: tr('Deck cover') }, starIcon()) : null),
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
    setChrome(`${tr('My decks')} › ${deck.name}`, tcg);
    title.textContent = deck.name;
    meta.textContent = `${tcg.name} · ${fmtName(fmt)}`;
    counter.textContent = deckCountText(fmt, total, owned, copies);
    bar.style.width = `${copies ? (owned / copies) * 100 : 0}%`;
    let issues;
    ({ issues, problems } = deckIssues(deck, cards));
    issuesBox.classList.toggle('ok', !issues.length);
    setChildren(issuesBox, !cards.length ? null : issues.length
      ? [el('div', { class: 'deck-issues-title' }, tr('{format} check', { format: fmtName(fmt) })), el('ul', {}, issues.map((t) => el('li', {}, t)))]
      : el('div', { class: 'deck-issues-title' }, `✓ ${tr('Ready for {format}', { format: fmtName(fmt) })}`));
    issuesBox.classList.toggle('hidden', !cards.length || (!issues.length && !fmt.size && !fmt.min && !specialSlot(fmt)));
  };
  const renderSlot = () => {
    const s = slot();
    if (!s) { setChildren(slotBox); return; }
    const list = special();
    setChildren(slotBox,
      el('div', { class: 'section-head sets-head' },
        el('h2', { class: 'section-title' }, tr(list.length > 1 ? `${s.label}s` : s.label)),
        el('div', { class: 'section-actions' },
          list.length && list.length < s.max
            ? el('button', { class: 'chip', title: tr('Add a second commander (Partner, Background…)'), onclick: () => chooseSpecial(false) },
              tr('Add partner')) : null,
          el('button', { class: 'btn btn-secondary', onclick: () => chooseSpecial(true) },
            tr(list.length ? 'Change {slot}' : 'Choose {slot}', { slot: slotName(s) })))),
      el('div', { class: 'card-grid' },
        list.map(tile),
        list.length ? null : el('button', { class: 'deck-slot-empty', onclick: () => chooseSpecial(true) },
          el('span', { class: 'icon-plus' }), tr('Choose {slot}', { slot: slotName(s) }))));
  };

  // ---- Cartas del mazo, agrupadas por tipo ----
  const cardsTitle = el('h2', { class: 'section-title' });
  const quickChips = el('div', { class: 'chips' });
  const cardsBox = el('div', {});
  const renderCards = () => {
    const main = cards.filter((c) => c.role === 'main');
    cardsTitle.textContent = tr('Deck ({n})', { n: main.reduce((n, c) => n + c.quantity, 0) });
    setChildren(quickChips, [['', tr('All')], ...ownedStatus()].map(([k, label]) =>
      optionChip(label, state.status === k, () => { state.status = k; renderCards(); })));
    const visible = main.filter((c) => !state.status || (deckCardStatus(deck, c) === 'owned') === (state.status === 'owned'));
    const { order, priority = order } = DECK_GROUPS[deck.tcg];
    const groupOf = (c) => priority.find((t) => typesOf(c).includes(t)) || 'Other';
    setChildren(cardsBox, [...order, 'Other'].map((type) => {
      const list = visible.filter((c) => groupOf(c) === type).sort((a, b) => a.name.localeCompare(b.name));
      if (!list.length) return null;
      return el('section', { class: 'deck-group' },
        el('h3', { class: 'deck-group-title' }, `${tr(GROUP_TITLES[type] || type)} (${list.reduce((n, c) => n + c.quantity, 0)})`),
        el('div', { class: 'card-grid' }, list.map(tile)));
    }));
    if (!visible.length) cardsBox.append(el('p', { class: 'muted' },
      tr(main.length ? 'No cards match this filter.' : 'No cards yet. Use Add cards to search for some.')));
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
      title: special ? tr('This card is the deck\'s {slot}', { slot: slotName(slot()) })
        : tr('Click to add a copy to the deck'),
      onclick: () => { if (special) return; sfx.play('add'); addCard(c); },
    },
      el('div', { class: 'card-img-wrap' },
        t.image_url ? el('img', { src: cardImage(t.image_url), alt: c.name, loading: 'lazy' })
          : el('div', { class: 'no-image' }, c.name, el('br'), tr('No image')),
        expandButton(t),
        special ? null : el('div', { class: 'check pick-toggle', title: tr('Add a copy') }, el('span', { class: 'icon-plus' })),
        entry && !special ? el('button', {
          class: 'pick-minus', title: tr('Remove a copy'),
          onclick: (e) => { e.stopPropagation(); sfx.play('remove'); removeCopy(c); },
        }, el('span', { class: 'icon-minus' })) : null,
        entry ? el('div', { class: 'deck-qty' }, special ? tr(slot().label)
          : tr('×{n} in deck', { n: entry.quantity })) : null),
      el('div', { class: 'card-info' },
        el('div', { class: 'card-name' }, `#${c.localId} ${c.name}`),
        el('div', { class: 'card-sub' }, c.set?.name || ''),
        el('div', { class: 'card-sub' }, collectionLine(c))));
  };
  const openPicker = () => {
    refreshPicker = openCardPicker(tcg, {
      search, filterKey: `deck-search:${deck.tcg}`, pickTile: pickerTile,
      subtitle: () => {
        const { fmt, total } = deckStats(deck, cards);
        return `${deck.name} · ${deckCountText(fmt, total, 0, 0)}`;
      },
      hint: tr('Click a card (or +) to add a copy, − to take one out. Your collection does not change.'),
      onClose: () => { refreshPicker = null; },
    });
  };

  const renderAll = () => { renderHeader(); renderSlot(); renderCards(); refreshPicker?.(); };

  const editDeck = async () => {
    const next = await deckDialog({ title: tr('Edit deck'), okLabel: tr('Save'), deck });
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
    const ok = await confirmDialog(tr('Delete deck'),
      tr('Delete "{name}"? Your collection does not change: the cards you own stay marked in their sets.', { name: deck.name }), tr('Delete'));
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
          el('button', { class: 'btn btn-icon', onclick: openPicker }, el('span', { class: 'icon-plus' }), tr('Add cards')),
          el('button', { class: 'btn btn-secondary', onclick: editDeck }, tr('Edit deck')),
          el('button', { class: 'btn btn-danger', onclick: removeDeck }, tr('Delete deck'))))),
    issuesBox,
    slotBox,
    el('div', { class: 'section-head sets-head' }, cardsTitle, quickChips),
    el('p', { class: 'muted hint' }, tr('Click a card to mark whether you own it in this deck: your collection does not change. '
      + 'Hover over it and use − / + to change the copies, or ⋮ for the deck cover and more.')),
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
      placeholder: isCommander ? tr('Search commanders, e.g. Atraxa')
        : tr('Search leaders, e.g. {example}', { example: tcg.example }),
      onkeydown: (e) => { if (e.key === 'Enter') run(); },
    });
    const run = async () => {
      const q = input.value.trim();
      if (q.length < 2) { setChildren(body); return; }
      setChildren(body, el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, tr('Searching…'))));
      try {
        // Scryfall: is:commander = cartas que pueden ser commander (legendarias, o que lo dicen en su texto).
        const found = (await window.tcg.searchCards(isCommander ? `${q} is:commander` : q, tcg.id))
          .filter((c) => isCommander || typesOf(c).includes(slot.type));
        if (input.value.trim() !== q) return;
        setChildren(body, !found.length ? el('p', { class: 'muted' }, tr(isCommander ? 'No commanders found.' : 'No leaders found.')) : [
          el('p', { class: 'muted hint' }, tr('Click a card to make it the {slot}.', { slot: slotName(slot) })),
          el('div', { class: 'card-grid' }, found.map((c) => {
            const t = { ...c, image_url: c.image, local_id: c.localId };
            return el('div', { class: 'card pick deck-pick' + (c.quantity > 0 ? ' owned' : ''), onclick: () => close(c) },
              el('div', { class: 'card-img-wrap' },
                t.image_url ? el('img', { src: cardImage(t.image_url), alt: c.name, loading: 'lazy' })
                  : el('div', { class: 'no-image' }, c.name, el('br'), tr('No image')),
                expandButton(t)),
              el('div', { class: 'card-info' },
                el('div', { class: 'card-name' }, `#${c.localId} ${c.name}`),
                el('div', { class: 'card-sub' }, c.set?.name || ''),
                el('div', { class: 'card-sub' }, collectionLine(c))));
          }))]);
      } catch (err) {
        setChildren(body, el('p', { class: 'error' }, tr('Search failed: {error}', { error: err.message || err })));
      }
    };
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(null); } },
      el('div', { class: 'dialog printings-dialog', role: 'dialog' },
        el('div', { class: 'printings-header' },
          el('div', {}, el('h3', {}, tr('Choose {slot}', { slot: slotName(slot) })),
            el('div', { class: 'search-row' }, input, el('button', { class: 'btn', onclick: run }, tr('Search')))),
          el('button', { class: 'chip', onclick: () => close(null) }, tr('Close'))),
        body));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    input.focus();
  });
}

// Pide confirmación y borra la colección custom. Devuelve true si se ha borrado.
async function deleteCustomCollection(collectionId, name) {
  const ok = await confirmDialog(tr('Delete collection'),
    tr('Delete "{name}"? The cards you own stay marked in their sets.', { name: name || tr('this collection') }), tr('Delete'));
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
          el('button', { class: 'chip', onclick: () => close(false) }, tr('Cancel')),
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
  if (!hasVariants(card) || !card.quantity) return `${tr('Qty:')} ${card.quantity || 0}`;
  const order = (key) => { const i = key ? card.variants.findIndex((v) => v.key === key) : 0; return i < 0 ? Infinity : i; };
  const name = (key) => (key ? card.variants.find((v) => v.key === key)?.short || key : card.variants[0].short);
  return `${tr('Qty:')} ` + Object.keys(qty).sort((a, b) => order(a) - order(b)).map((k) => `${qty[k]} ${name(k)}`).join(' · ');
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
    { label: `${tr('Add 1')}${mainName}`, icon: '+', sound: 'add', onClick: () => setMain(main + 1) },
    {
      label: `${tr('Add several')}${mainName}…`, icon: '++',
      onClick: async () => {
        const n = await askQuantity(card, main, variants?.[0].label);
        if (n) { sfx.play('add'); setMain(main + n); }
      },
    },
    main > 0 ? { label: `${tr('Remove 1')}${mainName}`, icon: '−', sound: 'remove', onClick: () => setMain(main - 1) } : null,
    ...(variants ? [{ separator: true }, ...variants.slice(1).flatMap((v) => [
      { label: `${tr('Add 1')} ${v.label}`, icon: '+', sound: 'add', onClick: () => setVariant(v.key, (qty[v.key] || 0) + 1) },
      qty[v.key] > 0 ? { label: `${tr('Remove 1')} ${v.label} (${qty[v.key]})`, icon: '−', sound: 'remove', onClick: () => setVariant(v.key, qty[v.key] - 1) } : null,
    ])] : []),
    card.quantity > 1 ? { label: tr('Remove all ({n})', { n: card.quantity }), icon: '×', sound: 'remove', onClick: () => setQuantity(0) } : null,
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
    wishlist.has(card.id)
      ? { label: tr('Remove from wishlist'), icon: '✧', sound: 'remove', onClick: () => wishlist.remove(card.id) }
      : { label: tr('Add to wishlist'), icon: '✦', sound: 'add', onClick: () => wishlist.add(tcg.id, card) },
    { label: tr('View price'), icon: '$', onClick: () => showPrices(tcg, card) },
    onAllArts ? { label: tr('View all arts'), icon: '❐', onClick: onAllArts } : null,
    tcg.id === 'pokemon' ? { label: tr('View on {site}', { site: 'TCG Collector' }), icon: '↗', onClick: () => window.tcg.openTcgCollector(link) } : null,
    tcg.id === 'magic' ? { label: tr('View on {site}', { site: 'Scryfall' }), icon: '↗', onClick: () => window.tcg.openScryfall(link) } : null,
    tcg.id === 'magic' ? { label: tr('View on {site}', { site: 'Moxfield' }), icon: '↗', onClick: () => window.tcg.openMoxfield(link) } : null,
    { label: tr('View on {site}', { site: 'TCGplayer' }), icon: '↗', onClick: () => window.tcg.openTcgplayer(link) },
  ];
}

// getMenu (opcional): función que devuelve las opciones del menú ⋮ de la carta.
function cardTile(card, onToggle, lines, getMenu) {
  const owned = card.quantity > 0;
  lines = lines || [card.rarity || ''];
  return el('div', {
    class: 'card' + (owned ? ' owned' : '') + (card.hidden ? ' is-hidden' : ''),
    title: card.quantity > 1 ? tr('You have {n} (change the quantity from ⋮)', { n: card.quantity })
      : tr(owned ? 'Owned (click to unmark)' : 'Missing (click to mark)'),
    // Con más de una copia el clic no cambia nada (se gestiona desde ⋮), así que tampoco suena.
    onclick: (e) => { if (!(card.quantity > 1)) sfx.play(card.quantity > 0 ? 'remove' : 'add'); onToggle(e); },
  },
    el('div', { class: 'card-img-wrap' },
      card.image_url
        ? el('img', { src: cardImage(card.image_url), alt: card.name, loading: 'lazy' })
        : el('div', { class: 'no-image' }, card.name, el('br'), tr('No image')),
      expandButton(card),
      el('div', { class: 'check' }, owned ? '✓' : ''),
      getMenu ? el('button', {
        class: 'card-menu-btn', title: tr('Actions'),
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
    class: 'card-expand-btn', title: tr('View larger'),
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
      el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, tr('Looking for other arts…'))));
    // El header queda fijo arriba y solo se desplaza el cuerpo, para que "Close" siempre se vea.
    const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
      el('div', { class: 'dialog printings-dialog', role: 'dialog' },
        el('div', { class: 'printings-header' },
          el('div', {}, el('h3', {}, tr('All arts')), subtitle),
          el('button', { class: 'chip', onclick: close }, tr('Close'))),
        body));
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);

    window.tcg.getPrintings({ id: card.id, name: card.name, localId: card.local_id, tcg: tcg.id }).then((found) => {
      const cards = found.map((c) => ({ ...c, image_url: c.image, local_id: c.localId }));
      if (!cards.length) cards.push({ ...card }); // la API no la encontró: al menos se muestra la propia carta
      subtitle.textContent = `#${card.local_id} ${card.name} · ${tr(cards.length === 1 ? '{n} art' : '{n} arts', { n: cards.length })}`;
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
      setChildren(body, el('p', { class: 'muted hint' }, tr('Click an art to mark it as owned. The highlighted one is this card.')), grid);
    }).catch((err) => {
      setChildren(body, el('p', { class: 'error' }, tr('Could not load the other arts: {error}', { error: err.message || err })));
    });
  });
}

// ---------- Diálogo "View price" ----------
// Precios actuales de cada versión de la carta (normal, foil, reverse, arte alternativo…), según la API de cada TCG.
function showPrices(tcg, card) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const body = el('div', { class: 'printings-body' },
    el('div', { class: 'loading small' }, el('div', { class: 'spinner' }), el('p', {}, tr('Loading prices…'))));
  const overlay = el('div', { class: 'dialog-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    el('div', { class: 'dialog printings-dialog prices-dialog', role: 'dialog' },
      el('div', { class: 'printings-header' },
        el('div', {}, el('h3', {}, tr('Prices')), el('p', { class: 'muted' }, `#${card.local_id} ${card.name}`)),
        el('button', { class: 'chip', onclick: close }, tr('Close'))),
      body));
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);

  const money = (p) => (p.value == null ? '—'
    : new Intl.NumberFormat(i18n.lang, { style: 'currency', currency: p.currency }).format(p.value));
  window.tcg.getPrices({ id: card.id, tcg: tcg.id, localId: card.local_id, name: card.name }).then((versions) => {
    if (!versions.length) {
      setChildren(body, el('p', { class: 'muted' }, tr('There are no prices for this card yet.')));
      return;
    }
    // Los títulos de versión y los nombres de precio (Market, Low…) vienen del proceso principal en inglés.
    setChildren(body, el('div', { class: 'price-list' }, versions.map((v) =>
      el('div', { class: 'price-version' + (v.current ? ' current' : '') },
        v.image ? el('img', { src: cardImage(v.image), alt: '', loading: 'lazy' }) : null,
        el('div', { class: 'price-info' },
          el('div', { class: 'price-title' }, v.image ? v.title : tr(v.title)),
          el('div', { class: 'price-sub' }, [v.subtitle, v.source].filter(Boolean).join(' · ')),
          el('div', { class: 'price-values' }, v.prices.map((p, i) =>
            el('div', { class: 'price-value' + (i === 0 ? ' main' : '') }, tr(p.label), el('strong', {}, money(p))))))))),
      versions.some((v) => v.current) ? el('p', { class: 'muted hint' }, tr('The highlighted one is this card.')) : null);
  }).catch((err) => {
    setChildren(body, el('p', { class: 'error' }, tr('Could not load the prices: {error}', { error: err.message || err })));
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
        el('h3', {}, tr('Add several')),
        el('p', { class: 'muted' }, `#${card.local_id} ${card.name}${variantLabel ? ` (${variantLabel})` : ''}`
          + ` · ${tr('you currently have {n}', { n: current })}`),
        el('label', { class: 'dialog-label' }, tr('How many do you want to add?'), input),
        el('div', { class: 'dialog-actions' },
          el('button', { class: 'chip', onclick: () => close(null) }, tr('Cancel')),
          el('button', { class: 'btn', onclick: accept }, tr('Add')))));
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
    el('p', {}, tr('Loading the Pokédex… (the first time it downloads every Pokémon card, this takes a few seconds)'))));

  let dex, dexNotes;
  try {
    // La nota de la Pokédex se guarda como la de un set más, con id 'pokedex'.
    const [list, notes] = await Promise.all([window.tcg.getPokedex({ ...opts, kinds: tcgPrefs.pokedexKinds }), window.tcg.getNotes('pokedex')]);
    dex = list;
    dexNotes = { id: 'pokedex', name: 'Pokédex', notes };
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, tr('Could not download the Pokédex. Are you connected to the internet?')),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showPokedex(tcg, opts) }, tr('Retry')));
    return;
  }

  const withCards = dex.filter((p) => dexTotal(p) > 0);
  const owned = dex.filter((p) => dexOwned(p) > 0);
  const grid = el('div', { class: 'dex-grid' });

  const render = () => {
    const q = dexState.search.trim().toLowerCase();
    const visible = dex.filter((p) => {
      if (dexState.filter === 'owned' && !dexOwned(p)) return false;
      if (dexState.filter === 'missing' && (dexOwned(p) || !dexTotal(p))) return false;
      if (!q) return true;
      return p.name_en.toLowerCase().includes(q) || String(p.dex_id) === q;
    });
    setChildren(grid, ...visible.map((p) => dexTile(tcg, p)));
    if (!visible.length) grid.append(el('p', { class: 'muted' }, tr('No Pokémon match.')));
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
    class: 'search', type: 'search', placeholder: tr('Search by name or number…'), value: dexState.search,
    oninput: (e) => { dexState.search = e.target.value; render(); },
  });

  setChildren(view,
    el('div', { class: 'collection-header' },
      el('div', {},
        el('h1', { class: 'title' }, 'Pokédex'),
        el('div', { class: 'counter' }, tr('{owned} / {total} Pokémon collected', { owned: owned.length, total: withCards.length })),
        el('div', { class: 'progress wide' },
          el('div', { class: 'progress-fill', style: `width:${withCards.length ? (owned.length / withCards.length) * 100 : 0}%` }))),
      el('div', { class: 'toolbar' },
        el('div', { class: 'toolbar-row' },
          notesButton(dexNotes),
          el('button', { class: 'btn', onclick: () => { dexState.scroll = 0; showPokedex(tcg, { refresh: true }); } },
            tr('Update from API'))),
        el('div', { class: 'toolbar-row' },
          search,
          el('div', { class: 'chips' },
            filterBtn('all', tr('All')), filterBtn('owned', tr('Collected')), filterBtn('missing', tr('Missing')))))),
    el('p', { class: 'muted hint' },
      tr('Counting: {kinds} (change it in Settings). Greyed out: Pokémon without any of those cards. Click a Pokémon to see its cards and mark the ones you own.',
        { kinds: listNames(tcgPrefs.pokedexKinds.map(dexKindName)) })),
    grid
  );
  render();
  view.scrollTop = dexState.scroll;
}

// Cartas de un Pokémon (y cuántas tienes) contando solo los tipos elegidos en Settings.
const dexTotal = (p) => tcgPrefs.pokedexKinds.reduce((n, k) => n + (p[`${k}_count`] || 0), 0);
const dexOwned = (p) => tcgPrefs.pokedexKinds.reduce((n, k) => n + (p[`owned_${k}_count`] || 0), 0);
const dexKindName = (k) => tr(DEX_KINDS.find((x) => x.id === k).label);

function dexTile(tcg, p) {
  const total = dexTotal(p);
  const enabled = total > 0;
  const name = p.name_en;
  const owned = dexOwned(p) > 0;
  return el('button', {
    class: 'dex-tile' + (enabled ? '' : ' disabled') + (owned ? ' owned' : ''),
    disabled: !enabled,
    title: !enabled ? tr('{name}: no cards of the chosen types', { name })
      : tr('{name}: {n} cards · you own {owned}', { name, n: total, owned: dexOwned(p) }),
    onclick: () => { dexState.scroll = view.scrollTop; navigate(showPokemon, tcg, p.dex_id); },
  },
    el('div', { class: 'dex-img-wrap' + (p.best_image ? ' is-card' : '') },
      el('img', { src: p.best_image ? cardImage(p.best_image) : spriteUrl(p.dex_id), alt: name, loading: 'lazy' })),
    el('div', { class: 'dex-num' }, dexNum(p.dex_id)),
    el('div', { class: 'dex-name' }, name),
    enabled ? el('div', { class: 'dex-count' }, `${dexOwned(p)} / ${total}`) : null);
}

function formatPrice(card) {
  if (card.price == null) return card.price_fetched_at ? tr('No price') : '';
  return new Intl.NumberFormat(i18n.lang, { style: 'currency', currency: card.currency || 'USD' }).format(card.price);
}

async function showPokemon(tcg, dexId) {
  setChrome(`${tcg.name} › Pokédex › …`, tcg);
  view.scrollTop = 0;
  setChildren(view, el('div', { class: 'loading' },
    el('div', { class: 'spinner' }), el('p', {}, tr('Loading cards and prices…'))));

  let data;
  try {
    data = await window.tcg.getPokemon(dexId, tcgPrefs.pokedexKinds);
  } catch (err) {
    setChildren(view,
      el('p', { class: 'error' }, tr('Could not load the cards.')),
      el('p', { class: 'muted' }, String(err.message || err)),
      el('button', { class: 'btn', onclick: () => showPokemon(tcg, dexId) }, tr('Retry')));
    return;
  }
  const { pokemon, cards } = data;
  const name = pokemon.name_en;
  setChrome(`${tcg.name} › Pokédex › ${name}`, tcg);

  // Una sección por cada tipo de carta que cuenta en la Pokédex (Settings), con sus cartas y cuántas tienes.
  const sections = tcgPrefs.pokedexKinds.map((kind) => ({
    kind, cards: cards.filter((c) => c.kind === kind),
    grid: el('div', { class: 'card-grid' }), count: el('span', { class: 'muted' }),
  })).filter((sec) => sec.cards.length);
  const counter = el('div', { class: 'counter' });
  const tiles = (list) => list.map((card) => cardTile(card, async () => {
    if (card.quantity > 1) return; // la cantidad se gestiona desde el set
    card.quantity = card.quantity > 0 ? 0 : 1;
    await window.tcg.setOwned(card.id, card.quantity);
    render();
  }, [`${card.set_name || card.set_id} · #${card.local_id}`, card.rarity || '', formatPrice(card)]));
  const render = () => {
    const ownedOf = (list) => list.filter((c) => c.quantity > 0).length;
    counter.textContent = sections.map((sec) => `${dexKindName(sec.kind)}: ${ownedOf(sec.cards)} / ${sec.cards.length}`).join(' · ');
    for (const sec of sections) {
      sec.count.textContent = ` (${ownedOf(sec.cards)} / ${sec.cards.length})`;
      setChildren(sec.grid, ...tiles(sec.cards));
    }
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
      tr('Mark the cards you own. The Pokédex will show the most expensive one you own. Hover over a card and use ⤢ to view it larger.')),
    sections.length ? null : el('p', { class: 'muted' }, tr('This Pokémon has no cards of the chosen types.')),
    sections.flatMap((sec) => [
      el('h2', { class: 'section-title' + (sec === sections[0] ? '' : ' promos-title') }, dexKindName(sec.kind), sec.count),
      sec.kind === 'promo' ? el('p', { class: 'muted hint' },
        tr('All promos for this Pokémon: the API does not say which ones are Full Art, so all of them are shown.')) : null,
      sec.grid,
    ])
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
const HOVER_TARGETS = '.card, .home-item, .collection-item, .set-tile, .dex-tile:not(.disabled), .deck-tile';
document.addEventListener('mouseover', (e) => {
  const target = e.target.closest?.(HOVER_TARGETS);
  if (target && !target.contains(e.relatedTarget)) sfx.play('hover');
});

renderStaticTexts();
navigate(showHome);
