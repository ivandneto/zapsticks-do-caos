import express from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ROOT, DATA_DIR, AUDIO_DIR, TMP_DIR, IS_EXE, PORTABLE } from './lib/paths.js';
import { startTray, errorBox } from './lib/tray.js';
import { readConfig, saveConfig, validPort, DEFAULT_PORT } from './lib/config.js';
import pkg from './package.json' with { type: 'json' };
import { ensureTools, autoUpdateYtdlp } from './lib/tools.js';
import * as db from './lib/db.js';
import { parseVideoId, getSourceAudio, getVideoSection, getFrame, makeTrayIcon, makeAnimatedWebp, makeSquareMp4, cutToOgg, analyze, checkTools } from './lib/audio.js';
import * as wa from './lib/whatsapp.js';
import * as sources from './lib/sources.js';

const PASSWORD = process.env.APP_PASSWORD || '';
const MAX_SECONDS = 60;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// --- Senha opcional (use se for abrir o app fora de casa, por túnel) ---
// A página pública de uma figurinha (/s/:id) e o arquivo de áudio ficam abertos, para quem recebe o link conseguir ouvir.
const isPublic = (p) => /^\/s\/[\w-]+$/.test(p) || /^\/media\/[\w-]+\.(ogg|webp|mp4)$/.test(p) || p === '/public.css' || p === '/api/ping';
app.use((req, res, next) => {
  if (!PASSWORD || isPublic(req.path)) return next();
  const [, b64 = ''] = (req.headers.authorization || '').split(' ');
  const pass = Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(pass), b = Buffer.from(PASSWORD);
  if (a.length === b.length && timingSafeEqual(a, b)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Audio Sticks"').status(401).send('Senha necessária');
});

app.use(express.static(path.join(ROOT, 'public')));

// Cada figurinha tem até 3 arquivos: <id>.ogg (áudio), <id>.webp (figurinha animada) e <id>.mp4 (vídeo quadrado com som)
const KINDS = { ogg: 'audio/ogg', webp: 'image/webp', mp4: 'video/mp4' };
const mediaPath = (id, ext = 'ogg') => path.join(AUDIO_DIR, `${id}.${ext}`);
const audioPath = (id) => mediaPath(id, 'ogg');
const validId = (id) => /^[\w-]{4,20}$/.test(id);
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const SOUND_STICKER_MAX = 10; // limite de áudio da figurinha com som do WhatsApp

// --- Arquivos das figurinhas ---
app.get('/media/:file', (req, res) => {
  const m = req.params.file.match(/^([\w-]{4,20})\.(ogg|webp|mp4)$/);
  if (!m || !fs.existsSync(mediaPath(m[1], m[2]))) return res.sendStatus(404);
  res.type(KINDS[m[2]]);
  if (req.query.download) {
    const s = db.getSticker(m[1]);
    const name = (s?.title || m[1]).replace(/[^\p{L}\p{N} _-]/gu, '').trim() || m[1];
    res.attachment(`${name}.${m[2]}`);
  }
  res.sendFile(mediaPath(m[1], m[2]));
});

/** Pega o trecho do vídeo de onde a figurinha saiu: YouTube (baixa a janela), link (cache ou baixa de novo) ou arquivo. */
async function videoSegmentFor(s) {
  if (s.videoId) return getVideoSection(s.videoId, s.start, s.end);
  let src = sources.getSource(s.sourceId);
  if (!src && s.sourceKind === 'url' && s.sourceUrl) src = sources.getSource((await sources.fetchUrl(s.sourceUrl)).id);
  if (!src) throw new Error('O arquivo de origem não está mais no cache. Envie o arquivo de novo e recrie a figurinha.');
  if (!src.hasVideo) throw new Error('A origem é só áudio: não há imagem para animar.');
  return sources.cutVideoSegment(src.file, s.start, s.end, TMP_DIR);
}

/** Gera a figurinha animada (.webp) e o vídeo quadrado (.mp4) a partir do trecho do vídeo. */
async function buildVisual(s) {
  const video = await videoSegmentFor(s);
  try {
    await makeAnimatedWebp(video, mediaPath(s.id, 'webp'), s.duration);
    await makeSquareMp4(video, audioPath(s.id), mediaPath(s.id, 'mp4'), s.duration);
  } finally {
    fs.rmSync(video, { force: true });
  }
  return db.updateSticker(s.id, { visual: true });
}

const friendlyError = (err) => /Sign in|bot/i.test(err.message) ? 'O YouTube pediu verificação para este vídeo. Tente outro ou atualize o yt-dlp (npm run setup).'
  : /Private|unavailable|removed/i.test(err.message) ? 'Vídeo indisponível ou privado.'
  : `Não deu certo: ${err.message}`;

// --- Criação (em segundo plano, com etapas que a página acompanha) ---
const jobs = new Map();

// Origem: { url } do YouTube, ou { sourceId } de um link de outro site / arquivo já carregado (POST /api/sources…)
app.post('/api/stickers', (req, res) => {
  const { url, sourceId, start, end, title, emoji, tags, videoTitle, videoDuration, fadeIn, fadeOut, normalize, gainDb, makeVisual } = req.body || {};
  const videoId = sourceId ? null : parseVideoId(url);
  const source = sourceId ? sources.getSource(sourceId) : null;
  const s = Number(start), e = Number(end);
  if (sourceId && !source) return fail(res, 400, 'A mídia carregada expirou. Carregue o link ou o arquivo de novo.');
  if (!sourceId && !videoId) return fail(res, 400, 'Link inválido.');
  if (source && e > source.duration + 0.5) return fail(res, 400, 'O fim do trecho passa do fim da mídia.');
  if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s) return fail(res, 400, 'Marque o início e o fim do trecho.');
  if (e - s > MAX_SECONDS) return fail(res, 400, `O trecho pode ter no máximo ${MAX_SECONDS} segundos.`);
  if (e - s < 0.3) return fail(res, 400, 'O trecho está curto demais.');

  const job = { id: randomUUID(), step: 'download', error: null, sticker: null };
  jobs.set(job.id, job);
  setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000);
  res.status(202).json({ jobId: job.id });

  (async () => {
    const src = source ? { file: source.file, offset: 0 } : await getSourceAudio(videoId, s, e, Number(videoDuration) || 0);
    try {
      job.step = 'cut';
      const id = db.newId();
      const out = audioPath(id);
      await cutToOgg(src.file, out, {
        ss: s - src.offset, duration: e - s,
        fadeIn: !!fadeIn, fadeOut: !!fadeOut, normalize: normalize !== false,
        gainDb: [0, 3, 6, 9].includes(Number(gainDb)) ? Number(gainDb) : 0,
      });
      job.step = 'analyze';
      const { waveform, duration } = await analyze(out);
      job.sticker = db.insertSticker({
        id, title: String(title || videoTitle || 'Figurinha').slice(0, 80), emoji: String(emoji || '🔊').slice(0, 8), tags,
        videoId, videoTitle: String(videoTitle || source?.title || '').slice(0, 200) || null, start: s, end: e, duration, waveform,
        sourceKind: source ? source.kind : 'youtube', sourceUrl: source ? source.url : null, sourceId: source?.id ?? null,
        sourceSite: source ? source.site : 'YouTube',
      });
    } finally {
      if (src.temp) fs.rmSync(src.file, { force: true });
    }
    // Trechos curtos também viram figurinha animada (falhar aqui não perde o áudio)
    if (makeVisual !== false && (!source || source.hasVideo) && job.sticker.duration <= SOUND_STICKER_MAX + 0.05) {
      job.step = 'visual';
      try { job.sticker = await buildVisual(job.sticker); } catch (err) {
        console.error('[figurinha]', err.message);
        job.warning = 'O áudio foi criado, mas a figurinha animada falhou. Tente de novo pelo botão da figurinha.';
      }
    }
    job.step = 'done';
  })().catch((err) => {
    console.error('[criar]', err.message);
    job.step = 'error';
    job.error = friendlyError(err);
  });
});

