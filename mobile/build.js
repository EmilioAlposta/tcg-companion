// Genera mobile/www, la web que Capacitor mete en la app de Android, a partir de los mismos ficheros de escritorio:
// - mobile.js: main.js + preload.js + src/ empaquetados con esbuild, con electron, fs, path y zlib sustituidos
//   por mobile/shims (los ficheros de escritorio no se tocan).
// - renderer/ y assets/ copiados tal cual, y un index.html con la CSP del móvil, mobile.css, mobile.js
//   y texts.js (los textos de ayuda para pantalla táctil).
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'www');
const shim = (name) => path.join(__dirname, 'shims', `${name}.js`);
// WebView de Android 7+ aunque no se haya actualizado nunca (Android 11 de fábrica trae Chrome 83).
const TARGET = 'chrome80';

async function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(__dirname, 'entry.js')],
    outfile: path.join(OUT, 'mobile.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: TARGET,
    alias: { electron: shim('electron'), fs: shim('fs'), path: shim('path'), zlib: shim('zlib') },
    inject: [shim('buffer-global')],
    define: {
      'require.resolve': 'globalThis.__resolveWasm',
      'process.platform': '"android"',
      __dirname: '"/app"',
    },
    logLevel: 'warning',
  });

  // La interfaz: los mismos ficheros que en escritorio, con la sintaxis nueva traducida para los WebView viejos.
  // Las rutas "../assets/..." de la app se quedan en /assets.
  for (const f of ['app.js', 'i18n.js', 'sounds.js']) {
    const { code } = await esbuild.transform(fs.readFileSync(path.join(ROOT, 'renderer', f), 'utf8'), { target: TARGET, loader: 'js' });
    fs.writeFileSync(path.join(OUT, f), code);
  }
  fs.copyFileSync(path.join(ROOT, 'renderer', 'styles.css'), path.join(OUT, 'styles.css'));
  fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), {
    recursive: true, filter: (src) => !src.endsWith('logo-source.webp') && !src.endsWith('.ico'),
  });
  fs.copyFileSync(path.join(__dirname, 'mobile.css'), path.join(OUT, 'mobile.css'));
  const texts = await esbuild.transform(fs.readFileSync(path.join(__dirname, 'texts.js'), 'utf8'), { target: TARGET, loader: 'js' });
  fs.writeFileSync(path.join(OUT, 'texts.js'), texts.code);
  fs.copyFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'), path.join(OUT, 'sql-wasm.wasm'));

  // En escritorio las APIs se llaman desde el proceso principal; aquí desde la página, así que la CSP las permite.
  let html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
  html = html
    .replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />')
    .replace("default-src 'self';", "default-src 'self'; connect-src 'self' https: blob: data:;")
    .replace("img-src 'self' data:", "img-src 'self' data: blob:")
    // sql.js corre en la página (en escritorio, en el proceso principal): hace falta poder compilar su wasm.
    // Los WebView anteriores a Chrome 97 no conocen 'wasm-unsafe-eval' y lo piden con 'unsafe-eval'.
    .replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'")
    .replace('<link rel="stylesheet" href="styles.css" />', '<link rel="stylesheet" href="styles.css" />\n  <link rel="stylesheet" href="mobile.css" />')
    .replace('<script src="i18n.js"></script>', '<script src="mobile.js"></script>\n  <script src="i18n.js"></script>\n  <script src="texts.js"></script>');
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
