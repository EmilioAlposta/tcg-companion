const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Database, setCollectionId } = require('./src/db');
const { fetchSetCards, fetchSets, searchCards, fetchTcgplayerProductId } = require('./src/pokemon-api');
const { syncPokedex, refreshPrices } = require('./src/pokedex-sync');
const onePiece = require('./src/onepiece-api');
const magic = require('./src/magic-api');
const yugioh = require('./src/yugioh-api');
const { cardAttrs, cardVariants } = require('./src/card-attrs');
const { cardPrices } = require('./src/prices');
const { FORMATS, exportRows, exportFile } = require('./src/export');

// TCG cuyo catálogo entero se descarga de una vez (la búsqueda va contra la base de datos) y TCG con lista de sets
// (las cartas de cada set se descargan al abrirlo y la búsqueda va contra la API). Pokémon va aparte (TCGdex).
const CATALOGS = { onepiece: onePiece, lorcana: require('./src/lorcana-api') };
const SET_LISTS = { magic, yugioh };
const TCG_IDS = ['pokemon', ...Object.keys(SET_LISTS), ...Object.keys(CATALOGS)];
const TCG_NAMES = {
  pokemon: 'Pokemon', onepiece: 'One Piece', magic: 'Magic', yugioh: 'Yu-Gi-Oh', lorcana: 'Lorcana',
};
// Línea de producto de TCGplayer (para su buscador cuando no sabemos el id del producto).
const TCGPLAYER_LINES = {
  onepiece: 'one-piece-card-game', magic: 'magic', yugioh: 'yugioh', lorcana: 'lorcana-tcg',
};

let db;

// Dónde está la base de datos: por defecto en la carpeta de datos de la app. En Settings se puede elegir otra
// (p. ej. una de Google Drive, OneDrive o Dropbox, para usar la misma colección en varios ordenadores); se recuerda en
// storage.json. Si esa carpeta no está (unidad desconectada) se abre la de siempre y Settings lo avisa (missingDir).
// En Android la base de datos vive en el WebView y no se puede mover.
const DB_NAME = 'tcg-companion.sqlite';
const MOVABLE = process.platform !== 'android';
const storageConfig = () => path.join(app.getPath('userData'), 'storage.json');
let missingDir = null;

function readStorageDir() {
  try {
    return JSON.parse(fs.readFileSync(storageConfig(), 'utf8')).dbDir || null;
  } catch {
    return null;
  }
}

function dbDirAtStartup() {
  const dir = MOVABLE && readStorageDir();
  if (!dir) return app.getPath('userData');
  if (fs.existsSync(dir)) return dir;
  missingDir = dir;
  return app.getPath('userData');
}

function storageInfo() {
  const dir = path.dirname(db.filePath);
  let size = null;
  try { size = MOVABLE ? fs.statSync(db.filePath).size : null; } catch { /* todavía sin guardar */ }
  return { movable: MOVABLE, dir, file: db.filePath, isDefault: dir === app.getPath('userData'), size, missingDir };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'TCG Companion',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#0d1b2e',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Los efectos de sonido (al pasar el ratón por las cartas) deben sonar antes del primer clic.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function syncCollection(collectionId) {
  const col = db.getCollection(collectionId);
  if (!col) throw new Error(`Unknown collection: ${collectionId}`);
  // One Piece puede descargar un set suelto; los otros catálogos se vuelven a descargar enteros.
  if (CATALOGS[col.tcg] && !CATALOGS[col.tcg].fetchSetCards) {
    db.replaceCatalog(col.tcg, await CATALOGS[col.tcg].fetchCatalog());
    return;
  }
  const api = CATALOGS[col.tcg] || SET_LISTS[col.tcg];
  // card_total: las cartas que se esperan, para que Scryfall pida todas las páginas a la vez.
  db.replaceCards(collectionId, api ? await api.fetchSetCards(col.set_id, col.card_total) : await fetchSetCards(col.set_id, col.name_filter));
}

async function ensureCatalog(tcg) {
  if (!db.hasCatalog(tcg)) db.replaceCatalog(tcg, await CATALOGS[tcg].fetchCatalog());
}