// --- Outras origens: link de qualquer site (yt-dlp) ou arquivo do PC ---
app.post('/api/sources', (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return fail(res, 400, 'Cole um link que comece com http:// ou https://');
  const job = { id: randomUUID(), step: 'fetch', error: null, source: null, site: sources.siteName(url) };
  jobs.set(job.id, job);
  setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000);
  res.status(202).json({ jobId: job.id, site: job.site });
  sources.fetchUrl(url).then((m) => { job.source = m; job.step = 'done'; })
    .catch((err) => { console.error('[origem]', err.message); job.step = 'error'; job.error = err.message; });
});

const sourceUpload = multer({ dest: TMP_DIR, limits: { fileSize: 1024 * 1024 * 1024 } });
app.post('/api/sources/upload', sourceUpload.single('file'), (req, res) => {
  if (!req.file) return fail(res, 400, 'Escolha um arquivo de vídeo ou áudio.');
  // o navegador manda o nome em UTF-8, mas o multer o lê como latin1; desfaz isso só se o resultado for UTF-8 válido
  const utf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const name = utf8.includes('�') ? req.file.originalname : utf8;
  const job = { id: randomUUID(), step: 'prepare', error: null, source: null };
  jobs.set(job.id, job);
  setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000);
  res.status(202).json({ jobId: job.id });
  sources.addUpload(req.file.path, name).then((m) => { job.source = m; job.step = 'done'; })
    .catch((err) => { console.error('[arquivo]', err.message); job.step = 'error'; job.error = err.message; });
});

