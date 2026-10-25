// Cliente de Scryfall (https://scryfall.com/docs/api): API gratuita y sin API key de Magic: The Gathering.
// Pide un User-Agent propio y como mucho ~10 peticiones por segundo: cada petición empieza al menos 100 ms después
// de la anterior (pueden estar varias en curso a la vez, así las páginas de un set llegan en paralelo).
const BASE = 'https://api.scryfall.com';
const HEADERS = { 'User-Agent': 'TCGCompanion/0.1', Accept: 'application/json' };
const MAX_SEARCH_PAGES = 3; // 175 cartas por página: el buscador devuelve como mucho 525
const PAGE_SIZE = 175;

let nextStart = 0;
async function getJson(url) {
  const wait = Math.max(0, nextStart - Date.now());
  nextStart = Math.max(Date.now(), nextStart) + 100;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(url, { headers: HEADERS });
  // 404 en una búsqueda = no hay cartas (Scryfall no devuelve una lista vacía).
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The API responded ${res.status} for ${url}`);
  return res.json();
}

// Tipos de set de Scryfall: nombre de la sección en "View sets" y su orden.
const SET_TYPES = [
  ['expansion', 'Expansions'], ['core', 'Core Sets'], ['masters', 'Masters'], ['draft_innovation', 'Draft Innovation'],
  ['commander', 'Commander'], ['funny', 'Un-sets'], ['starter', 'Starter Decks'], ['duel_deck', 'Duel Decks'],
  ['premium_deck', 'Premium Decks'], ['from_the_vault', 'From the Vault'], ['spellbook', 'Signature Spellbooks'],
  ['arsenal', 'Arsenal'], ['masterpiece', 'Masterpiece Series'], ['box', 'Box Sets'], ['planechase', 'Planechase'],
  ['archenemy', 'Archenemy'], ['vanguard', 'Vanguard'], ['minigame', 'Minigames'], ['promo', 'Promos'],
  ['token', 'Tokens'], ['memorabilia', 'Memorabilia'],
];
const serieOf = (type) => SET_TYPES.find(([t]) => t === type)?.[1] || 'Other';
const rankOf = (type) => { const i = SET_TYPES.findIndex(([t]) => t === type); return i < 0 ? SET_TYPES.length : i; };

// Todos los sets en papel (sin los de MTG Arena / MTGO), con su tipo, fecha, icono y nº de cartas.
async function fetchSets() {
  const json = await getJson(`${BASE}/sets`);
  return (json?.data || []).filter((s) => !s.digital && s.card_count > 0).map((s) => ({
    id: s.code, name: s.name, serie: serieOf(s.set_type), rank: rankOf(s.set_type),
    releaseDate: s.released_at || null, logo: s.icon_svg_uri || null, total: s.card_count,
  }));
}

// Formatos de los mazos de la app cuya legalidad se guarda con cada carta.
const DECK_FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander'];

const RARITIES = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'Mythic Rare', special: 'Special', bonus: 'Bonus' };

// Convierte una carta de Scryfall al formato que guarda la base de datos. Solo se guardan los campos
// que usa la app (la carta completa ocupa varios KB y algunos sets tienen miles).
function toCard(c) {
  const faces = Array.isArray(c.card_faces) ? c.card_faces : [];
  const images = c.image_uris || faces[0]?.image_uris;
  const colors = c.colors || [...new Set(faces.flatMap((f) => f.colors || []))];
  const price = [c.prices?.usd, c.prices?.usd_foil, c.prices?.usd_etched].map(Number).find((p) => p > 0);
  return {
    id: `mtg-${c.id}`,
    localId: c.collector_number,
    name: c.name,
    rarity: RARITIES[c.rarity] || c.rarity || null,
    illustrator: c.artist || null,
    image: images?.normal || null,
    set: { id: c.set, name: c.set_name },
    market_price: price ?? undefined,
    type_line: c.type_line || faces.map((f) => f.type_line).filter(Boolean).join(' // '),
    colors,
    color_identity: c.color_identity,
    // Formatos en los que la carta es legal (las restringidas de Vintage cuentan como legales).
    legal: DECK_FORMATS.filter((f) => ['legal', 'restricted'].includes(c.legalities?.[f])),
    finishes: c.finishes,
    frame: c.frame,
    frame_effects: c.frame_effects,
    border_color: c.border_color,
    full_art: c.full_art || undefined,
    promo: c.promo || undefined,
    oracle_id: c.oracle_id || faces[0]?.oracle_id,
    tcgplayer_id: c.tcgplayer_id,
    scryfall_uri: c.scryfall_uri,
  };
}

// Todas las páginas de una búsqueda (175 cartas por página, ~1 MB cada una). Las páginas se piden a la vez: con
// expected (las cartas que se esperan, p. ej. las del set) desde el principio; si no, después de la primera, que
// dice cuántas cartas hay. Una página de más devuelve 404 y no añade nada.
async function searchAll(query, { order = 'set', maxPages = Infinity, expected = 0 } = {}) {
  const params = new URLSearchParams({ q: query, unique: 'prints', order, include_extras: 'true', include_variations: 'true' });
  const pageUrl = (page) => `${BASE}/cards/search?${params}&page=${page}`;
  const pagesFor = (cards) => Math.min(maxPages, Math.max(1, Math.ceil(cards / PAGE_SIZE)));
  const guessed = pagesFor(expected);
  const results = await Promise.all(Array.from({ length: guessed }, (_, i) => getJson(pageUrl(i + 1))));
  const [first] = results;
  if (!first) return [];
  const pages = first.has_more ? pagesFor(first.total_cards) : 1;
  if (pages > guessed) {
    results.push(...await Promise.all(Array.from({ length: pages - guessed }, (_, i) => getJson(pageUrl(guessed + i + 1)))));
  }
  return results.slice(0, pages).flatMap((json) => (json?.data || []).map(toCard));
}

// Todas las cartas de un set, por número de coleccionista. expected: las cartas del set según la lista de sets.
const fetchSetCards = (setCode, expected = 0) => searchAll(`e:${setCode} game:paper`, { expected });

// Busca por nombre en todos los sets (de la más nueva a la más antigua).
const searchCards = (name) => searchAll(`${name} game:paper`, { order: 'released', maxPages: MAX_SEARCH_PAGES });

// Todas las impresiones de una carta: mismo nombre exacto en cualquier set.
const fetchPrintings = (name) => searchAll(`!"${String(name).replace(/"/g, '')}" game:paper`, { order: 'released' });

// Carta completa de Scryfall (con sus precios actuales) a partir del id de la app.
const fetchCard = (cardId) => getJson(`${BASE}/cards/${encodeURIComponent(String(cardId).replace(/^mtg-/, ''))}`);

module.exports = { fetchSets, fetchSetCards, searchCards, fetchPrintings, fetchCard };
