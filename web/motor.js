// 🌐 Motor do navegador (versão web).
// Responde às MESMAS rotas que o server.js (/api/…, /media/…), só que aqui dentro da página, sem servidor.
// A tela (public/app.js) não sabe a diferença: api()/apiRaw()/uploadWithProgress() desviam para cá, e as
// imagens, vídeos e downloads (<img src="/media/…">) chegam pelo service worker (web/sw.js), que pergunta aqui.

import * as banco from './banco.js';
import * as midia from './midia.js';

const SEM_WHATS = 'Na versão web não dá para mandar direto pelo WhatsApp. Baixe ou compartilhe a figurinha, ou use o app para Windows (botão no topo).';
const SEM_LINK = 'No site não dá para baixar de links (YouTube, Instagram, TikTok…). Baixe o vídeo e envie o arquivo, ou use o app para Windows.';
const versao = () => document.querySelector('meta[name="versao"]')?.content || 'web';
// Limites do WhatsApp (iguais aos do server.js)
const MAX_SECONDS = 60, STICK_MAX = 10, SOUND_STICKER_MAX = 10, ANIM_SOUND_MAX = 5;
const TIPOS = { ogg: 'audio/ogg', webp: 'image/webp', mp4: 'video/mp4', png: 'image/png' };

// ---------- respostas ----------
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const falha = (status, error) => json({ error }, status);
const nada = () => new Response(null, { status: 204 });
/** Arquivo com suporte a "Range" (o <video> pede pedaços para poder pular no tempo) e a download com nome. */
function arquivo(blob, req, { nome = null, cache = true } = {}) {
  const h = { 'Content-Type': blob.type || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  if (cache) h['Cache-Control'] = 'private, max-age=3600';
  if (nome) h['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`;
  const range = req?.headers?.range;
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    const a = m[1] ? Number(m[1]) : Math.max(0, blob.size - Number(m[2]));
    const b = m[1] && m[2] ? Math.min(blob.size - 1, Number(m[2])) : blob.size - 1;
    if (a >= blob.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
    return new Response(blob.slice(a, b + 1), { status: 206, headers: { ...h, 'Content-Range': `bytes ${a}-${b}/${blob.size}`, 'Content-Length': String(b - a + 1) } });
  }
  return new Response(blob, { status: 200, headers: { ...h, 'Content-Length': String(blob.size) } });
}
const nomeArquivo = (s, ext) => `${String(s?.title || 'figurinha').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'figurinha'}.${ext}`;

// ---------- estado da sessão (some ao recarregar, como o cache do app) ----------
const fontes = new Map();   // id → { meta, fonte }
const camadas = new Map();  // overlayId → Blob PNG
const tarefas = new Map();  // jobId → { step, error, sticker, source, warning }
const recortes = new Map(); // token → { blobs, fps }

function tarefa(fn, passo = 'prepare') {
  const job = { id: banco.novoId() + banco.novoId(), step: passo, error: null };
  tarefas.set(job.id, job);
  setTimeout(() => tarefas.delete(job.id), 10 * 60 * 1000);
  Promise.resolve().then(() => fn(job)).then(() => { job.step = 'done'; }).catch((e) => {
    console.error('[motor]', e);
    job.step = 'error';
    job.error = e?.message || String(e);
  });
  return json({ jobId: job.id }, 202);
}

async function registrarFonte(blob, nome, extra = {}) {
  const fonte = await midia.abrirFonte(blob, nome);
  if (fonte.duration > 3600) throw new Error('O arquivo tem mais de 1 hora. Corte um pedaço menor antes.');
  const id = banco.novoId() + banco.novoId();
  const meta = {
    id, kind: 'upload', url: null, site: 'Arquivo', title: String(nome || 'arquivo').replace(/\.[^.]+$/, '').slice(0, 120) || 'arquivo',
    media: fonte.media, duration: fonte.duration, hasVideo: fonte.hasVideo, hasAudio: fonte.hasAudio, createdAt: new Date().toISOString(), ...extra,
  };
  fontes.set(id, { meta, fonte });
  return meta;
}
const pegarFonte = (id) => fontes.get(String(id || '')) || null;

// ---------- lista da Biblioteca ----------
async function listar(params) {
  const q = (params.get('q') || '').trim().toLowerCase(), fav = params.get('favorites') === '1';
  const sort = params.get('sort') || 'recent', pack = params.get('pack') || '';
  const [todas, pacotes] = await Promise.all([banco.todasFigurinhas(), banco.todosPacotes()]);
  const porFig = {};
  for (const p of pacotes) for (const sid of p.stickers) (porFig[sid] ||= []).push(p.id);
  const doPacote = pack ? new Set(pacotes.find((p) => p.id === pack)?.stickers || []) : null;
  let lista = todas.filter((s) => (!fav || s.favorite) && (!doPacote || doPacote.has(s.id))
    && (!q || s.title.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q)) || (s.videoTitle || '').toLowerCase().includes(q) || s.emoji === q));
  const cmp = { recent: (a, b) => b.createdAt.localeCompare(a.createdAt), plays: (a, b) => b.plays - a.plays || b.createdAt.localeCompare(a.createdAt), az: (a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }) }[sort];
  lista = lista.sort(cmp || ((a, b) => b.createdAt.localeCompare(a.createdAt))).map((s) => ({ ...s, packs: porFig[s.id] || [] }));
  const vivos = new Map(todas.map((s) => [s.id, s]));
  const packs = pacotes.map((p) => {
    const ids = p.stickers.filter((id) => vivos.has(id));
    return { id: p.id, name: p.name, emoji: p.emoji, createdAt: p.createdAt, count: ids.length, cover: ids.find((id) => vivos.get(id).visual) || null };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }));
  const stats = { total: todas.length, seconds: todas.reduce((a, s) => a + (s.duration || 0), 0), plays: todas.reduce((a, s) => a + s.plays, 0), sends: todas.reduce((a, s) => a + s.sends, 0) };
  return { stickers: lista, packs, stats };
}

