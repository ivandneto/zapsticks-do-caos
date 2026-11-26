// 🎬 Mídia na versão web: tudo o que o ffmpeg faz no app, feito aqui com o que o navegador já tem
// (canvas, <video>, ImageDecoder, WebCodecs). A conta do enquadramento é a mesma do lib/audio.js (squareFilter).

import { muxAnimatedWebp } from './webp-anim.js';
import { codificarOgg } from './ogg.js';

export const S = 512;
const RAIO = 56;                  // cantos arredondados da figurinha (como a máscara do app)
const ORCAMENTO_ANIM = 490 * 1024; // WhatsApp: figurinha animada até ~500 KB
const ORCAMENTO_PARADA = 98 * 1024; // e parada até 100 KB
const TAXA = 48000;

// ---------- abrir o arquivo ----------
const ext = (nome) => (String(nome).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
const esperar = (el, ev, ms = 20000) => new Promise((ok, erro) => {
  const t = setTimeout(() => erro(new Error('O navegador demorou demais para abrir o arquivo.')), ms);
  el.addEventListener(ev, () => { clearTimeout(t); ok(); }, { once: true });
  el.addEventListener('error', () => { clearTimeout(t); erro(new Error('Este navegador não abre esse formato. Use MP4, WebM, MP3, M4A, OGG, JPG, PNG, GIF ou WebP.')); }, { once: true });
});

/** Quadros de uma imagem animada (GIF, WebP, APNG): [{ bmp, t }] e a duração. */
async function quadrosAnimados(blob, tipo) {
  if (!('ImageDecoder' in window) || !(await ImageDecoder.isTypeSupported(tipo).catch(() => false))) return null;
  const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: tipo });
  await dec.tracks.ready;
  await dec.completed;
  const n = dec.tracks.selectedTrack?.frameCount || 1;
  if (n < 2) { dec.close(); return null; }
  const quadros = [];
  let t = 0;
  for (let i = 0; i < Math.min(n, 600); i++) {
    const { image } = await dec.decode({ frameIndex: i });
    quadros.push({ bmp: await createImageBitmap(image), t });
    t += (image.duration || 100000) / 1e6;
    image.close();
  }
  dec.close();
  return { quadros, duracao: t };
}

/**
 * Abre um arquivo e diz o que ele é. Devolve a "fonte" usada no resto:
 * { media: 'video'|'audio'|'image'|'gif', duration, hasVideo, hasAudio, width, height, blob, … }
 */
