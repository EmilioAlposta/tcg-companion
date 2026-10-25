// Cliente de TCGdex (https://tcgdex.dev): API gratuita y sin API key.
const BASE = 'https://api.tcgdex.net/v2/en';
const GRAPHQL = 'https://api.tcgdex.net/v2/graphql';
const { cardAttrs, cardVariants } = require('./card-attrs');

// Rarezas de TCGdex que consideramos "Full Art" (cartas de Pokémon a toda la carta).
const FULL_ART_RARITIES = [
  'Ultra Rare',                 // Full Art EX / GX / V / ex
  'Illustration rare',
  'Special illustration rare',
  'Hyper rare',
  'Mega Hyper Rare',
  'Secret Rare',                // Rainbow, Gold, Alt Arts de Espada/Escudo
  'Shiny Ultra Rare',
  'Shiny rare V',
  'Shiny rare VMAX',
  'Black White Rare',
];

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`The API responded ${res.status} for ${url}`);
  return res.json();
}

// Ejecuta fn sobre items con un máximo de `limit` peticiones simultáneas.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Devuelve el detalle completo de las cartas de un set, filtradas por nombre.
async function fetchSetCards(setId, nameFilter) {
  const set = await getJson(`${BASE}/sets/${encodeURIComponent(setId)}`);
  const filter = nameFilter ? nameFilter.toLowerCase() : null;
  const briefs = set.cards.filter((c) => !filter || c.name.toLowerCase().includes(filter));
  return mapLimit(briefs, 6, (c) => getJson(`${BASE}/cards/${encodeURIComponent(c.id)}`));
}

// Lista de todas las especies de la Pokédex nacional, con nombre en inglés y español (PokeAPI).
async function fetchPokedex() {
  try {
    const query = `{ pokemon_v2_pokemonspecies(order_by: {id: asc}) {
      id name pokemon_v2_pokemonspeciesnames(where: {language_id: {_in: [7, 9]}}) { name language_id } } }`;
    const json = await getJson('https://beta.pokeapi.co/graphql/v1beta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return json.data.pokemon_v2_pokemonspecies.map((s) => {
      const names = s.pokemon_v2_pokemonspeciesnames;
      const en = names.find((n) => n.language_id === 9)?.name || titleCase(s.name);
      const es = names.find((n) => n.language_id === 7)?.name || en;
      return { dexId: s.id, nameEn: en, nameEs: es };
    });
  } catch {
    // Respaldo: la API REST solo da el identificador ("mr-mime"), lo convertimos a título.
    const json = await getJson('https://pokeapi.co/api/v2/pokemon-species?limit=2000');
    return json.results.map((s) => {
      const dexId = Number(s.url.match(/\/(\d+)\/?$/)[1]);
      const name = titleCase(s.name);
      return { dexId, nameEn: name, nameEs: name };
    }).sort((a, b) => a.dexId - b.dexId);
  }
}

function titleCase(slug) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Todas las cartas de Pokémon (excluye entrenadores, energías y TCG Pocket; unas 20.000, en una sola consulta),
// con su tipo para la Pokédex: 'fullart' (rarezas de FULL_ART_RARITIES), 'promo' (TCGdex no indica si una promo
// es Full Art) u 'other' (el resto: comunes, raras, holo…). En Settings se elige qué tipos cuentan.
async function fetchPokemonCards() {
  const pocket = await getJson(`${BASE}/series/tcgp`).then((s) => new Set(s.sets.map((x) => x.id))).catch(() => new Set());
  const data = await graphql(`{ cards(filters: {category: "Pokemon"}) { id localId name image dexId rarity set { id name } } }`);
  return (data.cards || [])
    .map((c) => ({ ...c, kind: c.rarity === 'Promo' ? 'promo' : FULL_ART_RARITIES.includes(c.rarity) ? 'fullart' : 'other' }))
    .filter((c) => !pocket.has(c.set?.id) && (c.image || c.kind === 'promo'));
}

async function graphql(query) {
  const json = await getJson(GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return json.data || {};
}

// Todos los sets del TCG (sin TCG Pocket), con su serie, fecha y nº de cartas.
async function fetchSets() {
  const data = await graphql(`{ sets { id name releaseDate logo serie { id name } cardCount { total } } }`);
  return (data.sets || []).filter((s) => s.serie?.id !== 'tcgp');
}

// Busca cartas por nombre en todos los sets (TCGdex busca por "contiene", sin distinguir mayúsculas).
async function searchCards(name) {
  const data = await graphql(`{ cards(filters: {name: ${JSON.stringify(name)}}) {
    id localId name image rarity category types stage suffix trainerType energyType set { id name }
    hp attacks { name damage } abilities { name } variants_detailed { type subtype stamp foil } } }`);
  return (data.cards || []).map(({ category, types, stage, suffix, trainerType, energyType, hp, attacks, abilities, variants_detailed, ...c }) => ({
    ...c, rarity: c.rarity === 'None' ? null : c.rarity,
    attrs: cardAttrs({ category, types, stage, suffix, trainerType, energyType }),
    variants: cardVariants({ variants_detailed }),
    printKey: printKey({ name: c.name, hp, attacks, abilities }),
  }));
}

// Identifica "la misma carta" con otro arte: mismo nombre, HP, habilidades y ataques (nombre y daño).
// Así un Charizard ex de 151 no se mezcla con el de Paldean Fates, que se llama igual pero juega distinto.
// TCGdex a veces trae ataques o nombres nulos en cartas antiguas: se tratan como vacíos.
function printKey({ name, hp, attacks, abilities }) {
  const lower = (s) => String(s ?? '').toLowerCase();
  return JSON.stringify([
    lower(name), hp ?? null,
    (abilities || []).filter(Boolean).map((a) => lower(a.name)),
    (attacks || []).filter(Boolean).map((a) => [lower(a.name), a.damage ?? null]),
  ]);
}

// Precio de mercado de una carta: TCGplayer (USD) si existe, si no Cardmarket (EUR).
async function fetchCardPrice(cardId) {
  const card = await getJson(`${BASE}/cards/${encodeURIComponent(cardId)}`);
  const tp = card.pricing?.tcgplayer;
  if (tp) {
    const prices = Object.values(tp)
      .filter((v) => v && typeof v === 'object')
      .map((v) => v.marketPrice ?? v.midPrice)
      .filter((p) => typeof p === 'number');
    if (prices.length) return { price: Math.max(...prices), currency: 'USD' };
  }
  const cm = card.pricing?.cardmarket;
  const cmPrice = cm?.trend || cm?.avg || cm?.['trend-holo'];
  if (cmPrice) return { price: cmPrice, currency: 'EUR' };
  return { price: null, currency: null };
}

// Id de producto de TCGplayer de una carta (null si TCGdex todavía no lo tiene).
async function fetchTcgplayerProductId(cardId) {
  const card = await getJson(`${BASE}/cards/${encodeURIComponent(cardId)}`);
  const variants = Object.values(card.pricing?.tcgplayer || {}).filter((v) => v && typeof v === 'object');
  return variants.find((v) => v.productId)?.productId ?? null;
}

// Precios de TCGplayer y Cardmarket de una carta, tal como los da TCGdex (null si no tiene).
async function fetchCardPricing(cardId) {
  return (await getJson(`${BASE}/cards/${encodeURIComponent(cardId)}`)).pricing || null;
}

module.exports = {
  fetchSetCards, fetchSets, searchCards, fetchPokedex, fetchPokemonCards, fetchCardPrice, fetchCardPricing, fetchTcgplayerProductId,
  mapLimit, FULL_ART_RARITIES,
};
