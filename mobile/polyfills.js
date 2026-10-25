// Métodos que usa la app y que no tiene el WebView de los Android sin actualizar (Chrome < 97).
// La sintaxis nueva (||=, ?. …) ya la traduce esbuild al empaquetar; los métodos hay que añadirlos.
function define(proto, name, fn) {
  if (!proto[name]) Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true });
}

function at(i) {
  const n = Math.trunc(i) || 0;
  return this[n < 0 ? this.length + n : n];
}
define(Array.prototype, 'at', at);
define(String.prototype, 'at', at);
define(Array.prototype, 'findLast', function findLast(fn, thisArg) {
  for (let i = this.length - 1; i >= 0; i--) if (fn.call(thisArg, this[i], i, this)) return this[i];
  return undefined;
});