async function ensureSetList(tcg) {
  if (!db.hasSetList(tcg)) db.replaceSetList(tcg, await SET_LISTS[tcg].fetchSets());
}

// Los formatos de Moxfield solo existen para Magic.
function checkExportFormat(tcg, format) {
  if (!FORMATS[format] || (format.startsWith('moxfield') && tcg !== 'magic')) throw new Error(`Unknown format: ${format}`);
}

// Contenido exportado (Buffer) y nº de filas. Sin collectionId se exportan las cartas que tienes de todo el TCG.
async function buildExport({ tcg, collectionId, format, mode = 'owned', splitVariants = false }) {
  checkExportFormat(tcg, format);
  const col = collectionId ? db.getCollection(collectionId) : null;
  if (!col) mode = 'owned';
  // Un set sin descargar solo tiene las cartas que marcaste: hacen falta todas para saber cuáles faltan.
  if (col && !col.custom && !col.synced_at) await syncCollection(collectionId);
  // Las cartas ocultas no cuentan como faltantes (igual que en el set).
  const cards = col ? db.getCards(collectionId).filter((c) => mode === 'owned' || !c.hidden) : db.getOwnedCards(tcg);
  const setNames = db.getSetNames(tcg);
  const rows = exportRows(cards, { mode, splitVariants, setName: (c) => c.set_name || setNames[c.set_id] });
  return { content: exportFile(rows, format, { mode }), rows: rows.length };
}

// Cartas de Scryfall o YGOPRODeck (buscador o artes) de sets conocidos, con lo que tienes de cada una y sus atributos
// y versiones. En Yu-Gi-Oh! se ordenan del set más nuevo al más antiguo (Scryfall ya las da así), como mucho 500.
async function withOwnership(tcg, found) {
  await ensureSetList(tcg);
  const sets = Object.fromEntries(db.getCollections(tcg).filter((c) => !c.custom).map((c) => [c.set_id, c]));
  let cards = found.filter((c) => sets[c.set.id]);
  if (tcg !== 'magic') {
    cards = cards.sort((a, b) => (sets[b.set.id].release_date || '').localeCompare(sets[a.set.id].release_date || '')
      || a.localId.localeCompare(b.localId, undefined, { numeric: true })).slice(0, 500);
  }
  const qty = db.getQuantities(cards.map((c) => c.id));
  return cards.map((c) => db.withVariantQuantities({
    ...c, price: c.market_price ?? null, quantity: qty[c.id], attrs: c.attrs || cardAttrs(c), variants: cardVariants(c),
  }));
}

// Busca en TCGdex, se queda con las cartas de sets conocidos (y que pasen `keep`) y las ordena del set más nuevo al más antiguo.
async function searchPokemonCards(name, keep = () => true) {
  const found = (await searchCards(name)).filter((c) => c.set && db.getCollection(setCollectionId(c.set.id)) && keep(c));
  const sets = Object.fromEntries(db.getCollections('pokemon').map((c) => [c.set_id, c]));
  found.sort((a, b) => (sets[b.set.id]?.release_date || '').localeCompare(sets[a.set.id]?.release_date || '')
    || a.localId.localeCompare(b.localId, undefined, { numeric: true }));
  const qty = db.getQuantities(found.map((c) => c.id));
  return found.map((c) => db.withVariantQuantities({ ...c, quantity: qty[c.id] }));
}

