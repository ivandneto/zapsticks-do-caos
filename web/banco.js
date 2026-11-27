// 📚 A Biblioteca da versão web, guardada no próprio navegador (IndexedDB).
// Mesmo formato de figurinha e de pacote que o app do PC (lib/db.js), para exportar e importar entre os dois.
//   stickers: { id, title, emoji, tags[], duration, waveform[], favorite, plays, sends, createdAt, visual, kind, animated, … }
//   packs:    { id, name, emoji, createdAt, stickers: [ids] }
//   media:    chave "<id>.<ext>" → Blob (webp, ogg, mp4, png)

const NOME = 'audio-sticks', VERSAO = 1;
let conexao = null;

function abrir() {
  conexao ||= new Promise((ok, erro) => {
    const r = indexedDB.open(NOME, VERSAO);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('stickers')) db.createObjectStore('stickers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error || new Error('O navegador não deixou guardar a Biblioteca.'));
  });
  return conexao;
}

async function tx(loja, modo, fn) {
  const db = await abrir();
  return new Promise((ok, erro) => {
    const t = db.transaction(loja, modo);
    let res;
    Promise.resolve(fn(t.objectStore(loja))).then((v) => { res = v; });
    t.oncomplete = () => ok(res);
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error || new Error('Operação cancelada (o espaço do navegador pode ter acabado).'));
  });
}
const req = (r) => new Promise((ok, erro) => { r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });

export const novoId = () => {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const limpaTags = (tags) => (Array.isArray(tags) ? tags : String(tags || '').split(','))
  .map((t) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 10);

// ---------- figurinhas ----------
export function normaliza(s) {
  return {
    id: s.id, title: String(s.title || 'Figurinha').slice(0, 80), emoji: String(s.emoji || '🔊').slice(0, 8), tags: limpaTags(s.tags),
    videoId: /^[\w-]{11}$/.test(String(s.videoId || '')) ? s.videoId : null, videoTitle: s.videoTitle ?? null, start: s.start ?? null, end: s.end ?? null,
    duration: Number(s.duration) || 0, waveform: Array.isArray(s.waveform) ? s.waveform.slice(0, 64).map(Number) : [],
    favorite: !!s.favorite, plays: s.plays || 0, sends: s.sends || 0, createdAt: s.createdAt || new Date().toISOString(),
    visual: !!s.visual, kind: ['audio', 'sticker', 'combo'].includes(s.kind) ? s.kind : 'audio', animated: s.animated !== false,
    sourceKind: s.sourceKind ?? null, sourceUrl: /^https?:\/\//i.test(String(s.sourceUrl || '')) ? String(s.sourceUrl).slice(0, 2000) : null, sourceId: s.sourceId ?? null, sourceSite: s.sourceSite ?? null,
  };
}
const comAudio = (s) => ({ ...s, hasAudio: s.kind !== 'sticker' });

export async function salvarFigurinha(s) {
  const n = normaliza(s);
  await tx('stickers', 'readwrite', (st) => st.put(n));
  return comAudio(n);
}
export const pegarFigurinha = async (id) => { const s = await tx('stickers', 'readonly', (st) => req(st.get(id))); return s ? comAudio(s) : null; };
export async function todasFigurinhas() { return (await tx('stickers', 'readonly', (st) => req(st.getAll()))).map(comAudio); }

export async function atualizarFigurinha(id, patch) {
  const s = await pegarFigurinha(id);
  if (!s) return null;
  const n = { ...s };
  if (patch.title !== undefined) n.title = String(patch.title).trim().slice(0, 80) || s.title;
  if (patch.emoji !== undefined) n.emoji = String(patch.emoji).trim().slice(0, 8) || s.emoji;
  if (patch.tags !== undefined) n.tags = limpaTags(patch.tags);
  if (patch.favorite !== undefined) n.favorite = !!patch.favorite;
  for (const k of ['visual', 'animated', 'plays', 'sends']) if (patch[k] !== undefined) n[k] = patch[k];
  return salvarFigurinha(n);
}

export async function apagarFigurinha(id) {
  await tx('stickers', 'readwrite', (st) => st.delete(id));
  await tx('media', 'readwrite', (st) => { for (const ext of ['webp', 'ogg', 'mp4', 'png']) st.delete(`${id}.${ext}`); });
  const ps = await todosPacotes();
  for (const p of ps) if (p.stickers.includes(id)) await tx('packs', 'readwrite', (st) => st.put({ ...p, stickers: p.stickers.filter((x) => x !== id) }));
}

// ---------- mídia ----------
export const salvarMidia = (chave, blob) => tx('media', 'readwrite', (st) => st.put(blob, chave));
export const pegarMidia = (chave) => tx('media', 'readonly', (st) => req(st.get(chave)));

// ---------- pacotes ----------
export async function todosPacotes() { return tx('packs', 'readonly', (st) => req(st.getAll())); }
export async function salvarPacote(p) {
  const n = { id: p.id || novoId(), name: String(p.name || 'Pacote').trim().slice(0, 40), emoji: String(p.emoji || '📦').slice(0, 8), createdAt: p.createdAt || new Date().toISOString(), stickers: [...new Set(p.stickers || [])] };
  await tx('packs', 'readwrite', (st) => st.put(n));
  return n;
}
export const apagarPacote = (id) => tx('packs', 'readwrite', (st) => st.delete(id));
export async function pacotesDaFigurinha(id, ids) {
  for (const p of await todosPacotes()) {
    const tem = p.stickers.includes(id), quer = ids.includes(p.id);
    if (tem !== quer) await salvarPacote({ ...p, stickers: quer ? [...p.stickers, id] : p.stickers.filter((x) => x !== id) });
  }
}

/** Espaço usado e disponível (o navegador decide o limite). */
export async function espaco() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { usado: e.usage || 0, total: e.quota || 0 } : null; } catch { return null; }
}
