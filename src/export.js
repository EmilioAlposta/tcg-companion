// Exportar la colección (un TCG entero o un set) a Excel o a CSV para importarlo en otras webs.
// Las filas se arman a partir de cartas con el formato de db.getCards (quantity, variants, variant_qty).
const zlib = require('zlib');

// Formatos que se pueden elegir. Moxfield solo tiene sentido en Magic: su importador de colección
// pide nombre, código de set (de Scryfall) y nº de coleccionista, y el acabado en "Foil" ('foil' / 'etched').
const FORMATS = {
  xlsx: { ext: 'xlsx', filter: 'Excel' },
  csv: { ext: 'csv', filter: 'CSV' },
  moxfield: { ext: 'csv', filter: 'Moxfield CSV' },
};

// Una fila por carta y versión. mode 'owned': las copias que tienes de cada versión.
// mode 'missing': las que te faltan; con splitVariants, cada versión que no tienes cuenta como una que falta
// (p. ej. tienes la normal pero no la reverse); sin él, solo las cartas de las que no tienes ninguna copia.
function exportRows(cards, { mode = 'owned', splitVariants = false, setName = () => '' } = {}) {
  const rows = [];
  for (const c of cards) {
    const variants = c.variants?.length ? c.variants : null;
    const label = (key) => (!variants ? '' : !key ? variants[0].label : variants.find((v) => v.key === key)?.label || key);
    const base = {
      setName: setName(c) || '', setCode: c.set_id || '', number: c.local_id || '', name: c.name, rarity: c.rarity || '',
    };
    const qty = c.variant_qty || (c.quantity ? { '': c.quantity } : {});
    if (mode === 'owned') {
      const keys = Object.keys(qty).filter((k) => qty[k] > 0);
      const order = (k) => (!variants || !k ? 0 : variants.findIndex((v) => v.key === k) + 1 || Infinity);
      for (const k of keys.sort((a, b) => order(a) - order(b))) {
        rows.push({ ...base, variant: label(k), variantKey: k || variants?.[0].key || '', quantity: qty[k] });
      }
    } else if (splitVariants && variants) {
      // La versión principal es la clave '' en variant_qty.
      variants.forEach((v, i) => {
        if (!(qty[i === 0 ? '' : v.key] > 0)) rows.push({ ...base, variant: v.label, variantKey: v.key, quantity: 1 });
      });
    } else if (!(c.quantity > 0)) {
      rows.push({ ...base, variant: '', variantKey: '', quantity: 1 });
    }
  }
  return rows;
}

// Contenido del fichero (Buffer) en el formato elegido.
function exportFile(rows, format, { mode = 'owned' } = {}) {
  if (format === 'moxfield') {
    // Cabecera de las exportaciones de colección de Moxfield, que es la que acepta su importador.
    const header = ['Count', 'Tradelist Count', 'Name', 'Edition', 'Condition', 'Language', 'Foil', 'Tags',
      'Last Modified', 'Collector Number', 'Alter', 'Proxy', 'Purchase Price'];
    return csv([header, ...rows.map((r) => [r.quantity, 0, r.name, r.setCode.toLowerCase(), 'Near Mint', 'English',
      ['foil', 'etched'].includes(r.variantKey) ? r.variantKey : '', '', '', r.number, 'False', 'False', ''])]);
  }
  // Nombre + set + número + cantidad: las columnas que reconocen los importadores CSV genéricos de colecciones.
  const header = ['Quantity', 'Name', 'Set', 'Set Code', 'Card Number', 'Variant', 'Rarity'];
  const table = [header, ...rows.map((r) => [r.quantity, r.name, r.setName, r.setCode, r.number, r.variant, r.rarity])];
  if (format === 'csv') return csv(table);
  return xlsx(table, { sheetName: mode === 'missing' ? 'Missing' : 'Collection', widths: [10, 34, 30, 12, 13, 26, 22] });
}

// BOM para que Excel abra bien las tildes; comillas solo cuando hacen falta.
function csv(table) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return Buffer.from('﻿' + table.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n', 'utf8');
}

// ---------- .xlsx mínimo (sin dependencias): una hoja, cabecera en negrita, filtros y columnas con ancho ----------

function xlsx(table, { sheetName, widths }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const col = (i) => { let s = ''; for (i += 1; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  const lastCell = `${col(table[0].length - 1)}${table.length}`;
  const sheetRows = table.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
    const ref = `${col(c)}${r + 1}`;
    const style = r === 0 ? ' s="1"' : '';
    return typeof v === 'number' ? `<c r="${ref}"${style}><v>${v}</v></c>`
      : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(v ?? '')}</t></is></c>`;
  }).join('')}</row>`).join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zip({
    '[Content_Types].xml': `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>',
    '_rels/.rels': `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${xml}<workbook ${ns} xmlns:r="${rel}"><sheets>`
      + `<sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets>`
      + `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${esc(sheetName)}'!$A$1:$${lastCell.replace(/(\d+)$/, '$$$1')}</definedName></definedNames>`
      + '</workbook>',
    'xl/_rels/workbook.xml.rels': `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${xml}<styleSheet ${ns}>`
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '</styleSheet>',
    'xl/worksheets/sheet1.xml': `${xml}<worksheet ${ns}>`
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      + `<sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${lastCell}"/></worksheet>`,
  });
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fichero .zip con compresión deflate (el formato de los .xlsx).
function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, 'utf8');
    const packed = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(0x21, 12); // fecha 1/1/1980 (una fecha 0 no es válida para algunos programas)
    head.writeUInt32LE(crc32(data), 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    head.copy(dir, 8, 6, 30); // flags, método, fecha, crc, tamaños y longitud del nombre: igual que la cabecera local
    dir.writeUInt32LE(offset, 42);
    locals.push(head, nameBuf, packed);
    central.push(dir, nameBuf);
    offset += head.length + nameBuf.length + packed.length;
  }
  const dirSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dirSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

module.exports = { FORMATS, exportRows, exportFile };
