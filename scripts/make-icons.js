// Genera assets/icon.png (512px) y assets/icon.ico a partir de assets/logo-source.webp
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const assets = path.join(__dirname, '..', 'assets');
const source = path.join(assets, 'logo-source.webp');

(async () => {
  await sharp(source).resize(512, 512).png().toFile(path.join(assets, 'icon.png'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map((s) => sharp(source).resize(s, s).png().toBuffer()));
  const toIco = pngToIco.default || pngToIco;
  fs.writeFileSync(path.join(assets, 'icon.ico'), await toIco(pngs));
  console.log('Iconos generados en assets/');
})();
