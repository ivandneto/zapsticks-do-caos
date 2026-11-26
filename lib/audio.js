// Baixa o áudio do YouTube (yt-dlp) e recorta/converte para figurinha de áudio (ffmpeg → OGG/Opus).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { CACHE_DIR, TMP_DIR } from './paths.js';
import { bin, jsRuntimeArgs } from './tools.js';

const ytdlp = () => bin('yt-dlp') || 'yt-dlp';
// SIMULATE_YT_BLOCK=1 (só para testes): finge que o YouTube bloqueou, para testar o "gravar enquanto toca"
const ytRun = (args) => (process.env.SIMULATE_YT_BLOCK
  ? Promise.reject(new Error("ERROR: [youtube] teste: Sign in to confirm you're not a bot. (simulado por SIMULATE_YT_BLOCK)"))
  : run(ytdlp(), args));
const ffmpeg = () => bin('ffmpeg') || 'ffmpeg';
// Quadro inteiro, sem recorte (para a tela de enquadrar): cabe em 720x720
export const FULL_FRAME = "scale='min(720,iw)':'min(720,ih)':force_original_aspect_ratio=decrease";

/** Roda um programa sem shell (argumentos nunca são interpretados). */
function run(cmd, args, { binary = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
    p.on('error', (e) => reject(new Error(`Não consegui executar ${path.basename(cmd)}: ${e.message}`)));
    p.on('close', (code) => {
      const buf = Buffer.concat(out);
      if (code === 0) resolve(binary ? buf : buf.toString());
      else reject(new Error(lastLines(err) || `${path.basename(cmd)} saiu com código ${code}`));
    });
  });
}

const lastLines = (s) => s.trim().split(/\r?\n/).filter((l) => /error|erro/i.test(l)).slice(-3).join(' | ') || s.trim().split(/\r?\n/).slice(-2).join(' | ');

/** Extrai o ID de 11 caracteres de qualquer formato de link do YouTube. */
export function parseVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1, 12);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v');
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    if (!id && m) id = m[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

function ytArgs() {
  const a = ['--no-playlist', '--no-warnings', '--no-progress', ...jsRuntimeArgs()];
  if (ffmpeg() !== 'ffmpeg') a.push('--ffmpeg-location', ffmpeg());
  return a;
}

// Evita baixar o mesmo vídeo duas vezes ao mesmo tempo
const inflight = new Map();

/**
 * Garante o áudio do vídeo em disco e devolve { file, offset }:
 * offset = em que segundo do vídeo começa o arquivo baixado.
 * Vídeos até 20 min são baixados inteiros e ficam em cache (recortes seguintes são instantâneos);
 * vídeos maiores baixam só a janela pedida.
 */
export async function getSourceAudio(videoId, start, end, videoDuration) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const full = !videoDuration || videoDuration <= 20 * 60;

  if (full) {
    const cached = fs.readdirSync(CACHE_DIR).find((f) => f.startsWith(videoId + '.'));
    if (cached) {
      const file = path.join(CACHE_DIR, cached);
      fs.utimesSync(file, new Date(), new Date());
      return { file, offset: 0 };
    }
    if (!inflight.has(videoId)) {
      const job = (async () => {
        const out = await ytRun([...ytArgs(), '-f', 'bestaudio/best', '-o', path.join(CACHE_DIR, `${videoId}.%(ext)s`), '--print', 'after_move:filepath', url]);
        pruneCache();
        return out.trim().split(/\r?\n/).pop();
      })().finally(() => inflight.delete(videoId));
      inflight.set(videoId, job);
    }
    return { file: await inflight.get(videoId), offset: 0 };
  }

  const pad = 3;
  const from = Math.max(0, start - pad);
  const to = end + pad;
  const base = path.join(TMP_DIR, randomUUID());
  const out = await ytRun([...ytArgs(), '-f', 'bestaudio/best', '--download-sections', `*${from.toFixed(2)}-${to.toFixed(2)}`, '-o', `${base}.%(ext)s`, '--print', 'after_move:filepath', url]);
  return { file: out.trim().split(/\r?\n/).pop(), offset: from, temp: true };
}

// Endereço direto do stream de vídeo (vale ~6h no YouTube; guardamos por 1h)
const streamUrls = new Map();
async function videoStreamUrl(videoId) {
  const hit = streamUrls.get(videoId);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.url;
  const p = ytRun([...ytArgs(), '-f', 'bv*[height<=480][height>=240]/b[height<=480]/bv*/b', '-g', `https://www.youtube.com/watch?v=${videoId}`])
    .then((out) => out.trim().split(/\r?\n/)[0]);
  streamUrls.set(videoId, { url: p, at: Date.now() });
  p.catch(() => streamUrls.delete(videoId));
  return p;
}

