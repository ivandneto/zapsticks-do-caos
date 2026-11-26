// Origens além do YouTube: link de qualquer site suportado pelo yt-dlp (Instagram, TikTok, X, Facebook,
// Kwai, Vimeo…) ou arquivo enviado do PC. O arquivo fica num cache local e é de lá que se recorta.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { CACHE_DIR } from './paths.js';
import { bin, jsRuntimeArgs } from './tools.js';

export const SOURCES_DIR = path.join(CACHE_DIR, 'sources');
fs.mkdirSync(SOURCES_DIR, { recursive: true });

const ffmpeg = () => bin('ffmpeg') || 'ffmpeg';
const ytdlp = () => bin('yt-dlp') || 'yt-dlp';

// Formatos que o navegador toca direto; os demais são convertidos para .mp4 (vídeo) ou .m4a (áudio)
const PLAYABLE = new Set(['.mp4', '.m4v', '.webm', '.mp3', '.m4a', '.ogg', '.oga', '.opus', '.wav', '.aac']);
// Fotos e GIFs servem para figurinha sem som (aba Stick) e como imagem na Combinação Caótica
export const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
export const GIF_EXTS = ['.gif'];
export const UPLOAD_EXTS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.3gp', '.mp3', '.m4a', '.ogg', '.oga', '.opus', '.wav', '.aac', '.flac', '.wma', ...IMAGE_EXTS, ...GIF_EXTS];
const MAX_AGE_DAYS = 7; // origens (vídeos baixados/enviados) mais velhas que isso são apagadas sozinhas
const MAX_SECONDS = 60 * 60; // não baixa nem aceita mídia de mais de 1 hora

/** Roda um programa sem shell e devolve { code, out, err }. */
function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    // PYTHONIOENCODING: o yt-dlp no Windows imprime títulos em cp1252 sem isso (acentos quebrados)
    const p = spawn(cmd, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let out = '', err = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; if (err.length > 40000) err = err.slice(-40000); });
    p.on('error', (e) => reject(new Error(`Não consegui executar ${path.basename(cmd)}: ${e.message}`)));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

const metaPath = (id) => path.join(SOURCES_DIR, `${id}.json`);
export const validSourceId = (id) => /^[a-f0-9]{16}$/.test(String(id || ''));

export function getSource(id) {
  if (!validSourceId(id)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(metaPath(id), 'utf8'));
    if (!fs.existsSync(m.file)) return null;
    // origens antigas não tinham "media"/"hasAudio"
    m.media ||= m.hasVideo ? 'video' : 'audio';
    if (m.hasAudio === undefined) m.hasAudio = true;
    return m;
  } catch { return null; }
}
const publicMeta = ({ file, ...m }) => m;
function saveMeta(m) {
  fs.writeFileSync(metaPath(m.id), JSON.stringify(m, null, 2));
  pruneSources();
  return publicMeta(m);
}