app.get('/api/sources/:id/media', (req, res) => {
  const src = sources.getSource(req.params.id);
  if (!src) return res.sendStatus(404);
  res.sendFile(src.file); // suporta "Range": o player consegue pular para qualquer ponto
});

// Prévia da figurinha: quadro do vídeo no início do trecho, recortado quadrado (?v= YouTube | ?src= outra origem)
app.get('/api/frame', async (req, res) => {
  const t = Number(req.query.t);
  if (!Number.isFinite(t) || t < 0) return res.sendStatus(400);
  try {
    let jpg;
    if (req.query.src) {
      const src = sources.getSource(String(req.query.src));
      if (!src || !src.hasVideo) return res.sendStatus(404);
      jpg = await sources.frameFromFile(src.file, t);
    } else {
      const videoId = parseVideoId(String(req.query.v || ''));
      if (!videoId) return res.sendStatus(400);
      jpg = await getFrame(videoId, t);
    }
    res.type('image/jpeg').set('Cache-Control', 'private, max-age=3600').send(jpg);
  } catch (err) {
    console.error('[prévia]', err.message);
    res.sendStatus(502);
  }
});

// Gera (ou refaz) a figurinha animada de uma figurinha que já existe
app.post('/api/stickers/:id/visual', (req, res) => {
  const s = db.getSticker(req.params.id);
  if (!s) return fail(res, 404, 'Figurinha não encontrada.');
  if (!s.videoId && !s.sourceId && !s.sourceUrl) return fail(res, 400, 'Essa figurinha não tem o vídeo de origem (veio de um pacote importado).');
  if (s.duration > SOUND_STICKER_MAX + 0.05) return fail(res, 400, `A figurinha com som aceita até ${SOUND_STICKER_MAX}s de áudio. Esta tem ${s.duration.toFixed(1)}s — crie um trecho menor.`);
  const job = { id: randomUUID(), step: 'visual', error: null, sticker: null };
  jobs.set(job.id, job);
  setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000);
  res.status(202).json({ jobId: job.id });
  buildVisual(s).then((st) => { job.sticker = st; job.step = 'done'; }).catch((err) => {
    console.error('[figurinha]', err.message);
    job.step = 'error';
    job.error = friendlyError(err);
  });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return fail(res, 404, 'Tarefa não encontrada.');
  res.json(job);
});

// --- Coleção ---
app.get('/api/stickers', (req, res) => {
  res.json({
    stickers: db.listStickers({ q: String(req.query.q || '').slice(0, 60), favorites: req.query.favorites === '1', sort: req.query.sort, pack: String(req.query.pack || '') }),
    packs: db.listPacks(), stats: db.stats(),
  });
});

app.patch('/api/stickers/:id', (req, res) => {
  if (!db.getSticker(req.params.id)) return fail(res, 404, 'Figurinha não encontrada.');
  const { title, emoji, tags, favorite } = req.body || {};
  res.json(db.updateSticker(req.params.id, { title, emoji, tags, favorite }));
});

app.post('/api/stickers/:id/play', (req, res) => { db.bump(req.params.id, 'plays'); res.sendStatus(204); });

app.delete('/api/stickers/:id', (req, res) => {
  if (!validId(req.params.id)) return fail(res, 400, 'ID inválido.');
  const ok = db.deleteSticker(req.params.id);
  db.removeStickerFromPacks(req.params.id);
  for (const ext of Object.keys(KINDS)) fs.rmSync(mediaPath(req.params.id, ext), { force: true });
  ok ? res.sendStatus(204) : fail(res, 404, 'Figurinha não encontrada.');
});

// Erro de envio → 409 quando o WhatsApp está desconectado (a página abre a tela de conexão)
const sendFail = (res, err, tag) => {
  console.error(tag, err.message);
  fail(res, err.code === 'NOT_CONNECTED' || wa.waStatus().status !== 'open' ? 409 : /Destino inválido/.test(err.message) ? 400 : 500, err.message);
};

// "to" = 'me' (padrão), contato (…@s.whatsapp.net / …@lid) ou grupo (…@g.us)
app.post('/api/stickers/:id/send', async (req, res) => {
  const s = db.getSticker(req.params.id);
  if (!s) return fail(res, 404, 'Figurinha não encontrada.');
  try {
    await sendOne(s, 'audio', req.body?.to);
    res.json({ ok: true });
  } catch (err) { sendFail(res, err, '[enviar]'); }
});

