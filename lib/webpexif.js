// Dados da figurinha que o WhatsApp lê de dentro do .webp (bloco EXIF): nome do "pacote", autor e emojis.
// Figurinha não tem legenda no WhatsApp; é esse nome que aparece quando alguém toca na figurinha.
// Gravado na hora do envio, então renomear a figurinha no app já vale para o próximo envio.

const chunk = (id, data) => {
  const head = Buffer.alloc(8);
  head.write(id, 0, 'ascii');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};

function exifPayload(info) {
  const json = Buffer.from(JSON.stringify(info), 'utf8');
  // TIFF little-endian com 1 entrada: tag 0x5741 ("WA"), tipo 7 (bytes), tamanho do JSON, dados no offset 22
  const tiff = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0, 0, 0, 0, 0x16, 0x00, 0x00, 0x00]);
  tiff.writeUInt32LE(json.length, 14);
  return Buffer.concat([tiff, json]);
}

/** Tamanho da imagem de um .webp simples (VP8 ou VP8L), para montar o cabeçalho estendido. */
function simpleSize(id, d) {
  if (id === 'VP8 ') return { w: d.readUInt16LE(6) & 0x3fff, h: d.readUInt16LE(8) & 0x3fff, alpha: false };
  if (id === 'VP8L') {
    const b = d.readUInt32LE(1);
    return { w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1, alpha: Boolean((b >>> 28) & 1) };
  }
  return null;
}

/**
 * Devolve uma cópia do .webp com os dados da figurinha. Se o arquivo não for um .webp que dê para entender,
 * devolve o original (enviar sem nome é melhor do que não enviar).
 */
export function withStickerInfo(webp, { name = '', publisher = 'Audio Sticks', emojis = [] } = {}) {
  try {
    if (webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') return webp;
    const chunks = [];
    for (let p = 12; p + 8 <= webp.length;) {
      const id = webp.toString('ascii', p, p + 4);
      const size = webp.readUInt32LE(p + 4);
      const data = webp.subarray(p + 8, p + 8 + size);
      if (data.length < size) return webp;
      if (id !== 'EXIF') chunks.push({ id, data: Buffer.from(data) });
      p += 8 + size + (size % 2);
    }
    if (!chunks.length) return webp;

    if (chunks[0].id !== 'VP8X') {
      const dim = simpleSize(chunks[0].id, chunks[0].data);
      if (!dim) return webp;
      const x = Buffer.alloc(10);
      x[0] = dim.alpha ? 0x10 : 0;
      x.writeUIntLE(dim.w - 1, 4, 3);
      x.writeUIntLE(dim.h - 1, 7, 3);
      chunks.unshift({ id: 'VP8X', data: x });
    }
    chunks[0].data[0] |= 0x08; // bandeira "tem EXIF"

    const info = {
      'sticker-pack-id': 'audio-sticks',
      'sticker-pack-name': String(name).slice(0, 120),
      'sticker-pack-publisher': String(publisher).slice(0, 120),
      emojis: emojis.filter(Boolean),
    };
    const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...chunks.map((c) => chunk(c.id, c.data)), chunk('EXIF', exifPayload(info))]);
    const head = Buffer.alloc(8);
    head.write('RIFF', 0, 'ascii');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body]);
  } catch {
    return webp;
  }
}
