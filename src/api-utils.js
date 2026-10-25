// Utilidades comunes de los clientes de API de Yu-Gi-Oh! y Lorcana.
const HEADERS = { 'User-Agent': 'TCGCompanion/0.1', Accept: 'application/json' };

// Cola de peticiones de una en una, con una pausa entre ellas (para respetar el límite de cada API).
// notFound: valor que se devuelve con un 404 (o con el 400 de YGOPRODeck cuando no hay cartas).
function jsonQueue(gapMs, { notFoundStatus = [404], notFound = null } = {}) {
  let queue = Promise.resolve();
  return (url) => {
    const run = queue.then(async () => {
      const res = await fetch(url, { headers: HEADERS });
      if (notFoundStatus.includes(res.status)) return notFound;
      if (!res.ok) throw new Error(`The API responded ${res.status} for ${url}`);
      return res.json();
    });
    queue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, gapMs)));
    return run;
  };
}

const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s/-])\S/g, (m) => m.toUpperCase());

// Quita los campos vacíos (null o listas vacías) de los atributos para los filtros.
function compact(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete obj[k];
  }
  return obj;
}

// Texto apto para un id ("Ultra Rare" -> "ultra-rare").
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

module.exports = { jsonQueue, titleCase, compact, slug };