/** Envia uma figurinha: 'sound' (com som, experimental), 'plain' (sem som) ou 'audio' (mensagem de voz).
 *  Sem a animação, cai para mensagem de voz. */
async function sendOne(s, mode = 'sound', to = 'me') {
  const hasVisual = s.visual && fs.existsSync(mediaPath(s.id, 'webp'));
  if (mode === 'audio' || !hasVisual) await wa.sendVoice(to, fs.readFileSync(audioPath(s.id)), { seconds: s.duration, waveform: s.waveform });
  else if (mode === 'plain') await wa.sendSticker(to, fs.readFileSync(mediaPath(s.id, 'webp')));
  else await wa.sendSoundSticker(to, fs.readFileSync(mediaPath(s.id, 'webp')), fs.readFileSync(audioPath(s.id)), { seconds: s.duration });
  db.bump(s.id, 'sends');
}

// Figurinha: mode=sound (experimental, com som) ou mode=plain (figurinha animada comum)
app.post('/api/stickers/:id/send-sticker', async (req, res) => {
  const s = db.getSticker(req.params.id);
  if (!s) return fail(res, 404, 'Figurinha não encontrada.');
  if (!s.visual || !fs.existsSync(mediaPath(s.id, 'webp'))) return fail(res, 400, 'Gere a figurinha animada primeiro.');
  try {
    await sendOne(s, req.body?.mode === 'plain' ? 'plain' : 'sound', req.body?.to);
    res.json({ ok: true });
  } catch (err) { sendFail(res, err, '[figurinha]'); }
});

// --- Pacotes (categorias) ---
app.get('/api/packs', (req, res) => res.json(db.listPacks()));
app.post('/api/packs', (req, res) => {
  const { name, emoji } = req.body || {};
  if (!String(name || '').trim()) return fail(res, 400, 'Dê um nome ao pacote.');
  res.status(201).json(db.createPack({ name, emoji }));
});
app.patch('/api/packs/:id', (req, res) => {
  if (!db.getPack(req.params.id)) return fail(res, 404, 'Pacote não encontrado.');
  res.json(db.updatePack(req.params.id, req.body || {}));
});
app.delete('/api/packs/:id', (req, res) => (db.deletePack(req.params.id) ? res.sendStatus(204) : fail(res, 404, 'Pacote não encontrado.')));
app.put('/api/stickers/:id/packs', (req, res) => {
  if (!db.getSticker(req.params.id)) return fail(res, 404, 'Figurinha não encontrada.');
  db.setStickerPacks(req.params.id, Array.isArray(req.body?.packs) ? req.body.packs.map(String) : []);
  res.json({ ok: true });
});

// Envia o pacote inteiro pro WhatsApp: um título e depois cada figurinha, com progresso
app.post('/api/packs/:id/send', (req, res) => {
  const pack = db.getPack(req.params.id);
  if (!pack) return fail(res, 404, 'Pacote não encontrado.');
  if (wa.waStatus().status !== 'open') return fail(res, 409, 'WhatsApp não está conectado.');
  const list = db.packStickers(pack.id);
  if (!list.length) return fail(res, 400, 'Esse pacote está vazio.');
  const mode = ['sound', 'plain', 'audio'].includes(req.body?.mode) ? req.body.mode : 'sound';
  const to = req.body?.to || 'me';
  try { wa.resolveTarget(to); } catch (err) { return sendFail(res, err, '[pacote]'); }
  const self = wa.isSelf(to);
  const job = { id: randomUUID(), step: 'sending', done: 0, total: list.length, failed: 0, error: null };
  jobs.set(job.id, job);
  setTimeout(() => jobs.delete(job.id), 30 * 60 * 1000);
  res.status(202).json({ jobId: job.id });
  (async () => {
    await wa.sendText(to, `📦 *${pack.emoji} ${pack.name}* · ${list.length} figurinha${list.length > 1 ? 's' : ''}`);
    for (const s of list) {
      try { await sendOne(s, mode, to); } catch (err) { job.failed++; console.error('[pacote]', s.id, err.message); }
      job.done++;
      // ritmo humano, evita bloqueio por spam (mais devagar quando vai para outra pessoa/grupo)
      await new Promise((r) => setTimeout(r, self ? 1200 : 2000 + Math.random() * 1500));
    }
    job.step = 'done';
  })().catch((err) => { job.step = 'error'; job.error = err.message; });
});

