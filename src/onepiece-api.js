// Cliente de OPTCG API (https://optcgapi.com): API gratuita y sin API key del One Piece Card Game.
// No tiene logos ni fechas de los sets, pero sí todas las cartas (con sus variantes) y su precio de TCGplayer.
const BASE = 'https://optcgapi.com/api';
const PROMO_SET_ID = 'PROMO';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The API responded ${res.status} for ${url}`);
  return res.json();
}

const SERIES = [
  [/^OP/, 'Booster Packs'],
  [/^EB/, 'Extra Boosters'],
  [/^PRB/, 'Premium Boosters'],
  [/^ST/, 'Starter Decks'],
];
const serieOf = (setId) => (setId === PROMO_SET_ID ? 'Promos' : SERIES.find(([re]) => re.test(setId))?.[1] || 'Other');

// Convierte las cartas de la API al formato que guarda la base de datos.
// El id incluye el set: la API repite card_image_id entre sets (reimpresiones, promos…).
function toCards(raw, setId) {
  const seen = new Map(); // card_image_id -> nombres ya vistos en este set
  const out = [];
  for (const c of raw) {
    const imageId = c.card_image_id || c.card_set_id;
    const names = seen.get(imageId) || [];
    if (names.includes(c.card_name)) continue; // la API a veces devuelve la misma carta dos veces
    names.push(c.card_name);
    seen.set(imageId, names);
    out.push({
      ...c,
      id: `op-${setId}-${imageId}${names.length > 1 ? `-${names.length}` : ''}`,
      localId: c.card_set_id,
      name: c.card_name,
      rarity: c.rarity || null,
      image: c.card_image || null,
      set: { id: setId, name: setId === PROMO_SET_ID ? 'Promotion Cards' : c.set_name },
    });
  }
  return out;
}

// Todo el catálogo: los sets (boosters, starter decks y una colección con las promos) con sus cartas.
// Son unos pocos MB, así que se descarga de una vez y el buscador funciona sin conexión.
async function fetchCatalog() {
  const [setList, setCards, deckCards, promos] = await Promise.all([
    getJson(`${BASE}/allSets/`), getJson(`${BASE}/allSetCards/`),
    getJson(`${BASE}/allSTCards/`), getJson(`${BASE}/allPromos/`),
  ]);
  // La API lista los boosters del más antiguo al más nuevo; los starter decks van por número.
  const order = new Map(setList.map((s, i) => [s.set_id, i]));
  const deckNum = (id) => Number(id.match(/\d+/)?.[0] || 0);
  const groups = new Map();
  for (const c of [...setCards, ...deckCards]) {
    if (!groups.has(c.set_id)) groups.set(c.set_id, { name: c.set_name, raw: [] });
    groups.get(c.set_id).raw.push(c);
  }
  const sets = [...groups].map(([id, g]) => ({
    id, name: g.name, serie: serieOf(id), cards: toCards(g.raw, id),
    rank: id.startsWith('ST') ? deckNum(id) : 1000 + (order.get(id) ?? 999),
  }));
  sets.push({ id: PROMO_SET_ID, name: 'Promotion Cards', serie: 'Promos', cards: toCards(promos, PROMO_SET_ID), rank: 0 });
  return sets;
}

// Vuelve a descargar las cartas de un set.
async function fetchSetCards(setId) {
  const url = setId === PROMO_SET_ID ? `${BASE}/allPromos/`
    : setId.startsWith('ST') ? `${BASE}/decks/${encodeURIComponent(setId)}/`
    : `${BASE}/sets/${encodeURIComponent(setId)}/`;
  return toCards(await getJson(url), setId);
}

module.exports = { fetchCatalog, fetchSetCards };
