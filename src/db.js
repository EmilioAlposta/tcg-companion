// Base de datos SQLite local (fichero .sqlite que se puede abrir con DBeaver).
// Usa sql.js (SQLite compilado a WebAssembly): no necesita compilar nada nativo.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  tcg         TEXT NOT NULL,
  name        TEXT NOT NULL,
  set_id      TEXT NOT NULL,
  name_filter TEXT,
  sort_order  INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cards (
  id            TEXT NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id),
  set_id        TEXT NOT NULL,
  local_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  rarity        TEXT,
  illustrator   TEXT,
  image_url     TEXT,
  data_json     TEXT,
  fetched_at    TEXT NOT NULL,
  PRIMARY KEY (id, collection_id)
);

CREATE TABLE IF NOT EXISTS owned_cards (
  card_id    TEXT PRIMARY KEY,
  quantity   INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- Pokédex nacional (PokeAPI)
CREATE TABLE IF NOT EXISTS pokedex (
  dex_id  INTEGER PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_es TEXT NOT NULL
);

-- Cartas Full Art de cada Pokémon (una fila por carta y Pokémon: las Tag Team tienen varios)
CREATE TABLE IF NOT EXISTS fullart_cards (
  id         TEXT NOT NULL,
  dex_id     INTEGER NOT NULL,
  local_id   TEXT,
  name       TEXT NOT NULL,
  rarity     TEXT,
  set_id     TEXT,
  set_name   TEXT,
  image_url  TEXT,
  kind       TEXT NOT NULL DEFAULT 'fullart', -- 'fullart' | 'promo'
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (id, dex_id)
);
CREATE INDEX IF NOT EXISTS idx_fullart_dex ON fullart_cards(dex_id);

-- Precio de mercado de las cartas (price NULL = la API no tiene precio)
CREATE TABLE IF NOT EXISTS card_prices (
  card_id    TEXT PRIMARY KEY,
  price      REAL,
  currency   TEXT,
  fetched_at TEXT NOT NULL
);
`;

// Colecciones disponibles. Para añadir más, basta con añadir filas aquí.
const SEED_COLLECTIONS = [
  { id: 'pkm-30th-pikachus', tcg: 'pokemon', name: '30th Celebration - Pikachus', set_id: '30th', name_filter: 'Pikachu', sort_order: 1 },
];

class Database {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = null;
  }

  async open() {
    const wasmBinary = fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
    const SQL = await initSqlJs({ wasmBinary });
    this.db = fs.existsSync(this.filePath)
      ? new SQL.Database(fs.readFileSync(this.filePath))
      : new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON;');
    this.db.run(SCHEMA);
    // Migración: bases de datos creadas antes de que existieran las promos.
    const cols = this.all('PRAGMA table_info(fullart_cards)').map((c) => c.name);
    if (!cols.includes('kind')) {
      this.db.run(`ALTER TABLE fullart_cards ADD COLUMN kind TEXT NOT NULL DEFAULT 'fullart'`);
      this.db.run('DELETE FROM pokedex'); // fuerza a volver a descargar la Pokédex (con promos)
    }
    const stmt = this.db.prepare(
      `INSERT INTO collections (id, tcg, name, set_id, name_filter, sort_order)
       VALUES ($id, $tcg, $name, $set_id, $name_filter, $sort_order)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, set_id = excluded.set_id,
         name_filter = excluded.name_filter, sort_order = excluded.sort_order`
    );
    for (const c of SEED_COLLECTIONS) stmt.run(prefix(c));
    stmt.free();
    this.save();
  }

  // sql.js trabaja en memoria: volcamos a disco tras cada cambio.
  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.filePath);
  }

  all(sql, params = {}) {
    const stmt = this.db.prepare(sql);
    stmt.bind(prefix(params));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  get(sql, params = {}) {
    return this.all(sql, params)[0] || null;
  }

  getCollections(tcg) {
    return this.all(
      `SELECT c.*,
              (SELECT COUNT(*) FROM cards k WHERE k.collection_id = c.id) AS total,
              (SELECT COUNT(*) FROM cards k JOIN owned_cards o ON o.card_id = k.id
                WHERE k.collection_id = c.id) AS owned
         FROM collections c WHERE c.tcg = $tcg ORDER BY c.sort_order, c.name`,
      { tcg }
    );
  }

  getCollection(id) {
    return this.get('SELECT * FROM collections WHERE id = $id', { id });
  }

  getCards(collectionId) {
    return this.all(
      `SELECT k.id, k.local_id, k.name, k.rarity, k.illustrator, k.image_url,
              COALESCE(o.quantity, 0) AS quantity
         FROM cards k LEFT JOIN owned_cards o ON o.card_id = k.id
        WHERE k.collection_id = $cid
        ORDER BY k.local_id`,
      { cid: collectionId }
    );
  }

  replaceCards(collectionId, cards) {
    const now = new Date().toISOString();
    this.db.run('BEGIN');
    try {
      this.db.run('DELETE FROM cards WHERE collection_id = $cid', { $cid: collectionId });
      const stmt = this.db.prepare(
        `INSERT INTO cards (id, collection_id, set_id, local_id, name, rarity, illustrator, image_url, data_json, fetched_at)
         VALUES ($id, $cid, $set_id, $local_id, $name, $rarity, $illustrator, $image_url, $data_json, $now)`
      );
      for (const c of cards) {
        stmt.run({
          $id: c.id, $cid: collectionId, $set_id: c.set?.id || '', $local_id: c.localId,
          $name: c.name, $rarity: c.rarity || null, $illustrator: c.illustrator || null,
          $image_url: c.image || null, $data_json: JSON.stringify(c), $now: now,
        });
      }
      stmt.free();
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
    this.save();
  }

  setOwned(cardId, quantity) {
    if (quantity > 0) {
      this.db.run(
        `INSERT INTO owned_cards (card_id, quantity, updated_at) VALUES ($id, $q, $now)
         ON CONFLICT(card_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`,
        { $id: cardId, $q: quantity, $now: new Date().toISOString() }
      );
    } else {
      this.db.run('DELETE FROM owned_cards WHERE card_id = $id', { $id: cardId });
    }
    this.save();
  }

  // ---------- Pokédex ----------

  replacePokedex(species, cards) {
    const now = new Date().toISOString();
    this.db.run('BEGIN');
    try {
      this.db.run('DELETE FROM pokedex');
      this.db.run('DELETE FROM fullart_cards');
      const sp = this.db.prepare('INSERT INTO pokedex (dex_id, name_en, name_es) VALUES ($id, $en, $es)');
      for (const s of species) sp.run({ $id: s.dexId, $en: s.nameEn, $es: s.nameEs });
      sp.free();
      const fa = this.db.prepare(
        `INSERT OR IGNORE INTO fullart_cards (id, dex_id, local_id, name, rarity, set_id, set_name, image_url, kind, fetched_at)
         VALUES ($id, $dex, $local_id, $name, $rarity, $set_id, $set_name, $image_url, $kind, $now)`
      );
      for (const c of cards) {
        for (const dex of c.dexIds) {
          fa.run({
            $id: c.id, $dex: dex, $local_id: c.localId, $name: c.name, $rarity: c.rarity,
            $set_id: c.set?.id || null, $set_name: c.set?.name || null, $image_url: c.image || null,
            $kind: c.kind, $now: now,
          });
        }
      }
      fa.free();
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
    this.save();
  }

  isPokedexSynced() {
    return this.get('SELECT COUNT(*) AS n FROM pokedex').n > 0;
  }

  getPokedexStats() {
    return this.get(
      `SELECT (SELECT COUNT(*) FROM pokedex) AS species,
              (SELECT COUNT(DISTINCT dex_id) FROM fullart_cards) AS with_fullart,
              (SELECT COUNT(DISTINCT f.dex_id) FROM fullart_cards f
                 JOIN owned_cards o ON o.card_id = f.id) AS owned`
    );
  }

  // Cada Pokémon con su nº de Full Arts y promos, y la imagen de la carta más cara que tienes.
  getPokedex() {
    return this.all(
      `SELECT p.dex_id, p.name_en, p.name_es,
              (SELECT COUNT(*) FROM fullart_cards f WHERE f.dex_id = p.dex_id AND f.kind = 'fullart') AS fullart_count,
              (SELECT COUNT(*) FROM fullart_cards f WHERE f.dex_id = p.dex_id AND f.kind = 'promo') AS promo_count,
              (SELECT COUNT(*) FROM fullart_cards f JOIN owned_cards o ON o.card_id = f.id
                WHERE f.dex_id = p.dex_id) AS owned_count,
              (SELECT COUNT(*) FROM fullart_cards f JOIN owned_cards o ON o.card_id = f.id
                WHERE f.dex_id = p.dex_id AND f.kind = 'promo') AS owned_promo_count,
              (SELECT f.image_url FROM fullart_cards f
                 JOIN owned_cards o ON o.card_id = f.id
                 LEFT JOIN card_prices cp ON cp.card_id = f.id
                WHERE f.dex_id = p.dex_id AND f.image_url IS NOT NULL
                ORDER BY COALESCE(cp.price, -1) DESC, f.fetched_at LIMIT 1) AS best_image
         FROM pokedex p ORDER BY p.dex_id`
    );
  }

  getPokemon(dexId) {
    return this.get('SELECT * FROM pokedex WHERE dex_id = $id', { id: dexId });
  }

  getPokemonFullArts(dexId) {
    return this.all(
      `SELECT f.id, f.local_id, f.name, f.rarity, f.set_id, f.set_name, f.image_url, f.kind,
              cp.price, cp.currency, cp.fetched_at AS price_fetched_at,
              COALESCE(o.quantity, 0) AS quantity
         FROM fullart_cards f
         LEFT JOIN owned_cards o ON o.card_id = f.id
         LEFT JOIN card_prices cp ON cp.card_id = f.id
        WHERE f.dex_id = $dex
        ORDER BY COALESCE(cp.price, -1) DESC, f.set_id, f.local_id`,
      { dex: dexId }
    );
  }

  setPrices(prices) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO card_prices (card_id, price, currency, fetched_at) VALUES ($id, $p, $c, $now)
       ON CONFLICT(card_id) DO UPDATE SET price = excluded.price, currency = excluded.currency,
         fetched_at = excluded.fetched_at`
    );
    for (const p of prices) stmt.run({ $id: p.cardId, $p: p.price, $c: p.currency, $now: now });
    stmt.free();
    this.save();
  }
}

function prefix(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k.startsWith('$') ? k : '$' + k] = v;
  return out;
}

module.exports = { Database };
