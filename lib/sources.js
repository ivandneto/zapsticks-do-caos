// Origens além do YouTube: link de qualquer site suportado pelo yt-dlp (Instagram, TikTok, X, Facebook,
// Kwai, Vimeo…) ou arquivo enviado do PC. O arquivo fica num cache local e é de lá que se recorta.
import { spawn } from 'node:child_process';
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
export const UPLOAD_EXTS = ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi', '.3gp', '.mp3', '.m4a', '.ogg', '.oga', '.opus', '.wav', '.aac', '.flac', '.wma'];
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
    return fs.existsSync(m.file) ? m : null;
  } catch { return null; }
}
const publicMeta = ({ file, ...m }) => m;
function saveMeta(m) {
  fs.writeFileSync(metaPath(m.id), JSON.stringify(m, null, 2));
  pruneSources();
  return publicMeta(m);
}

/** Mantém só as 25 origens mais recentes (cada vídeo baixado pode ter dezenas de MB). */
function pruneSources(keep = 25) {
  const metas = fs.readdirSync(SOURCES_DIR).filter((f) => f.endsWith('.json'))
    .map((f) => ({ id: f.slice(0, -5), t: fs.statSync(path.join(SOURCES_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { id } of metas.slice(keep)) {
    for (const f of fs.readdirSync(SOURCES_DIR)) if (f.startsWith(id + '.')) fs.rmSync(path.join(SOURCES_DIR, f), { force: true });
  }
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
  if (!info.hasAudio) { fs.rmSync(file, { force: true }); throw new Error('Esse vídeo não tem som.'); }
  const playable = await makePlayable(file, info);
  return saveMeta({ id, kind: 'url', url: u.href, site: siteName(u.href), title, duration: info.duration, hasVideo: info.hasVideo, file: playable, createdAt: new Date().toISOString() });
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

/** Registra um arquivo enviado do PC (já salvo em `tmpFile`). */
export async function addUpload(tmpFile, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!UPLOAD_EXTS.includes(ext)) { fs.rmSync(tmpFile, { force: true }); throw new Error(`Formato não suportado (${ext || 'sem extensão'}). Use vídeo (mp4, mov, webm…) ou áudio (mp3, m4a, wav…).`); }
  const id = randomBytes(8).toString('hex');
  const file = path.join(SOURCES_DIR, `${id}${ext}`);
  fs.renameSync(tmpFile, file);
  const info = await probe(file);
  if (!info.hasAudio) { fs.rmSync(file, { force: true }); throw new Error('Esse arquivo não tem som.'); }
  if (!info.duration) { fs.rmSync(file, { force: true }); throw new Error('Não consegui ler esse arquivo. Ele pode estar corrompido.'); }
  if (info.duration > MAX_SECONDS) { fs.rmSync(file, { force: true }); throw new Error('O arquivo tem mais de 1 hora. Corte um pedaço menor antes.'); }
  const playable = await makePlayable(file, info);
  const title = path.basename(originalName, ext).replace(/[_-]+/g, ' ').trim().slice(0, 120) || 'Arquivo';
  return saveMeta({ id, kind: 'upload', url: null, site: 'Arquivo', title, duration: info.duration, hasVideo: info.hasVideo, file: playable, createdAt: new Date().toISOString() });
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
export async function frameFromFile(file, t) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-ss', Math.max(0, t).toFixed(2), '-i', file, '-frames:v', '1',
      '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=320:320", '-q:v', '4', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { windowsHide: true });
    const chunks = [];
    p.stdout.on('data', (d) => chunks.push(d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 && chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error('sem quadro'))));
  });
}
