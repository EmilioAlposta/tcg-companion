// Cliente de YGOPRODeck (https://ygoprodeck.com/api-guide/): API gratuita y sin API key de Yu-Gi-Oh!.
// Permite 20 peticiones por segundo: van de una en una con una pausa. Cuando no hay cartas responde 400.
// Una carta tiene varias impresiones (card_sets): cada set + código + rareza es una carta distinta en la app.
const { jsonQueue, titleCase, compact, slug } = require('./api-utils');

const BASE = 'https://db.ygoprodeck.com/api/v7';
const getJson = jsonQueue(60, { notFoundStatus: [400, 404] });

// Todos los sets del TCG con su fecha, imagen y nº de cartas. Se agrupan por año en "View sets".
async function fetchSets() {
  const list = (await getJson(`${BASE}/cardsets.php`)) || [];
  return list.filter((s) => s.num_of_cards > 0).map((s) => ({
    id: s.set_name, name: s.set_name, code: s.set_code, serie: s.tcg_date?.slice(0, 4) || 'Other', rank: 0,
    releaseDate: s.tcg_date || null, logo: s.set_image || null, total: s.num_of_cards,
  }));
}

// Atributos para los filtros: Monster / Spell / Trap, su subtipo (Effect, Fusion… o Quick-Play, Field…) y el atributo.
function attrsOf(c) {
  const kind = /Monster/.test(c.type) ? 'Monster' : /Spell/.test(c.type) ? 'Spell' : /Trap/.test(c.type) ? 'Trap'
    : titleCase(String(c.type).replace(/ Card$/, ''));
  const subtype = kind === 'Monster' ? String(c.type).split(' ').filter((w) => !['Monster', 'Card'].includes(w)) : [c.race];
  return compact({ type: kind, subtype, colors: c.attribute ? [titleCase(c.attribute)] : [] });
}

// Una carta de la app por cada impresión (de los sets que pasen `keep`).
function toPrintings(c, keep = () => true) {
  const image = c.card_images?.[0]?.image_url_small || null;
  const attrs = attrsOf(c);
  return (c.card_sets || []).filter((s) => keep(s.set_name)).map((s) => {
    const rarity = String(s.set_rarity_code || '').replace(/[()]/g, '') || slug(s.set_rarity);
    return {
      id: `ygo-${s.set_code}-${rarity}`,
      localId: s.set_code,
      name: c.name,
      rarity: s.set_rarity || null,
      image,
      set: { id: s.set_name, name: s.set_name },
      market_price: Number(s.set_price) > 0 ? Number(s.set_price) : undefined,
      attrs,
      ygo_id: c.id,
    };
  });
}

// La API repite a veces la misma impresión: se queda la primera.
const unique = (cards) => [...new Map(cards.map((c) => [c.id, c])).values()];

async function fetchSetCards(setName) {
  const json = await getJson(`${BASE}/cardinfo.php?cardset=${encodeURIComponent(setName)}`);
  return unique((json?.data || []).flatMap((c) => toPrintings(c, (s) => s === setName)));
}

// Busca por nombre (parcial) en todos los sets.
async function searchCards(name) {
  const json = await getJson(`${BASE}/cardinfo.php?fname=${encodeURIComponent(name)}`);
  return unique((json?.data || []).flatMap((c) => toPrintings(c)));
}

// La carta con sus impresiones y precios, por nombre exacto (sin convertir).
async function fetchCard(name) {
  const json = await getJson(`${BASE}/cardinfo.php?name=${encodeURIComponent(name)}`);
  return json?.data?.[0] || null;
}

// Todas las impresiones de una carta: mismo nombre exacto en cualquier set.
async function fetchPrintings(name) {
  const card = await fetchCard(name);
  return card ? unique(toPrintings(card)) : [];
}

module.exports = { fetchSets, fetchSetCards, searchCards, fetchCard, fetchPrintings, toPrintings };