export async function abrirFonte(blob, nome = '') {
  const tipo = blob.type || ({ gif: 'image/gif', webp: 'image/webp', png: 'image/png', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav' }[ext(nome)] || '');
  if (/^image\//.test(tipo)) {
    const anim = /gif|webp|png|apng/.test(tipo) ? await quadrosAnimados(blob, tipo === 'image/apng' ? 'image/png' : tipo).catch(() => null) : null;
    if (anim) {
      const { width, height } = anim.quadros[0].bmp;
      return { media: 'gif', duration: anim.duracao, hasVideo: true, hasAudio: false, width, height, blob, quadros: anim.quadros };
    }
    const bmp = await createImageBitmap(blob).catch(() => { throw new Error('Não consegui abrir essa imagem.'); });
    return { media: 'image', duration: 0, hasVideo: true, hasAudio: false, width: bmp.width, height: bmp.height, blob, bmp };
  }
  if (/^(video|audio)\//.test(tipo) || ['mkv', 'avi', 'flac', 'aac', 'wma', 'wmv'].includes(ext(nome))) {
    const url = URL.createObjectURL(blob);
    const el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = url;
    await esperar(el, 'loadedmetadata');
    let duration = el.duration;
    if (!Number.isFinite(duration)) { // gravação do navegador (MediaRecorder) vem sem duração: força a leitura até o fim
      el.currentTime = 1e9;
      await esperar(el, 'durationchange', 8000).catch(() => {});
      duration = Number.isFinite(el.duration) ? el.duration : 0;
      el.currentTime = 0;
    }
    if (!duration) throw new Error('Não consegui ler esse arquivo. Ele pode estar corrompido ou num formato que o navegador não abre.');
    const hasVideo = el.videoWidth > 0;
    const hasAudio = !hasVideo || await temSom(el);
    if (hasVideo) { el.currentTime = 0; await esperar(el, 'seeked', 8000).catch(() => {}); }
    return { media: hasVideo ? 'video' : 'audio', duration, hasVideo, hasAudio, width: el.videoWidth, height: el.videoHeight, blob, el, url, fila: Promise.resolve() };
  }
  throw new Error('Esse tipo de arquivo não é suportado. Use vídeo, áudio, foto ou GIF.');
}

/** O vídeo tem som? Cada navegador conta de um jeito; toca mudo um instante para o Chrome contar. */
async function temSom(el) {
  if ('mozHasAudio' in el) return el.mozHasAudio;
  if (el.audioTracks) return el.audioTracks.length > 0;
  if (!('webkitAudioDecodedByteCount' in el)) return true;
  try { await el.play(); await new Promise((r) => setTimeout(r, 350)); el.pause(); } catch { return true; }
  return el.webkitAudioDecodedByteCount > 0;
}

// ---------- quadro no tempo t ----------
/** O que desenhar no tempo t: { img, w, h } (vídeo posicionado, quadro do GIF ou a foto). Um pedido por vez por vídeo. */
export function quadroEm(fonte, t) {
  if (fonte.media === 'image') return Promise.resolve({ img: fonte.bmp, w: fonte.width, h: fonte.height });
  if (fonte.media === 'gif') {
    const d = fonte.duration || 1, tt = ((t % d) + d) % d;
    let q = fonte.quadros[0];
    for (const x of fonte.quadros) { if (x.t <= tt + 1e-6) q = x; else break; }
    return Promise.resolve({ img: q.bmp, w: fonte.width, h: fonte.height });
  }
  const el = fonte.el;
  const vez = fonte.fila.then(() => new Promise((ok) => {
    const alvo = Math.max(0, Math.min(t, (fonte.duration || 0) - 0.001));
    if (Math.abs(el.currentTime - alvo) < 0.0005 && el.readyState >= 2) return ok();
    const t0 = setTimeout(ok, 3000);
    el.addEventListener('seeked', () => { clearTimeout(t0); ok(); }, { once: true });
    el.currentTime = alvo;
  })).then(() => ({ img: el, w: el.videoWidth, h: el.videoHeight }));
  fonte.fila = vez.catch(() => {});
  return vez;
}

// ---------- enquadramento (mesma conta do squareFilter do app) ----------
const limpaFrame = (f) => {
  const n = (v, a, b, d) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : d);
  return f ? { z: n(f.z, 0.25, 4, 1), x: n(f.x, 0, 1, 0.5), y: n(f.y, 0, 1, 0.5) } : { z: 1, x: 0.5, y: 0.5 };
};
/** Desenha o quadro num quadrado de lado L: 'crop' (zoom e posição) ou 'pad' (inteiro, centralizado). */
export function desenhar(ctx, q, L, { fit = 'crop', frame = null } = {}) {
  if (fit === 'pad') {
    const k = Math.min(L / q.w, L / q.h), w = q.w * k, h = q.h * k;
    ctx.drawImage(q.img, (L - w) / 2, (L - h) / 2, w, h);
    return;
  }
  const f = limpaFrame(frame);
  const k = (L * f.z) / Math.min(q.w, q.h), w = q.w * k, h = q.h * k;
  ctx.drawImage(q.img, (L - w) * f.x, (L - h) * f.y, w, h);
}

const tela = (w, h = w) => { const c = new OffscreenCanvas(w, h); return [c, c.getContext('2d', { willReadFrequently: false })]; };

/** Um quadro pronto da figurinha (512×512): enquadrado, com cantos arredondados (no quadrado) e o texto por cima. */
async function compor(fonte, t, { fit, frame, overlay, cantos = true, fundo = null }) {
  const [c, ctx] = tela(S);
  if (fundo) { ctx.fillStyle = fundo; ctx.fillRect(0, 0, S, S); }
  const q = await quadroEm(fonte, t);
  if (cantos && fit !== 'pad') { ctx.save(); ctx.beginPath(); ctx.roundRect(0, 0, S, S, RAIO); ctx.clip(); desenhar(ctx, q, S, { fit, frame }); ctx.restore(); }
  else desenhar(ctx, q, S, { fit, frame });
  if (overlay) ctx.drawImage(overlay, 0, 0, S, S);
  return c;
}

/** Prévia: 'crop'/'pad' em 320×320 (JPEG, como o /api/frame do app) ou 'full' (o quadro inteiro, até 720). */
export async function previa(fonte, t, { fit = 'crop', frame = null } = {}) {
  const q = await quadroEm(fonte, t);
  if (fit === 'full') {
    const k = Math.min(1, 720 / q.w, 720 / q.h);
    const [c, ctx] = tela(Math.round(q.w * k), Math.round(q.h * k));
    ctx.drawImage(q.img, 0, 0, c.width, c.height);
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  }
  const [c, ctx] = tela(320);
  ctx.fillStyle = fit === 'pad' ? '#2a2a36' : '#000';
  ctx.fillRect(0, 0, 320, 320);
  desenhar(ctx, q, 320, { fit, frame });
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}

const webp = async (c, q) => {
  const b = await c.convertToBlob({ type: 'image/webp', quality: q });
  if (b.type !== 'image/webp') throw new Error('Este navegador não gera figurinha (WebP). Use o Chrome, o Edge ou o Firefox atualizados.');
  return b;
};

// ---------- figurinhas ----------
/** Figurinha parada: .webp até 100 KB (+ o .png 512 como "molde" da Combinação). */
export async function figurinhaParada(fonte, { t = 0, fit, frame, overlay }) {
  const c = await compor(fonte, t, { fit, frame, overlay });
  let blob;
  for (const q of [0.85, 0.7, 0.55, 0.4, 0.25, 0.12, 0.05]) { blob = await webp(c, q); if (blob.size <= ORCAMENTO_PARADA) break; }
  return { webp: blob, png: await c.convertToBlob({ type: 'image/png' }) };
}

// Mesma regra do app (lib/audio.js → ANIM_LADDER): segura os fps e baixa primeiro a qualidade.
const ESCADA = [[15, 0.7], [15, 0.45], [12, 0.4], [12, 0.25], [12, 0.15], [10, 0.15], [10, 0.1], [10, 0.06], [8, 0.08], [8, 0.04], [6, 0.06], [5, 0.04]];

/**
 * Figurinha animada: .webp até ~490 KB, em loop. quadros(t) devolve o canvas 512 do instante t.
 * Rápido: tira os quadros UMA vez (a 15 qps; menos qps reaproveita os mesmos) e estima o tamanho de cada
 * degrau com uma amostra de 12 quadros, para só comprimir tudo no degrau que deve caber.
 */
async function animar(quadros, dur, onProg, base = 15) {
  const n0 = Math.max(1, Math.round(dur * base));
  const todos = [];
  for (let i = 0; i < n0; i++) { todos.push((await quadros(i / base)).transferToImageBitmap()); onProg?.((i + 1) / n0); }
  const [c, ctx] = tela(S);
  const comprime = async (b, q) => { ctx.clearRect(0, 0, S, S); ctx.drawImage(b, 0, 0); return (await webp(c, q)).arrayBuffer(); };
  const doFps = (fps) => { const n = Math.max(1, Math.round(dur * fps)); return Array.from({ length: n }, (_, i) => todos[Math.min(n0 - 1, Math.round(i * base / fps))]); };
  let inicio = 0;
  if (n0 > 24) { // estimativa com amostra
    for (; inicio < ESCADA.length - 1; inicio++) {
      const [fps, q] = ESCADA[inicio];
      const lista = doFps(Math.min(fps, base));
      const amostra = Array.from({ length: 12 }, (_, i) => lista[Math.floor(i * lista.length / 12)]);
      let soma = 0;
      for (const b of amostra) soma += (await comprime(b, q)).byteLength;
      if ((soma / amostra.length) * lista.length <= ORCAMENTO_ANIM * 0.93) break;
    }
    inicio = Math.max(0, inicio - 1); // a estimativa é aproximada: tenta um degrau acima antes
  }
  let melhor = null;
  for (let k = inicio; k < ESCADA.length; k++) {
    const [fpsPedido, q] = ESCADA[k];
    const fps = Math.min(fpsPedido, base);
    const lista = doFps(fps);
    const partes = [];
    for (const b of lista) partes.push(await comprime(b, q));
    melhor = muxAnimatedWebp(partes, { width: S, height: S, durations: partes.map(() => 1000 / fps) });
    if (melhor.size <= ORCAMENTO_ANIM) break;
  }
  todos.forEach((b) => b.close());
  return melhor;
}

export function figurinhaAnimada(fonte, { start = 0, duration, fit, frame, overlay, onProg }) {
  const d = Math.min(10, duration);
  return animar((t) => compor(fonte, start + t, { fit, frame, overlay }), d, onProg);
}

/** Animada a partir de quadros já prontos (PNG 512 recortados no "Tirar o fundo"). */
export async function figurinhaDeQuadros(blobs, fps, { overlay } = {}) {
  const bmps = await Promise.all(blobs.map((b) => createImageBitmap(b)));
  const dur = bmps.length / fps;
  const quadro = async (t) => {
    const [c, ctx] = tela(S);
    const b = bmps[Math.min(bmps.length - 1, Math.floor(t * fps + 1e-6))];
    ctx.drawImage(b, (S - b.width) / 2, (S - b.height) / 2);
    if (overlay) ctx.drawImage(overlay, 0, 0, S, S);
    return c;
  };
  const out = await animar(quadro, dur, null, fps);
  bmps.forEach((b) => b.close());
  return { webp: out, quadro, dur };
}

/** Quadros (PNG cabendo em 512, sem cortar) de um trecho, para o editor de "Tirar o fundo". */
export async function quadrosParaRecorte(fonte, start, end, fps = 12) {
  const out = [];
  const n = Math.max(1, Math.round(Math.min(10, end - start) * fps));
  for (let i = 0; i < n; i++) {
    const q = await quadroEm(fonte, start + i / fps);
    const k = Math.min(S / q.w, S / q.h, 1);
    const [c, ctx] = tela(Math.round(q.w * k), Math.round(q.h * k));
    ctx.drawImage(q.img, 0, 0, c.width, c.height);
    out.push(await c.convertToBlob({ type: 'image/png' }));
  }
  return out;
}

// ---------- som ----------
const decodificados = new WeakMap();
/** Todo o som do arquivo, mono a 48 kHz (decodificado uma vez por fonte). */
export async function somDaFonte(fonte) {
  if (decodificados.has(fonte)) return decodificados.get(fonte);
  const ctx = new OfflineAudioContext(1, 1, TAXA);
  let buf;
  try { buf = await ctx.decodeAudioData(await fonte.blob.arrayBuffer()); } catch { throw new Error('Não consegui ler o som desse arquivo. Tente outro formato (MP4, MP3, M4A, OGG, WebM).'); }
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels; }
  const r = { amostras: buf.sampleRate === TAXA ? mono : reamostrar(mono, buf.sampleRate) };
  decodificados.set(fonte, r);
  return r;
}
function reamostrar(x, de) {
  const n = Math.round(x.length * TAXA / de), y = new Float32Array(n), k = de / TAXA;
  for (let i = 0; i < n; i++) { const p = i * k, a = Math.floor(p), f = p - a; y[i] = (x[a] || 0) * (1 - f) + (x[a + 1] || 0) * f; }
  return y;
}

