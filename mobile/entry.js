// Punto de entrada de la app de Android. Ejecuta el main.js y el preload.js de escritorio sin cambios
// (electron, fs, path y zlib se sustituyen por los de mobile/shims al empaquetar, ver build.js)
// y añade lo propio del móvil: guardado diferido de la base de datos y el botón Atrás de Android.
require('./polyfills');
const { Capacitor } = require('@capacitor/core');
const { App } = require('@capacitor/app');
const fs = require('fs');
const { Database } = require('../src/db');

// Desktop guarda la base de datos entera tras cada cambio. En el móvil se agrupan los cambios seguidos
// (marcar varias cartas) en un solo guardado, y se guarda al momento si la app pasa a segundo plano.
const saveNow = Database.prototype.save;
let pending = null;
Database.prototype.save = function save() {
  if (!this.db) return;
  clearTimeout(pending?.timer);
  pending = { db: this, timer: setTimeout(flush, 400) };
};
function flush() {
  if (!pending) return fs.flush();
  const { db, timer } = pending;
  clearTimeout(timer);
  pending = null;
  saveNow.call(db);
  return fs.flush();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
App.addListener('pause', flush);

require('../main.js');
require('../preload.js');

document.documentElement.classList.add('mobile');

// Botón Atrás de Android: cierra lo que esté abierto (menú, diálogo, carta en grande) como Escape;
// si no hay nada, vuelve a la pantalla anterior, y en el menú principal sale de la app.
const OVERLAYS = '.card-menu, .dialog-overlay, .modal:not(.hidden)';
if (Capacitor.isNativePlatform()) {
  App.addListener('backButton', () => {
    if (document.querySelector(OVERLAYS)) {
      const target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    const back = document.getElementById('back');
    if (back && !back.classList.contains('hidden')) back.click();
    else flush().then(() => App.exitApp());
  });
}
