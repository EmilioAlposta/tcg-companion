// Atributos de una carta para los filtros avanzados, a partir de los datos crudos de la API
// (detalle de TCGdex, fila de OPTCG API o carta de Scryfall). Devuelve null si los datos no traen nada filtrable.
const OP_COLORS = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];
const OP_ATTRIBUTES = ['Slash', 'Strike', 'Ranged', 'Special', 'Wisdom'];
const MTG_TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle', 'Kindred',
  'Token', 'Emblem'];
const MTG_SUPERTYPES = ['Legendary', 'Basic', 'Snow', 'World'];
const MTG_COLORS = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

function cardAttrs(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.category) {
    // TCGdex: Pokemon / Trainer / Energy
    const subtype = raw.trainerType || (raw.energyType ? `${raw.energyType} Energy` : null);
    return compact({
      type: raw.category === 'Pokemon' ? 'Pokémon' : raw.category,
      subtype,
      colors: Array.isArray(raw.types) ? raw.types : [],
      stage: raw.stage ? raw.stage.replace(/^Stage(\d)$/, 'Stage $1') : null,
      mechanic: raw.suffix || null,
    });
  }
  if (raw.card_type) {
    // OPTCG API: Leader / Character / Event / Stage
    const words = (s) => String(s || '').split(/[\s/]+/);
    return compact({
      type: raw.card_type,
      colors: words(raw.card_color).filter((w) => OP_COLORS.includes(w)),
      attributes: [...new Set(words(raw.attribute).filter((w) => OP_ATTRIBUTES.includes(w)))],
      // Las versiones alternativas tienen _p1, _r1… en el id de la imagen (las promos _pr1 no lo son).
      version: /_[pr]\d/i.test(raw.card_image_id || '') ? 'Alternate art' : 'Standard',
    });
  }
  if (raw.type_line) {
    // Scryfall: tipos y supertipos de todas las caras (lo que va antes de "—"); Tribal es el nombre antiguo de Kindred.
    const words = raw.type_line.split('//').flatMap((face) => face.split('—')[0].trim().split(/\s+/))
      .map((w) => (w === 'Tribal' ? 'Kindred' : w));
    const colors = (raw.colors || []).map((c) => MTG_COLORS[c]).filter(Boolean);
    const effects = raw.frame_effects || [];
    const treatments = [
      raw.border_color === 'borderless' && 'Borderless',
      effects.includes('showcase') && 'Showcase',
      effects.includes('extendedart') && 'Extended art',
      raw.full_art && 'Full art',
      ['1993', '1997'].includes(raw.frame) && 'Old frame',
      raw.promo && 'Promo',
    ].filter(Boolean);
    return compact({
      type: [...new Set(words.filter((w) => MTG_TYPES.includes(w)))],
      supertype: [...new Set(words.filter((w) => MTG_SUPERTYPES.includes(w)))],
      colors: colors.length ? [...colors, ...(colors.length > 1 ? ['Multicolor'] : [])] : ['Colorless'],
      treatment: treatments.length ? treatments : ['Regular'],
    });
  }
  return null;
}

// Versiones impresas de una carta de Pokémon (normal, reverse holo, con sello, 1ª edición…), de TCGdex.
// Cada una: { key, label, short }. La primera es la versión principal: la que se marca al hacer clic en la carta.
// Devuelve null si la API no trae versiones (One Piece: allí cada versión ya es una carta distinta).
// En Magic las versiones son los acabados de Scryfall (normal, foil, etched); la principal es la primera.
const VARIANT_TYPES = { normal: ['Normal', 'Normal'], holo: ['Holo', 'Holo'], reverse: ['Reverse Holo', 'Reverse'] };
const MTG_FINISHES = { nonfoil: ['Non-foil', 'Normal'], foil: ['Foil', 'Foil'], etched: ['Etched foil', 'Etched'] };

function cardVariants(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type_line && Array.isArray(raw.finishes)) {
    return raw.finishes.length ? raw.finishes.map((f) => {
      const [label, short] = MTG_FINISHES[f] || [titleCase(f), titleCase(f)];
      return { key: f, label, short };
    }) : null;
  }
  let list = Array.isArray(raw.variants_detailed) ? raw.variants_detailed.filter((v) => v?.type) : [];
  // Datos antiguos (o sin detalle): solo trae qué versiones existen.
  if (!list.length && raw.variants && typeof raw.variants === 'object') {
    const v = raw.variants;
    list = [
      v.normal && { type: 'normal' }, v.holo && { type: 'holo' }, v.reverse && { type: 'reverse' },
      v.firstEdition && { type: v.holo ? 'holo' : 'normal', stamp: ['1st-edition'] },
      v.wPromo && { type: 'holo', stamp: ['w-promo'] },
    ].filter(Boolean);
  }
  if (!list.length) return null;
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const stamps = [].concat(v.stamp || []);
    const key = [v.type, v.subtype, v.foil, ...stamps].filter(Boolean).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const [label, short] = VARIANT_TYPES[v.type] || [titleCase(v.type), titleCase(v.type)];
    const extras = [
      v.foil ? `${titleCase(v.foil)} foil` : null,
      v.subtype ? titleCase(v.subtype) : null,
      ...stamps.map((s) => (s === '1st-edition' ? '1st Edition' : s === 'w-promo' ? 'W Promo' : `${titleCase(s)} stamp`)),
    ].filter(Boolean);
    out.push({ key, label: [label, ...extras].join(' · '), short: [short, ...extras.map((e) => e.replace(/ (stamp|foil)$/, ''))].join(' ') });
  }
  return out;
}

const titleCase = (slug) => String(slug).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  .replace(/\bPokemon\b/g, 'Pokémon');

function compact(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || (Array.isArray(v) && !v.length)) delete obj[k];
  }
  return obj;
}

module.exports = { cardAttrs, cardVariants };