// Pacote no formato .wastickers (importável por apps de figurinhas para virar pacote no WhatsApp). Sem som.
app.get('/api/packs/:id/wastickers', async (req, res) => {
  const pack = db.getPack(req.params.id);
  if (!pack) return fail(res, 404, 'Pacote não encontrado.');
  const list = db.packStickers(pack.id).filter((s) => s.visual && fs.existsSync(mediaPath(s.id, 'webp'))).slice(0, 30);
  if (list.length < 3) return fail(res, 400, `O WhatsApp exige pelo menos 3 figurinhas animadas no pacote (este tem ${list.length}).`);
  try {
    const tray = path.join(TMP_DIR, `tray-${randomUUID()}.png`);
    await makeTrayIcon(mediaPath(list[0].id, 'mp4'), tray);
    const zip = new AdmZip();
    zip.addFile('title.txt', Buffer.from(pack.name));
    zip.addFile('author.txt', Buffer.from('Audio Sticks'));
    zip.addFile('tray.png', fs.readFileSync(tray));
    fs.rmSync(tray, { force: true });
    list.forEach((s, i) => zip.addFile(`${String(i + 1).padStart(2, '0')}.webp`, fs.readFileSync(mediaPath(s.id, 'webp'))));
    const fname = pack.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'pacote';
    res.attachment(`${fname}.wastickers`).type('application/zip').send(zip.toBuffer());
  } catch (err) {
    console.error('[wastickers]', err.message);
    fail(res, 500, `Não consegui montar o pacote: ${err.message}`);
  }
});

// --- Exportar / importar pacote (.zip) para compartilhar a coleção ---
app.get('/api/export', (req, res) => {
  const ids = req.query.ids ? String(req.query.ids).split(',') : null;
  const onlyPack = req.query.pack ? db.getPack(String(req.query.pack)) : null;
  const list = db.listStickers({ pack: onlyPack?.id || '' }).filter((s) => !ids || ids.includes(s.id));
  const inList = new Set(list.map((s) => s.id));
  const packs = (onlyPack ? [onlyPack] : db.listPacks()).map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, stickers: db.packStickers(p.id).map((s) => s.id).filter((id) => inList.has(id)) }));
  const zip = new AdmZip();
  const manifest = { app: 'audio-sticks', version: 2, exportedAt: new Date().toISOString(), packs, stickers: list.map(({ plays, sends, packs: _p, ...s }) => s) };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  for (const s of list) for (const ext of Object.keys(KINDS)) if (fs.existsSync(mediaPath(s.id, ext))) zip.addLocalFile(mediaPath(s.id, ext), 'audio');
  const base = onlyPack ? onlyPack.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'pacote' : 'figurinhas';
  res.attachment(`${base}-${new Date().toISOString().slice(0, 10)}.zip`).type('application/zip').send(zip.toBuffer());
});

const upload = multer({ dest: TMP_DIR, limits: { fileSize: 200 * 1024 * 1024 } });
app.post('/api/import', upload.single('pack'), (req, res) => {
  if (!req.file) return fail(res, 400, 'Envie um arquivo .zip.');
  try {
    const zip = new AdmZip(req.file.path);
    const manifest = JSON.parse(zip.readAsText('manifest.json') || 'null');
    // aceita também pacotes exportados com o nome antigo do app ('sticks-audio')
    if (!['audio-sticks', 'sticks-audio'].includes(manifest?.app) || !Array.isArray(manifest.stickers)) return fail(res, 400, 'Esse arquivo não é um pacote de figurinhas.');
    let added = 0, skipped = 0;
    for (const s of manifest.stickers) {
      const entry = validId(s.id) && zip.getEntry(`audio/${s.id}.ogg`);
      if (!entry || db.getSticker(s.id) || !Array.isArray(s.waveform)) { skipped++; continue; }
      fs.writeFileSync(audioPath(s.id), entry.getData());
      let visual = true;
      for (const ext of ['webp', 'mp4']) {
        const e = zip.getEntry(`audio/${s.id}.${ext}`);
        if (e) fs.writeFileSync(mediaPath(s.id, ext), e.getData()); else visual = false;
      }
      db.insertSticker({ ...s, visual, waveform: s.waveform.slice(0, 64).map(Number), duration: Number(s.duration) || 1 });
      added++;
    }
    // pacotes: cria os que não existem (mesmo id) e coloca as figurinhas dentro
    let packsAdded = 0;
    for (const p of Array.isArray(manifest.packs) ? manifest.packs : []) {
      if (!validId(String(p.id))) continue;
      if (!db.getPack(p.id)) { db.createPack({ id: p.id, name: p.name, emoji: p.emoji }); packsAdded++; }
      for (const sid of Array.isArray(p.stickers) ? p.stickers : []) if (db.getSticker(sid)) db.addToPack(p.id, sid);
    }
    res.json({ added, skipped, packsAdded });
  } catch (err) {
    fail(res, 400, `Não consegui ler o pacote: ${err.message}`);
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }
});