function registerIpc() {
  ipcMain.handle('home:stats', () => db.getHomeStats());
  ipcMain.handle('collections:list', async (_e, tcg, { refreshSets = false } = {}) => {
    // La lista de sets se descarga la primera vez; sin conexión seguimos con lo que haya.
    if (tcg === 'pokemon' && (refreshSets || !db.hasSets())) {
      try {
        db.replaceSets(await fetchSets());
      } catch (err) {
        if (refreshSets) throw err;
      }
    }
    if (CATALOGS[tcg] && (refreshSets || !db.hasCatalog(tcg))) {
      try {
        db.replaceCatalog(tcg, await CATALOGS[tcg].fetchCatalog());
      } catch (err) {
        if (refreshSets || !db.hasCatalog(tcg)) throw err;
      }
    }
    if (SET_LISTS[tcg] && (refreshSets || !db.hasSetList(tcg))) {
      try {
        db.replaceSetList(tcg, await SET_LISTS[tcg].fetchSets());
      } catch (err) {
        if (refreshSets || !db.hasSetList(tcg)) throw err;
      }
    }
    return db.getCollections(tcg);
  });
  ipcMain.handle('collection:get', async (_e, id, { refresh = false } = {}) => {
    // La primera vez (o al pulsar "Actualizar") se descargan las cartas de la API.
    // Las colecciones custom no vienen de la API: sus cartas las elige el usuario.
    const col = db.getCollection(id);
    if (col && !col.custom && (refresh || !col.synced_at)) await syncCollection(id);
    return { collection: db.getCollection(id), cards: db.getCards(id) };
  });
  ipcMain.handle('custom:save', (_e, draft) => {
    const name = String(draft?.name ?? '').trim();
    if (!name) throw new Error('The collection needs a name');
    const tcg = TCG_IDS.includes(draft.tcg) ? draft.tcg : 'pokemon';
    return db.saveCustomCollection({ id: draft.id || null, tcg, name, cards: Array.isArray(draft.cards) ? draft.cards : [] });
  });
  ipcMain.handle('custom:delete', (_e, id) => {
    db.deleteCustomCollection(id);
    return true;
  });
  ipcMain.handle('notes:get', (_e, id) => db.getNotes(id));
  ipcMain.handle('collection:setNotes', (_e, id, notes) => {
    db.setCollectionNotes(id, String(notes ?? ''));
    return true;
  });
  // card (opcional): datos de la carta cuando se marca desde el buscador, para añadirla a su set.
  ipcMain.handle('card:setOwned', (_e, cardId, quantity, card) => {
    if (quantity > 0) {
      if (card?.setId) db.addCardToSet(card);
      else db.linkOwnedPokedexCards();
    }
    db.setOwned(cardId, Math.max(0, Math.floor(quantity)));
    return true;
  });
  // Copias de una versión concreta (variant '' = la principal). Devuelve el nuevo total de la carta.
  ipcMain.handle('card:setVariant', (_e, cardId, variant, quantity, card) => {
    if (quantity > 0) {
      if (card?.setId) db.addCardToSet(card);
      else db.linkOwnedPokedexCards();
    }
    return db.setVariantQuantity(cardId, String(variant || ''), Number(quantity) || 0);
  });
  ipcMain.handle('cards:search', async (_e, name, tcg) => {
    // Catálogos completos: todas las cartas están en la base de datos, se busca sin conexión.
    if (CATALOGS[tcg]) {
      await ensureCatalog(tcg);
      return db.searchCatalog(tcg, name);
    }
    if (SET_LISTS[tcg]) return withOwnership(tcg, await SET_LISTS[tcg].searchCards(name));
    // Solo se devuelven cartas de sets conocidos: hace falta la lista de sets (p. ej. al buscar desde un mazo).
    if (!db.hasSets()) db.replaceSets(await fetchSets());
    return searchPokemonCards(name);
  });
  // Artes de una carta: en los catálogos, la misma printKey en todos los sets (en One Piece, el mismo código);
  // en Pokémon, las cartas con el mismo nombre, HP, habilidades y ataques (ver printKey); en Magic y Yu-Gi-Oh!,
  // el mismo nombre exacto.
  ipcMain.handle('card:printings', async (_e, { id, name, localId, tcg }) => {
    if (CATALOGS[tcg]) return db.catalogPrintings(tcg, id, localId);
    if (SET_LISTS[tcg]) return withOwnership(tcg, await SET_LISTS[tcg].fetchPrintings(name));
    const exact = String(name).toLowerCase();
    const sameName = await searchPokemonCards(name, (c) => c.name.toLowerCase() === exact);
    const key = sameName.find((c) => c.id === id)?.printKey;
    return key ? sameName.filter((c) => c.printKey === key) : sameName;
  });
  // Precios actuales de las versiones de una carta (diálogo "View price").
  ipcMain.handle('card:prices', (_e, card) => cardPrices(db, card));
  ipcMain.handle('card:setHidden', (_e, collectionId, cardId, hidden) => {
    db.setHidden(collectionId, cardId, !!hidden);
    return true;
  });
  // TCG Collector no expone sus ids de carta: abrimos su buscador con "Nombre nº/total", que devuelve esa carta.
  ipcMain.handle('card:openTcgCollector', (_e, { name, localId, official }) => {
    const query = official ? `${name} ${localId}/${official}` : `${name} ${localId}`;
    return shell.openExternal(`https://www.tcgcollector.com/cards/intl?cardSearch=${encodeURIComponent(query)}`);
  });
  // TCGplayer: ficha del producto si TCGdex conoce su id; si no, su buscador con "Nombre nº/total".
  ipcMain.handle('card:openTcgplayer', async (_e, { id, name, localId, official, tcg, tcgplayerId }) => {
    // Sin id de producto (OPTCG API y YGOPRODeck no lo dan) se usa su buscador: por el código de la carta (OP01-001,
    // LOB-001) en los TCG que lo llevan impreso; en el resto, por el nombre.
    const line = TCGPLAYER_LINES[tcg];
    if (line) {
      const productId = tcgplayerId || db.getCardData(id)?.tcgplayer_id;
      const query = ['onepiece', 'yugioh'].includes(tcg) && localId ? localId : name;
      return shell.openExternal(productId
        ? `https://www.tcgplayer.com/product/${productId}`
        : `https://www.tcgplayer.com/search/${line}/product?productLineName=${line}&q=${encodeURIComponent(query)}`);
    }
    const productId = await fetchTcgplayerProductId(id).catch(() => null);
    const query = official ? `${name} ${localId}/${official}` : `${name} ${localId}`;
    return shell.openExternal(productId
      ? `https://www.tcgplayer.com/product/${productId}`
      : `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(query)}`);
  });
  // Scryfall: ficha de la carta si está guardada; si no, su buscador por nombre exacto.
  ipcMain.handle('card:openScryfall', (_e, { id, name, scryfallUri }) => {
    const uri = scryfallUri || db.getCardData(id)?.scryfall_uri;
    return shell.openExternal(uri || `https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}&unique=prints`);
  });
  // Moxfield no usa los ids de Scryfall: buscamos por nombre exacto, set y nº de coleccionista,
  // y como solo hay un resultado, Moxfield abre directamente la ficha de esa impresión.
  // En las cartas de dos caras se busca por la primera ("A // B" no da resultados).
  ipcMain.handle('card:openMoxfield', (_e, { name, localId, setId }) => {
    const query = [`!"${String(name).split(' // ')[0]}"`, setId && `set:${setId}`, localId && `cn:${localId}`]
      .filter(Boolean).join(' ');
    return shell.openExternal(`https://moxfield.com/search/cards?q=${encodeURIComponent(query)}`);
  });

  // Exportar en dos pasos: primero se elige dónde guardar (la app muestra la pantalla de carga después)
  // y luego se genera el fichero. Sin collectionId se exportan las cartas que tienes de todo el TCG.
  ipcMain.handle('export:choosePath', async (e, { tcg, collectionId, format, mode = 'owned', dialogTitle }) => {
    checkExportFormat(tcg, format);
    const col = collectionId ? db.getCollection(collectionId) : null;
    const tcgName = TCG_NAMES[tcg] || tcg;
    const title = `${col ? col.name : `${tcgName} collection`} - ${col ? mode : 'owned'}`.replace(/[\\/:*?"<>|]/g, '');
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      title: dialogTitle || 'Export collection', // viene traducido de la app
      defaultPath: path.join(app.getPath('documents'), `${title}.${FORMATS[format].ext}`),
      filters: [{ name: FORMATS[format].filter, extensions: [FORMATS[format].ext] }],
    });
    return canceled || !filePath ? null : filePath;
  });
  // Genera el fichero en filePath (la ruta elegida en export:choosePath). Devuelve { path, rows }.
  ipcMain.handle('collection:export', async (_e, { filePath, ...request }) => {
    if (!filePath) throw new Error('No file chosen');
    const { content, rows } = await buildExport(request);
    await fs.promises.writeFile(filePath, content);
    return { path: filePath, rows };
  });
  // Lo mismo, pero el texto va al portapapeles en vez de a un fichero (para la lista de texto de Moxfield).
  ipcMain.handle('collection:copyExport', async (_e, request) => {
    const { content, rows } = await buildExport(request);
    clipboard.writeText(content.toString('utf8'));
    return { rows };
  });
  ipcMain.handle('file:reveal', (_e, filePath) => shell.showItemInFolder(filePath));

  // Mazos: sus cartas no cuentan como cartas que tienes. Las acciones sobre las cartas devuelven la lista nueva.
  ipcMain.handle('decks:list', () => db.getDecks());
  ipcMain.handle('deck:get', (_e, id) => db.getDeck(id));
  ipcMain.handle('deck:create', (_e, draft) => {
    const name = String(draft?.name ?? '').trim();
    if (!name) throw new Error('The deck needs a name');
    if (!TCG_IDS.includes(draft.tcg)) throw new Error(`Unknown TCG: ${draft.tcg}`);
    return db.createDeck({ tcg: draft.tcg, name, format: String(draft.format || 'casual') });
  });
  ipcMain.handle('deck:update', (_e, id, changes = {}) => {
    const name = changes.name === undefined ? undefined : String(changes.name).trim();
    if (name === '') throw new Error('The deck needs a name');
    db.updateDeck(id, {
      name,
      format: changes.format === undefined ? undefined : String(changes.format),
      coverCardId: changes.coverCardId === undefined ? undefined : changes.coverCardId || null,
    });
    return db.getDeck(id);
  });
  ipcMain.handle('deck:delete', (_e, id) => {
    db.deleteDeck(id);
    return true;
  });
  ipcMain.handle('deck:addCard', (_e, deckId, card, opts) => {
    db.addDeckCard(deckId, card, { role: opts?.role || 'main', quantity: Math.max(1, Math.floor(opts?.quantity || 1)) });
    return db.getDeckCards(deckId);
  });
  ipcMain.handle('deck:updateCard', (_e, deckId, cardId, changes) => {
    db.updateDeckCard(deckId, cardId, changes || {});
    return db.getDeckCards(deckId);
  });

  // Wishlist: tampoco marca las cartas como tuyas.
  ipcMain.handle('wishlist:ids', () => db.getWishlistIds());
  ipcMain.handle('wishlist:get', (_e, tcg) => db.getWishlist(tcg));
  ipcMain.handle('wishlist:add', (_e, tcg, card) => {
    if (!TCG_IDS.includes(tcg)) throw new Error(`Unknown TCG: ${tcg}`);
    if (!card?.id || !card.name) throw new Error('The card needs an id and a name');
    db.addToWishlist(tcg, card);
    return true;
  });
  ipcMain.handle('wishlist:remove', (_e, cardId) => {
    db.removeFromWishlist(cardId);
    return true;
  });

  // kinds: tipos de carta que cuentan en la Pokédex ('fullart', 'promo', 'other'), según Settings.
  ipcMain.handle('pokedex:stats', (_e, kinds) => (db.isPokedexSynced() ? db.getPokedexStats(kinds) : null));
  ipcMain.handle('pokedex:get', async (_e, { refresh = false, kinds } = {}) => {
    if (refresh || !db.isPokedexSynced()) await syncPokedex(db);
    return db.getPokedex(kinds);
  });
  ipcMain.handle('pokedex:pokemon', async (_e, dexId, kinds) => {
    await refreshPrices(db, db.getPokemonFullArts(dexId, kinds));
    return { pokemon: db.getPokemon(dexId), cards: db.getPokemonFullArts(dexId, kinds) };
  });

  // Settings › Data management.
  ipcMain.handle('data:counts', () => db.getUserDataCounts());
  ipcMain.handle('data:clear', (_e, { catalog = false } = {}) => {
    db.clearUserData({ catalog: !!catalog });
    return true;
  });
  // Copia de seguridad en JSON con tus datos y los ajustes de la app (prefs, del localStorage de la interfaz).
  // Devuelve la ruta del fichero, o null si se cancela. En Android se comparte (Drive, WhatsApp…).
  ipcMain.handle('data:export', async (e, { prefs = {}, dialogTitle } = {}) => {
    const date = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      title: dialogTitle || 'Export all data',
      defaultPath: path.join(app.getPath('documents'), `TCG Companion backup ${date}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return null;
    const backup = { app: 'tcg-companion', version: 1, exportedAt: new Date().toISOString(), prefs, ...db.exportUserData() };
    await fs.promises.writeFile(filePath, Buffer.from(JSON.stringify(backup), 'utf8'));
    return filePath;
  });
  // Sustituye tus datos por los de una copia (el texto del fichero, que elige la interfaz). Antes descarga la lista de
  // sets de los TCG de la copia, si no estaba, para que sus cartas caigan en sus sets. Devuelve los ajustes de la copia.
  ipcMain.handle('data:import', async (_e, text) => {
    let backup;
    try {
      backup = JSON.parse(text);
    } catch {
      throw new Error('The file is not a TCG Companion backup');
    }
    if (backup?.app !== 'tcg-companion' || typeof backup.tables !== 'object') throw new Error('The file is not a TCG Companion backup');
    const tcgs = new Set((backup.collections || []).filter((c) => !c.custom).map((c) => c.tcg));
    for (const tcg of tcgs) {
      try {
        if (tcg === 'pokemon' && !db.hasSets()) db.replaceSets(await fetchSets());
        if (CATALOGS[tcg]) await ensureCatalog(tcg);
        if (SET_LISTS[tcg]) await ensureSetList(tcg);
      } catch { /* sin conexión: los sets de la copia se guardan tal cual */ }
    }
    db.importUserData(backup);
    return { prefs: backup.prefs || {}, counts: db.getUserDataCounts() };
  });

  // Settings › Storage (solo escritorio).
  ipcMain.handle('storage:info', () => storageInfo());
  // Elige una carpeta (reset: la de siempre). Devuelve { dir, exists } (exists: ya hay una base de datos allí, p. ej.
  // la de otro ordenador en la misma carpeta de Drive), o null si se cancela o es la carpeta actual.
  ipcMain.handle('storage:choose', async (e, { reset = false, dialogTitle } = {}) => {
    if (!MOVABLE) throw new Error('The database cannot be moved on this device');
    let dir = app.getPath('userData');
    if (!reset) {
      const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
        title: dialogTitle || 'Choose a folder', defaultPath: path.dirname(db.filePath), properties: ['openDirectory', 'createDirectory'],
      });
      if (canceled || !filePaths?.length) return null;
      dir = filePaths[0];
    }
    if (path.resolve(dir) === path.resolve(path.dirname(db.filePath))) return null;
    return { dir, exists: fs.existsSync(path.join(dir, DB_NAME)) };
  });
  // Pasa a usar la base de datos de dir: la que ya había allí (useExisting) o una copia de la actual. La carpeta
  // anterior conserva su copia.
  ipcMain.handle('storage:move', async (_e, { dir, useExisting = false }) => {
    if (!MOVABLE || !dir) throw new Error('The database cannot be moved');
    const target = path.join(dir, DB_NAME);
    if (useExisting && fs.existsSync(target)) {
      const next = new Database(target);
      await next.open();
      db = next;
    } else {
      // La base de datos que ya hubiera allí (la de otro ordenador) no se pierde: queda una copia al lado.
      if (fs.existsSync(target)) fs.copyFileSync(target, target.replace(/\.sqlite$/, `-replaced-${Date.now()}.sqlite`));
      db.filePath = target;
      db.save();
    }
    const isDefault = path.resolve(dir) === path.resolve(app.getPath('userData'));
    fs.writeFileSync(storageConfig(), JSON.stringify(isDefault ? {} : { dbDir: dir }));
    missingDir = null;
    return storageInfo();
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.tcgcompanion.app');
  db = new Database(path.join(dbDirAtStartup(), DB_NAME));
  await db.open();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