/** Um quadro do vídeo no segundo `t`, já recortado quadrado (prévia da figurinha). Devolve JPEG. */
export async function getFrame(videoId, t, { frame = null, full = false } = {}) {
  const url = await videoStreamUrl(videoId);
  return run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-ss', Math.max(0, t).toFixed(2), '-i', url, '-frames:v', '1',
    '-vf', full ? FULL_FRAME : squareFilter(frame, 320), '-q:v', '4', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { binary: true });
}

/**
 * Baixa só o trecho do VÍDEO (resolução baixa, basta para figurinha), cortado no quadro exato.
 * Devolve o caminho de um arquivo temporário que começa em `start`.
 */
export async function getVideoSection(videoId, start, end) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const base = path.join(TMP_DIR, randomUUID());
  const out = await ytRun([...ytArgs(),
    '-f', 'bv*[height<=480][height>=240]/bv*[height<=720]/b[height<=720]/bv*/b',
    '--download-sections', `*${start.toFixed(2)}-${end.toFixed(2)}`, '--force-keyframes-at-cuts',
    '-o', `${base}.%(ext)s`, '--print', 'after_move:filepath', url]);
  return out.trim().split(/\r?\n/).pop();
}

// Recorte quadrado central, 512x512, com cantos arredondados (transparentes)
const SQUARE = "crop='min(iw,ih)':'min(iw,ih)',scale=512:512:flags=lanczos";

/**
 * Enquadramento escolhido na página: { z: zoom 1–4, x, y: posição 0–1 (0,5 = centro) }.
 * Devolve null quando é o padrão (quadrado central), para manter exatamente o filtro de sempre.
 */
export function cleanFrame(f) {
  if (!f || typeof f !== 'object') return null;
  const n = (v, a, b, d) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : d);
  const r = { z: n(f.z, 1, 4, 1), x: n(f.x, 0, 1, 0.5), y: n(f.y, 0, 1, 0.5) };
  return r.z === 1 && r.x === 0.5 && r.y === 0.5 ? null : r;
}
/** Recorte quadrado (no enquadramento escolhido, ou no centro) já em `size`x`size`. */
export function squareFilter(frame, size = 512) {
  const f = cleanFrame(frame);
  if (!f) return SQUARE.replace('512:512', `${size}:${size}`);
  const side = `min(iw,ih)/${f.z.toFixed(4)}`;
  return `crop=w='${side}':h='${side}':x='(iw-ow)*${f.x.toFixed(4)}':y='(ih-oh)*${f.y.toFixed(4)}',scale=${size}:${size}:flags=lanczos`;
}

/** Máscara dos cantos arredondados: calculada uma vez só (pixel a pixel é lento) e reaproveitada. */
async function roundMask() {
  const file = path.join(TMP_DIR, 'mask-512-r56.png');
  if (fs.existsSync(file)) return file;
  const R = 56;
  const a = `if(gt(abs(W/2-X),W/2-${R})*gt(abs(H/2-Y),H/2-${R}),if(lte(hypot(${R}-(W/2-abs(W/2-X)),${R}-(H/2-abs(H/2-Y))),${R}),255,0),255)`;
  await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=black:s=512x512', '-frames:v', '1', '-vf', `format=gray,geq=lum='${a}'`, file]);
  return file;
}

/**
 * Enquadramento da figurinha (512x512):
 *  - 'crop': recorta o quadrado central e arredonda os cantos (padrão);
 *  - 'pad' : mostra a imagem inteira, com fundo transparente em volta (bom para fotos e GIFs recortados).
 * Devolve o -filter_complex que sai em [out] (rgba), dado o filtro de entrada `pre` (ex.: fps).
 */
async function stickerFilter(fit, pre = '', overlay = null, frame = null) {
  const head = pre ? `${pre},` : '';
  const f = fit === 'pad'
    ? { inputs: [], graph: `[0:v]${head}scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0[out]` }
    : { inputs: ['-loop', '1', '-i', await roundMask()], graph: `[0:v]${head}${squareFilter(frame)},format=rgba[v];[1:v]format=gray[m];[v][m]alphamerge[out]` };
  return withOverlay(f, overlay, 1 + f.inputs.filter((x) => x === '-i').length);
}

/**
 * "Carimba" a camada de texto e emoji (PNG 512x512 transparente feito no navegador) sobre cada quadro.
 * Recebe um grafo que termina em [out] e devolve outro que também termina em [out].
 */
function withOverlay(f, overlay, index) {
  if (!overlay) return f;
  return {
    inputs: [...f.inputs, '-loop', '1', '-i', overlay],
    graph: `${f.graph.replace(/\[out\]$/, '[base]')};[${index}:v]format=rgba[ovl];[base][ovl]overlay=0:0:shortest=1:format=auto,format=rgba[out]`,
  };
}

