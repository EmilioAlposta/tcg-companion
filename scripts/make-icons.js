// Genera assets/icon.png (512px) y assets/icon.ico a partir de assets/logo-source.webp
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const assets = path.join(__dirname, '..', 'assets');
const source = path.join(assets, 'logo-source.webp');
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

// Ajusta una imagen a un cuadrado sin deformarla, rellenando con transparencia.
async function toSquare(buffer, size) {
  return sharp(buffer).resize(size, size, { fit: 'contain', background: transparent }).png().toBuffer();
}

(async () => {
  // Quita el margen transparente del logo para que ocupe todo el icono.
  const trimmed = await sharp(source).trim({ threshold: 20 }).toBuffer();
  const { width, height } = await sharp(trimmed).metadata();

  // Para tamaños pequeños recortamos un poco los laterales: el logo es más ancho que alto y así
  // se ve más grande en el escritorio (a ese tamaño no se nota el borde de las cartas recortado).
  const side = Math.min(width, height + 60);
  const padTop = Math.round((side - height) / 2);
  const tight = await sharp(trimmed)
    .extract({ left: Math.round((width - side) / 2), top: 0, width: side, height })
    .extend({ top: padTop, bottom: side - height - padTop, left: 0, right: 0, background: transparent })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(assets, 'icon.png'), await toSquare(trimmed, 512));

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map((s) => toSquare(s <= 64 ? tight : trimmed, s)));
  const toIco = pngToIco.default || pngToIco;
  fs.writeFileSync(path.join(assets, 'icon.ico'), await toIco(pngs));
  console.log('Iconos generados en assets/');
})();
