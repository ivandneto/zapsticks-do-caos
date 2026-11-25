// Banco da coleção de figurinhas (SQLite embutido no Node, sem instalar nada).
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DATA_DIR } from './paths.js';

const db = new DatabaseSync(path.join(DATA_DIR, 'stickers.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS stickers (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    emoji       TEXT NOT NULL DEFAULT '🔊',
    tags        TEXT NOT NULL DEFAULT '',
    video_id    TEXT,
    video_title TEXT,
    start_s     REAL,
    end_s       REAL,
    duration    REAL NOT NULL,
    waveform    TEXT NOT NULL,
    favorite    INTEGER NOT NULL DEFAULT 0,
    plays       INTEGER NOT NULL DEFAULT 0,
    sends       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
`);
// coluna nova: 1 quando a figurinha animada (.webp) e o vídeo (.mp4) já foram gerados
try { db.exec('ALTER TABLE stickers ADD COLUMN visual INTEGER NOT NULL DEFAULT 0'); } catch { /* já existe */ }
// origem: 'youtube' (video_id), 'url' (Instagram, TikTok… em source_url) ou 'upload' (arquivo do PC). source_id = cache local.
for (const col of ['source_kind TEXT', 'source_url TEXT', 'source_id TEXT', 'source_site TEXT']) {
  try { db.exec(`ALTER TABLE stickers ADD COLUMN ${col}`); } catch { /* já existe */ }
}

export const newId = () => randomBytes(6).toString('base64url');

const toObj = (r) => r && ({
  id: r.id, title: r.title, emoji: r.emoji, tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
  videoId: r.video_id, videoTitle: r.video_title, start: r.start_s, end: r.end_s,
  duration: r.duration, waveform: JSON.parse(r.waveform), favorite: !!r.favorite,
  plays: r.plays, sends: r.sends, createdAt: r.created_at, visual: !!r.visual,
  sourceKind: r.source_kind || (r.video_id ? 'youtube' : null), sourceUrl: r.source_url || (r.video_id ? `https://www.youtube.com/watch?v=${r.video_id}` : null),
  sourceId: r.source_id || null, sourceSite: r.source_site || (r.video_id ? 'YouTube' : null),
});

const cleanTags = (tags) => (Array.isArray(tags) ? tags : String(tags || '').split(','))
  .map((t) => t.trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 10).join(',');

export function insertSticker(s) {
  db.prepare(`INSERT INTO stickers (id, title, emoji, tags, video_id, video_title, start_s, end_s, duration, waveform, favorite, plays, sends, created_at, visual, source_kind, source_url, source_id, source_site)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')), ?, ?, ?, ?, ?)`)
    .run(s.id, s.title, s.emoji || '🔊', cleanTags(s.tags), s.videoId ?? null, s.videoTitle ?? null, s.start ?? null, s.end ?? null,
      s.duration, JSON.stringify(s.waveform), s.favorite ? 1 : 0, s.plays || 0, s.sends || 0, s.createdAt ?? null, s.visual ? 1 : 0,
      s.sourceKind ?? (s.videoId ? 'youtube' : null), s.sourceUrl ?? null, s.sourceId ?? null, s.sourceSite ?? null);
  return getSticker(s.id);
}

export const getSticker = (id) => toObj(db.prepare('SELECT * FROM stickers WHERE id = ?').get(id));

export function listStickers({ q = '', favorites = false, sort = 'recent', pack = '' } = {}) {
  const order = { recent: 'created_at DESC', plays: 'plays DESC, created_at DESC', az: 'title COLLATE NOCASE ASC' }[sort] || 'created_at DESC';
  const where = [], args = [];
  if (favorites) where.push('favorite = 1');
  if (pack) { where.push('id IN (SELECT sticker_id FROM pack_items WHERE pack_id = ?)'); args.push(pack); }
  if (q) { where.push('(title LIKE ? OR tags LIKE ? OR video_title LIKE ? OR emoji = ?)'); const like = `%${q}%`; args.push(like, like, like, q); }
  const sql = `SELECT * FROM stickers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`;
  const inPacks = packsBySticker();
  return db.prepare(sql).all(...args).map((r) => ({ ...toObj(r), packs: inPacks[r.id] || [] }));
}

