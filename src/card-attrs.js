// Atributos de una carta para los filtros avanzados, a partir de los datos crudos de la API
// (detalle de TCGdex o fila de OPTCG API). Devuelve null si los datos no traen nada filtrable.
const OP_COLORS = ['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'];
const OP_ATTRIBUTES = ['Slash', 'Strike', 'Ranged', 'Special', 'Wisdom'];

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
  return null;
}

function compact(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || (Array.isArray(v) && !v.length)) delete obj[k];
  }
  return obj;
}

module.exports = { cardAttrs };
