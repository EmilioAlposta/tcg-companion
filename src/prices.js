// Precios de las versiones de una carta para el diálogo "View price".
// Devuelve una lista de versiones: { title, subtitle?, image?, current?, source, prices: [{ label, value, currency }] }.
// value null = la API no tiene ese precio.
const { fetchCardPricing } = require('./pokemon-api');
const onePiece = require('./onepiece-api');
const magic = require('./magic-api');

const titleCase = (slug) => String(slug).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// Pokémon (TCGdex): TCGplayer da un precio por versión (normal, holofoil, reverse-holofoil…);
// Cardmarket, uno para la carta normal y otro para la holo / reverse.
async function pokemonPrices(cardId) {
  const pricing = await fetchCardPricing(cardId);
  const out = [];
  for (const [key, p] of Object.entries(pricing?.tcgplayer || {})) {
    if (!p || typeof p !== 'object') continue;
    out.push({ title: titleCase(key), source: 'TCGplayer', prices: [
      { label: 'Market', value: p.marketPrice, currency: 'USD' }, { label: 'Low', value: p.lowPrice, currency: 'USD' },
      { label: 'Mid', value: p.midPrice, currency: 'USD' }, { label: 'High', value: p.highPrice, currency: 'USD' },
    ] });
  }
  const cm = pricing?.cardmarket;
  for (const [title, suffix] of [['Normal', ''], ['Holo / Reverse', '-holo']]) {
    const values = ['trend', 'avg', 'low', 'avg30'].map((k) => cm?.[k + suffix]);
    if (!values.some((v) => v)) continue;
    out.push({ title, source: 'Cardmarket', prices: ['Trend', 'Average', 'Low', '30-day average']
      .map((label, i) => ({ label, value: values[i] || null, currency: 'EUR' })) });
  }
  return out;
}

// Magic (Scryfall): precio de cada acabado (normal, foil, etched) en TCGplayer (USD) y Cardmarket (EUR).
const FINISHES = [['nonfoil', 'Non-foil', 'usd', 'eur'], ['foil', 'Foil', 'usd_foil', 'eur_foil'], ['etched', 'Etched foil', 'usd_etched', null]];

async function magicPrices(cardId) {
  const card = await magic.fetchCard(cardId);
  if (!card) return [];
  const num = (v) => (v == null ? null : Number(v));
  return FINISHES.filter(([f]) => (card.finishes || []).includes(f)).map(([, title, usd, eur]) => ({
    title, source: 'TCGplayer · Cardmarket', prices: [
      { label: 'TCGplayer', value: num(card.prices?.[usd]), currency: 'USD' },
      eur ? { label: 'Cardmarket', value: num(card.prices?.[eur]), currency: 'EUR' } : null,
    ].filter(Boolean),
  }));
}

// One Piece (OPTCG API): cada versión (normal, parallel, manga…) es una carta aparte. Se listan todas las del mismo
// código guardadas en la base de datos, con el precio actual de la API si responde (si no, el de la última descarga).
async function onePiecePrices(db, cardId, code) {
  const stored = db.onePiecePrintings(code);
  const live = new Map();
  try {
    for (const c of await onePiece.fetchCardVersions(code)) live.set(c.card_image, c);
  } catch {
    // sin conexión: se usan los precios guardados
  }
  return stored.map((c) => {
    const now = live.get(c.image);
    return {
      title: c.name, subtitle: [c.set.name, c.rarity].filter(Boolean).join(' · '), image: c.image, current: c.id === cardId,
      source: 'TCGplayer', prices: [
        { label: 'Market', value: now ? now.market_price : c.price, currency: 'USD' },
        { label: 'Lowest listing', value: now ? now.inventory_price : c.inventory, currency: 'USD' },
      ],
    };
  });
}

function cardPrices(db, { id, tcg, localId }) {
  if (tcg === 'magic') return magicPrices(id);
  if (tcg === 'onepiece') return onePiecePrices(db, id, localId);
  return pokemonPrices(id);
}

module.exports = { cardPrices };
