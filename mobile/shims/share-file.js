// Ficheros exportados: se guardan en la caché de la app y se abre el menú de compartir de Android
// (Drive, WhatsApp, Archivos…). En el navegador (vista previa) se descargan.
const { Capacitor } = require('@capacitor/core');
const { Filesystem, Directory, Encoding } = require('@capacitor/filesystem');
const { Share } = require('@capacitor/share');

async function shareFile(filePath, content) {
  const name = filePath.split('/').pop();
  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content]));
    a.download = name;
    a.click();
    return;
  }
  const isText = /\.(csv|txt|json)$/i.test(name);
  const { uri } = await Filesystem.writeFile({
    path: name,
    directory: Directory.Cache,
    data: isText ? content.toString('utf8') : content.toString('base64'),
    encoding: isText ? Encoding.UTF8 : undefined,
  });
  await Share.share({ title: name, files: [uri] }).catch((err) => {
    // Cerrar el menú sin elegir nada no es un error.
    if (!/cancel/i.test(String(err?.message || err))) throw err;
  });
}

module.exports = { shareFile };
