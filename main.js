const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Database, setCollectionId, magicCollectionId } = require('./src/db');
const { fetchSetCards, fetchSets, searchCards, fetchTcgplayerProductId } = require('./src/pokemon-api');
const { syncPokedex, refreshPrices } = require('./src/pokedex-sync');
const onePiece = require('./src/onepiece-api');
const magic = require('./src/magic-api');
const { cardAttrs, cardVariants } = require('./src/card-attrs');
const { cardPrices } = require('./src/prices');
const { FORMATS, exportRows, exportFile } = require('./src/export');

const TCG_IDS = ['pokemon', 'onepiece', 'magic'];

let db;

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
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

async function syncCollection(collectionId) {
  const col = db.getCollection(collectionId);
  if (!col) throw new Error(`Unknown collection: ${collectionId}`);
  const cards = col.tcg === 'onepiece' ? await onePiece.fetchSetCards(col.set_id)
    : col.tcg === 'magic' ? await magic.fetchSetCards(col.set_id)
    : await fetchSetCards(col.set_id, col.name_filter);
  db.replaceCards(collectionId, cards);
}

async function ensureMagicSets() {
  if (!db.hasMagicSets()) db.replaceMagicSets(await magic.fetchSets());
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

}

// Cartas de Scryfall (buscador o artes) de sets conocidos, con lo que tienes de cada una y sus atributos y versiones.
async function withMagicOwnership(found) {
  await ensureMagicSets();
  const cards = found.filter((c) => db.getCollection(magicCollectionId(c.set.id)));
  const qty = db.getQuantities(cards.map((c) => c.id));
  return cards.map((c) => db.withVariantQuantities({
    ...c, price: c.market_price ?? null, quantity: qty[c.id], attrs: cardAttrs(c), variants: cardVariants(c),
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
  ipcMain.handle('db:path', () => db.filePath);
  ipcMain.handle('collections:list', async (_e, tcg, { refreshSets = false } = {}) => {
    // La lista de sets se descarga la primera vez; sin conexión seguimos con lo que haya.
    if (tcg === 'pokemon' && (refreshSets || !db.hasSets())) {
      try {
        db.replaceSets(await fetchSets());
      } catch (err) {
        if (refreshSets) throw err;
      }
    }
    if (tcg === 'onepiece' && (refreshSets || !db.hasOnePieceSets())) {
      try {
        db.replaceOnePieceCatalog(await onePiece.fetchCatalog());
      } catch (err) {
        if (refreshSets || !db.hasOnePieceSets()) throw err;
      }
    }
    if (tcg === 'magic' && (refreshSets || !db.hasMagicSets())) {
      try {
        db.replaceMagicSets(await magic.fetchSets());
      } catch (err) {
        if (refreshSets || !db.hasMagicSets()) throw err;
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
    // One Piece: el catálogo entero está en la base de datos, se busca sin conexión.
    if (tcg === 'onepiece') {
      if (!db.hasOnePieceSets()) db.replaceOnePieceCatalog(await onePiece.fetchCatalog());
      return db.searchOnePieceCards(name);
    }
    if (tcg === 'magic') return withMagicOwnership(await magic.searchCards(name));
    return searchPokemonCards(name);
  });
  // Artes de una carta: en One Piece, el mismo código en todos los sets;
  // en Pokémon, las cartas con el mismo nombre, HP, habilidades y ataques (ver printKey); en Magic, el mismo nombre exacto.
  ipcMain.handle('card:printings', async (_e, { id, name, localId, tcg }) => {
    if (tcg === 'onepiece') return db.onePiecePrintings(localId);
    if (tcg === 'magic') return withMagicOwnership(await magic.fetchPrintings(name));
    const exact = String(name).toLowerCase();
    const sameName = await searchPokemonCards(name, (c) => c.name.toLowerCase() === exact);
    const key = sameName.find((c) => c.id === id)?.printKey;
    return key ? sameName.filter((c) => c.printKey === key) : sameName;
  });
  // Precios actuales de las versiones de una carta (diálogo "View price").
  ipcMain.handle('card:prices', (_e, card) => cardPrices(db, card));
  ipcMain.handle('db:reveal', () => shell.showItemInFolder(db.filePath));
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
    if (tcg === 'onepiece') {
      // OPTCG API no da el id de producto: buscamos por el código de la carta (OP01-001).
      return shell.openExternal('https://www.tcgplayer.com/search/one-piece-card-game/product'
        + `?productLineName=one-piece-card-game&q=${encodeURIComponent(localId || name)}`);
    }
    if (tcg === 'magic') {
      const productId = tcgplayerId || db.getCardData(id)?.tcgplayer_id;
      return shell.openExternal(productId
        ? `https://www.tcgplayer.com/product/${productId}`
        : `https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=${encodeURIComponent(name)}`);
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
  ipcMain.handle('export:choosePath', async (e, { tcg, collectionId, format, mode = 'owned' }) => {
    checkExportFormat(tcg, format);
    const col = collectionId ? db.getCollection(collectionId) : null;
    const tcgName = { pokemon: 'Pokemon', onepiece: 'One Piece', magic: 'Magic' }[tcg] || tcg;
    const title = `${col ? col.name : `${tcgName} collection`} - ${col ? mode : 'owned'}`.replace(/[\\/:*?"<>|]/g, '');
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      title: 'Export collection',
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

  ipcMain.handle('pokedex:stats', () => (db.isPokedexSynced() ? db.getPokedexStats() : null));
  ipcMain.handle('pokedex:get', async (_e, { refresh = false } = {}) => {
    if (refresh || !db.isPokedexSynced()) await syncPokedex(db);
    return db.getPokedex();
  });
  ipcMain.handle('pokedex:pokemon', async (_e, dexId) => {
    await refreshPrices(db, db.getPokemonFullArts(dexId));
    return { pokemon: db.getPokemon(dexId), cards: db.getPokemonFullArts(dexId) };
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.tcgcompanion.app');
  db = new Database(path.join(app.getPath('userData'), 'tcg-companion.sqlite'));
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
