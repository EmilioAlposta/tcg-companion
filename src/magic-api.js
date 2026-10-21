// Cliente de Scryfall (https://scryfall.com/docs/api): API gratuita y sin API key de Magic: The Gathering.
// Pide un User-Agent propio y como mucho ~10 peticiones por segundo: las peticiones van de una en una con una pausa.
const BASE = 'https://api.scryfall.com';
const HEADERS = { 'User-Agent': 'TCGCompanion/0.1', Accept: 'application/json' };
const MAX_SEARCH_PAGES = 3; // 175 cartas por página: el buscador devuelve como mucho 525

let queue = Promise.resolve();
function getJson(url) {
  const run = queue.then(async () => {
    const res = await fetch(url, { headers: HEADERS });
    // 404 en una búsqueda = no hay cartas (Scryfall no devuelve una lista vacía).
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`The API responded ${res.status} for ${url}`);
    return res.json();
  });
  queue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 100)));
  return run;
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

// Recorre las páginas de una búsqueda (175 cartas por página).
async function searchAll(query, { order = 'set', maxPages = Infinity } = {}) {
  const params = new URLSearchParams({ q: query, unique: 'prints', order, include_extras: 'true', include_variations: 'true' });
  let url = `${BASE}/cards/search?${params}`;
  const out = [];
  for (let page = 0; url && page < maxPages; page++) {
    const json = await getJson(url);
    if (!json) break;
    out.push(...json.data.map(toCard));
    url = json.has_more ? json.next_page : null;
  }
  return out;
}

// Todas las cartas de un set, por número de coleccionista.
const fetchSetCards = (setCode) => searchAll(`e:${setCode} game:paper`);

// Busca por nombre en todos los sets (de la más nueva a la más antigua).
const searchCards = (name) => searchAll(`${name} game:paper`, { order: 'released', maxPages: MAX_SEARCH_PAGES });

// Todas las impresiones de una carta: mismo nombre exacto en cualquier set.
const fetchPrintings = (name) => searchAll(`!"${String(name).replace(/"/g, '')}" game:paper`, { order: 'released' });

// Carta completa de Scryfall (con sus precios actuales) a partir del id de la app.
const fetchCard = (cardId) => getJson(`${BASE}/cards/${encodeURIComponent(String(cardId).replace(/^mtg-/, ''))}`);

module.exports = { fetchSets, fetchSetCards, searchCards, fetchPrintings, fetchCard };