// --- WhatsApp ---
app.get('/api/whatsapp', (req, res) => res.json(wa.waStatus()));
app.post('/api/whatsapp/connect', async (req, res) => {
  try { res.json(await wa.connect()); } catch (err) { fail(res, 500, err.message); }
});
app.post('/api/whatsapp/logout', async (req, res) => { await wa.logout(); res.json(wa.waStatus()); });

// Destinos: contatos (agenda sincronizada), grupos e verificação de número
app.get('/api/whatsapp/contacts', (req, res) => res.json(wa.listContacts()));
app.post('/api/whatsapp/contacts/sync', async (req, res) => {
  try { res.json({ count: await wa.syncContacts() }); } catch (err) { sendFail(res, err, '[contatos]'); }
});
app.get('/api/whatsapp/groups', async (req, res) => {
  try { res.json(await wa.listGroups()); } catch (err) { sendFail(res, err, '[grupos]'); }
});
app.post('/api/whatsapp/check', async (req, res) => {
  try {
    const r = await wa.checkNumber(req.body?.number);
    r ? res.json(r) : fail(res, 404, 'Esse número não tem WhatsApp.');
  } catch (err) { sendFail(res, err, '[número]'); }
});

// --- Diagnóstico ---
app.get('/api/ping', (req, res) => res.send('pong'));
app.get('/api/health', async (req, res) => res.json(await checkTools()));

// --- Página pública de uma figurinha (link para compartilhar) ---
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
app.get('/s/:id', (req, res) => {
  const s = db.getSticker(req.params.id);
  if (!s) return res.status(404).send('Figurinha não encontrada');
  const bars = s.waveform.map((v) => `<i style="height:${Math.max(6, v)}%"></i>`).join('');
  res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.emoji)} ${esc(s.title)}</title><meta property="og:title" content="${esc(s.emoji)} ${esc(s.title)}"><meta property="og:description" content="Figurinha de áudio · ${s.duration.toFixed(1)}s">
<link rel="stylesheet" href="/public.css"></head><body>
<main class="card"><button id="play" aria-label="Tocar" class="${s.visual ? 'img' : ''}">${s.visual ? `<img src="/media/${s.id}.webp" alt="">` : `<span>${esc(s.emoji)}</span>`}</button>
<h1>${esc(s.title)}</h1><div class="wave">${bars}<div class="prog" id="prog">${bars}</div></div>
<p>${s.duration.toFixed(1)}s</p><a class="dl" href="/media/${s.id}.ogg?download=1">⬇ Baixar áudio</a></main>
<audio id="a" src="/media/${s.id}.ogg" preload="auto"></audio>
<script>const a=document.getElementById('a'),p=document.getElementById('prog'),b=document.getElementById('play');
b.onclick=()=>{a.pause();a.currentTime=0;b.classList.add('on');const i=b.querySelector('img');if(!i)return a.play();let s=0;const go=()=>{if(!s){s=1;a.play()}};i.addEventListener('load',go,{once:true});i.src=i.src.split('?')[0]+'?play='+Date.now();setTimeout(go,500)};a.onended=()=>b.classList.remove('on');
(function f(){p.style.clipPath='inset(0 '+(100-(a.currentTime/(a.duration||1))*100)+'% 0 0)';requestAnimationFrame(f)})();</script>
</body></html>`);
});

// --- Configurações (porta) ---
app.get('/api/settings', (req, res) => res.json({
  port: currentPort, url: localUrl(), envPort: !!process.env.PORT, version: pkg.version,
  dataDir: DATA_DIR, portable: PORTABLE, isExe: IS_EXE, lanUrls: lanUrls(),
}));
app.post('/api/settings/port', async (req, res) => {
  const port = validPort(req.body?.port);
  if (!port) return fail(res, 400, 'Escolha uma porta entre 1024 e 65535.');
  if (process.env.PORT) return fail(res, 400, 'A porta está fixada pela variável de ambiente PORT. Remova-a para trocar por aqui.');
  if (port === currentPort) return res.json({ port, url: localUrl() });
  try {
    await switchPort(port, { closeOldAfter: 800 });
    res.json({ port, url: localUrl() });
  } catch (err) { fail(res, 409, err.message); }
});
app.post('/api/open-folder', (req, res) => { openPath(DATA_DIR); res.sendStatus(204); });
app.post('/api/app/restart', (req, res) => {
  if (!IS_EXE) return fail(res, 400, 'Rodando pelo código: reinicie no terminal (Ctrl + C e npm start).');
  res.json({ ok: true });
  setTimeout(restartApp, 300);
});
app.post('/api/app/quit', (req, res) => {
  if (!IS_EXE) return fail(res, 400, 'Rodando pelo código: encerre no terminal com Ctrl + C.');
  res.json({ ok: true });
  setTimeout(quitApp, 300);
});

app.use((err, req, res, next) => { console.error(err); fail(res, 500, 'Erro inesperado.'); });

// --- Inicialização ---
function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { /* sem navegador */ }
}
const openPath = (p) => { try { spawn(process.platform === 'win32' ? 'explorer' : 'xdg-open', [p], { detached: true, stdio: 'ignore' }).unref(); } catch { /* ok */ } };

// No executável não há janela de terminal: o registro vai para data/sticks.log
const LOG_FILE = path.join(DATA_DIR, 'sticks.log');
if (IS_EXE) {
  try { if (fs.statSync(LOG_FILE).size > 1024 * 1024) fs.rmSync(LOG_FILE); } catch { /* ainda não existe */ }
  const log = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  const wrap = (orig) => (...args) => {
    log.write(`[${new Date().toLocaleString('pt-BR')}] ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`);
    try { orig(...args); } catch { /* sem console */ }
  };
  console.log = wrap(console.log);
  console.error = wrap(console.error);
}

async function fatal(msg) {
  console.error(`✖ ${msg}`);
  if (IS_EXE) await errorBox(`Não foi possível iniciar o Audio Sticks.\n\n${msg}`);
  process.exit(1);
}

// Porta: variável PORT > data/config.json > 3000
let currentPort = validPort(process.env.PORT) || validPort(readConfig().port) || DEFAULT_PORT;
let server = null;
let tray = null;
const localUrl = (p = currentPort) => `http://localhost:${p}`;
const lanUrls = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${currentPort}`);

/** O Audio Sticks responde nessa porta? (outro programa não responde "pong") */
async function isOurs(port, host = 'localhost') {
  try {
    const r = await fetch(`http://${host}:${port}/api/ping`, { signal: AbortSignal.timeout(1500) });
    return (await r.text()) === 'pong';
  } catch { return false; }
}

