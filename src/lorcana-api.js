// Cliente de Lorcast (https://lorcast.com/docs/api): API gratuita y sin API key de Disney Lorcana.
// Pide como mucho 10 peticiones por segundo. Son unas 3.500 cartas: el catálogo entero se descarga de una vez
// (una petición por set) y el buscador funciona sin conexión, como en One Piece.
const { jsonQueue, titleCase, compact } = require('./api-utils');

const BASE = 'https://api.lorcast.com/v0';
const getJson = jsonQueue(110);

// Las rarezas que solo existen en foil no llevan la versión normal.
const FOIL_ONLY = ['Enchanted', 'Epic', 'Iconic', 'Promo'];

function toCard(c) {
  const rarity = titleCase(String(c.rarity || '').replace(/_/g, ' ')) || null;
  const name = c.version ? `${c.name} - ${c.version}` : c.name;
  const usd = Number(c.prices?.usd) || Number(c.prices?.usd_foil) || null;
  return {
    id: `lor-${c.id}`,
    localId: c.collector_number,
    name,
    rarity,
    illustrator: c.illustrators?.join(', ') || null,
    image: c.image_uris?.digital?.normal || null,
    set: { id: c.set.code, name: c.set.name },
    market_price: usd ?? undefined,
    attrs: compact({ type: c.type || [], colors: c.inks || (c.ink ? [c.ink] : []) }),
    variantList: FOIL_ONLY.includes(rarity) ? undefined
      : [{ key: 'normal', label: 'Normal', short: 'Normal' }, { key: 'foil', label: 'Foil', short: 'Foil' }],
    legal: Object.entries(c.legalities || {}).filter(([, v]) => v === 'legal').map(([f]) => f),
    printKey: name,
    tcgplayer_id: c.tcgplayer_id || undefined,
  };
}

// Sets numerados (The First Chapter = 1…) primero, del más nuevo al más antiguo; después promos y sets especiales.
async function fetchCatalog() {
  const sets = (await getJson(`${BASE}/sets`))?.results || [];
  const out = [];
  for (const [i, s] of sets.entries()) {
    const cards = (await getJson(`${BASE}/sets/${encodeURIComponent(s.code)}/cards`)) || [];
    const main = /^\d+$/.test(s.code);
    out.push({
      id: s.code, name: s.name, serie: main ? 'Main Sets' : 'Promos & Special Sets', releaseDate: s.released_at || null,
      rank: main ? 5000 + Number(s.code) : 1000 + i, cards: cards.map(toCard),
    });
  }
  return out;
}

// Carta con sus precios actuales, a partir del id de la app (sin convertir).
const fetchCard = (cardId) => getJson(`${BASE}/cards/${encodeURIComponent(String(cardId).replace(/^lor-/, ''))}`);

module.exports = { fetchCatalog, fetchCard };