/** Mantém só as 25 origens mais recentes e nenhuma com mais de 7 dias (cada vídeo pode ter dezenas de MB). */
export function pruneSources(keep = 25) {
  const now = Date.now();
  const metas = fs.readdirSync(SOURCES_DIR).filter((f) => f.endsWith('.json'))
    .map((f) => ({ id: f.slice(0, -5), t: fs.statSync(path.join(SOURCES_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const doomed = metas.filter((m, i) => i >= keep || now - m.t > MAX_AGE_DAYS * 86400000);
  for (const { id } of doomed) removeSourceFiles(id);
  // arquivos órfãos (download interrompido, sem .json)
  const alive = new Set(metas.filter((m) => !doomed.includes(m)).map((m) => m.id));
  for (const f of fs.readdirSync(SOURCES_DIR)) {
    const id = f.split('.')[0];
    if (!alive.has(id) && now - fs.statSync(path.join(SOURCES_DIR, f)).mtimeMs > 3600000) fs.rmSync(path.join(SOURCES_DIR, f), { force: true });
  }
}
function removeSourceFiles(id) {
  for (const f of fs.readdirSync(SOURCES_DIR)) if (f.startsWith(id + '.')) fs.rmSync(path.join(SOURCES_DIR, f), { force: true });
}

/** Tamanho total (bytes) de uma pasta, recursivo. */
export function dirSize(dir) {
  let total = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    }
  } catch { /* pasta não existe */ }
  return total;
}

/** Duração e se há imagem (ignora capa de álbum embutida em mp3). */
export async function probe(file) {
  const { err } = await exec(ffmpeg(), ['-hide_banner', '-i', file]);
  const d = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const hasVideo = err.split('\n').some((l) => /Stream #.*Video:/.test(l) && !/attached pic|\(mjpeg|png\)/i.test(l));
  const hasAudio = /Stream #.*Audio:/.test(err);
  return { duration, hasVideo, hasAudio };
}

/** Converte para algo que o navegador toque (≤720p, H.264/AAC), quando necessário. */
async function makePlayable(file, { hasVideo }) {
  if (PLAYABLE.has(path.extname(file).toLowerCase())) return file;
  const out = file.replace(/\.[^.]+$/, hasVideo ? '.play.mp4' : '.play.m4a');
  const args = hasVideo
    ? ['-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart']
    : ['-vn', '-c:a', 'aac', '-b:a', '192k'];
  const { code, err } = await exec(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, ...args, out]);
  if (code !== 0) throw new Error(`Não consegui converter o arquivo: ${err.trim().split('\n').pop()}`);
  fs.rmSync(file, { force: true });
  return out;
}

/** Nome amigável do site a partir do link (para mostrar na tela). */
export function siteName(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\.|^m\.|^vm\.|^vt\./, '');
    const known = { 'instagram.com': 'Instagram', 'tiktok.com': 'TikTok', 'x.com': 'X', 'twitter.com': 'X', 'facebook.com': 'Facebook', 'fb.watch': 'Facebook',
      'kwai.com': 'Kwai', 'vimeo.com': 'Vimeo', 'twitch.tv': 'Twitch', 'reddit.com': 'Reddit', 'soundcloud.com': 'SoundCloud', 'dailymotion.com': 'Dailymotion', 'threads.net': 'Threads' };
    return known[h] || Object.entries(known).find(([k]) => h.endsWith('.' + k))?.[1] || h;
  } catch { return 'link'; }
}

/** Baixa um link de qualquer site suportado pelo yt-dlp. Reaproveita o cache se já baixou. */
export async function fetchUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('Isso não parece um link.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Use um link que comece com http:// ou https://');
  const id = createHash('sha1').update(u.href).digest('hex').slice(0, 16);
  const cached = getSource(id);
  if (cached) { fs.utimesSync(metaPath(id), new Date(), new Date()); return publicMeta(cached); }

  const { code, out, err } = await exec(ytdlp(), [
    '--no-playlist', '--no-warnings', '--no-progress', '--encoding', 'utf-8', ...jsRuntimeArgs(),
    ...(ffmpeg() !== 'ffmpeg' ? ['--ffmpeg-location', ffmpeg()] : []),
    '--match-filter', `!is_live & duration <=? ${MAX_SECONDS}`,
    '-f', 'bv*[height<=720]+ba/b[height<=720]/bv*+ba/b',
    '--merge-output-format', 'mp4',
    '-o', path.join(SOURCES_DIR, `${id}.%(ext)s`),
    '--print', 'before_dl:TITLE %(title).200B',
    '--print', 'after_move:FILE %(filepath)s',
    '--no-simulate', u.href,
  ]);
  const file = out.match(/^FILE (.+)$/m)?.[1]?.trim();
  if (code !== 0 || !file || !fs.existsSync(file)) throw new Error(friendlyFetchError(err, u.href));
  const title = out.match(/^TITLE (.*)$/m)?.[1]?.trim() || siteName(u.href);
  const info = await probe(file);
  const playable = await makePlayable(file, info);
  return saveMeta({ id, kind: 'url', url: u.href, site: siteName(u.href), title, duration: info.duration, hasVideo: info.hasVideo, hasAudio: info.hasAudio,
    media: info.hasVideo ? 'video' : 'audio', file: playable, createdAt: new Date().toISOString() });
}

function friendlyFetchError(err, url) {
  const site = siteName(url);
  if (/Unsupported URL/i.test(err)) return `Esse site (${site}) não é suportado. Baixe o vídeo e use “Arquivo”.`;
  if (/login|log in|cookies|rate-limit|private|Requested content is not available/i.test(err))
    return `O ${site} pediu login para esse conteúdo (post privado, restrito ou limite de acesso). Baixe o vídeo e use “Arquivo”.`;
  if (/does not pass filter|is_live/i.test(err)) return 'Transmissões ao vivo e vídeos com mais de 1 hora não são aceitos.';
  if (/404|not found|unavailable|removed/i.test(err)) return 'Não encontrei esse vídeo (removido ou indisponível).';
  if (/No video formats|no formats/i.test(err)) return `Não achei mídia nesse link do ${site}.`;
  const last = err.trim().split('\n').filter((l) => /ERROR/i.test(l)).pop();
  return `Não consegui baixar do ${site}${last ? `: ${last.replace(/^.*ERROR:\s*/, '').slice(0, 160)}` : '.'}`;
}

