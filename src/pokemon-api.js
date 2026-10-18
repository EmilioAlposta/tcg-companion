// Cliente de TCGdex (https://tcgdex.dev): API gratuita y sin API key.
const BASE = 'https://api.tcgdex.net/v2/en';
const GRAPHQL = 'https://api.tcgdex.net/v2/graphql';

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
  if (!res.ok) throw new Error(`La API respondió ${res.status} para ${url}`);
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

// Todas las cartas Full Art de Pokémon y todas las promos (excluye entrenadores, energías y TCG Pocket).
// Las promos van aparte (kind = 'promo') porque TCGdex no indica si una promo es Full Art.
async function fetchFullArtCards() {
  const pocket = await getJson(`${BASE}/series/tcgp`).then((s) => new Set(s.sets.map((x) => x.id))).catch(() => new Set());
  const rarities = [...FULL_ART_RARITIES, 'Promo'];
  const lists = await mapLimit(rarities, 3, async (rarity) => {
    const query = `{ cards(filters: {rarity: ${JSON.stringify(rarity)}}) {
      id localId name image dexId rarity category set { id name } } }`;
    const json = await getJson(GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const kind = rarity === 'Promo' ? 'promo' : 'fullart';
    return (json.data?.cards || []).map((c) => ({ ...c, kind }));
  });
  return lists.flat().filter((c) =>
    c.category === 'Pokemon' && !pocket.has(c.set?.id) && (c.image || c.kind === 'promo'));
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

module.exports = { fetchSetCards, fetchPokedex, fetchFullArtCards, fetchCardPrice, mapLimit, FULL_ART_RARITIES };