/** Figurinha animada .webp (até 10 s, em loop — limite do WhatsApp), dentro de ~500 KB. Aceita vídeo ou GIF. */
export async function makeAnimatedWebp(video, output, duration, { fit = 'crop', overlay = null, frame = null } = {}) {
  const d = Math.min(10, duration);
  const tries = [[15, 70], [12, 55], [10, 40], [8, 30], [6, 20]];
  for (const [fps, q] of tries) {
    const f = await stickerFilter(fit, `fps=${fps}`, overlay, frame);
    await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-t', d.toFixed(3), '-i', video, ...f.inputs, '-an',
      '-filter_complex', `${f.graph};[out]format=yuva420p[o]`, '-map', '[o]',
      '-t', d.toFixed(3), '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', String(q),
      '-compression_level', '4', '-loop', '0', output]);
    if (fs.statSync(output).size <= 490 * 1024) return;
  }
}

/**
 * Figurinha estática (foto): .webp ≤ 100 KB (limite do WhatsApp para figurinha parada) e um .png 512x512
 * guardado como "molde" — é dele que a Combinação Caótica faz o vídeo.
 */
export async function makeStaticSticker(image, webpOut, pngOut, { fit = 'crop', overlay = null, frame = null } = {}) {
  const f = await stickerFilter(fit, '', overlay, frame);
  await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', image, ...f.inputs, '-filter_complex', f.graph, '-map', '[out]', '-frames:v', '1', pngOut]);
  for (const q of [85, 70, 55, 40, 25]) {
    await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', pngOut, '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(q), '-frames:v', '1', webpOut]);
    if (fs.statSync(webpOut).size <= 98 * 1024) return;
  }
}

/**
 * Quadros de um trecho de vídeo (PNG, cabendo em 512x512, sem cortar) para o editor de "tirar o fundo".
 * `input` já começa no ponto certo quando `ss` = 0.
 */
export async function extractFrames(input, dir, { ss = 0, duration, fps = 12 }) {
  fs.mkdirSync(dir, { recursive: true });
  await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', ...(ss > 0 ? ['-ss', ss.toFixed(3)] : []), '-t', Math.min(10, duration).toFixed(3), '-i', input,
    '-an', '-vf', `fps=${fps},scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos`, path.join(dir, '%04d.png')]);
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length;
}

/** Figurinha animada a partir dos quadros já recortados (PNG 512x512 com transparência), no limite de ~500 KB. */
export async function makeAnimatedWebpFromFrames(dir, fps, output, { overlay = null } = {}) {
  const ov = overlay ? ['-loop', '1', '-i', overlay] : [];
  // tenta manter a fluidez; se ficar grande, baixa a qualidade e depois pula quadros
  const tries = [[1, 75], [1, 55], [2, 55], [2, 35], [3, 30], [4, 20]];
  for (const [step, q] of tries) {
    const tail = `${step > 1 ? `fps=${(fps / step).toFixed(3)},` : ''}format=yuva420p`;
    const graph = overlay ? `[1:v]format=rgba[ovl];[0:v][ovl]overlay=0:0:shortest=1:format=auto,${tail}[o]` : `[0:v]${tail}[o]`;
    await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', path.join(dir, '%04d.png'), ...ov,
      '-filter_complex', graph, '-map', '[o]', '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', String(q),
      '-compression_level', '4', '-loop', '0', output]);
    if (fs.statSync(output).size <= 490 * 1024) return;
  }
}

/** Molde .mp4 (mudo) a partir dos quadros recortados, sobre fundo escuro (vídeo não tem transparência). */
export async function makeSilentMp4FromFrames(dir, fps, output, { overlay = null } = {}) {
  const graph = overlay
    ? 'color=c=0x16161f:s=512x512[bg];[bg][0:v]overlay=shortest=1[b2];[1:v]format=rgba[ovl];[b2][ovl]overlay=0:0:shortest=1,format=yuv420p'
    : 'color=c=0x16161f:s=512x512[bg];[bg][0:v]overlay=shortest=1,format=yuv420p';
  await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', path.join(dir, '%04d.png'), ...(overlay ? ['-loop', '1', '-i', overlay] : []),
    '-filter_complex', graph, '-r', '30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', output]);
}

/** "Molde" de uma figurinha animada sem som: vídeo quadrado mudo (base para combinar com qualquer som). */
export async function makeSilentMp4(video, output, duration, { fit = 'crop', overlay = null, frame = null } = {}) {
  const vf = fit === 'pad'
    ? 'fps=30,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black'
    : `fps=30,${squareFilter(frame)}`;
  await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-t', Math.min(10, duration).toFixed(3), '-i', video, ...videoWithOverlay(vf, overlay, 1), '-an',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart', output]);
}

