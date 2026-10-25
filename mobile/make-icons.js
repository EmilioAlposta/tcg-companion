// Ícono y pantalla de carga de la app de Android a partir de assets/icon.png (fondo del color de la app).
// Solo hace falta volver a ejecutarlo si cambia el logo: `npm run mobile:icons`.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');
const RES = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const BG = '#0d1b2e';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const canvas = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: BG } });
const logo = (size) => sharp(ICON).resize(size, size).toBuffer();

async function main() {
  for (const [name, k] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${name}`);
    const px = Math.round(48 * k);
    // Ícono clásico (cuadrado y redondo): el logo ocupa casi todo, sobre el fondo.
    const square = await canvas(px, px).composite([{ input: await logo(Math.round(px * 0.86)), gravity: 'center' }]).png().toBuffer();
    await sharp(square).toFile(path.join(dir, 'ic_launcher.png'));
    const mask = Buffer.from(`<svg width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}"/></svg>`);
    await sharp(square).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(path.join(dir, 'ic_launcher_round.png'));
    // Ícono adaptable (Android 8+): 108 dp con el logo en la zona segura central de 66 dp.
    const fg = Math.round(108 * k);
    await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await logo(Math.round(66 * k)), gravity: 'center' }]).png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

  // Pantallas de carga: mismo tamaño que las de Capacitor, con el logo en el centro.
  for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const file = path.join(RES, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    const size = Math.round(Math.min(width, height) * 0.35);
    const out = await canvas(width, height).composite([{ input: await logo(size), gravity: 'center' }]).png().toBuffer();
    fs.writeFileSync(file, out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
