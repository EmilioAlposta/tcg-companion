const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { Database, setCollectionId } = require('./src/db');
const { fetchSetCards, fetchSets, searchCards, fetchTcgplayerProductId } = require('./src/pokemon-api');
const { syncPokedex, refreshPrices } = require('./src/pokedex-sync');
const onePiece = require('./src/onepiece-api');

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
  const cards = col.tcg === 'onepiece'
    ? await onePiece.fetchSetCards(col.set_id)
    : await fetchSetCards(col.set_id, col.name_filter);
  db.replaceCards(collectionId, cards);
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
    const tcg = draft.tcg === 'onepiece' ? 'onepiece' : 'pokemon';
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
    return searchPokemonCards(name);
  });
  // Artes de una carta: en One Piece, el mismo código en todos los sets;
  // en Pokémon, las cartas con el mismo nombre, HP, habilidades y ataques (ver printKey).
  ipcMain.handle('card:printings', async (_e, { id, name, localId, tcg }) => {
    if (tcg === 'onepiece') return db.onePiecePrintings(localId);
    const exact = String(name).toLowerCase();
    const sameName = await searchPokemonCards(name, (c) => c.name.toLowerCase() === exact);
    const key = sameName.find((c) => c.id === id)?.printKey;
    return key ? sameName.filter((c) => c.printKey === key) : sameName;
  });
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
  ipcMain.handle('card:openTcgplayer', async (_e, { id, name, localId, official, tcg }) => {
    if (tcg === 'onepiece') {
      // OPTCG API no da el id de producto: buscamos por el código de la carta (OP01-001).
      return shell.openExternal('https://www.tcgplayer.com/search/one-piece-card-game/product'
        + `?productLineName=one-piece-card-game&q=${encodeURIComponent(localId || name)}`);
    }
    const productId = await fetchTcgplayerProductId(id).catch(() => null);
    const query = official ? `${name} ${localId}/${official}` : `${name} ${localId}`;
    return shell.openExternal(productId
      ? `https://www.tcgplayer.com/product/${productId}`
      : `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(query)}`);
  });

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
