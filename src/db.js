// Base de datos SQLite local (fichero .sqlite que se puede abrir con DBeaver).
// Usa sql.js (SQLite compilado a WebAssembly): no necesita compilar nada nativo.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { cardAttrs, cardVariants } = require('./card-attrs');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  tcg         TEXT NOT NULL,
  name        TEXT NOT NULL,
  set_id      TEXT NOT NULL,
  name_filter TEXT,
  sort_order  INTEGER DEFAULT 0,
  serie_name   TEXT,
  release_date TEXT,
  logo         TEXT,
  card_total   INTEGER,          -- nº de cartas según la API (antes de descargarlas)
  synced_at    TEXT,             -- NULL = las cartas del set todavía no se han descargado
  custom       INTEGER NOT NULL DEFAULT 0  -- 1 = colección creada por el usuario con cartas de varios sets
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

-- Copias de las versiones que no son la principal (reverse holo, con sello…). owned_cards.quantity es el
-- total; las copias de la versión principal son el total menos las de esta tabla.
CREATE TABLE IF NOT EXISTS owned_variants (
  card_id    TEXT NOT NULL,
  variant    TEXT NOT NULL,
  quantity   INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (card_id, variant)
);

-- Cartas ocultas de un set: no cuentan para el total ni para el porcentaje
CREATE TABLE IF NOT EXISTS hidden_cards (
  collection_id TEXT NOT NULL,
  card_id       TEXT NOT NULL,
  hidden_at     TEXT NOT NULL,
  PRIMARY KEY (collection_id, card_id)
);