/** O .webp é animado? (cabeçalho RIFF: bandeira de animação no VP8X ou bloco ANIM) e quanto dura. */
export function webpInfo(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return { animated: false, duration: 0 };
    let p = 12, animated = false, ms = 0;
    while (p + 8 <= b.length) {
      const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4), d = p + 8;
      if (id === 'VP8X' && b[d] & 0x02) animated = true;
      if (id === 'ANIM') animated = true;
      if (id === 'ANMF' && d + 16 <= b.length) ms += b.readUIntLE(d + 12, 3);
      p = d + sz + (sz & 1);
    }
    return { animated, duration: ms / 1000 };
  } catch { return { animated: false, duration: 0 }; }
}

let animWebpDecoder = null;
/** O ffmpeg instalado lê .webp animado? (versões recentes sim; a 6.1 do executável não) */
function ffmpegReadsAnimatedWebp() {
  if (animWebpDecoder === null) {
    const r = spawnSync(ffmpeg(), ['-hide_banner', '-decoders'], { windowsHide: true, encoding: 'utf8' });
    animWebpDecoder = /webp_anim/.test(r.stdout || '');
  }
  return animWebpDecoder;
}

/**
 * Figurinha/GIF animado que o NAVEGADOR já decodificou em quadros PNG (caso do .webp animado do Giphy e das
 * figurinhas salvas do WhatsApp). Monta um .mov sem perda e com transparência (o ffmpeg lê em qualquer versão)
 * e guarda o original para mostrar na tela.
 */