/**
 * Recorta o trecho e trata o som como o app: entrada/saída suave, volume equalizado (alvo ~ -14 LUFS,
 * aproximado pelo RMS) e reforço em dB com limitador. Devolve Float32Array mono 48 kHz.
 */
export function tratarSom(todas, { ss, duration, fadeIn = false, fadeOut = false, normalize = true, gainDb = 0 }) {
  const a = Math.max(0, Math.round(ss * TAXA)), b = Math.min(todas.length, a + Math.round(duration * TAXA));
  const y = todas.slice(a, b);
  const n = y.length;
  if (!n) throw new Error('O trecho está sem som.');
  if (fadeIn) { const f = Math.round(Math.min(0.3, duration / 4) * TAXA); for (let i = 0; i < f && i < n; i++) y[i] *= i / f; }
  if (fadeOut) { const f = Math.round(Math.min(0.5, duration / 4) * TAXA); for (let i = 0; i < f && i < n; i++) y[n - 1 - i] *= i / f; }
  let ganho = 1;
  if (normalize) {
    let soma = 0; for (let i = 0; i < n; i++) soma += y[i] * y[i];
    const rms = Math.sqrt(soma / n);
    if (rms > 1e-5) ganho = Math.min(10 ** (-16 / 20) / rms, 12); // ~ -16 dBFS RMS ≈ -14 LUFS para fala
  }
  ganho *= 10 ** ((Number(gainDb) || 0) / 20);
  const teto = 0.92;
  for (let i = 0; i < n; i++) { const v = y[i] * ganho; y[i] = Math.abs(v) <= teto * 0.8 ? v : Math.sign(v) * (teto * 0.8 + (teto * 0.2) * Math.tanh((Math.abs(v) - teto * 0.8) / (teto * 0.2))); }
  return y;
}