-- Notas libres del usuario sobre un set
CREATE TABLE IF NOT EXISTS collection_notes (
  collection_id TEXT PRIMARY KEY,
  notes         TEXT NOT NULL,
  updated_at    TEXT NOT NULL
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

-- Mazos del usuario (el formato y sus reglas los define la app: commander, standard…)
CREATE TABLE IF NOT EXISTS decks (
  id            TEXT PRIMARY KEY,
  tcg           TEXT NOT NULL,
  name          TEXT NOT NULL,
  format        TEXT NOT NULL,
  cover_card_id TEXT,             -- carta de portada; NULL = el commander / líder o la primera carta
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Cartas de un mazo, con sus datos: no están en cards ni en owned_cards, así que añadir una carta
-- a un mazo no la marca como tuya ni la añade a su set.
CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id        TEXT NOT NULL,
  card_id        TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'main',  -- 'main' | 'commander' (Magic) | 'leader' (One Piece)
  quantity       INTEGER NOT NULL DEFAULT 1,
  owned_override INTEGER,                       -- NULL = según tu colección; 1 / 0 = la tengo / no, solo en este mazo
  set_id         TEXT,
  local_id       TEXT,
  name           TEXT NOT NULL,
  rarity         TEXT,
  image_url      TEXT,
  data_json      TEXT,
  added_at       TEXT NOT NULL,
  PRIMARY KEY (deck_id, card_id)
);
`;

// Condición SQL: la carta k no está oculta en su colección.
const VISIBLE = `NOT EXISTS (SELECT 1 FROM hidden_cards h WHERE h.collection_id = k.collection_id AND h.card_id = k.id)`;

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
    // Migración: columnas de sets añadidas cuando se incorporaron todos los sets de TCGdex.
    const colCols = this.all('PRAGMA table_info(collections)').map((c) => c.name);
    for (const [col, type] of [['serie_name', 'TEXT'], ['release_date', 'TEXT'], ['logo', 'TEXT'],
      ['card_total', 'INTEGER'], ['synced_at', 'TEXT'], ['custom', 'INTEGER NOT NULL DEFAULT 0']]) {
      if (!colCols.includes(col)) this.db.run(`ALTER TABLE collections ADD COLUMN ${col} ${type}`);
    }
    if (!colCols.includes('synced_at')) {
      this.db.run(`UPDATE collections SET synced_at = $now
                    WHERE EXISTS (SELECT 1 FROM cards k WHERE k.collection_id = collections.id)`,
        { $now: new Date().toISOString() });
    }
    // Migración: la antigua colección fija "30th Celebration - Pikachus" pasa a ser una colección custom
    // (conserva sus cartas, las ocultas y las notas, y ya se puede editar o borrar).
    if (!colCols.includes('custom')) {
      this.db.run(`UPDATE collections SET custom = 1, name_filter = NULL, set_id = '', sort_order = 0
                    WHERE id = 'pkm-30th-pikachus'`);
    }
    // Cartas de mazo que se quedaron sin copias: salen del mazo.
    this.db.run('DELETE FROM deck_cards WHERE NOT (quantity > 0)');
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
              (SELECT COUNT(*) FROM cards k WHERE k.collection_id = c.id
                  AND NOT ${VISIBLE}) AS hidden,
              CASE WHEN c.synced_at IS NULL THEN COALESCE(c.card_total, 0)
                   ELSE (SELECT COUNT(*) FROM cards k WHERE k.collection_id = c.id AND ${VISIBLE}) END AS total,
              (SELECT COUNT(*) FROM cards k JOIN owned_cards o ON o.card_id = k.id
                WHERE k.collection_id = c.id AND ${VISIBLE}) AS owned
         FROM collections c WHERE c.tcg = $tcg ORDER BY c.sort_order, c.release_date DESC, c.name`,
      { tcg }
    );
  }

  getCollection(id) {
    return this.get(
      `SELECT c.*, COALESCE(n.notes, '') AS notes
         FROM collections c LEFT JOIN collection_notes n ON n.collection_id = c.id
        WHERE c.id = $id`,
      { id }
    );
  }

  // Además de los sets, guarda notas de otras vistas (p. ej. 'pokedex').
  getNotes(collectionId) {
    return this.get('SELECT notes FROM collection_notes WHERE collection_id = $cid', { cid: collectionId })?.notes || '';
  }

  setCollectionNotes(collectionId, notes) {
    if (notes.trim()) {
      this.db.run(
        `INSERT INTO collection_notes (collection_id, notes, updated_at) VALUES ($cid, $notes, $now)
         ON CONFLICT(collection_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`,
        { $cid: collectionId, $notes: notes, $now: new Date().toISOString() }
      );
    } else {
      this.db.run('DELETE FROM collection_notes WHERE collection_id = $cid', { $cid: collectionId });
    }
    this.save();
  }

  // attrs: atributos para los filtros avanzados. Las cartas de una colección custom (o las añadidas a un set
  // sin descargar) no guardan el detalle de la API: se toma de la misma carta en otro set, si está.
  getCards(collectionId) {
    return this.all(
      `SELECT k.id, k.set_id, k.local_id, k.name, k.rarity, k.illustrator, k.image_url,
              json_extract(k.data_json, '$.set.name') AS set_name,
              json_extract(k.data_json, '$.set.cardCount.official') AS set_official,
              json_extract(k.data_json, '$.market_price') AS price,
              COALESCE(o.quantity, 0) AS quantity,
              CASE WHEN h.card_id IS NULL THEN 0 ELSE 1 END AS hidden,
              k.data_json,
              CASE WHEN json_extract(k.data_json, '$.category') IS NULL AND json_extract(k.data_json, '$.card_type') IS NULL
                        AND json_extract(k.data_json, '$.type_line') IS NULL
                   THEN (SELECT s.data_json FROM cards s WHERE s.id = k.id AND s.collection_id <> k.collection_id
                           AND (json_extract(s.data_json, '$.category') IS NOT NULL
                                OR json_extract(s.data_json, '$.card_type') IS NOT NULL
                                OR json_extract(s.data_json, '$.type_line') IS NOT NULL) LIMIT 1) END AS source_json
         FROM cards k LEFT JOIN owned_cards o ON o.card_id = k.id
         LEFT JOIN hidden_cards h ON h.collection_id = k.collection_id AND h.card_id = k.id
         -- Set de cada carta (en una colección custom hay cartas de varios sets): se ordenan como la lista de sets.
         LEFT JOIN collections s ON s.custom = 0 AND s.set_id = k.set_id
                                AND s.tcg = (SELECT tcg FROM collections WHERE id = $cid)
        WHERE k.collection_id = $cid
        ORDER BY s.sort_order, s.release_date DESC, s.name, k.set_id,
                 -- Nº de carta ordenado como número (1, 2, 10… y no 1, 10, 2); los que no empiezan por número
                 -- (TG01, OP01-001…) van después, por orden alfabético.
                 CASE WHEN k.local_id GLOB '[0-9]*' THEN 0 ELSE 1 END, CAST(k.local_id AS INTEGER),
                 k.local_id, k.id`,
      { cid: collectionId }
    ).map(({ data_json, source_json, ...card }) => {
      const own = parseJson(data_json);
      const source = parseJson(source_json);
      card.attrs = own?.attrs || cardAttrs(own) || cardAttrs(source);
      card.variants = own?.variantList || cardVariants(own) || cardVariants(source);
      return card;
    }).map((card) => this.withVariantQuantities(card));
  }

  // Todas las cartas que tienes de un TCG (una vez cada una, desde su set), ordenadas por set y número.
  // Para exportar: mismo formato que getCards, más set_name (el nombre del set).
  getOwnedCards(tcg) {
    return this.all(
      `SELECT k.id, k.set_id, k.local_id, k.name, k.rarity, c.name AS set_name, o.quantity, k.data_json,
              (SELECT s.data_json FROM cards s WHERE s.id = k.id AND s.collection_id <> k.collection_id
                  AND s.data_json IS NOT NULL LIMIT 1) AS source_json
         FROM owned_cards o JOIN cards k ON k.id = o.card_id JOIN collections c ON c.id = k.collection_id
        WHERE c.tcg = $tcg AND c.custom = 0
        GROUP BY k.id
        ORDER BY c.sort_order, c.release_date DESC, c.name, CAST(k.local_id AS INTEGER), k.local_id`,
      { tcg }
    ).map(({ data_json, source_json, ...card }) => {
      const own = parseJson(data_json);
      card.variants = own?.variantList || cardVariants(own) || cardVariants(parseJson(source_json));
      return this.withVariantQuantities(card);
    });
  }

  // Nombre de cada set de un TCG por su código (para las cartas de las colecciones custom).
  getSetNames(tcg) {
    return Object.fromEntries(this.all('SELECT set_id, name FROM collections WHERE tcg = $tcg AND custom = 0', { tcg })
      .map((c) => [c.set_id, c.name]));
  }

  // ---------- Versiones (normal, reverse holo, con sello…) ----------

  // Añade a la carta variant_qty: { versión: copias } (solo las versiones que tienes; '' = la principal).
  withVariantQuantities(card) {
    const extras = this.all('SELECT variant, quantity FROM owned_variants WHERE card_id = $id', { id: card.id });
    const qty = {};
    let rest = card.quantity;
    for (const v of extras) { qty[v.variant] = v.quantity; rest -= v.quantity; }
    if (rest > 0) qty[''] = rest;
    card.variant_qty = qty;
    return card;
  }

  // Cambia las copias de una versión ('' = la principal) y recalcula el total de la carta.
  setVariantQuantity(cardId, variant, quantity) {
    quantity = Math.max(0, Math.floor(quantity));
    const now = new Date().toISOString();
    const total = this.get('SELECT quantity FROM owned_cards WHERE card_id = $id', { id: cardId })?.quantity || 0;
    const extras = this.get('SELECT COALESCE(SUM(quantity), 0) AS n FROM owned_variants WHERE card_id = $id', { id: cardId }).n;
    let main = total - extras;
    if (!variant) {
      main = quantity;
    } else if (quantity > 0) {
      this.db.run(
        `INSERT INTO owned_variants (card_id, variant, quantity, updated_at) VALUES ($id, $v, $q, $now)
         ON CONFLICT(card_id, variant) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`,
        { $id: cardId, $v: variant, $q: quantity, $now: now }
      );
    } else {
      this.db.run('DELETE FROM owned_variants WHERE card_id = $id AND variant = $v', { $id: cardId, $v: variant });
    }
    const newTotal = main + this.get('SELECT COALESCE(SUM(quantity), 0) AS n FROM owned_variants WHERE card_id = $id', { id: cardId }).n;
    this.setOwned(cardId, newTotal);
    return newTotal;
  }

  replaceCards(collectionId, cards) {
    this.db.run('BEGIN');
    try {
      this.writeCards(collectionId, cards, new Date().toISOString());
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
    this.save();
  }

  // Sustituye las cartas de una colección (sin transacción ni guardado: lo hace quien llama).
  writeCards(collectionId, cards, now) {
    this.db.run('DELETE FROM cards WHERE collection_id = $cid', { $cid: collectionId });
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO cards (id, collection_id, set_id, local_id, name, rarity, illustrator, image_url, data_json, fetched_at)
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
    this.db.run('UPDATE collections SET synced_at = $now WHERE id = $cid', { $cid: collectionId, $now: now });
  }

  // ---------- Colecciones custom ----------

  // Crea (sin id) o actualiza una colección custom con su nombre y su lista de cartas. Devuelve el id.
  saveCustomCollection({ id, tcg, name, cards }) {
    const now = Date.now();
    this.db.run('BEGIN');
    try {
      if (!id) {
        id = `custom-${now.toString(36)}`;
        this.db.run(
          `INSERT INTO collections (id, tcg, name, set_id, sort_order, custom, synced_at)
           VALUES ($id, $tcg, $name, '', 0, 1, $now)`,
          { $id: id, $tcg: tcg, $name: name, $now: new Date(now).toISOString() }
        );
      } else {
        this.db.run('UPDATE collections SET name = $name WHERE id = $id AND custom = 1', { $id: id, $name: name });
      }
      const keep = new Set(cards.map((c) => c.id));
      for (const { id: cardId } of this.all('SELECT id FROM cards WHERE collection_id = $cid', { cid: id })) {
        if (keep.has(cardId)) continue;
        this.db.run('DELETE FROM cards WHERE collection_id = $cid AND id = $id', { $cid: id, $id: cardId });
        this.db.run('DELETE FROM hidden_cards WHERE collection_id = $cid AND card_id = $id', { $cid: id, $id: cardId });
      }
      // fetched_at guarda cuándo se añadió cada carta (las que ya estaban conservan el suyo).
      const stmt = this.db.prepare(
        `INSERT OR IGNORE INTO cards (id, collection_id, set_id, local_id, name, rarity, image_url, data_json, fetched_at)
         VALUES ($id, $cid, $set_id, $local_id, $name, $rarity, $image_url, $data_json, $at)`
      );
      cards.forEach((c, i) => stmt.run({
        $id: c.id, $cid: id, $set_id: c.setId || '', $local_id: c.localId || '', $name: c.name,
        $rarity: c.rarity || null, $image_url: c.image || null,
        $data_json: JSON.stringify({ set: { id: c.setId, name: c.setName }, market_price: c.price ?? undefined,
          attrs: c.attrs || undefined, variantList: c.variants || undefined }),
        $at: new Date(now + i).toISOString(),
      }));
      stmt.free();
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
    this.save();
    return id;
  }

  // Borra la colección, no las cartas que tienes: siguen marcadas en sus sets.
  deleteCustomCollection(id) {
    if (!this.get('SELECT 1 AS ok FROM collections WHERE id = $id AND custom = 1', { id })) return;
    for (const table of ['cards', 'hidden_cards', 'collection_notes']) {
      this.db.run(`DELETE FROM ${table} WHERE collection_id = $id`, { $id: id });
    }
    this.db.run('DELETE FROM collections WHERE id = $id', { $id: id });
    this.save();
  }

  // ---------- Mazos ----------

  // Cada mazo con sus cartas (para la portada y los contadores de la lista de mazos).
  getDecks() {
    return this.all('SELECT * FROM decks ORDER BY updated_at DESC').map((d) => ({ ...d, cards: this.getDeckCards(d.id) }));
  }

  getDeck(id) {
    const deck = this.get('SELECT * FROM decks WHERE id = $id', { id });
    return deck ? { deck, cards: this.getDeckCards(id) } : null;
  }

  // have_exact: copias que tienes de esa impresión; have_any: de cualquier impresión de la misma carta
  // (en Magic, mismo nombre; en One Piece, mismo código). En Pokémon solo cuenta la impresión exacta.
  getDeckCards(deckId) {
    return this.all(
      `SELECT d.card_id AS id, d.role, d.quantity, d.owned_override, d.set_id, d.local_id, d.name, d.rarity, d.image_url,
              d.data_json,
              COALESCE((SELECT quantity FROM owned_cards WHERE card_id = d.card_id), 0) AS have_exact,
              COALESCE((SELECT SUM(o.quantity) FROM owned_cards o
                         WHERE o.card_id = d.card_id
                            OR (d.card_id LIKE 'mtg-%' AND o.card_id LIKE 'mtg-%'
                                AND EXISTS (SELECT 1 FROM cards k WHERE k.id = o.card_id AND k.name = d.name))
                            OR (d.card_id LIKE 'op-%' AND o.card_id LIKE 'op-%'
                                AND EXISTS (SELECT 1 FROM cards k WHERE k.id = o.card_id AND k.local_id = d.local_id))), 0) AS have_any
         FROM deck_cards d WHERE d.deck_id = $id AND d.quantity > 0 ORDER BY d.added_at, d.card_id`,
      { id: deckId }
    ).map(({ data_json, ...card }) => ({ ...parseJson(data_json), ...card }));
  }

  createDeck({ tcg, name, format }) {
    const now = new Date();
    const id = `deck-${now.getTime().toString(36)}`;
    this.db.run(
      `INSERT INTO decks (id, tcg, name, format, created_at, updated_at) VALUES ($id, $tcg, $name, $format, $now, $now)`,
      { $id: id, $tcg: tcg, $name: name, $format: format, $now: now.toISOString() }
    );
    this.save();
    return id;
  }

  // Solo cambia los campos que vienen (coverCardId null = la portada por defecto).
  updateDeck(id, { name, format, coverCardId }) {
    const fields = [];
    const params = { $id: id, $now: new Date().toISOString() };
    if (name !== undefined) { fields.push('name = $name'); params.$name = name; }
    if (format !== undefined) { fields.push('format = $format'); params.$format = format; }
    if (coverCardId !== undefined) { fields.push('cover_card_id = $cover'); params.$cover = coverCardId; }
    this.db.run(`UPDATE decks SET ${[...fields, 'updated_at = $now'].join(', ')} WHERE id = $id`, params);
    this.save();
  }

  deleteDeck(id) {
    this.db.run('DELETE FROM deck_cards WHERE deck_id = $id', { $id: id });
    this.db.run('DELETE FROM decks WHERE id = $id', { $id: id });
    this.save();
  }

  // Añade copias de la carta al mazo. Si ya estaba con el mismo rol se suman; si cambia de rol
  // (p. ej. pasa a ser el commander), se queda con las copias nuevas.
  addDeckCard(deckId, card, { role = 'main', quantity = 1 } = {}) {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO deck_cards (deck_id, card_id, role, quantity, set_id, local_id, name, rarity, image_url, data_json, added_at)
       VALUES ($deck, $id, $role, $qty, $set_id, $local_id, $name, $rarity, $image_url, $data_json, $now)
       ON CONFLICT(deck_id, card_id) DO UPDATE SET
         quantity = CASE WHEN deck_cards.role = excluded.role THEN deck_cards.quantity + excluded.quantity ELSE excluded.quantity END,
         role = excluded.role`,
      {
        $deck: deckId, $id: card.id, $role: role, $qty: quantity, $set_id: card.setId || '', $local_id: card.localId || '',
        $name: card.name, $rarity: card.rarity || null, $image_url: card.image || null, $now: now,
        $data_json: JSON.stringify({
          set_name: card.setName, set_official: card.setOfficial ?? undefined, price: card.price ?? undefined,
          attrs: card.attrs || undefined, color_identity: card.colorIdentity || undefined, legal: card.legal || undefined,
          tcgplayer_id: card.tcgplayerId || undefined, scryfall_uri: card.scryfallUri || undefined,
        }),
      }
    );
    this.touchDeck(deckId, now);
    this.save();
  }

  // changes: { quantity, role, ownedOverride } (solo los que vienen). quantity 0 = quitarla del mazo.
  updateDeckCard(deckId, cardId, { quantity, role, ownedOverride }) {
    const key = { $deck: deckId, $id: cardId };
    // Sin copias (o una cantidad no válida), la carta sale del mazo.
    if (quantity !== undefined && !(quantity >= 1)) {
      this.db.run('DELETE FROM deck_cards WHERE deck_id = $deck AND card_id = $id', key);
      this.db.run('UPDATE decks SET cover_card_id = NULL WHERE id = $deck AND cover_card_id = $id', key);
    } else {
      if (quantity !== undefined) {
        this.db.run('UPDATE deck_cards SET quantity = $q WHERE deck_id = $deck AND card_id = $id', { ...key, $q: Math.floor(quantity) });
      }
      if (role !== undefined) this.db.run('UPDATE deck_cards SET role = $role WHERE deck_id = $deck AND card_id = $id', { ...key, $role: role });
      if (ownedOverride !== undefined) {
        this.db.run('UPDATE deck_cards SET owned_override = $o WHERE deck_id = $deck AND card_id = $id',
          { ...key, $o: ownedOverride == null ? null : ownedOverride ? 1 : 0 });
      }
    }
    this.touchDeck(deckId);
    this.save();
  }

  touchDeck(deckId, now = new Date().toISOString()) {
    this.db.run('UPDATE decks SET updated_at = $now WHERE id = $id', { $id: deckId, $now: now });
  }

  // ---------- Sets de TCGdex ----------

  hasSets() {
    return this.get(`SELECT COUNT(*) AS n FROM collections WHERE id LIKE 'pkm-set-%'`).n > 0;
  }

  // Guarda la lista de sets (sin sus cartas: se descargan al abrir cada set).
  replaceSets(sets) {
    const stmt = this.db.prepare(
      `INSERT INTO collections (id, tcg, name, set_id, sort_order, serie_name, release_date, logo, card_total)
       VALUES ($id, 'pokemon', $name, $set_id, 100, $serie, $date, $logo, $total)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, serie_name = excluded.serie_name,
         release_date = excluded.release_date, logo = excluded.logo, card_total = excluded.card_total`
    );
    for (const x of sets) {
      stmt.run({
        $id: setCollectionId(x.id), $name: x.name, $set_id: x.id, $serie: x.serie?.name || null,
        $date: x.releaseDate || null, $logo: x.logo || null, $total: x.cardCount?.total ?? null,
      });
    }
    stmt.free();
    this.linkOwnedPokedexCards();
    this.save();
  }

  // Las cartas marcadas desde la Pokédex o el buscador se añaden a su set (aunque el set no se haya
  // descargado todavía), para que el set cuente como "con cartas" y aparezca en la lista principal.
  linkOwnedPokedexCards() {
    this.db.run(
      `INSERT OR IGNORE INTO cards (id, collection_id, set_id, local_id, name, rarity, image_url, fetched_at)
       SELECT f.id, c.id, f.set_id, COALESCE(f.local_id, ''), f.name, f.rarity, f.image_url, f.fetched_at
         FROM owned_cards o JOIN fullart_cards f ON f.id = o.card_id
         JOIN collections c ON c.id = 'pkm-set-' || f.set_id
        GROUP BY f.id`
    );
  }

  addCardToSet(card) {
    const cid = String(card.id).startsWith('mtg-') ? magicCollectionId(card.setId) : setCollectionId(card.setId);
    if (!this.getCollection(cid)) return;
    this.db.run(
      `INSERT OR IGNORE INTO cards (id, collection_id, set_id, local_id, name, rarity, image_url, fetched_at)
       VALUES ($id, $cid, $set_id, $local_id, $name, $rarity, $image_url, $now)`,
      { $id: card.id, $cid: cid, $set_id: card.setId, $local_id: card.localId || '', $name: card.name,
        $rarity: card.rarity || null, $image_url: card.image || null, $now: new Date().toISOString() }
    );
  }

  // ---------- One Piece (OPTCG API) ----------

  hasOnePieceSets() {
    return this.get(`SELECT COUNT(*) AS n FROM collections WHERE id LIKE 'op-set-%'`).n > 0;
  }

  // Guarda el catálogo completo: cada set con todas sus cartas (las cartas que tienes se conservan).
  replaceOnePieceCatalog(sets) {
    const now = new Date().toISOString();
    this.db.run('BEGIN');
    try {
      const stmt = this.db.prepare(
        `INSERT INTO collections (id, tcg, name, set_id, sort_order, serie_name, card_total)
         VALUES ($id, 'onepiece', $name, $set_id, $order, $serie, $total)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order,
           serie_name = excluded.serie_name, card_total = excluded.card_total`
      );
      for (const s of sets) {
        stmt.run({ $id: onePieceCollectionId(s.id), $name: s.name, $set_id: s.id,
          $order: 10000 - s.rank, $serie: s.serie, $total: s.cards.length });
      }
      stmt.free();
      for (const s of sets) this.writeCards(onePieceCollectionId(s.id), s.cards, now);
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
    this.save();
  }

  // Busca por nombre en todos los sets descargados (con el mismo formato que el buscador de TCGdex).
  searchOnePieceCards(name) {
    return this.queryOnePieceCards('instr(lower(k.name), lower($q)) > 0', { q: name });
  }

  // Todas las versiones de una carta de One Piece: mismo código (OP01-001) en cualquier set, con sus artes alternativos.
  onePiecePrintings(code) {
    return this.queryOnePieceCards('k.local_id = $code', { code });
  }

  queryOnePieceCards(where, params) {
    return this.all(
      `SELECT k.id, k.local_id, k.name, k.rarity, k.image_url, k.set_id, c.name AS set_name, k.data_json,
              json_extract(k.data_json, '$.market_price') AS price, json_extract(k.data_json, '$.inventory_price') AS inventory,
              COALESCE(o.quantity, 0) AS quantity
         FROM cards k JOIN collections c ON c.id = k.collection_id
         LEFT JOIN owned_cards o ON o.card_id = k.id
        WHERE c.tcg = 'onepiece' AND c.custom = 0 AND ${where}
        ORDER BY c.sort_order, k.local_id, k.id LIMIT 500`,
      params
    ).map((k) => ({
      id: k.id, localId: k.local_id, name: k.name, rarity: k.rarity, image: k.image_url,
      price: k.price, inventory: k.inventory, quantity: k.quantity, set: { id: k.set_id, name: k.set_name },
      attrs: cardAttrs(parseJson(k.data_json)),
    }));
  }

  // ---------- Magic (Scryfall) ----------

  hasMagicSets() {
    return this.get(`SELECT COUNT(*) AS n FROM collections WHERE id LIKE 'mtg-set-%'`).n > 0;
  }

  // Guarda la lista de sets (sin sus cartas: se descargan al abrir cada set, como en Pokémon).
  // sort_order agrupa por tipo de set (expansiones, core sets, masters…); dentro de cada tipo, del más nuevo al más antiguo.
  replaceMagicSets(sets) {
    const stmt = this.db.prepare(
      `INSERT INTO collections (id, tcg, name, set_id, sort_order, serie_name, release_date, logo, card_total)
       VALUES ($id, 'magic', $name, $set_id, $order, $serie, $date, $logo, $total)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order, serie_name = excluded.serie_name,
         release_date = excluded.release_date, logo = excluded.logo, card_total = excluded.card_total`
    );
    for (const s of sets) {
      stmt.run({ $id: magicCollectionId(s.id), $name: s.name, $set_id: s.id, $order: 100 + s.rank, $serie: s.serie,
        $date: s.releaseDate, $logo: s.logo, $total: s.total });
    }
    stmt.free();
    this.save();
  }

  // Datos guardados de una carta (de cualquier colección), p. ej. para los enlaces externos.
  getCardData(cardId) {
    return parseJson(this.get(`SELECT data_json FROM cards WHERE id = $id AND json_extract(data_json, '$.type_line') IS NOT NULL
                                 LIMIT 1`, { id: cardId })?.data_json);
  }

  getQuantities(cardIds) {
    const out = {};
    for (const id of cardIds) out[id] = this.get('SELECT quantity FROM owned_cards WHERE card_id = $id', { id })?.quantity || 0;
    return out;
  }

  setHidden(collectionId, cardId, hidden) {
    if (hidden) {
      this.db.run(
        `INSERT OR IGNORE INTO hidden_cards (collection_id, card_id, hidden_at) VALUES ($cid, $id, $now)`,
        { $cid: collectionId, $id: cardId, $now: new Date().toISOString() }
      );
    } else {
      this.db.run('DELETE FROM hidden_cards WHERE collection_id = $cid AND card_id = $id', { $cid: collectionId, $id: cardId });
    }
    this.save();
  }

  // quantity es el total; nunca baja de las copias de las otras versiones (sin copias, se borran todas).
  setOwned(cardId, quantity) {
    if (quantity > 0) {
      const extras = this.get('SELECT COALESCE(SUM(quantity), 0) AS n FROM owned_variants WHERE card_id = $id', { id: cardId }).n;
      quantity = Math.max(quantity, extras);
      this.db.run(
        `INSERT INTO owned_cards (card_id, quantity, updated_at) VALUES ($id, $q, $now)
         ON CONFLICT(card_id) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at`,
        { $id: cardId, $q: quantity, $now: new Date().toISOString() }
      );
    } else {
      this.db.run('DELETE FROM owned_cards WHERE card_id = $id', { $id: cardId });
      this.db.run('DELETE FROM owned_variants WHERE card_id = $id', { $id: cardId });
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

const setCollectionId = (setId) => `pkm-set-${setId}`;
const onePieceCollectionId = (setId) => `op-set-${setId}`;
const magicCollectionId = (setCode) => `mtg-set-${setCode}`;

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function prefix(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k.startsWith('$') ? k : '$' + k] = v;
  return out;
}

module.exports = { Database, setCollectionId, magicCollectionId };
