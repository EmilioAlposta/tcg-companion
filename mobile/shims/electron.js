// Sustituto de Electron para la app de Android: main.js se ejecuta tal cual dentro del WebView.
// ipcMain guarda los manejadores y window.tcg (ver entry.js) los llama directamente, sin proceso aparte.
const { Browser } = require('@capacitor/browser');
const { ready } = require('./fs');

const handlers = {};
// main.js registra los manejadores y justo después crea la ventana: entonces ya se puede llamar a window.tcg.
let started;
const whenStarted = new Promise((resolve) => { started = resolve; });

const ipcMain = {
  handle(channel, fn) { handlers[channel] = fn; },
};

// Llama al manejador como lo haría ipcRenderer.invoke (siempre devuelve una promesa).
async function invoke(channel, ...args) {
  await whenStarted;
  const fn = handlers[channel];
  if (!fn) throw new Error(`No handler for ${channel}`);
  return fn({ sender: null }, ...args);
}

const app = {
  whenReady: () => ready,
  getPath: (name) => (name === 'documents' ? '/exports' : '/data'),
  setAppUserModelId() {},
  on() {},
  quit() {},
};

class BrowserWindow {
  constructor() { started(); }
  loadFile() {}
  static getAllWindows() { return [null]; }
  static fromWebContents() { return null; }
}

// Los enlaces externos (Scryfall, TCGplayer…) se abren en el navegador del sistema.
const shell = {
  openExternal: (url) => Browser.open({ url }),
  showItemInFolder() {},
};

// No hay diálogo de "Guardar como": el fichero se crea en la caché y luego se comparte (ver share-file.js).
const dialog = {
  showSaveDialog: async (_win, { defaultPath }) => ({ canceled: false, filePath: defaultPath }),
};

const clipboard = {
  writeText: (text) => navigator.clipboard.writeText(text),
};

// Lo que usa preload.js.
const ipcRenderer = { invoke };
const contextBridge = {
  exposeInMainWorld(name, api) { window[name] = api; },
};

module.exports = { ipcMain, ipcRenderer, contextBridge, app, BrowserWindow, shell, dialog, clipboard };