/**
 * Escuta numa porta; rejeita se estiver ocupada. No Windows, outro programa pode ocupar só 127.0.0.1
 * e mesmo assim a porta "abre" para nós — então confere se 127.0.0.1 responde como Audio Sticks.
 */
async function listenOn(port) {
  const busy = () => new Error(`A porta ${port} já está sendo usada por outro programa.`);
  const s = await new Promise((resolve, reject) => {
    const srv = app.listen(port);
    srv.once('listening', () => resolve(srv));
    srv.once('error', (e) => reject(e.code === 'EADDRINUSE' ? busy() : e));
  });
  if (!(await isOurs(port, '127.0.0.1'))) {
    s.close(); s.closeAllConnections?.();
    throw busy();
  }
  return s;
}

/** Troca de porta sem reiniciar: abre a nova primeiro (se falhar, nada muda) e só depois fecha a antiga. */
async function switchPort(port, { closeOldAfter = 0 } = {}) {
  const next = await listenOn(port);
  const old = server;
  server = next;
  currentPort = port;
  saveConfig({ port });
  console.log(`Porta trocada para ${port} · ${localUrl()}`);
  pushTrayState(true);
  if (old) setTimeout(() => { old.close(); old.closeAllConnections?.(); }, closeOldAfter);
}

// --- Status na bandeja, reiniciar e encerrar ---
let appPhase = 'starting'; // starting | preparing | running
let lastTrayState = '';
function pushTrayState(force = false) {
  if (!tray) return;
  const w = wa.waStatus();
  const appText = appPhase === 'preparing' ? '◌ Preparando (baixando ferramentas)…'
    : appPhase === 'starting' ? '◌ Iniciando…' : `● Rodando · ${localUrl()}`;
  const waText = w.status === 'open' ? `WhatsApp: conectado (+${w.me?.number || ''})`
    : w.status === 'qr' ? 'WhatsApp: aguardando leitura do QR code'
    : w.status === 'connecting' ? 'WhatsApp: conectando…' : 'WhatsApp: desconectado (clique para conectar)';
  const color = appPhase !== 'running' || w.status === 'connecting' || w.status === 'qr' ? '#ffb020'
    : w.status === 'open' ? '#25d366' : '#8a8a96';
  const tip = `Audio Sticks · porta ${currentPort} · WhatsApp ${w.status === 'open' ? 'conectado' : w.status === 'disconnected' ? 'desconectado' : 'conectando'}`;
  const line = [appText, waText, color, tip].join('|');
  if (!force && line === lastTrayState) return;
  lastTrayState = line;
  tray.state(appText, waText, color, tip);
}

function quitApp() {
  console.log('Encerrando.');
  tray?.stop();
  setTimeout(() => process.exit(0), 200);
}

