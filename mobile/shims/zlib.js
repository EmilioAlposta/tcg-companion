// export.js solo usa deflateRawSync (para el .xlsx): fflate hace lo mismo en el navegador.
const { deflateSync } = require('fflate');
const { Buffer } = require('buffer');

module.exports = { deflateRawSync: (data) => Buffer.from(deflateSync(data)) };
