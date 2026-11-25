// Preferências do app que sobrevivem a reinícios (ex.: a porta). Ficam em data/config.json.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const FILE = path.join(DATA_DIR, 'config.json');
export const DEFAULT_PORT = 3000;

export function readConfig() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch { return {}; }
}

export function saveConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  return next;
}

/** Porta válida para o app: inteiro entre 1024 e 65535 (abaixo de 1024 exige administrador). */
export function validPort(p) {
  const n = Number(p);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : null;
}