// ---------- criar ----------
const overlayDe = async (id) => midia.lerOverlay(camadas.get(String(id || '')) || null);

/** Figurinha sem som: foto (parada), GIF ou trecho de vídeo (animada). */
async function criarStick(b, job) {
  const reg = pegarFonte(b.sourceId);
  if (!reg) throw new Error('A mídia carregada expirou. Carregue o arquivo de novo.');
  const { fonte, meta } = reg;
  if (!fonte.hasVideo) throw new Error('Essa mídia é só áudio: não tem imagem para virar figurinha.');
  const fit = b.fit === 'pad' ? 'pad' : 'crop', frame = fit === 'crop' ? b.frame : null, overlay = await overlayDe(b.overlayId);
  const still = fonte.media === 'image';
  let s = 0, e = 0;
  if (!still) {
    s = Number(b.start); e = Number(b.end);
    if (fonte.media === 'gif' && !(e > s)) { s = 0; e = Math.min(STICK_MAX, fonte.duration); }
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s) throw new Error('Marque o início e o fim do trecho.');
    if (e - s > STICK_MAX + 0.05) throw new Error(`A figurinha animada pode ter no máximo ${STICK_MAX} segundos.`);
    if (e - s < 0.3) throw new Error('O trecho está curto demais.');
  }
  job.step = 'visual';
  const id = banco.novoId();
  if (still) {
    const r = await midia.figurinhaParada(fonte, { fit, frame, overlay });
    await banco.salvarMidia(`${id}.webp`, r.webp);
    await banco.salvarMidia(`${id}.png`, r.png);
  } else {
    await banco.salvarMidia(`${id}.webp`, await midia.figurinhaAnimada(fonte, { start: s, duration: e - s, fit, frame, overlay }));
  }
  return banco.salvarFigurinha({
    id, kind: 'sticker', animated: !still, visual: true, waveform: [], duration: still ? 0 : e - s, start: s, end: e,
    title: b.title || b.videoTitle || meta.title || 'Figurinha', emoji: b.emoji || '🖼️', tags: b.tags,
    videoTitle: b.videoTitle || meta.title, sourceKind: 'upload', sourceSite: 'Arquivo', sourceId: meta.id,
  });
}