export function updateSticker(id, patch) {
  const cols = { title: 'title', emoji: 'emoji', favorite: 'favorite', tags: 'tags', visual: 'visual' };
  const sets = [], args = [];
  for (const [k, col] of Object.entries(cols)) {
    if (patch[k] === undefined) continue;
    sets.push(`${col} = ?`);
    args.push(k === 'favorite' || k === 'visual' ? (patch[k] ? 1 : 0) : k === 'tags' ? cleanTags(patch[k]) : String(patch[k]).slice(0, 80));
  }
  if (sets.length) db.prepare(`UPDATE stickers SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);
  return getSticker(id);
}

export const bump = (id, field) => db.prepare(`UPDATE stickers SET ${field === 'sends' ? 'sends' : 'plays'} = ${field === 'sends' ? 'sends' : 'plays'} + 1 WHERE id = ?`).run(id);
export const deleteSticker = (id) => db.prepare('DELETE FROM stickers WHERE id = ?').run(id).changes > 0;
export const stats = () => db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(duration),0) AS seconds, COALESCE(SUM(plays),0) AS plays, COALESCE(SUM(sends),0) AS sends FROM stickers').get();

// --- Pacotes (categorias). Uma figurinha pode estar em vários pacotes. ---
db.exec(`
  CREATE TABLE IF NOT EXISTS packs (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    emoji      TEXT NOT NULL DEFAULT '📦',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE IF NOT EXISTS pack_items (
    pack_id    TEXT NOT NULL,
    sticker_id TEXT NOT NULL,
    added_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (pack_id, sticker_id)
  );
`);

const packObj = (r) => r && ({ id: r.id, name: r.name, emoji: r.emoji, count: r.count ?? 0, cover: r.cover ?? null, createdAt: r.created_at });

export function listPacks() {
  return db.prepare(`
    SELECT p.*, COUNT(s.id) AS count,
      (SELECT s2.id FROM pack_items i2 JOIN stickers s2 ON s2.id = i2.sticker_id
        WHERE i2.pack_id = p.id AND s2.visual = 1 ORDER BY i2.added_at LIMIT 1) AS cover
    FROM packs p LEFT JOIN pack_items i ON i.pack_id = p.id LEFT JOIN stickers s ON s.id = i.sticker_id
    GROUP BY p.id ORDER BY p.name COLLATE NOCASE`).all().map(packObj);
}
export const getPack = (id) => listPacks().find((p) => p.id === id) || null;

export function createPack({ id, name, emoji }) {
  const pid = id || newId();
  db.prepare('INSERT INTO packs (id, name, emoji) VALUES (?, ?, ?)').run(pid, String(name).trim().slice(0, 40) || 'Pacote', String(emoji || '📦').slice(0, 8));
  return getPack(pid);
}
export function updatePack(id, { name, emoji }) {
  if (name !== undefined) db.prepare('UPDATE packs SET name = ? WHERE id = ?').run(String(name).trim().slice(0, 40) || 'Pacote', id);
  if (emoji !== undefined) db.prepare('UPDATE packs SET emoji = ? WHERE id = ?').run(String(emoji).slice(0, 8) || '📦', id);
  return getPack(id);
}
export function deletePack(id) {
  db.prepare('DELETE FROM pack_items WHERE pack_id = ?').run(id);
  return db.prepare('DELETE FROM packs WHERE id = ?').run(id).changes > 0;
}
/** Define em quais pacotes a figurinha está (substitui a lista). */
export function setStickerPacks(stickerId, packIds) {
  const valid = new Set(listPacks().map((p) => p.id));
  db.prepare('DELETE FROM pack_items WHERE sticker_id = ?').run(stickerId);
  const ins = db.prepare('INSERT OR IGNORE INTO pack_items (pack_id, sticker_id) VALUES (?, ?)');
  for (const pid of packIds) if (valid.has(pid)) ins.run(pid, stickerId);
}
export const addToPack = (packId, stickerId) => db.prepare('INSERT OR IGNORE INTO pack_items (pack_id, sticker_id) VALUES (?, ?)').run(packId, stickerId);
export const removeStickerFromPacks = (stickerId) => db.prepare('DELETE FROM pack_items WHERE sticker_id = ?').run(stickerId);
/** Mapa figurinha → ids dos pacotes em que está. */
export function packsBySticker() {
  const map = {};
  for (const r of db.prepare('SELECT pack_id, sticker_id FROM pack_items').all()) (map[r.sticker_id] ||= []).push(r.pack_id);
  return map;
}
/** Figurinhas de um pacote, na ordem em que foram adicionadas. */
export const packStickers = (packId) => db.prepare(`SELECT s.* FROM pack_items i JOIN stickers s ON s.id = i.sticker_id
  WHERE i.pack_id = ? ORDER BY i.added_at`).all(packId).map(toObj);
