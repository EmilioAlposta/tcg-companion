// Lo poco de path que usan main.js y db.js, con rutas siempre separadas por "/".
const join = (...parts) => parts.join('/').replace(/\/+/g, '/');
const dirname = (p) => p.replace(/\/[^/]*$/, '') || '/';

module.exports = { join, dirname, sep: '/' };