/** Figurinha com o som do vídeo: o áudio (.ogg) e, até 10s com imagem, a figurinha (.webp) e o vídeo com som (.mp4). */
async function criarAudio(b, job) {
  const reg = pegarFonte(b.sourceId);
  if (!reg) throw new Error(b.url ? SEM_LINK : 'A mídia carregada expirou. Carregue o arquivo de novo.');
  const { fonte, meta } = reg;
  if (fonte.media === 'image' || fonte.media === 'gif') throw new Error('Foto e GIF não têm som. Em Som, escolha “Sem som”, “Enviar áudio” ou “Gravar voz”.');
  if (!fonte.hasAudio) throw new Error('Essa mídia não tem som. Em Som, escolha “Sem som”, “Enviar áudio” ou “Gravar voz”.');
  const s = Number(b.start), e = Number(b.end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s) throw new Error('Marque o início e o fim do trecho.');
  if (e > fonte.duration + 0.5) throw new Error('O fim do trecho passa do fim da mídia.');
  if (e - s > MAX_SECONDS) throw new Error(`O trecho pode ter no máximo ${MAX_SECONDS} segundos.`);
  if (e - s < 0.3) throw new Error('O trecho está curto demais.');
  job.step = 'download';
  const { amostras } = await midia.somDaFonte(fonte);
  job.step = 'cut';
  const y = midia.tratarSom(amostras, { ss: s, duration: e - s, fadeIn: !!b.fadeIn, fadeOut: !!b.fadeOut, normalize: b.normalize !== false, gainDb: [0, 3, 6, 9].includes(Number(b.gainDb)) ? Number(b.gainDb) : 0 });
  const id = banco.novoId();
  await banco.salvarMidia(`${id}.ogg`, await midia.fazerOgg(y));
  job.step = 'analyze';
  const duration = midia.duracaoDe(y);
  let sticker = await banco.salvarFigurinha({
    id, kind: 'audio', title: b.title || b.videoTitle || meta.title || 'Figurinha', emoji: b.emoji || '🔊', tags: b.tags,
    videoTitle: b.videoTitle || meta.title, start: s, end: e, duration, waveform: midia.formaDeOnda(y),
    sourceKind: 'upload', sourceSite: 'Arquivo', sourceId: meta.id, visual: false,
  });
  if (b.makeVisual !== false && fonte.hasVideo && duration <= SOUND_STICKER_MAX + 0.05) {
    job.step = 'visual';
    try { sticker = await fazerVisual(sticker, fonte, { y, fit: b.fit === 'pad' ? 'pad' : 'crop', frame: b.fit === 'pad' ? null : b.frame, overlay: await overlayDe(b.overlayId) }); }
    catch (err) { console.error('[figurinha]', err); job.warning = `O áudio foi criado, mas a figurinha falhou: ${err.message}`; }
  }
  return sticker;
}

/** Imagem da figurinha com som: animada até 5s (webp + mp4), parada de 5 a 10s (webp parado + mp4 da imagem). */
async function fazerVisual(s, fonte, { y, fit = 'crop', frame = null, overlay = null }) {
  const animated = s.duration <= ANIM_SOUND_MAX + 0.05;
  const start = s.start || 0;
  if (animated) {
    await banco.salvarMidia(`${s.id}.webp`, await midia.figurinhaAnimada(fonte, { start, duration: s.duration, fit, frame, overlay }));
    await banco.salvarMidia(`${s.id}.mp4`, await midia.fazerMp4(midia.quadroDeVideo(fonte, start, { fit, frame, overlay }), s.duration, y));
  } else {
    const r = await midia.figurinhaParada(fonte, { t: start, fit, frame, overlay });
    await banco.salvarMidia(`${s.id}.webp`, r.webp);
    await banco.salvarMidia(`${s.id}.png`, r.png);
    const img = await createImageBitmap(r.png);
    await banco.salvarMidia(`${s.id}.mp4`, await midia.fazerMp4(async () => { const c = new OffscreenCanvas(512, 512), x = c.getContext('2d'); x.fillStyle = '#16161f'; x.fillRect(0, 0, 512, 512); x.drawImage(img, 0, 0); return c; }, s.duration, y, { fps: 5 }));
  }
  return banco.atualizarFigurinha(s.id, { visual: true, animated });
}

