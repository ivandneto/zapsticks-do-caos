// 🎙️ Áudio .ogg (Opus), o formato das mensagens de voz do WhatsApp, gerado no navegador.
// O navegador comprime (WebCodecs AudioEncoder, Opus 48 kHz mono); aqui só montamos as "páginas" Ogg
// (RFC 3533 + RFC 7845: OpusHead, OpusTags e os pacotes de áudio, com CRC32 do Ogg).

const TAXA = 48000, PRE_SKIP = 312;

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0; for (let i = 0; i < b.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ b[i]) & 255]) >>> 0; return c; };

function pagina(pacotes, { granulo, serie, numero, inicio = false, fim = false }) {
  const lacing = [];
  for (const p of pacotes) { let n = p.length; while (n >= 255) { lacing.push(255); n -= 255; } lacing.push(n); }
  const corpo = pacotes.reduce((a, p) => a + p.length, 0);
  const b = new Uint8Array(27 + lacing.length + corpo);
  const dv = new DataView(b.buffer);
  b.set([79, 103, 103, 83], 0); // "OggS"
  b[5] = (inicio ? 2 : 0) | (fim ? 4 : 0);
  dv.setBigUint64(6, BigInt(granulo), true);
  dv.setUint32(14, serie, true);
  dv.setUint32(18, numero, true);
  b[26] = lacing.length;
  b.set(lacing, 27);
  let o = 27 + lacing.length;
  for (const p of pacotes) { b.set(p, o); o += p.length; }
  dv.setUint32(22, crc32(b), true);
  return b;
}

/** Monta o .ogg a partir dos pacotes Opus (Uint8Array) e da duração de cada um (em amostras a 48 kHz). */
export function montarOgg(pacotes, amostras) {
  const serie = (Math.random() * 0xffffffff) >>> 0;
  const head = new Uint8Array(19);
  head.set(new TextEncoder().encode('OpusHead'), 0);
  head[8] = 1; head[9] = 1; // versão, 1 canal
  new DataView(head.buffer).setUint16(10, PRE_SKIP, true);
  new DataView(head.buffer).setUint32(12, TAXA, true);
  const vendor = new TextEncoder().encode('Audio Sticks (web)');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set(new TextEncoder().encode('OpusTags'), 0);
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  const partes = [pagina([head], { granulo: 0, serie, numero: 0, inicio: true }), pagina([tags], { granulo: 0, serie, numero: 1 })];
  let granulo = PRE_SKIP, numero = 2, lote = [], segs = 0;
  pacotes.forEach((p, i) => {
    const s = Math.ceil((p.length + 1) / 255);
    if (lote.length && segs + s > 255) { partes.push(pagina(lote, { granulo, serie, numero: numero++ })); lote = []; segs = 0; }
    lote.push(p); segs += s; granulo += amostras[i];
  });
  partes.push(pagina(lote, { granulo, serie, numero: numero++, fim: true }));
  return new Blob(partes, { type: 'audio/ogg' });
}

/** Comprime amostras mono (Float32Array a 48 kHz) em .ogg Opus. */
export async function codificarOgg(amostras, { bitrate = 64000 } = {}) {
  if (!('AudioEncoder' in window)) throw new Error('Este navegador não consegue gerar áudio. Use o Chrome ou o Edge atualizados.');
  const cfg = { codec: 'opus', sampleRate: TAXA, numberOfChannels: 1, bitrate };
  if (!(await AudioEncoder.isConfigSupported(cfg)).supported) throw new Error('Este navegador não gera áudio Opus. Use o Chrome ou o Edge atualizados.');
  const pacotes = [], dur = [];
  let erro = null;
  const enc = new AudioEncoder({
    output: (chunk) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); pacotes.push(d); dur.push(Math.round((chunk.duration || 20000) * TAXA / 1e6)); },
    error: (e) => { erro = e; },
  });
  enc.configure(cfg);
  const BLOCO = TAXA; // 1 s por vez
  for (let i = 0; i < amostras.length; i += BLOCO) {
    const parte = amostras.subarray(i, Math.min(amostras.length, i + BLOCO));
    enc.encode(new AudioData({ format: 'f32', sampleRate: TAXA, numberOfFrames: parte.length, numberOfChannels: 1, timestamp: Math.round(i * 1e6 / TAXA), data: parte }));
  }
  await enc.flush();
  enc.close();
  if (erro) throw erro;
  return montarOgg(pacotes, dur);
}