/**
 * Vídeo da Combinação Caótica: a imagem de uma figurinha (molde .mp4 animado, ou .png parado) com o som de outra.
 * A animação repete até o som acabar.
 */
export async function makeComboMp4(visual, audioOgg, output, duration) {
  const isStill = /\.png$/i.test(visual);
  const input = isStill ? ['-loop', '1', '-i', visual] : ['-stream_loop', '-1', '-i', visual];
  await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', ...input, '-i', audioOgg, '-t', duration.toFixed(3),
    '-map', '0:v:0', '-map', '1:a:0', '-vf', 'scale=512:512,format=yuv420p', '-r', '30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', output]);
}

/** Argumentos de vídeo (.mp4) com o filtro `vf` e, se houver, a camada de texto e emoji (entrada nº `index`). */
function videoWithOverlay(vf, overlay, index) {
  if (!overlay) return ['-map', '0:v:0', '-vf', `${vf},format=yuv420p`];
  return ['-loop', '1', '-i', overlay, '-filter_complex', `[0:v]${vf}[base];[${index}:v]format=rgba[ovl];[base][ovl]overlay=0:0:shortest=1,format=yuv420p[o]`, '-map', '[o]'];
}

/** Ícone do pacote (96x96 PNG, exigência do WhatsApp) a partir do 1º quadro do vídeo da figurinha. */
export async function makeTrayIcon(mp4, output) {
  await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', mp4, '-frames:v', '1', '-vf', 'scale=96:96:flags=lanczos', output]);
}

/** Vídeo quadrado .mp4 com o áudio da figurinha — é o que se escolhe no criador de figurinhas do WhatsApp. */
export async function makeSquareMp4(video, audioOgg, output, duration, { overlay = null, frame = null } = {}) {
  await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-t', duration.toFixed(3), '-i', video, '-i', audioOgg,
    ...videoWithOverlay(`fps=30,${squareFilter(frame)}`, overlay, 2), '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', output]);
}

function pruneCache(keep = 15) {
  const files = fs.readdirSync(CACHE_DIR).map((f) => ({ f, t: fs.statSync(path.join(CACHE_DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(keep)) fs.rmSync(path.join(CACHE_DIR, f), { force: true });
}

/** Recorta e converte para OGG/Opus mono (formato de mensagem de voz do WhatsApp). */
export async function cutToOgg(input, output, { ss, duration, fadeIn = false, fadeOut = false, normalize = true, gainDb = 0 }) {
  const filters = [];
  if (fadeIn) filters.push(`afade=t=in:st=0:d=${Math.min(0.3, duration / 4).toFixed(3)}`);
  if (fadeOut) { const d = Math.min(0.5, duration / 4); filters.push(`afade=t=out:st=${(duration - d).toFixed(3)}:d=${d.toFixed(3)}`); }
  if (normalize) filters.push('loudnorm=I=-14:TP=-1.5:LRA=11');
  if (gainDb) filters.push(`volume=${Number(gainDb)}dB`, 'alimiter=limit=0.95');
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', ss.toFixed(3), '-t', duration.toFixed(3), '-i', input, '-vn', '-ac', '1', '-ar', '48000'];
  if (filters.length) args.push('-af', filters.join(','));
  args.push('-c:a', 'libopus', '-b:a', '64k', '-application', 'audio', output);
  await run(ffmpeg(), args);
}

/** Forma de onda (64 barras de 0 a 100) e duração real do arquivo. */
export async function analyze(file, bars = 64) {
  const rate = 8000;
  const pcm = await run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(rate), '-f', 's16le', 'pipe:1'], { binary: true });
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const per = Math.max(1, Math.floor(samples.length / bars));
  const vals = [];
  for (let b = 0; b < bars; b++) {
    let sum = 0;
    const from = b * per, to = Math.min(samples.length, from + per);
    for (let i = from; i < to; i++) sum += samples[i] * samples[i];
    vals.push(to > from ? Math.sqrt(sum / (to - from)) : 0);
  }
  const max = Math.max(...vals, 1);
  const waveform = vals.map((v) => Math.round(Math.pow(v / max, 0.7) * 100));
  return { waveform, duration: samples.length / rate };
}

export async function checkTools() {
  const res = {};
  try { res.ytdlp = (await run(ytdlp(), ['--version'])).trim(); } catch (e) { res.ytdlp = null; res.ytdlpError = e.message; }
  try { res.ffmpeg = (await run(ffmpeg(), ['-version'])).split('\n')[0]; } catch (e) { res.ffmpeg = null; res.ffmpegError = e.message; }
  return res;
}