/** Som de uma figurinha (amostras 48 kHz), lido do .ogg guardado. */
async function somDaFigurinha(id) {
  const ogg = await banco.pegarMidia(`${id}.ogg`);
  if (!ogg) throw new Error('Essa figurinha não tem o som guardado.');
  const fonte = await midia.abrirFonte(ogg, 'som.ogg');
  return (await midia.somDaFonte(fonte)).amostras;
}

/** Combinação Caótica: a imagem de uma + o som de outra. */
async function combinar(b) {
  const vis = await banco.pegarFigurinha(String(b.visualId || '')), aud = await banco.pegarFigurinha(String(b.audioId || ''));
  if (!vis || !vis.visual) throw Object.assign(new Error('Escolha uma figurinha com imagem.'), { status: 400 });
  if (!aud || !aud.hasAudio) throw Object.assign(new Error('Escolha uma figurinha com som.'), { status: 400 });
  const soundMax = vis.animated ? ANIM_SOUND_MAX : SOUND_STICKER_MAX;
  if (aud.duration > soundMax + 0.05) throw Object.assign(new Error(vis.animated ? `Com imagem animada, o som pode ter até ${ANIM_SOUND_MAX}s (esse tem ${aud.duration.toFixed(1)}s).` : `A figurinha com som aceita até ${SOUND_STICKER_MAX}s de áudio, e esse som tem ${aud.duration.toFixed(1)}s.`), { status: 400 });
  const [webp, ogg, png] = await Promise.all([banco.pegarMidia(`${vis.id}.webp`), banco.pegarMidia(`${aud.id}.ogg`), banco.pegarMidia(`${vis.id}.png`)]);
  if (!webp || !ogg) throw Object.assign(new Error('Faltam os arquivos de uma das peças.'), { status: 400 });
  const id = banco.novoId();
  await banco.salvarMidia(`${id}.webp`, webp);
  await banco.salvarMidia(`${id}.ogg`, ogg);
  if (png) await banco.salvarMidia(`${id}.png`, png);
  const y = await somDaFigurinha(aud.id);
  const fonte = await midia.fonteDeWebp(png && !vis.animated ? png : webp);
  const laco = fonte.media === 'gif' ? fonte.duration : Infinity;
  await banco.salvarMidia(`${id}.mp4`, await midia.fazerMp4(midia.quadroDeVideo(fonte, 0, { fit: 'pad', laco }), aud.duration, y, { fps: fonte.media === 'gif' ? 20 : 5 }));
  const sticker = await banco.salvarFigurinha({
    id, kind: 'combo', visual: true, animated: vis.animated, duration: aud.duration, waveform: aud.waveform,
    title: b.title || `${vis.title} + ${aud.title}`, emoji: b.emoji || vis.emoji || '🌀', tags: b.tags,
    videoTitle: `Imagem: ${vis.title} · Som: ${aud.title}`, start: aud.start, end: aud.end, sourceKind: aud.sourceKind, sourceSite: aud.sourceSite, sourceId: aud.sourceId,
  });
  const querem = Array.isArray(b.deleteIds) ? b.deleteIds.map(String) : b.deleteParts ? [vis.id, aud.id] : [];
  const deleted = [];
  for (const p of [vis, aud]) if (querem.includes(p.id) && !deleted.includes(p.id)) { await banco.apagarFigurinha(p.id); deleted.push(p.id); }
  return { sticker, deleted };
}