/** Forma de onda: 64 barras de 0 a 100 (mesma conta do app). */
export function formaDeOnda(y, barras = 64) {
  const per = Math.max(1, Math.floor(y.length / barras)), vals = [];
  for (let b = 0; b < barras; b++) {
    let s = 0; const de = b * per, ate = Math.min(y.length, de + per);
    for (let i = de; i < ate; i++) s += y[i] * y[i];
    vals.push(ate > de ? Math.sqrt(s / (ate - de)) : 0);
  }
  const max = Math.max(...vals, 1e-9);
  return vals.map((v) => Math.round(Math.pow(v / max, 0.7) * 100));
}

export const fazerOgg = (y) => codificarOgg(y);

// ---------- vídeo .mp4 com som (para criar a figurinha com som no WhatsApp) ----------
let mp4lib = null;
/**
 * quadro(t) → canvas 512 do instante t (a animação, em loop se precisar). som: Float32Array mono 48 kHz.
 * H.264 + AAC (ou Opus, se o navegador não tiver AAC), como o .mp4 do app.
 */
export async function fazerMp4(quadro, duracao, som, { fps = 20, onProg } = {}) {
  if (!('VideoEncoder' in window)) throw new Error('Este navegador não gera vídeo. Use o Chrome ou o Edge atualizados.');
  mp4lib ||= await import('./vendor/mp4-muxer.mjs');
  const { Muxer, ArrayBufferTarget } = mp4lib;
  const vcfg = { codec: 'avc1.42001f', width: S, height: S, bitrate: 1_200_000, framerate: fps };
  if (!(await VideoEncoder.isConfigSupported(vcfg)).supported) throw new Error('Este navegador não gera vídeo H.264.');
  let acodec = null, acfg = null;
  if (som) {
    for (const [nome, codec] of [['aac', 'mp4a.40.2'], ['opus', 'opus']]) {
      const c = { codec, sampleRate: TAXA, numberOfChannels: 1, bitrate: 128000 };
      if ((await AudioEncoder.isConfigSupported(c).catch(() => ({}))).supported) { acodec = nome; acfg = c; break; }
    }
    if (!acodec) throw new Error('Este navegador não gera o som do vídeo.');
  }
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: S, height: S }, ...(som ? { audio: { codec: acodec, numberOfChannels: 1, sampleRate: TAXA } } : {}), fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  let erro = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => { erro = e; } });
  venc.configure(vcfg);
  const n = Math.max(1, Math.round(duracao * fps));
  for (let i = 0; i < n; i++) {
    const c = await quadro(i / fps);
    const vf = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    venc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
    vf.close();
    onProg?.((i + 1) / n);
    if (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
  }
  await venc.flush(); venc.close();
  if (som) {
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => { erro = e; } });
    aenc.configure(acfg);
    const y = som.subarray(0, Math.round(duracao * TAXA));
    for (let i = 0; i < y.length; i += TAXA) {
      const p = y.subarray(i, Math.min(y.length, i + TAXA));
      aenc.encode(new AudioData({ format: 'f32', sampleRate: TAXA, numberOfFrames: p.length, numberOfChannels: 1, timestamp: Math.round(i * 1e6 / TAXA), data: p }));
    }
    await aenc.flush(); aenc.close();
  }
  if (erro) throw erro;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

/** Quadros do vídeo .mp4: o mesmo enquadramento, sem cantos (vídeo não tem transparência), em fundo escuro. */
export const quadroDeVideo = (fonte, start, { fit, frame, overlay, laco = Infinity }) =>
  (t) => compor(fonte, start + (t % laco), { fit, frame, overlay, cantos: false, fundo: '#16161f' });

/** Fonte "imagem animada" a partir de um .webp (para Combinação e "Tirar o fundo" de figurinha pronta). */
export async function fonteDeWebp(blob) {
  return abrirFonte(new Blob([blob], { type: 'image/webp' }), 'figurinha.webp');
}

export const lerOverlay = async (blob) => (blob ? createImageBitmap(blob) : null);
export const duracaoDe = (y) => y.length / TAXA;