/** Reinicia: fecha a porta, abre uma nova cópia do programa e sai. */
function restartApp() {
  console.log('Reiniciando…');
  tray?.stop();
  try { server?.close(); server?.closeAllConnections?.(); } catch { /* ok */ }
  setTimeout(() => {
    try {
      spawn(process.execPath, [], { detached: true, stdio: 'ignore', env: { ...process.env, NO_BROWSER: '1' } }).unref();
    } catch (err) { console.error('Não consegui reiniciar:', err.message); }
    process.exit(0);
  }, 500);
}

async function main() {
  if (IS_EXE) process.title = 'Audio Sticks';
  // Clicou no .exe com o app já rodando? Só abre o navegador.
  if (await isOurs(currentPort)) {
    console.log(`O Audio Sticks já está aberto em ${localUrl()}.`);
    if (IS_EXE || process.argv.includes('--open')) openBrowser(localUrl());
    return setTimeout(() => process.exit(0), 500);
  }
  console.log(`🔊 Audio Sticks iniciando · dados em ${DATA_DIR}${PORTABLE ? ' (modo portátil)' : ''}`);

  tray = IS_EXE && !process.env.NO_TRAY ? startTray({
    open: () => openBrowser(localUrl()),
    folder: () => openPath(DATA_DIR),
    log: () => openPath(LOG_FILE),
    port: () => tray.askPort(currentPort),
    setport: async (value) => {
      const port = validPort(value);
      if (!port) return tray.balloon('Porta inválida', 'Use um número entre 1024 e 65535.');
      if (port === currentPort) return;
      try {
        await switchPort(port);
        tray.balloon('Porta trocada', `O Audio Sticks agora está em ${localUrl()}`);
        openBrowser(localUrl());
      } catch (err) { tray.balloon('Não deu para trocar a porta', err.message); }
    },
    restart: () => restartApp(),
    quit: () => { console.log('Encerrado pelo menu da bandeja.'); process.exit(0); },
  }) : null;

  let warned = false;
  try {
    await ensureTools({ log: (m) => {
      console.log(m.trim());
      if (!warned && tray) { warned = true; appPhase = 'preparing'; pushTrayState(); tray.balloon('Preparando o Audio Sticks', 'Primeira vez: baixando as ferramentas de áudio (~200 MB). Isso leva alguns minutos.'); }
    } });
  } catch (e) { console.log(`⚠ ${e.message}`); }
  autoUpdateYtdlp();

  // Sobe o servidor. Se a porta estiver ocupada por OUTRO programa, procura a próxima livre e guarda a escolha.
  const wanted = currentPort;
  for (let attempt = 0; ; attempt++) {
    try { server = await listenOn(currentPort); break; } catch (err) {
      if (process.env.PORT || attempt >= 20) return fatal(err.message);
      if (await isOurs(currentPort)) {
        console.log(`O Audio Sticks já está aberto em ${localUrl()}.`);
        if (IS_EXE || process.argv.includes('--open')) openBrowser(localUrl());
        tray?.stop();
        return setTimeout(() => process.exit(0), 500);
      }
      currentPort++;
    }
  }
  if (currentPort !== wanted) {
    saveConfig({ port: currentPort });
    console.log(`⚠ Porta ${wanted} ocupada por outro programa; usando ${currentPort}.`);
    tray?.balloon('Porta trocada automaticamente', `A porta ${wanted} estava ocupada por outro programa. O Audio Sticks agora usa a ${currentPort}.`);
  }

  console.log(`Aberto em ${localUrl()}`);
  for (const u of lanUrls()) console.log(`  no celular (Wi-Fi): ${u}`);
  const tools = await checkTools();
  if (!tools.ytdlp) console.log('⚠ yt-dlp indisponível. Verifique a internet e abra de novo.');
  if (!tools.ffmpeg) console.log('⚠ ffmpeg indisponível. Verifique a internet e abra de novo.');
  if (PASSWORD) console.log('🔒 senha ativada (APP_PASSWORD)');
  if (tray) {
    appPhase = 'running';
    pushTrayState(true);
    setInterval(pushTrayState, 2000); // acompanha a conexão do WhatsApp
    if (currentPort === wanted) tray.balloon('Audio Sticks está rodando', 'Clique no ícone aqui na bandeja para abrir. Para desligar: botão direito → Sair.');
  }
  if ((IS_EXE && !process.env.NO_BROWSER) || process.argv.includes('--open')) openBrowser(localUrl());
  if (wa.hasSession()) wa.connect().catch((e) => console.error('[whatsapp]', e.message));
}

process.on('uncaughtException', (e) => console.error(e));
process.on('unhandledRejection', (e) => console.error(e));
main().catch((e) => fatal(e.message));