// ---------- exportar / importar (.zip no mesmo formato do app) ----------
let zipLib = null;
const fflate = async () => (zipLib ||= await import('./vendor/fflate.js'));
async function exportar(params) {
  const { zipSync, strToU8 } = await fflate();
  const ids = params.get('ids') ? params.get('ids').split(',') : null;
  const { stickers, packs } = await listar(new URLSearchParams(params.get('pack') ? { pack: params.get('pack') } : {}));
  const lista = stickers.filter((s) => !ids || ids.includes(s.id));
  const dentro = new Set(lista.map((s) => s.id));
  const pacotes = (await banco.todosPacotes()).filter((p) => !params.get('pack') || p.id === params.get('pack'))
    .map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, stickers: p.stickers.filter((id) => dentro.has(id)) }));
  const arquivos = { 'manifest.json': strToU8(JSON.stringify({ app: 'audio-sticks', version: 2, exportedAt: new Date().toISOString(), packs: pacotes, stickers: lista.map(({ plays, sends, packs: _p, hasAudio, ...s }) => s) }, null, 2)) };
  for (const s of lista) for (const e of Object.keys(TIPOS)) { const b = await banco.pegarMidia(`${s.id}.${e}`); if (b) arquivos[`audio/${s.id}.${e}`] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }]; }
  const nomeP = params.get('pack') ? packs.find((p) => p.id === params.get('pack'))?.name : null;
  return arquivo(new Blob([zipSync(arquivos)], { type: 'application/zip' }), null, { nome: `${(nomeP || 'figurinhas').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'figurinhas'}-${new Date().toISOString().slice(0, 10)}.zip`, cache: false });
}
async function importar(arq) {
  const { unzipSync, strFromU8 } = await fflate();
  let z;
  try { z = unzipSync(new Uint8Array(await arq.arrayBuffer())); } catch { throw new Error('Esse arquivo não é um .zip válido.'); }
  const manifest = z['manifest.json'] ? JSON.parse(strFromU8(z['manifest.json'])) : null;
  if (!['audio-sticks', 'sticks-audio'].includes(manifest?.app) || !Array.isArray(manifest.stickers)) throw new Error('Esse arquivo não é um pacote de figurinhas.');
  let added = 0, skipped = 0, packsAdded = 0;
  const valido = (id) => /^[\w-]{4,40}$/.test(String(id));
  for (const s of manifest.stickers) {
    const silent = s.kind === 'sticker';
    if (!valido(s.id) || !z[`audio/${s.id}.${silent ? 'webp' : 'ogg'}`] || await banco.pegarFigurinha(s.id) || !Array.isArray(s.waveform)) { skipped++; continue; }
    for (const [e, tipo] of Object.entries(TIPOS)) if (z[`audio/${s.id}.${e}`]) await banco.salvarMidia(`${s.id}.${e}`, new Blob([z[`audio/${s.id}.${e}`]], { type: tipo }));
    await banco.salvarFigurinha({ ...s, visual: !!z[`audio/${s.id}.webp`], duration: Number(s.duration) || (silent ? 0 : 1) });
    added++;
  }
  const existentes = new Map((await banco.todosPacotes()).map((p) => [p.id, p]));
  for (const p of Array.isArray(manifest.packs) ? manifest.packs : []) {
    if (!valido(p.id)) continue;
    const atual = existentes.get(p.id);
    if (!atual) packsAdded++;
    const ids = [];
    for (const sid of Array.isArray(p.stickers) ? p.stickers : []) if (await banco.pegarFigurinha(sid)) ids.push(sid);
    await banco.salvarPacote({ ...(atual || { id: p.id, name: p.name, emoji: p.emoji }), stickers: [...(atual?.stickers || []), ...ids] });
  }
  return { added, skipped, packsAdded };
}

