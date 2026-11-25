// Localiza (ou baixa na primeira vez) os dois programas externos: yt-dlp e ffmpeg.
// Ficam na pasta bin/ ao lado do app; o ffmpeg do PATH também serve.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync, spawn } from 'node:child_process';
import { BIN_DIR } from './paths.js';

const isWin = process.platform === 'win32';
const BIN = BIN_DIR;
const exe = (n) => (isWin ? `${n}.exe` : n);

const SOURCES = {
  'yt-dlp': {
    win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
    linux: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
  },
  // build estática (com libopus), comprimida em .gz
  ffmpeg: {
    win32: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz',
    darwin: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}.gz`,
    linux: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz',
  },
};

// Motor de JavaScript que o yt-dlp usa para destravar o YouTube (só se não houver Node no PC)
const DENO = {
  win32: 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip',
  darwin: `https://github.com/denoland/deno/releases/latest/download/deno-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin.zip`,
  linux: 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip',
};

const onPath = (name, flag = '-version') => spawnSync(name, [flag], { windowsHide: true, stdio: 'ignore' }).status === 0;
let nodeOnPath = null;

/** Argumentos de motor JS para o yt-dlp: deno do app > node do PC > nenhum. */
export function jsRuntimeArgs() {
  const deno = path.join(BIN, exe('deno'));
  if (fs.existsSync(deno)) return ['--js-runtimes', `deno:${deno}`];
  if (nodeOnPath ??= onPath('node', '--version')) return ['--js-runtimes', 'node'];
  return [];
}

async function downloadDeno(log) {
  const url = DENO[process.platform];
  if (!url) return;
  log('  ↓ baixando o motor de JavaScript do yt-dlp (deno, só na primeira vez)…');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download do deno falhou (HTTP ${res.status}).`);
  const { default: AdmZip } = await import('adm-zip');
  const entry = new AdmZip(Buffer.from(await res.arrayBuffer())).getEntry(exe('deno'));
  const dest = path.join(BIN, exe('deno'));
  fs.mkdirSync(BIN, { recursive: true });
  fs.writeFileSync(dest + '.part', entry.getData());
  fs.renameSync(dest + '.part', dest);
  if (!isWin) fs.chmodSync(dest, 0o755);
  log('  ✓ deno pronto');
}

const resolved = {};
/** Caminho do programa: variável de ambiente > bin/ do app > PATH. */
export function bin(name) {
  if (resolved[name]) return resolved[name];
  const env = process.env[name === 'yt-dlp' ? 'YTDLP_PATH' : 'FFMPEG_PATH'];
  const local = path.join(BIN, exe(name));
  if (env) return (resolved[name] = env);
  if (fs.existsSync(local)) return (resolved[name] = local);
  if (name === 'ffmpeg' && onPath('ffmpeg')) return (resolved[name] = 'ffmpeg');
  return null;
}

async function download(name, log) {
  const url = SOURCES[name][process.platform];
  if (!url) throw new Error(`Sem download automático de ${name} para este sistema.`);
  fs.mkdirSync(BIN, { recursive: true });
  const dest = path.join(BIN, exe(name));
  log(`  ↓ baixando ${name} (só na primeira vez)…`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download de ${name} falhou (HTTP ${res.status}).`);
  let buf = Buffer.from(await res.arrayBuffer());
  if (url.endsWith('.gz')) buf = zlib.gunzipSync(buf);
  fs.writeFileSync(dest + '.part', buf);
  fs.renameSync(dest + '.part', dest);
  if (!isWin) fs.chmodSync(dest, 0o755);
  log(`  ✓ ${name} pronto (${(buf.length / 1e6).toFixed(0)} MB)`);
  delete resolved[name];
  return dest;
}

/** Garante os dois programas. `force` baixa o yt-dlp de novo mesmo se existir. */
export async function ensureTools({ log = console.log, force = false } = {}) {
  if (force || !bin('yt-dlp')) await download('yt-dlp', log);
  if (!bin('ffmpeg')) await download('ffmpeg', log);
  if (!jsRuntimeArgs().length) {
    try { await downloadDeno(log); } catch (e) { log(`  ⚠ ${e.message} O YouTube pode falhar em alguns vídeos.`); }
  }
}

/** O YouTube muda com frequência: atualiza o yt-dlp em segundo plano a cada início. */
export function autoUpdateYtdlp() {
  const p = bin('yt-dlp');
  if (!p || !p.startsWith(BIN)) return;
  const child = spawn(p, ['-U'], { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {});
}
