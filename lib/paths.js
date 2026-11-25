import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSea } from 'node:sea';

/** true quando roda como "Audio Sticks.exe" (executável único). */
export const IS_EXE = isSea();

// Onde fica o código (public/): pasta do .exe, ou a raiz do projeto em desenvolvimento.
export const ROOT = IS_EXE
  ? path.dirname(process.execPath)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Pasta de dados do usuário no padrão de cada sistema (`name` permite achar a do nome antigo). */
function userAppDir(name = 'Audio Sticks', slug = 'audio-sticks') {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), name);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', name);
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), slug);
}

/**
 * O app se chamava "Sticks Audio". Na primeira abertura com o nome novo, a pasta antiga é renomeada
 * (figurinhas, pacotes, porta e a sessão do WhatsApp vão junto). Se não der para renomear
 * (ex.: a versão antiga ainda aberta), continua usando a pasta antiga para não perder nada.
 */
function appDirWithMigration() {
  const dir = userAppDir();
  const old = userAppDir('Sticks Audio', 'sticks-audio');
  if (fs.existsSync(dir) || !fs.existsSync(old)) return dir;
  try { fs.renameSync(old, dir); return dir; } catch { return old; }
}

// Executável: dados e ferramentas na pasta do usuário (ex.: %LOCALAPPDATA%\Audio Sticks), assim
// o programa pode ficar em qualquer lugar e trocar de versão não apaga as figurinhas.
// MODO PORTÁTIL: se existir uma pasta "data" ao lado do .exe, usa ela (pendrive, ou quem já usava assim).
// Em desenvolvimento (npm start): tudo dentro do projeto.
export const PORTABLE = IS_EXE && fs.existsSync(path.join(ROOT, 'data'));
export const APP_HOME = !IS_EXE || PORTABLE ? ROOT : appDirWithMigration();

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(APP_HOME, 'data'));
export const BIN_DIR = path.join(APP_HOME, 'bin');
export const AUDIO_DIR = path.join(DATA_DIR, 'audio');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const WA_AUTH_DIR = path.join(DATA_DIR, 'whatsapp-auth');

for (const d of [DATA_DIR, AUDIO_DIR, CACHE_DIR, TMP_DIR]) fs.mkdirSync(d, { recursive: true });