// ---------- roteador ----------
async function corpo(opts) {
  if (!opts.body) return {};
  if (typeof opts.body === 'string') { try { return JSON.parse(opts.body); } catch { return {}; } }
  if (opts.body instanceof FormData) return opts.body;
  return {};
}
const campo = (fd, k) => (fd instanceof FormData ? fd.get(k) : fd?.[k]);

async function rotear(path, opts = {}) {
  const url = new URL(path, location.origin);
  const metodo = (opts.method || 'GET').toUpperCase();
  const r = url.pathname, p = url.searchParams;
  const req = { headers: Object.fromEntries(new Headers(opts.headers || {}).entries()) };
  let m;

  // mídia guardada
  if ((m = r.match(/^\/media\/([\w-]+)\.(ogg|webp|mp4|png)$/)) && metodo === 'GET') {
    const blob = await banco.pegarMidia(`${m[1]}.${m[2]}`);
    if (!blob) return falha(404, 'Arquivo não encontrado.');
    const s = p.has('download') ? await banco.pegarFigurinha(m[1]) : null;
    return arquivo(new Blob([blob], { type: TIPOS[m[2]] }), req, { nome: p.has('download') ? nomeArquivo(s, m[2]) : null });
  }
  if (!r.startsWith('/api/')) return falha(404, 'Não encontrado.');

  // básicos
  if (r === '/api/ping') return new Response('pong');
  if (r === '/api/settings') return json({ version: versao(), url: location.origin, web: true });
  if (r === '/api/health') return json({ web: true });
  if (r === '/api/whatsapp') return json({ status: 'unavailable', qr: null, me: null, error: null });
  if (r.startsWith('/api/whatsapp') || /\/send/.test(r)) return falha(501, SEM_WHATS);
  if (r === '/api/stickers' && metodo === 'GET') return json(await listar(p));
  if ((m = r.match(/^\/api\/jobs\/([\w-]+)$/))) {
    const j = tarefas.get(m[1]);
    if (!j) return falha(404, 'Tarefa não encontrada.');
    const { id, ...resto } = j;
    return json(resto);
  }

  // origens
  if (r === '/api/sources' || r === '/api/sources/image-url') return falha(400, SEM_LINK);
  if ((m = r.match(/^\/api\/sources\/([\w-]+)\/media$/))) {
    const reg = pegarFonte(m[1]);
    return reg ? arquivo(reg.fonte.blob, req) : falha(404, 'Mídia expirada. Carregue de novo.');
  }
  if (r === '/api/frame') {
    const reg = pegarFonte(p.get('src'));
    if (!reg || !reg.fonte.hasVideo) return falha(404, 'sem quadro');
    const fit = ['pad', 'full'].includes(p.get('fit')) ? p.get('fit') : 'crop';
    return arquivo(await midia.previa(reg.fonte, Math.max(0, Number(p.get('t')) || 0), { fit, frame: { z: p.get('z'), x: p.get('x'), y: p.get('y') } }), req);
  }

  // camada de texto e emoji
  if (r === '/api/overlays' && metodo === 'POST') {
    const b = campo(await corpo(opts), 'overlay');
    if (!(b instanceof Blob)) return falha(400, 'Camada de texto não recebida.');
    const id = crypto.randomUUID();
    camadas.set(id, b);
    setTimeout(() => camadas.delete(id), 30 * 60 * 1000);
    return json({ id }, 201);
  }

  // criar
  if (r === '/api/stickers' && metodo === 'POST') {
    const b = await corpo(opts);
    return tarefa(async (job) => { job.sticker = b.mode === 'sticker' ? await criarStick(b, job) : await criarAudio(b, job); }, b.mode === 'sticker' ? 'visual' : 'download');
  }
  if ((m = r.match(/^\/api\/stickers\/([\w-]+)\/visual$/))) {
    const s = await banco.pegarFigurinha(m[1]);
    if (!s) return falha(404, 'Figurinha não encontrada.');
    const reg = pegarFonte(s.sourceId);
    if (!reg) return falha(400, 'O vídeo de origem não está mais aberto. Carregue o arquivo de novo e crie o trecho.');
    return tarefa(async (job) => { job.sticker = await fazerVisual(s, reg.fonte, { y: await somDaFigurinha(s.id) }); }, 'visual');
  }
  if ((m = r.match(/^\/api\/stickers\/([\w-]+)\/as-source$/))) {
    const s = await banco.pegarFigurinha(m[1]);
    if (!s || !s.visual) return falha(404, 'Figurinha com imagem não encontrada.');
    const blob = (!s.animated && await banco.pegarMidia(`${s.id}.png`)) || await banco.pegarMidia(`${s.id}.webp`);
    try { return json(await registrarFonte(blob, `${s.title}.${blob.type === 'image/png' ? 'png' : 'webp'}`)); } catch (e) { return falha(500, e.message); }
  }
  if ((m = r.match(/^\/api\/stickers\/([\w-]+)\/play$/))) {
    const s = await banco.pegarFigurinha(m[1]);
    if (s) await banco.atualizarFigurinha(s.id, { plays: s.plays + 1 });
    return nada();
  }
  if ((m = r.match(/^\/api\/stickers\/([\w-]+)\/packs$/)) && metodo === 'PUT') {
    if (!await banco.pegarFigurinha(m[1])) return falha(404, 'Figurinha não encontrada.');
    const b = await corpo(opts);
    await banco.pacotesDaFigurinha(m[1], Array.isArray(b.packs) ? b.packs.map(String) : []);
    return json({ ok: true });
  }
  if ((m = r.match(/^\/api\/stickers\/([\w-]+)$/))) {
    if (metodo === 'PATCH') { const s = await banco.atualizarFigurinha(m[1], await corpo(opts)); return s ? json(s) : falha(404, 'Figurinha não encontrada.'); }
    if (metodo === 'DELETE') { if (!await banco.pegarFigurinha(m[1])) return falha(404, 'Figurinha não encontrada.'); await banco.apagarFigurinha(m[1]); return nada(); }
  }
  if (r === '/api/combos' && metodo === 'POST') {
    try { return json(await combinar(await corpo(opts))); } catch (e) { return falha(e.status || 500, e.message); }
  }

  // tirar o fundo de vídeo/GIF: quadros para o editor
  if (r === '/api/frames' && metodo === 'POST') {
    const b = await corpo(opts);
    const reg = pegarFonte(b.sourceId);
    if (!reg) return falha(400, b.url ? SEM_LINK : 'A mídia carregada expirou. Carregue de novo.');
    const s = Math.max(0, Number(b.start) || 0), e = Number(b.end) || 0;
    if (e - s < 0.3) return falha(400, 'Marque um trecho de vídeo.');
    if (e - s > STICK_MAX + 0.05) return falha(400, `Para tirar o fundo, use um trecho de até ${STICK_MAX}s.`);
    const fps = 12, blobs = await midia.quadrosParaRecorte(reg.fonte, s, e, fps), token = crypto.randomUUID();
    recortes.set(token, { blobs, fps });
    setTimeout(() => recortes.delete(token), 30 * 60 * 1000);
    return json({ token, count: blobs.length, fps });
  }
  if ((m = r.match(/^\/api\/frames\/([\w-]+)\/(\d{4})\.png$/))) {
    const q = recortes.get(m[1])?.blobs[Number(m[2]) - 1];
    return q ? arquivo(q, req) : falha(404, 'Quadro não encontrado.');
  }

  // pacotes
  if (r === '/api/packs' && metodo === 'GET') return json((await listar(new URLSearchParams())).packs);
  if (r === '/api/packs' && metodo === 'POST') {
    const b = await corpo(opts);
    if (!String(b.name || '').trim()) return falha(400, 'Dê um nome ao pacote.');
    return json(await banco.salvarPacote({ name: b.name, emoji: b.emoji }), 201);
  }
  if ((m = r.match(/^\/api\/packs\/([\w-]+)$/))) {
    const atual = (await banco.todosPacotes()).find((x) => x.id === m[1]);
    if (!atual) return falha(404, 'Pacote não encontrado.');
    if (metodo === 'PATCH') { const b = await corpo(opts); return json(await banco.salvarPacote({ ...atual, name: b.name ?? atual.name, emoji: b.emoji ?? atual.emoji })); }
    if (metodo === 'DELETE') { await banco.apagarPacote(m[1]); return nada(); }
  }
  if (/^\/api\/packs\/[\w-]+\/wastickers$/.test(r)) return falha(501, 'O pacote .wastickers ainda é só do app para Windows.');
  if (r === '/api/export') return exportar(p);
  if (r === '/api/import' && metodo === 'POST') {
    const f = campo(await corpo(opts), 'pack');
    if (!(f instanceof Blob)) return falha(400, 'Envie um arquivo .zip.');
    try { return json(await importar(f)); } catch (e) { return falha(400, e.message); }
  }

  return falha(501, 'Na versão web isso ainda não existe. Use o app para Windows (botão no topo).');
}

