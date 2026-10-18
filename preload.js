const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tcg', {
  dbPath: () => ipcRenderer.invoke('db:path'),
  revealDb: () => ipcRenderer.invoke('db:reveal'),
  listCollections: (tcg) => ipcRenderer.invoke('collections:list', tcg),
  getCollection: (id, opts) => ipcRenderer.invoke('collection:get', id, opts),
  setOwned: (cardId, quantity) => ipcRenderer.invoke('card:setOwned', cardId, quantity),
  pokedexStats: () => ipcRenderer.invoke('pokedex:stats'),
  getPokedex: (opts) => ipcRenderer.invoke('pokedex:get', opts),
  getPokemon: (dexId) => ipcRenderer.invoke('pokedex:pokemon', dexId),
});
