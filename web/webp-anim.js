// 🎞️ Monta um .webp ANIMADO a partir de quadros .webp parados (os que o próprio navegador gera com canvas.toBlob).
// Sem conversor pesado: o navegador comprime cada quadro e aqui só juntamos tudo no formato oficial do WebP
// (RIFF · VP8X · ANIM · ANMF por quadro), que é o que o WhatsApp lê.

const te = new TextEncoder();
const u24 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255];

/** Os pedaços ("chunks") de um .webp parado: [{ fourcc, data }]. */
function chunksOf(buf) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('quadro não é WebP (o navegador não gerou WebP)');
  const out = [];
  for (let o = 12; o + 8 <= b.length;) {
    const fourcc = tag(o), size = dv.getUint32(o + 4, true);
    out.push({ fourcc, data: b.subarray(o + 8, o + 8 + size) });
    o += 8 + size + (size & 1);
  }
  return out;
}

function chunk(fourcc, parts) {
  const size = parts.reduce((a, p) => a + p.length, 0);
  const head = new Uint8Array(8);
  head.set(te.encode(fourcc), 0);
  new DataView(head.buffer).setUint32(4, size, true);
  return [head, ...parts, ...(size & 1 ? [new Uint8Array(1)] : [])];
}
const join = (parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };

/**
 * frames: ArrayBuffer de cada quadro (.webp parado, todos do mesmo tamanho)
 * durations: ms de cada quadro · loop: 0 = repete para sempre
 */
export function muxAnimatedWebp(frames, { width, height, durations, loop = 0 }) {
  let alpha = false;
  const anmf = [];
  frames.forEach((buf, i) => {
    const parts = chunksOf(buf).filter((c) => c.fourcc === 'ALPH' || c.fourcc === 'VP8 ' || c.fourcc === 'VP8L');
    if (!parts.length) throw new Error('quadro sem imagem');
    if (parts.some((c) => c.fourcc === 'ALPH' || c.fourcc === 'VP8L')) alpha = true;
    const head = new Uint8Array([...u24(0), ...u24(0), ...u24(width - 1), ...u24(height - 1), ...u24(Math.max(1, Math.round(durations[i] ?? durations[0]))), 0b10]); // sem mistura, sem descarte
    anmf.push(...chunk('ANMF', [head, ...parts.flatMap((c) => chunk(c.fourcc, [c.data]))]));
  });
  const vp8x = chunk('VP8X', [new Uint8Array([0b10 | (alpha ? 0b10000 : 0), 0, 0, 0, ...u24(width - 1), ...u24(height - 1)])]);
  const anim = chunk('ANIM', [new Uint8Array([0, 0, 0, 0, loop & 255, (loop >> 8) & 255])]);
  const body = join([te.encode('WEBP'), ...vp8x, ...anim, ...anmf]);
  const riff = new Uint8Array(8);
  riff.set(te.encode('RIFF'), 0);
  new DataView(riff.buffer).setUint32(4, body.length, true);
  return new Blob([riff, body], { type: 'image/webp' });
}