/** Envios de arquivo (o mesmo contrato do uploadWithProgress: devolve o JSON da resposta). */
async function enviar(path, fd, onProgress) {
  onProgress?.(100);
  const r = new URL(path, location.origin).pathname;
  if (r === '/api/sources/upload' || r === '/api/sources/animated') {
    const f = fd.get(r.endsWith('animated') ? 'original' : 'file');
    if (!(f instanceof Blob)) throw new Error('Escolha um arquivo de vídeo, áudio, foto ou GIF.');
    const resp = tarefa(async (job) => { job.source = await registrarFonte(f, f.name || 'arquivo'); });
    return resp.json();
  }
  const m2 = r.match(/^\/api\/frames\/([\w-]+)\/result$/);
  if (m2) {
    const rec = recortes.get(m2[1]);
    if (!rec) throw new Error('Os quadros expiraram. Abra o “Tirar o fundo” de novo.');
    const quadros = fd.getAll('frames').filter((x) => x instanceof Blob);
    if (!quadros.length) throw new Error('Nenhum quadro recebido.');
    const fps = Number(fd.get('fps')) || rec.fps;
    const resp = tarefa(async (job) => {
      const overlay = await overlayDe(fd.get('overlayId'));
      const { webp } = await midia.figurinhaDeQuadros(quadros, fps, { overlay });
      const id = banco.novoId();
      await banco.salvarMidia(`${id}.webp`, webp);
      const s = Number(fd.get('start')) || 0, e = Number(fd.get('end')) || quadros.length / fps;
      job.sticker = await banco.salvarFigurinha({
        id, kind: 'sticker', animated: true, visual: true, waveform: [], duration: e - s, start: s, end: e,
        title: fd.get('title') || 'Figurinha sem fundo', emoji: fd.get('emoji') || '✂️', tags: fd.get('tags') || '',
        sourceKind: 'upload', sourceSite: 'Arquivo', sourceId: fd.get('sourceId') || null,
      });
      recortes.delete(m2[1]);
    }, 'visual');
    return resp.json();
  }
  if (r === '/api/import') {
    const f = fd.get('pack');
    if (!(f instanceof Blob)) throw new Error('Envie um arquivo .zip.');
    return importar(f);
  }
  const resp = await rotear(path, { method: 'POST', body: fd });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
  return data;
}

export function criarMotor() {
  return {
    /** Mesmo contrato do fetch(): recebe a rota e devolve uma Response. */
    async fetch(path, opts = {}) {
      try { return await rotear(path, opts); } catch (e) { console.error('[motor]', e); return falha(500, e?.message || String(e)); }
    },
    upload: enviar,
    /** Já há algo guardado neste navegador? (para decidir se vale esperar o service worker) */
    temFigurinhas: async () => (await banco.todasFigurinhas()).length > 0,
  };
}
