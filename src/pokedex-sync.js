// Sincroniza la Pokédex y asocia cada carta de Pokémon a su(s) Pokémon.
const { fetchPokedex, fetchPokemonCards, fetchCardPrice, mapLimit } = require('./pokemon-api');

const PRICE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // los precios se refrescan cada semana

const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9♀♂.:' -]/g, '');

// Algunas cartas de TCGdex no traen dexId: buscamos el nombre de especie más largo contenido en el nombre
// de la carta ("Team Rocket's Mewtwo ex" -> Mewtwo, "Iron Valiant ex" -> Iron Valiant).
function makeNameMatcher(species) {
  const byName = new Map(species.map((s) => [normalize(s.nameEn), s.dexId]));
  return (cardName) => {
    const words = normalize(cardName).replace(/'s\b/g, '').split(/\s+/).filter(Boolean);
    for (let len = Math.min(3, words.length); len >= 1; len--) {
      for (let i = 0; i + len <= words.length; i++) {
        const id = byName.get(words.slice(i, i + len).join(' '));
        if (id) return [id];
      }
    }
    return [];
  };
}

async function syncPokedex(db) {
  const [species, cards] = await Promise.all([fetchPokedex(), fetchPokemonCards()]);
  const valid = new Set(species.map((s) => s.dexId));
  const matchName = makeNameMatcher(species);
  const mapped = cards
    .map((c) => ({ ...c, dexIds: (c.dexId?.length ? c.dexId : matchName(c.name)).filter((d) => valid.has(d)) }))
    .filter((c) => c.dexIds.length);
  db.replacePokedex(species, mapped);
}

// Descarga los precios que falten (o estén viejos) de las cartas de un Pokémon.
async function refreshPrices(db, cards) {
  const now = Date.now();
  const stale = cards.filter((c) => !c.price_fetched_at || now - Date.parse(c.price_fetched_at) > PRICE_MAX_AGE_MS);
  if (!stale.length) return false;
  const prices = await mapLimit(stale, 6, async (c) => {
    try {
      return { cardId: c.id, ...(await fetchCardPrice(c.id)) };
    } catch {
      return null; // sin conexión o error puntual: se reintentará la próxima vez
    }
  });
  const ok = prices.filter(Boolean);
  if (ok.length) db.setPrices(ok);
  return ok.length > 0;
}

module.exports = { syncPokedex, refreshPrices };
