const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { Database } = require('./src/db');
const { fetchSetCards } = require('./src/pokemon-api');
const { syncPokedex, refreshPrices } = require('./src/pokedex-sync');

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
  if (!col) throw new Error(`Colección desconocida: ${collectionId}`);
  const cards = await fetchSetCards(col.set_id, col.name_filter);
  db.replaceCards(collectionId, cards);
}

function registerIpc() {
  ipcMain.handle('db:path', () => db.filePath);
  ipcMain.handle('collections:list', (_e, tcg) => db.getCollections(tcg));
  ipcMain.handle('collection:get', async (_e, id, { refresh = false } = {}) => {
    // La primera vez (o al pulsar "Actualizar") se descargan las cartas de la API.
    if (refresh || db.getCards(id).length === 0) await syncCollection(id);
    return { collection: db.getCollection(id), cards: db.getCards(id) };
  });
  ipcMain.handle('card:setOwned', (_e, cardId, quantity) => {
    db.setOwned(cardId, Math.max(0, Math.floor(quantity)));
    return true;
  });
  ipcMain.handle('db:reveal', () => shell.showItemInFolder(db.filePath));

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