export async function addAnimatedFrames({ framePaths, fps, originalPath, originalName, tmpDir }) {
  const id = randomBytes(8).toString('hex');
  const dir = path.join(tmpDir, `anim-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    framePaths.forEach((f, i) => fs.renameSync(f, path.join(dir, `${String(i + 1).padStart(4, '0')}.png`)));
    const file = path.join(SOURCES_DIR, `${id}.mov`);
    const { code, err } = await exec(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(fps), '-i', path.join(dir, '%04d.png'), '-c:v', 'png', file]);
    if (code !== 0) throw new Error(`Não consegui montar a animação: ${err.trim().split('\n').pop()}`);
    const ext = path.extname(originalName || '').toLowerCase() || '.webp';
    const display = path.join(SOURCES_DIR, `${id}.view${ext}`);
    if (originalPath) fs.renameSync(originalPath, display);
    const title = path.basename(originalName || 'animação', ext).replace(/[_-]+/g, ' ').trim().slice(0, 120) || 'Animação';
    return saveMeta({ id, kind: 'upload', url: null, site: 'Arquivo', title, media: 'gif', duration: framePaths.length / fps,
      hasVideo: true, hasAudio: false, file, display: originalPath ? display : null, createdAt: new Date().toISOString() });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Baixa uma imagem/GIF de um link direto (Giphy, Tenor, .gif, .webp, .png…) para um arquivo temporário. */
export async function downloadImage(url, tmpDir) {
  let u;
  try { u = new URL(url); } catch { throw new Error('Link inválido.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Use um link http:// ou https://');
  const res = await fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`O site respondeu ${res.status}.`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\//.test(type)) return null; // não é imagem: quem chamou tenta como vídeo
  const len = Number(res.headers.get('content-length') || 0);
  if (len > 60 * 1024 * 1024) throw new Error('Imagem grande demais (mais de 60 MB).');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 60 * 1024 * 1024) throw new Error('Imagem grande demais (mais de 60 MB).');
  const ext = { 'image/gif': '.gif', 'image/webp': '.webp', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/bmp': '.bmp' }[type] || path.extname(u.pathname) || '.img';
  const base = decodeURIComponent(path.basename(u.pathname, path.extname(u.pathname))).replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'imagem';
  const name = `${u.hostname.includes('giphy') ? 'giphy' : u.hostname.includes('tenor') ? 'tenor' : base}${ext}`;
  const id = randomBytes(8).toString('hex');
  const file = path.join(tmpDir, `img-${id}${ext}`);
  fs.writeFileSync(file, buf);
  return { id, file, name, type };
}

/** Registra um arquivo enviado do PC (já salvo em `tmpFile`). */
export async function addUpload(tmpFile, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!UPLOAD_EXTS.includes(ext)) { fs.rmSync(tmpFile, { force: true }); throw new Error(`Formato não suportado (${ext || 'sem extensão'}). Use vídeo (mp4, mov, webm…), áudio (mp3, m4a, wav…), foto (jpg, png, webp) ou GIF.`); }
  const id = randomBytes(8).toString('hex');
  const file = path.join(SOURCES_DIR, `${id}${ext}`);
  fs.renameSync(tmpFile, file);
  const title = path.basename(originalName, ext).replace(/[_-]+/g, ' ').trim().slice(0, 120) || 'Arquivo';
  const base = { id, kind: 'upload', url: null, site: 'Arquivo', title, createdAt: new Date().toISOString() };
  const bad = (msg) => { fs.rmSync(file, { force: true }); throw new Error(msg); };

  // .webp ANIMADO (Giphy, figurinha salva do WhatsApp): é animação, não foto
  if (ext === '.webp') {
    const wi = webpInfo(file);
    if (wi.animated) {
      if (!ffmpegReadsAnimatedWebp()) bad('Esse .webp é animado. Abra o app no Edge ou no Chrome atualizado (eles leem a animação) e envie de novo, ou use a versão em GIF.');
      return saveMeta({ ...base, media: 'gif', duration: Math.min(wi.duration || 3, MAX_SECONDS), hasVideo: true, hasAudio: false, file });
    }
  }
  // Foto: o navegador mostra direto; ffmpeg só precisa conseguir ler
  if (IMAGE_EXTS.includes(ext)) {
    const { code } = await exec(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-i', file, '-frames:v', '1', '-f', 'null', '-']);
    if (code !== 0) bad(ext === '.webp' ? 'Não consegui ler esse .webp (figurinha animada em .webp não é suportada). Use PNG, JPG ou GIF.' : 'Não consegui ler essa imagem.');
    return saveMeta({ ...base, media: 'image', duration: 0, hasVideo: true, hasAudio: false, file });
  }
  let info = await probe(file);
  // gravação do navegador (MediaRecorder) vem sem duração no cabeçalho: regrava sem mexer na imagem e no som
  if (!info.duration && ['.webm', '.mkv'].includes(ext)) {
    const fixed = file.replace(/\.[^.]+$/, `.fix${ext}`);
    const { code } = await exec(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-c', 'copy', fixed]);
    if (code === 0) { fs.renameSync(fixed, file); info = await probe(file); } else fs.rmSync(fixed, { force: true });
  }
  if (GIF_EXTS.includes(ext)) {
    // GIF de um quadro só vira foto
    return saveMeta({ ...base, media: info.duration > 0.05 ? 'gif' : 'image', duration: info.duration, hasVideo: true, hasAudio: false, file });
  }
  if (!info.duration) bad('Não consegui ler esse arquivo. Ele pode estar corrompido.');
  if (info.duration > MAX_SECONDS) bad('O arquivo tem mais de 1 hora. Corte um pedaço menor antes.');
  if (!info.hasAudio && !info.hasVideo) bad('Esse arquivo não tem nem imagem nem som.');
  const playable = await makePlayable(file, info);
  return saveMeta({ ...base, media: info.hasVideo ? 'video' : 'audio', duration: info.duration, hasVideo: info.hasVideo, hasAudio: info.hasAudio, file: playable });
}

/** Recorta um pedaço do vídeo (para a animação da figurinha). Devolve um arquivo temporário. */
export async function cutVideoSegment(file, start, end, tmpDir) {
  const out = path.join(tmpDir, `${randomBytes(6).toString('hex')}.mp4`);
  const { code, err } = await exec(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-ss', start.toFixed(3), '-t', (end - start).toFixed(3), '-i', file,
    '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', out]);
  if (code !== 0) throw new Error(`Não consegui recortar o vídeo: ${err.trim().split('\n').pop()}`);
  return out;
}

/** Um quadro (JPEG quadrado) para a prévia da figurinha. */
export async function frameFromFile(file, t, { fit = 'crop' } = {}) {
  const vf = fit === 'pad'
    ? 'scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=0x2a2a36'
    : "crop='min(iw,ih)':'min(iw,ih)',scale=320:320";
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg(), ['-hide_banner', '-loglevel', 'error', ...(t > 0 ? ['-ss', t.toFixed(2)] : []), '-i', file, '-frames:v', '1',
      '-vf', vf, '-q:v', '4', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { windowsHide: true });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 && chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error('sem quadro'))));
  });
}
