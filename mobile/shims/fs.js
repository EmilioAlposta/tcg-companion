// Sustituto de fs para la app de Android: los ficheros viven en memoria y los de /data (la base de datos)
// se guardan además en IndexedDB, que el WebView conserva entre sesiones.
// `ready` se resuelve cuando ya están cargados el wasm de sql.js y la base de datos guardada.
const { Buffer } = require('buffer');

const WASM_PATH = '/wasm/sql-wasm.wasm';
const files = new Map();
// db.js busca el wasm con require.resolve('sql.js/dist/sql-wasm.wasm'); build.js lo cambia por esta función.
globalThis.__resolveWasm = () => WASM_PATH;

const idb = new Promise((resolve, reject) => {
  const req = indexedDB.open('tcg-companion', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('files');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

function store(mode, fn) {
  return idb.then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  }));
}

// Las escrituras van en cola para que nunca llegue antes una versión vieja que una nueva.
let writes = Promise.resolve();
function persist(p) {
  const data = files.get(p);
  writes = writes.then(() => store('readwrite', (s) => s.put(new Uint8Array(data), p))).catch((err) => console.error(err));
  return writes;
}

const ready = Promise.all([
  fetch('sql-wasm.wasm').then((r) => r.arrayBuffer()).then((b) => files.set(WASM_PATH, Buffer.from(b))),
  store('readonly', (s) => s.getAllKeys()).then((keys) => Promise.all(keys.map((k) =>
    store('readonly', (s) => s.get(k)).then((v) => files.set(k, Buffer.from(v)))))),
]);

function enoent(p) {
  const err = new Error(`ENOENT: no such file, '${p}'`);
  err.code = 'ENOENT';
  return err;
}

const fs = {
  existsSync: (p) => files.has(p),
  readFileSync(p) {
    if (!files.has(p)) throw enoent(p);
    return files.get(p);
  },
  writeFileSync(p, data) { files.set(p, data); },
  mkdirSync() {},
  renameSync(from, to) {
    if (!files.has(from)) throw enoent(from);
    files.set(to, files.get(from));
    files.delete(from);
    if (to.startsWith('/data/')) persist(to);
  },
  promises: {
    // Solo lo usan las exportaciones (colecciones y copia de seguridad): el fichero se comparte en vez de guardarse.
    writeFile: (p, data) => require('./share-file').shareFile(p, data),
  },
  ready,
  flush: () => writes,
  WASM_PATH,
};

module.exports = fs;
