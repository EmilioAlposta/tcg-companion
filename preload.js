const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tcg', {
  dbPath: () => ipcRenderer.invoke('db:path'),
  revealDb: () => ipcRenderer.invoke('db:reveal'),
  listCollections: (tcg) => ipcRenderer.invoke('collections:list', tcg),
  getCollection: (id, opts) => ipcRenderer.invoke('collection:get', id, opts),
  getNotes: (id) => ipcRenderer.invoke('notes:get', id),
  setCollectionNotes: (id, notes) => ipcRenderer.invoke('collection:setNotes', id, notes),
  setOwned:(cardId, quantity) => ipcRenderer.invoke('card:setOwned', cardId, quantity),
  setHidden: (collectionId, cardId, hidden) => ipcRenderer.invoke('card:setHidden', collectionId, cardId, hidden),
  openTcgCollector: (card) => ipcRenderer.invoke('card:openTcgCollector', card),
  openTcgplayer: (card) => ipcRenderer.invoke('card:openTcgplayer', card),
  pokedexStats: () => ipcRenderer.invoke('pokedex:stats'),
  getPokedex: (opts) => ipcRenderer.invoke('pokedex:get', opts),
  getPokemon: (dexId) => ipcRenderer.invoke('pokedex:pokemon', dexId),
});
