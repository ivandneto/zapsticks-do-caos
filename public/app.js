// ============ utilidades ============
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const AUDIO_MAX = 60;      // Audio Stick: trecho de até 60 s
const STICK_ANIM_MAX = 10; // figurinha animada: até 10 s (limite do WhatsApp)
const ANIM_SOUND_MAX = 5;  // figurinha ANIMADA com som: até 5 s de áudio (parada aceita até 10 s)
let MAX_LEN = AUDIO_MAX;
// aba atual: 'audio' (Audio Stick) | 'sticker' (Stick) | 'combo' (Combinação Caótica)
let mode = 'audio';
let fit = 'crop';          // enquadramento do Stick: 'crop' (quadrado) | 'pad' (inteiro, fundo transparente)
let comboReturn = null;    // 'visual' | 'audio' quando uma peça está sendo criada para a combinação
// Combinação Caótica: as duas peças escolhidas e quais foram criadas só para ela (podem ser apagadas depois)
const combo = { visual: null, audio: null, temp: new Set() };
const comboPackSel = new Set();
const REPO_URL = 'https://github.com/ivandneto/zapsticks-do-caos';
const STICKER_MAX = 10; // a figurinha com som do WhatsApp aceita até 10s de áudio

function fmt(t, decimals = 1) {
  if (!Number.isFinite(t)) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  const ss = s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0');
  return `${m}:${ss}`;
}
function parseTime(str) {
  str = String(str).trim().replace(',', '.');
  if (!str) return NaN;
  const parts = str.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || `Erro ${res.status}`); err.status = res.status; throw err; }
  return data;
}

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

function burst(emoji, x = innerWidth / 2, y = innerHeight / 2) {
  const box = $('#burst');
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('span');
    s.textContent = i % 3 ? emoji : ['✨', '🎉', '⭐'][(i / 3) % 3];
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    s.style.setProperty('--x', `${Math.cos(a) * d}px`);
    s.style.setProperty('--y', `${Math.sin(a) * d - 80}px`);
    s.style.setProperty('--r', `${(Math.random() - .5) * 720}deg`);
    box.append(s);
    setTimeout(() => s.remove(), 1300);
  }
}

// ============ modal ============
const modal = $('#modal');
function openModal(html, onOpen, { wide = false } = {}) {
  $('.modal-box', modal).classList.toggle('wide', wide);
  $('.modal-body', modal).innerHTML = html;
  modal.hidden = false;
  onOpen?.($('.modal-body', modal));
}
function closeModal() { modal.hidden = true; modalClosed?.(); modalClosed = null; }
let modalClosed = null;
// Fecha pelo fundo só se o clique COMEÇOU no fundo: selecionar um texto (para copiar) e soltar o mouse
// fora da caixa conta como "clique no fundo" para o navegador, e fechava a janela.
let downOnBackdrop = false;
modal.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === modal; });
modal.addEventListener('click', (e) => {
  if ((e.target === modal && downOnBackdrop) || e.target.closest('.modal-x') || e.target.closest('[data-close]')) closeModal();
  downOnBackdrop = false;
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

function confirmBox(title, text, okLabel = 'Confirmar', danger = false) {
  return new Promise((resolve) => {
    openModal(`<h3>${esc(title)}</h3><p>${esc(text)}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" id="cOk">${esc(okLabel)}</button></div>`,
    (b) => { $('#cOk', b).onclick = () => { modalClosed = null; closeModal(); resolve(true); }; });
    modalClosed = () => resolve(false);
  });
}

// ============ ícones ============
const IC = {
  sticker: '<svg viewBox="0 0 24 24"><path d="M20 12.5V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h5.5z"/><path d="M20 12.5 12.5 20v-4.5a3 3 0 0 1 3-3z"/><path d="M9 10h.01M15 10h.01"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3m0 0-4 4m4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  dl: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M5 21h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  wa: '<svg class="fill" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.3 1.2-1.8 1.3-.5 0-1 .3-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg>',
};

// ============ players: YouTube (iframe) ou mídia baixada/enviada (<video>) ============
let player = null, playerReady = false, embedBlocked = false;
const ytApi = new Promise((resolve) => {
  window.onYouTubeIframeAPIReady = resolve;
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.append(s);
});
const html5 = $('#html5');

// kind: 'youtube' (toca direto do YouTube) | 'source' (link de outro site ou arquivo, servido pelo app)
const vid = { kind: null, id: null, url: '', title: '', duration: 0, sourceId: null, hasVideo: true, hasAudio: true, media: 'video', site: '' };
const sel = { start: 0, end: 5 };
let previewing = false;
let creating = false;
let frameKey = null, frameT = null; // prévia da figurinha
// 🔤 camadas de texto e emoji (public/texteditor.js): ficam até trocar de mídia; o PNG vai junto na criação
const textOv = { layers: [], blob: null, url: null };
let keepTextOv = false;

function parseVideoId(input) {
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1, 12);
    if (host.endsWith('youtube.com')) return u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/) || [])[1] || null;
  } catch { /* não é URL */ }
  const m = s.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// Comandos iguais para os dois players
const isYT = () => vid.kind === 'youtube';
const canPlay = () => (isYT() ? playerReady && !embedBlocked : vid.kind === 'source' && vid.media !== 'image' && vid.media !== 'gif');
function mPlay() { if (isYT()) player.playVideo(); else html5.play().catch(() => {}); }
function mPause() { if (isYT()) { if (playerReady) player.pauseVideo(); } else html5.pause(); }
const now = () => (!canPlay() ? sel.start : isYT() ? player.getCurrentTime() || 0 : html5.currentTime || 0);
const seek = (t) => {
  if (!canPlay()) return;
  t = clamp(t, 0, vid.duration || t);
  if (isYT()) player.seekTo(t, true); else html5.currentTime = t;
};
html5.addEventListener('pause', () => { if (previewing && !isYT()) stopPreview(false); });

// kind: 'youtube' | 'source' (vídeo/áudio no <video>) | 'image' (foto ou GIF no <img>, sem linha do tempo)
function showPlayer(kind) {
  const img = kind === 'image';
  $('#ytBox').hidden = kind !== 'youtube';
  html5.hidden = kind !== 'source';
  $('#imgView').hidden = !img;
  $('#audioOnly').hidden = kind !== 'source' || vid.hasVideo;
  $('#timeline').hidden = img;
  $('#step3Num').textContent = img ? '2' : '3'; // foto/GIF não têm o passo de marcar o trecho
  if (kind !== 'youtube' && playerReady) { try { player.pauseVideo(); } catch { /* ok */ } }
  if (kind !== 'source') { html5.pause(); html5.removeAttribute('src'); html5.load(); }
  if (!img) $('#imgView').removeAttribute('src');
}
const isPicture = () => vid.media === 'image' || vid.media === 'gif'; // foto ou GIF: sem som e sem recorte de tempo
function beginEditor() {
  embedBlocked = false; $('#embedError').hidden = true;
  stopPreview();
  resetPreview();
  $('#editor').hidden = false; $('#welcome').hidden = true;
}
function hintErr(msg) { const h = $('#urlHint'); h.textContent = msg; h.classList.add('err'); }
function setLoading(on) {
  $$('#urlForm button').forEach((b) => (b.disabled = on));
  $('#urlForm').classList.toggle('loading', on);
}
const SITE_ICON = { YouTube: '▶️', Instagram: '📸', TikTok: '🎵', X: '𝕏', Facebook: '📘', Kwai: '🎬', Vimeo: '🎞️', Twitch: '🎮', Reddit: '👽', SoundCloud: '☁️', Arquivo: '📁' };
const siteIcon = (site) => SITE_ICON[site] || '🔗';

/** Decide pela origem: YouTube toca direto; links de outros sites são baixados antes. */
function loadAny(raw) {
  const s = String(raw || '').trim();
  if (!s) return;
  if (parseVideoId(s)) return loadVideo(s);
  const link = s.match(/https?:\/\/\S+/)?.[0];
  if (!link) return hintErr('Cole um link (YouTube, Instagram, TikTok, X…) ou use o botão “Arquivo”.');
  if (looksLikeImageUrl(link)) return loadImageUrl(link);
  return loadRemote(link);
}

async function loadVideo(raw) {
  const id = parseVideoId(raw);
  const hint = $('#urlHint');
  if (!id) return hintErr('Esse link não parece ser do YouTube.');
  hint.classList.remove('err');
  hint.textContent = 'Carregando…';
  Object.assign(vid, { kind: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, title: '', duration: 0, sourceId: null, hasVideo: true, hasAudio: true, media: 'video', site: 'YouTube' });
  beginEditor();
  showPlayer('youtube');

  // Tempo vindo no link (?t=90) vira o início sugerido
  let t0 = 0;
  try { const t = new URL(raw).searchParams.get('t'); if (t) t0 = parseTime(t.replace(/s$/, '').replace(/m/, ':')) || 0; } catch { /* ok */ }
  sel.start = t0; sel.end = t0 + 5;

  await ytApi;
  if (!player) {
    player = new YT.Player('player', {
      videoId: id,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: Math.floor(t0) },
      events: {
        onReady: () => { playerReady = true; afterLoad(); },
        onError: (e) => {
          if ([101, 150, 153].includes(e.data)) { embedBlocked = true; $('#embedError').hidden = false; hint.textContent = ''; if (!vid.duration) { vid.duration = Math.max(sel.end + 60, 120); render(); } }
          else hint.textContent = 'O YouTube não conseguiu tocar esse vídeo.';
        },
        onStateChange: (e) => { if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) { if (previewing && isYT()) stopPreview(false); } },
      },
    });
  } else {
    player.cueVideoById({ videoId: id, startSeconds: t0 });
    afterLoad();
  }
}

function afterLoad() {
  const id = vid.id;
  let tries = 0;
  const wait = setInterval(() => {
    if (vid.id !== id || !isYT()) return clearInterval(wait);
    const d = player.getDuration?.() || 0;
    const data = player.getVideoData?.() || {};
    if ((d > 0 && data.title) || ++tries > 40) {
      clearInterval(wait);
      if (d > 0) vid.duration = d;
      vid.title = data.title || '';
      sel.end = Math.min(sel.end, vid.duration || sel.end);
      if (!$('#title').value || $('#title').dataset.auto) { $('#title').value = vid.title.slice(0, 50); $('#title').dataset.auto = '1'; }
      $('#urlHint').textContent = vid.title ? `▶️ YouTube · ${vid.title}` : '';
      recenter(); render();
    }
  }, 250);
  if (!embedBlocked) { setTimeout(() => { try { if (isYT()) player.playVideo(); } catch { /* autoplay bloqueado */ } }, 300); }
}

/** Link de outro site: o app baixa (yt-dlp) e depois toca no player próprio. */
async function loadRemote(url) {
  const hint = $('#urlHint');
  hint.classList.remove('err');
  setLoading(true);
  try {
    const { jobId, site } = await api('/api/sources', { method: 'POST', body: JSON.stringify({ url }) });
    hint.innerHTML = `<span class="spin-inline"></span> ${siteIcon(site)} Baixando do ${esc(site)}… isso leva alguns segundos.`;
    const job = await pollJob(jobId);
    openSource(job.source);
  } catch (err) { hintErr(err.message); }
  setLoading(false);
}

/** Arquivo do PC (vídeo ou áudio): envia com barra de progresso. */
async function loadFile(f) {
  if (!f) return;
  const hint = $('#urlHint');
  hint.classList.remove('err');
  setLoading(true);
  try {
    const source = await uploadSourceFile(f, (msg) => { hint.innerHTML = `<span class="spin-inline"></span> ${msg}`; });
    openSource(source);
  } catch (err) { hintErr(err.message); }
  setLoading(false);
}

/**
 * .webp/.png ANIMADO (Giphy, figurinha salva do WhatsApp): o navegador decodifica os quadros (WebCodecs ImageDecoder),
 * reamostrados a 15 qps e cabendo em 512 px. Devolve null se não for animado ou se o navegador não souber ler.
 */
async function decodeAnimatedImage(file, onProgress) {
  if (!('ImageDecoder' in window)) return null;
  const type = file.type || (/\.webp$/i.test(file.name) ? 'image/webp' : /\.png$/i.test(file.name) ? 'image/png' : '');
  if (!/image\/(webp|png|apng)/.test(type)) return null;
  let dec;
  try {
    if (!(await ImageDecoder.isTypeSupported(type))) return null;
    dec = new ImageDecoder({ data: await file.arrayBuffer(), type });
    await dec.tracks.ready;
  } catch { return null; }
  const track = dec.tracks.selectedTrack;
  if (!track || !track.animated || track.frameCount < 2) { dec.close(); return null; }
  const decoded = [];
  let total = 0;
  try {
    for (let i = 0; i < track.frameCount; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      const d = Math.max(0.02, (image.duration || 100000) / 1e6); // µs → s
      decoded.push({ image, start: total, d });
      total += d;
    }
    const fps = 15;
    const dur = Math.min(total, STICK_ANIM_MAX); // figurinha animada vai até 10s
    const n = Math.max(2, Math.round(dur * fps));
    const w0 = decoded[0].image.displayWidth, h0 = decoded[0].image.displayHeight;
    const k = Math.min(1, 512 / Math.max(w0, h0));
    const W = Math.max(2, Math.round(w0 * k)), H = Math.max(2, Math.round(h0 * k));
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const blobs = [];
    let fi = 0;
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      while (fi < decoded.length - 1 && decoded[fi].start + decoded[fi].d <= t) fi++;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(decoded[fi].image, 0, 0, W, H);
      blobs.push(await new Promise((r) => c.toBlob(r, 'image/png')));
      if (i % 10 === 0) onProgress?.(`Lendo a animação… ${Math.round((i / n) * 100)}%`);
    }
    return { blobs, fps };
  } finally {
    decoded.forEach((x) => x.image.close());
    dec.close();
  }
}

/** Envia um arquivo (vídeo, áudio, foto, GIF ou .webp animado) e devolve a origem pronta. */
async function uploadSourceFile(f, onMsg = () => {}) {
  const anim = await decodeAnimatedImage(f, onMsg);
  let jobId;
  if (anim) {
    const fd = new FormData();
    fd.append('original', f);
    anim.blobs.forEach((b, i) => fd.append('frames', b, `${String(i + 1).padStart(4, '0')}.png`));
    fd.append('fps', String(anim.fps));
    ({ jobId } = await uploadWithProgress('/api/sources/animated', fd, (p) => onMsg(`Enviando a animação… ${p}%`)));
  } else {
    const fd = new FormData();
    fd.append('file', f);
    ({ jobId } = await uploadWithProgress('/api/sources/upload', fd, (p) => onMsg(`Enviando “${esc(f.name)}”… ${p}%`)));
  }
  onMsg('Preparando o arquivo…');
  return (await pollJob(jobId)).source;
}

/** Link direto de imagem/GIF (Giphy, Tenor, .gif, .webp…): o servidor baixa e segue como arquivo. */
async function loadImageUrl(url) {
  const hint = $('#urlHint');
  hint.classList.remove('err');
  hint.innerHTML = '<span class="spin-inline"></span> Baixando a imagem…';
  setLoading(true);
  try {
    const file = await imageUrlToFile(url);
    setLoading(false);
    if (!file) return loadRemote(url); // não era imagem: tenta como vídeo
    return loadFile(file);
  } catch (err) { hintErr(err.message); setLoading(false); }
}
/** O servidor baixa o link; devolve um File, ou null se o link não for de imagem. */
async function imageUrlToFile(url) {
  const r = await api('/api/sources/image-url', { method: 'POST', body: JSON.stringify({ url }) });
  if (!r.image) return null;
  const blob = await (await fetch(`/api/sources/image-url/${r.id}`)).blob();
  return new File([blob], r.name, { type: r.type });
}
const looksLikeImageUrl = (u) => /\.(gif|webp|png|jpe?g|bmp)(\?|#|$)/i.test(u) || /(^|\.)((media\d*|i)\.giphy\.com|media\d*\.tenor\.com|c\.tenor\.com)\//i.test(u.replace(/^https?:\/\//, ''));

function uploadWithProgress(url, body, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => {
      let data = {};
      try { data = JSON.parse(x.responseText); } catch { /* sem corpo */ }
      x.status < 300 ? resolve(data) : reject(new Error(data.error || `Erro ${x.status}`));
    };
    x.onerror = () => reject(new Error('A conexão caiu durante o envio.'));
    x.send(body);
  });
}

function openSource(src) {
  if (!keepTextOv) setTextOverlay([], null);
  keepTextOv = false;
  const media = src.media || (src.hasVideo ? 'video' : 'audio');
  Object.assign(vid, { kind: 'source', id: null, url: src.url || '', title: src.title || '', duration: src.duration, sourceId: src.id,
    hasVideo: src.hasVideo, hasAudio: src.hasAudio !== false, media, site: src.site });
  // foto/GIF só fazem sentido como figurinha sem som: troca para a aba Stick (a não ser na combinação)
  if ((media === 'image' || media === 'gif') && mode === 'audio') { setMode('sticker'); toast('Foto ou GIF: abri a aba Stick (figurinha sem som) 🖼️'); }
  beginEditor();
  if (media === 'image' || media === 'gif') {
    showPlayer('image');
    $('#imgView').src = `/api/sources/${src.id}/media`;
    sel.start = 0; sel.end = media === 'gif' ? Math.min(STICK_ANIM_MAX, src.duration) : 0;
  } else {
    showPlayer('source');
    html5.src = `/api/sources/${src.id}/media`;
    sel.start = 0; sel.end = Math.min(mode === 'sticker' ? 3 : 5, src.duration);
  }
  if (!$('#title').value || $('#title').dataset.auto) { $('#title').value = vid.title.slice(0, 50); $('#title').dataset.auto = '1'; }
  const tag = media === 'image' ? ' (foto)' : media === 'gif' ? ' (GIF)' : !src.hasVideo ? ' (só áudio)' : !vid.hasAudio ? ' (sem som)' : '';
  $('#urlHint').textContent = `${siteIcon(src.site)} ${src.site} · ${vid.title}${tag}`;
  recenter(); render();
  if (media !== 'image' && media !== 'gif') html5.play().catch(() => { /* autoplay bloqueado: o usuário aperta play */ });
}

// ============ seleção ============
function setSel(which, t, { keepLen = false } = {}) {
  const dur = vid.duration || Infinity;
  t = Math.round(clamp(t, 0, dur) * 10) / 10;
  if (which === 'start') {
    if (keepLen || t >= sel.end) { const len = sel.end - sel.start; sel.start = t; sel.end = Math.min(dur, t + (keepLen ? len : Math.max(len, 3))); }
    else sel.start = t;
  } else {
    if (t <= sel.start) { sel.end = t; sel.start = Math.max(0, t - 3); }
    else sel.end = t;
  }
  render();
}

// janela da régua de zoom (recalculada fora do arraste para não "fugir" do dedo)
const win = { a: 0, b: 10 };
function recenter() {
  const len = sel.end - sel.start;
  const pad = Math.max(1.5, len * 0.6);
  win.a = Math.max(0, sel.start - pad);
  win.b = Math.min(vid.duration || sel.end + pad, sel.end + pad);
  if (win.b - win.a < 3) win.b = win.a + 3;
  drawTicks();
}
function drawTicks() {
  const span = win.b - win.a;
  const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => span / s <= 40) || 60;
  const major = step * (step < 1 ? (step === 0.25 ? 4 : 5) : 5);
  let html = '';
  for (let t = Math.ceil(win.a / step) * step; t <= win.b; t += step) {
    const x = ((t - win.a) / span) * 100;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    html += `<i class="${isMajor ? 'major' : ''}" style="left:${x}%"></i>`;
    if (isMajor) html += `<b style="left:${x}%">${fmt(t, step < 1 ? 1 : 0)}</b>`;
  }
  $('.z-ticks').innerHTML = html;
}

const X = (t) => `${((t - win.a) / (win.b - win.a)) * 100}%`;
function render() {
  const dur = vid.duration || 1;
  $('.ov-sel').style.left = `${(sel.start / dur) * 100}%`;
  $('.ov-sel').style.width = `${((sel.end - sel.start) / dur) * 100}%`;
  $('#durTime').textContent = vid.duration ? fmt(vid.duration, 0) : '—';
  if (sel.start < win.a || sel.end > win.b) recenter();
  $('.z-sel').style.left = X(sel.start);
  $('.z-sel').style.width = `${((sel.end - sel.start) / (win.b - win.a)) * 100}%`;
  $('.z-handle.start').style.left = X(sel.start);
  $('.z-handle.end').style.left = X(sel.end);
  const len = sel.end - sel.start;
  MAX_LEN = mode === 'sticker' ? STICK_ANIM_MAX : AUDIO_MAX;
  const lenEl = $('.z-len');
  lenEl.textContent = `${len.toFixed(1)}s`;
  lenEl.classList.toggle('warn', len > MAX_LEN);
  if (document.activeElement !== $('#startIn')) $('#startIn').value = fmt(sel.start);
  if (document.activeElement !== $('#endIn')) $('#endIn').value = fmt(sel.end);
  const btn = $('#createBtn');
  const L = (t) => `<span class="len">${t}</span>`;
  let label, off;
  if (mode === 'sticker') {
    if (!vid.hasVideo) { label = `Essa mídia é só áudio ${L('· use o Audio Stick')}`; off = true; }
    else if (vid.media === 'image') { label = `Criar figurinha ${L('· parada (foto)')}`; off = false; }
    else if (vid.media === 'gif') { label = `Criar figurinha ${L(`· GIF animado${vid.duration > STICK_ANIM_MAX ? ` (primeiros ${STICK_ANIM_MAX}s)` : ''}`)}`; off = false; }
    else if (len > MAX_LEN) { label = `Trecho longo demais ${L(`(máx. ${MAX_LEN}s de animação)`)}`; off = true; }
    else { label = `Criar figurinha ${L(`· ${len.toFixed(1)}s · animada, sem som`)}`; off = len < 0.3; }
  } else if (isPicture()) { label = `Foto e GIF não têm som ${L('· use Stick ou Combinação')}`; off = true; }
  else if (!vid.hasAudio) { label = `Essa mídia não tem som ${L('· use a aba Stick')}`; off = true; }
  else if (len > MAX_LEN) { label = `Trecho longo demais ${L(`(máx. ${MAX_LEN}s)`)}`; off = true; }
  else { label = `Criar figurinha ${L(`· ${len.toFixed(1)}s${!vid.hasVideo ? ' · só áudio' : len <= ANIM_SOUND_MAX ? ' · animada com som' : len <= STICKER_MAX ? ' · parada com som (animada: até 5s)' : ' · só áudio (figurinha com som: até 10s)'}`)}`; off = len < 0.3; }
  btn.innerHTML = label;
  btn.disabled = off || creating;
  $('#bgBtn').hidden = !(mode === 'sticker' && vid.kind && vid.hasVideo);
  $('#txtBtn').hidden = !(vid.kind && vid.hasVideo && (mode === 'sticker' || (!isPicture() && len <= STICKER_MAX)));
  schedulePreview();
}

// laço de animação: cabeçote de leitura + parar no fim do trecho
(function tick() {
  if (vid.kind && canPlay()) {
    const t = now();
    $('#curTime').textContent = fmt(t);
    $('.ov-head').style.left = `${(t / (vid.duration || 1)) * 100}%`;
    const head = $('.z-head');
    head.style.display = t >= win.a && t <= win.b ? '' : 'none';
    head.style.left = X(t);
    if (previewing && t >= sel.end - 0.03) {
      if ($('#loop').checked) seek(sel.start);
      else stopPreview();
    }
  }
  requestAnimationFrame(tick);
})();

function startPreview() {
  if (!canPlay()) return toast('O vídeo não pode tocar aqui, mas dá para criar a figurinha assim mesmo.');
  previewing = true;
  $('#previewBtn').classList.add('on');
  seek(sel.start);
  mPlay();
}
function stopPreview(pause = true) {
  if (!previewing) return;
  previewing = false;
  $('#previewBtn').classList.remove('on');
  if (pause) mPause();
}

// arrastes na régua de zoom
const zoom = $('#zoom');
zoom.addEventListener('pointerdown', (e) => {
  const rect = $('.z-inner').getBoundingClientRect();
  const toT = (cx) => win.a + ((cx - rect.left) / rect.width) * (win.b - win.a);
  const handle = e.target.closest('.z-handle');
  const onSel = e.target.closest('.z-sel');
  let mode = handle ? handle.dataset.handle : onSel ? 'move' : 'seek';
  const t0 = toT(e.clientX), s0 = sel.start, e0 = sel.end;
  if (mode === 'seek') { seek(t0); return; }
  zoom.setPointerCapture(e.pointerId);
  handle?.classList.add('drag');
  let moved = false;
  const move = (ev) => {
    const t = toT(ev.clientX);
    if (Math.abs(ev.clientX - e.clientX) > 3) moved = true;
    if (mode === 'start') { sel.start = Math.round(clamp(t, 0, sel.end - 0.3) * 10) / 10; seek(sel.start); }
    else if (mode === 'end') { sel.end = Math.round(clamp(t, sel.start + 0.3, vid.duration || Infinity) * 10) / 10; seek(Math.max(sel.start, sel.end - 1.5)); }
    else { const d = t - t0, len = e0 - s0; sel.start = Math.round(clamp(s0 + d, 0, (vid.duration || Infinity) - len) * 10) / 10; sel.end = Math.round((sel.start + len) * 10) / 10; }
    renderNoRecenter();
  };
  const up = () => {
    zoom.removeEventListener('pointermove', move);
    handle?.classList.remove('drag');
    if (mode === 'move' && !moved) seek(t0);
    else if (moved) { recenter(); render(); if (mode === 'end') { previewEnd(); } }
  };
  zoom.addEventListener('pointermove', move);
  zoom.addEventListener('pointerup', up, { once: true });
  zoom.addEventListener('pointercancel', up, { once: true });
});
function renderNoRecenter() { const a = win.a, b = win.b; render(); win.a = a; win.b = b; }
// ao soltar a alça do fim, toca o último segundo e meio para conferir o corte
function previewEnd() {
  if (!canPlay()) return;
  previewing = true; $('#previewBtn').classList.add('on');
  seek(Math.max(sel.start, sel.end - 1.5)); mPlay();
}

// clique / arraste na barra geral
const ov = $('#overview');
ov.addEventListener('pointerdown', (e) => {
  const go = (cx) => { const r = ov.getBoundingClientRect(); seek(clamp((cx - r.left) / r.width, 0, 1) * (vid.duration || 0)); };
  go(e.clientX);
  ov.setPointerCapture(e.pointerId);
  const mv = (ev) => go(ev.clientX);
  ov.addEventListener('pointermove', mv);
  ov.addEventListener('pointerup', () => ov.removeEventListener('pointermove', mv), { once: true });
});

$('#setStart').onclick = () => { setSel('start', now()); recenter(); render(); };
$('#setEnd').onclick = () => { setSel('end', now()); recenter(); render(); };
$('#previewBtn').onclick = () => (previewing ? stopPreview() : startPreview());
$$('.nudge').forEach((b) => (b.onclick = () => { setSel(b.dataset.which, sel[b.dataset.which] + Number(b.dataset.d)); seek(b.dataset.which === 'start' ? sel.start : Math.max(sel.start, sel.end - 1.5)); }));
for (const which of ['start', 'end']) {
  const input = $(`#${which}In`);
  const apply = () => { const t = parseTime(input.value); if (Number.isFinite(t)) { setSel(which, t); recenter(); render(); } else input.value = fmt(sel[which]); };
  input.addEventListener('change', apply);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { apply(); input.blur(); } });
}

// atalhos de teclado
addEventListener('keydown', (e) => {
  if (!modal.hidden || e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-9]$/.test(e.key)) { const card = $$('#grid .sticker')[Number(e.key) - 1]; if (card) { playSticker(card.dataset.id); e.preventDefault(); } return; }
  if (!vid.kind || mode === 'combo') return;
  const k = e.key.toLowerCase();
  if (k === 'i') { $('#setStart').click(); flash('#setStart'); }
  else if (k === 'o') { $('#setEnd').click(); flash('#setEnd'); }
  else if (k === ' ') { e.preventDefault(); $('#previewBtn').click(); }
  else if (k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); seek(now() + (k === 'arrowleft' ? -1 : 1) * (e.shiftKey ? 0.1 : 1)); }
  else return;
});
function flash(sel) { const el = $(sel); el.animate([{ transform: 'scale(.95)', borderColor: 'var(--accent)' }, { transform: 'scale(1)' }], { duration: 250 }); }

// URL: enviar, colar, ou vir pela URL (?url= / ?text= — atalho de compartilhar do celular)
$('#urlForm').addEventListener('submit', (e) => { e.preventDefault(); loadAny($('#url').value); });
$('#url').addEventListener('paste', () => setTimeout(() => { if (/https?:\/\//.test($('#url').value)) loadAny($('#url').value); }, 0));
// arquivo do PC: botão ou arrastar e soltar no estúdio
$('#fileBtn').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = (e) => { loadFile(e.target.files[0]); e.target.value = ''; };
{
  const studio = $('.studio');
  let depth = 0;
  const droppable = (e) => ['Files', 'text/uri-list', 'text/html'].some((t) => e.dataTransfer?.types.includes(t));
  const clear = () => { depth = 0; studio.classList.remove('drop'); $$('.slot').forEach((x) => x.classList.remove('drop-on')); };
  studio.addEventListener('dragenter', (e) => { if (droppable(e)) { depth++; if (mode !== 'combo') studio.classList.add('drop'); } });
  studio.addEventListener('dragleave', () => { if (--depth <= 0) clear(); });
  studio.addEventListener('dragover', (e) => {
    if (!droppable(e)) return;
    e.preventDefault();
    if (mode === 'combo') { const over = e.target.closest('.slot'); $$('.slot').forEach((x) => x.classList.toggle('drop-on', x === over)); }
  });
  studio.addEventListener('drop', (e) => {
    if (!droppable(e)) return;
    e.preventDefault();
    const slot = e.target.closest('.slot')?.dataset.slot;
    const got = readTransfer(e.dataTransfer);
    clear();
    got.then((inp) => (inp ? takeInput(inp, slot) : toast('Não reconheci o que foi solto. Tente um arquivo, uma imagem ou um link.', 'err')));
  });
}

// ============ 📋 colar (CTRL+V) e arrastar: arquivo, imagem copiada ou link ============
/**
 * O que veio no colar/arrastar: { file } (arquivo do PC ou imagem copiada, sem precisar salvar) ou { url }
 * (link, ou imagem arrastada de outra página: usa o endereço dela, o que mantém o GIF animado).
 * Lê tudo do evento ANTES do primeiro await (depois disso o navegador apaga os dados).
 */
async function readTransfer(dt) {
  if (!dt) return null;
  const html = dt.getData('text/html');
  const src = html ? new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.getAttribute('src') : null;
  const list = dt.getData('text/uri-list').split(/\r?\n/).find((l) => l && !l.startsWith('#'));
  const text = dt.getData('text/plain');
  const file = [...(dt.files || [])][0] || [...(dt.items || [])].find((i) => i.kind === 'file')?.getAsFile();
  const named = (b) => new File([b], `imagem colada.${(b.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: b.type });
  // GIF arrastado de outra página: o endereço vale mais que o arquivo (o arquivo às vezes vem só com o 1º quadro)
  if (src && /^https?:/.test(src) && /\.gif(\?|#|$)|giphy|tenor/i.test(src)) return { url: src };
  if (file) return { file: /^image\.(png|jpe?g|gif|webp)$/i.test(file.name) || !file.name ? named(file) : file };
  const u = String(src || list || text || '').trim();
  if (/^data:image\//.test(u)) return { file: named(await (await fetch(u)).blob()) };
  const link = u.match(/https?:\/\/\S+/)?.[0];
  return link ? { url: link } : null;
}

/** Leva o que foi colado/solto para o lugar certo: a caixa da combinação, ou o estúdio. */
function takeInput(inp, slot) {
  if (mode === 'combo') return comboTake(slot || guessSlot(inp), inp);
  if (inp.file) return loadFile(inp.file);
  $('#url').value = inp.url;
  return loadAny(inp.url);
}
function guessSlot(inp) {
  const t = inp.file?.type || '';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('image/') || (inp.url && looksLikeImageUrl(inp.url))) return 'visual';
  return !combo.visual ? 'visual' : !combo.audio ? 'audio' : 'visual';
}

// caixa da combinação embaixo do mouse (para o CTRL+V cair nela)
let hoverSlot = null;
$('#comboPanel').addEventListener('pointerover', (e) => { hoverSlot = e.target.closest('.slot')?.dataset.slot || null; });
$('#comboPanel').addEventListener('pointerleave', () => { hoverSlot = null; });
addEventListener('paste', (e) => {
  // dentro de campos de texto, colar continua normal (o campo do link tem tratamento próprio)
  if (!modal.hidden || document.querySelector('.bge-back') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const dt = e.clipboardData;
  if (!dt || (!dt.files.length && !dt.getData('text/plain') && !dt.getData('text/html'))) return;
  e.preventDefault();
  readTransfer(dt).then((inp) => {
    if (!inp) return toast('Copie uma imagem, um arquivo ou um link e cole de novo.', 'err');
    if (mode !== 'combo') scrollTo({ top: 0, behavior: 'smooth' });
    takeInput(inp, hoverSlot);
  });
});
$('#title').addEventListener('input', () => delete $('#title').dataset.auto);
{
  const p = new URLSearchParams(location.search);
  const shared = p.get('url') || p.get('text') || p.get('v');
  if (shared) {
    const m = shared.match(/https?:\/\/\S+/);
    $('#url').value = m ? m[0] : shared;
    history.replaceState(null, '', '/');
    loadAny($('#url').value);
  }
}

// ============ emoji ============
const EMOJIS = ['🔊', '😂', '🤣', '😱', '🔥', '💀', '👏', '🤡', '🥳', '😡', '😭', '🐐', '🎵', '📢', '🙄', '😎', '🤯', '👀', '🫠', '❤️', '⚽', '🍺', '🐸', '💸', '🚨'];
let emoji = '🔊';
$('#emojiGrid').innerHTML = EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === emoji ? 'on' : ''}">${e}</button>`).join('');
$('#emojiGrid').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  emoji = b.dataset.e;
  $$('#emojiGrid button').forEach((x) => x.classList.toggle('on', x === b));
  const now = $('#emojiNow'); now.textContent = emoji; now.classList.remove('pop'); void now.offsetWidth; now.classList.add('pop');
});
$('#stickerPrev').onclick = () => (previewing ? stopPreview() : startPreview());

// ============ prévia da figurinha (quadro do vídeo no início do trecho) ============
function resetPreview() {
  frameKey = null;
  $('#prevImg').src = isYT() ? `https://i.ytimg.com/vi/${vid.id}/hqdefault.jpg` : 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
}
function schedulePreview() {
  const box = $('#stickerPrev');
  const len = sel.end - sel.start;
  const stick = mode === 'sticker';
  const visual = !!vid.kind && vid.hasVideo && (stick || len <= STICKER_MAX);
  box.classList.toggle('has-img', visual);
  box.classList.toggle('pad', stick && fit === 'pad');
  $('#prevCaption').textContent = !vid.kind ? '' : !vid.hasVideo ? 'Origem só de áudio: vira áudio'
    : stick ? (vid.media === 'image' ? 'Prévia · figurinha parada' : vid.media === 'gif' ? 'Prévia · GIF animado' : `Prévia · anima ${Math.min(STICK_ANIM_MAX, len).toFixed(1)}s, sem som`)
    : isPicture() ? 'Foto/GIF: use a aba Stick' : !visual ? 'Acima de 10s: vira só áudio' : len <= ANIM_SOUND_MAX ? `Prévia · anima ${len.toFixed(1)}s com som` : 'Prévia · parada com som (5 a 10s)';
  if (!visual) return;
  const key = `${vid.id || vid.sourceId}@${sel.start.toFixed(1)}@${stick ? fit : 'crop'}`;
  if (key === frameKey) return;
  frameKey = key;
  clearTimeout(frameT);
  frameT = setTimeout(() => {
    box.classList.add('loading');
    const img = new Image();
    img.onload = () => { if (frameKey === key) { $('#prevImg').src = img.src; box.classList.remove('loading'); } };
    img.onerror = () => { if (frameKey === key) box.classList.remove('loading'); };
    const t = isPicture() ? 0 : sel.start + 0.05;
    img.src = `/api/frame?${isYT() ? `v=${vid.id}` : `src=${vid.sourceId}`}&t=${t.toFixed(2)}&fit=${stick ? fit : 'crop'}`;
  }, 450);
}

let gainDb = 0;
$('#gainSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; gainDb = Number(b.dataset.v); $$('#gainSeg button').forEach((x) => x.classList.toggle('on', x === b)); });

// ============ criar ============
$('#createBtn').onclick = async () => {
  if (creating || !vid.kind) return;
  stopPreview();
  creating = true; render();
  const prog = $('#progress'); prog.hidden = false;
  $$('li', prog).forEach((li) => li.className = '');
  const stick = mode === 'sticker';
  const steps = stick ? ['visual'] : ['download', 'cut', 'analyze', 'visual'];
  for (const st of ['download', 'cut', 'analyze']) $(`li[data-step="${st}"]`, prog).hidden = stick;
  $('li[data-step="visual"]', prog).hidden = !stick && (sel.end - sel.start > STICKER_MAX || !vid.hasVideo);
  $('li[data-step="visual"]', prog).textContent = stick ? 'Gerando a figurinha' : 'Gerando a figurinha animada';
  $('li[data-step="download"]', prog).textContent = isYT() ? 'Baixando o áudio do YouTube' : 'Lendo a mídia carregada';
  const show = (step) => { const i = steps.indexOf(step); $$('li', prog).forEach((li, j) => li.className = j < i || step === 'done' ? 'done' : j === i ? 'active' : ''); };
  show(steps[0]);
  try {
    const overlayId = await uploadTextOverlay();
    const { jobId } = await api('/api/stickers', {
      method: 'POST',
      body: JSON.stringify({
        mode: stick ? 'sticker' : undefined, fit, overlayId,
        url: isYT() ? vid.url : undefined, sourceId: isYT() ? undefined : vid.sourceId, start: sel.start, end: sel.end, videoTitle: vid.title, videoDuration: vid.duration,
        title: $('#title').value.trim() || vid.title.slice(0, 50) || 'Figurinha', emoji, tags: $('#tags').value,
        normalize: $('#optNorm').checked, fadeIn: $('#optFadeIn').checked, fadeOut: $('#optFadeOut').checked, gainDb,
      }),
    });
    let job;
    for (;;) {
      await new Promise((r) => setTimeout(r, 500));
      job = await api(`/api/jobs/${jobId}`);
      show(job.step);
      if (job.step === 'done' || job.step === 'error') break;
    }
    if (job.error) throw new Error(job.error);
    if (job.warning) toast(job.warning, 'err');
    show('done');
    const r = $('#createBtn').getBoundingClientRect();
    burst(job.sticker.emoji, r.left + r.width / 2, r.top);
    if (createPackSel.size) await api(`/api/stickers/${job.sticker.id}/packs`, { method: 'PUT', body: JSON.stringify({ packs: [...createPackSel] }) });
    await loadCollection(job.sticker.id);
    // peça feita para a Combinação Caótica: volta para lá já encaixada
    if (comboReturn) backToCombo(job.sticker);
    else showCreated(job.sticker);
    $('#tags').value = '';
    setTimeout(() => { prog.hidden = true; }, 1500);
  } catch (err) {
    toast(err.message, 'err');
    prog.hidden = true;
  } finally {
    creating = false; render();
  }
};

function showCreated(s) {
  if (!s.hasAudio) {
    // Stick: figurinha sem som
    openModal(`<div style="text-align:center"><img class="st-prev" src="/media/${s.id}.webp?v=${Date.now()}" alt="">
      <h3 style="padding:0;margin-top:8px">Figurinha criada! 🖼️</h3><p>${esc(s.title)} · ${s.animated ? 'animada' : 'parada'}, sem som</p></div>
      <div class="stack">
        <button class="btn wa" id="mSend">${IC.wa} Enviar figurinha pro WhatsApp</button>
        <button class="btn" id="mCombo">🌀 Combinar com um som (Combinação Caótica)</button>
        <a class="btn" href="/media/${s.id}.webp?download=1">${IC.dl} Baixar .webp</a>
      </div>`, (b) => {
      $('#mSend', b).onclick = (e) => sendStickerMsg(s.id, 'plain', e.currentTarget);
      $('#mCombo', b).onclick = () => openComboWith({ visual: s });
    });
    return;
  }
  openModal(`<div style="text-align:center">${s.visual ? `<img class="st-prev" src="/media/${s.id}.webp?v=${Date.now()}" alt="">` : `<div style="font-size:64px;line-height:1">${esc(s.emoji)}</div>`}
    <h3 style="padding:0;margin-top:8px">${s.kind === 'combo' ? 'Combinação criada! 🌀' : 'Figurinha criada!'}</h3><p>${esc(s.title)} · ${s.duration.toFixed(1)}s</p></div>
    <div class="stack">
      <button class="btn wa" id="mSend">${IC.wa} ${s.visual ? 'Enviar figurinha com som pro meu WhatsApp' : 'Enviar áudio pro meu WhatsApp'}</button>
      ${s.visual ? `<button class="btn" id="mSticker">${IC.sticker} Mais opções da figurinha…</button>` : ''}
      <button class="btn" id="mPlay">▶ Ouvir</button>
      <button class="btn" id="mShare">${IC.share} Compartilhar…</button>
    </div>`, (b) => {
    $('#mSend', b).onclick = (e) => (s.visual ? sendStickerMsg(s.id, 'sound', e.currentTarget) : sendSticker(s.id, e.currentTarget));
    $('#mPlay', b).onclick = () => playSticker(s.id);
    $('#mShare', b).onclick = () => shareSticker(s.id);
    if (s.visual) { $('#mSticker', b).onclick = () => stickerModal(s.id); $('.st-prev', b).onclick = () => playSticker(s.id); }
  });
}

// ============ figurinha com som ============
async function pollJob(jobId, onStep) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 600));
    const job = await api(`/api/jobs/${jobId}`);
    onStep?.(job.step);
    if (job.step === 'error') throw new Error(job.error);
    if (job.step === 'done') return job;
  }
}

function stickerModal(id) {
  const s = stickers.find((x) => x.id === id);
  if (!s) return;
  const tooLong = s.duration > STICKER_MAX + 0.05;
  if (!s.hasAudio) {
    // Stick (sem som)
    openModal(`<h3>🖼️ Figurinha</h3>
      <div class="st-wrap"><img class="st-prev" src="/media/${s.id}.webp?v=${encodeURIComponent(s.createdAt)}" alt="Prévia da figurinha"></div>
      <p style="text-align:center" class="small">${esc(s.title)} · ${s.animated ? 'animada' : 'parada'}, sem som</p>
      <div class="stack">
        <button class="btn wa" id="stPlain">${IC.wa} Enviar figurinha</button>
        <button class="btn" id="stCombo">🌀 Dar voz a ela: combinar com um som</button>
        <button class="btn" id="stBg">✂️ Tirar o fundo (cria uma cópia)</button>
        <a class="btn" href="/media/${s.id}.webp?download=1">${IC.dl} Baixar figurinha .webp</a>
      </div>`, (b) => {
      $('#stPlain', b).onclick = (e) => sendStickerMsg(s.id, 'plain', e.currentTarget);
      $('#stCombo', b).onclick = () => openComboWith({ visual: s });
      $('#stBg', b).onclick = () => bgFromSticker(s);
    });
    return;
  }
  if (!s.visual) {
    openModal(`<h3>${IC.sticker.replace('<svg', '<svg style="width:24px;height:24px;vertical-align:-4px"')} Figurinha com som</h3>
      ${tooLong ? `<p>A figurinha com som do WhatsApp aceita até <b>${STICKER_MAX}s</b> de áudio e esta tem <b>${s.duration.toFixed(1)}s</b>.</p>
        <p>Crie um trecho menor do mesmo vídeo para virar figurinha.</p>${s.sourceUrl ? `<div class="stack"><button class="btn primary" id="vReopen">Abrir o vídeo para recortar de novo</button></div>` : ''}`
      : !s.videoId && !s.sourceId && !s.sourceUrl ? '<p>Essa figurinha veio de um pacote importado sem a animação, então não dá para gerar a imagem.</p>'
      : `<p>Vou baixar esse trecho do vídeo e transformar numa figurinha animada (512×512, em loop).</p>
        <div class="stack"><button class="btn primary" id="vMake">Gerar figurinha animada</button></div>`}
      ${!tooLong ? `<div class="stack" style="margin-top:8px"><button class="btn" id="vCombo">🌀 Ou combinar este som com outra imagem (foto, GIF…)</button></div>` : ''}`, (b) => {
      $('#vCombo', b)?.addEventListener('click', () => openComboWith({ audio: s }));
      $('#vReopen', b)?.addEventListener('click', () => {
        closeModal();
        $('#url').value = s.videoId ? `https://www.youtube.com/watch?v=${s.videoId}&t=${Math.floor(s.start)}s` : s.sourceUrl;
        loadAny($('#url').value);
        scrollTo({ top: 0, behavior: 'smooth' });
      });
      $('#vMake', b)?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'Baixando o trecho do vídeo e animando…';
        try {
          const { jobId } = await api(`/api/stickers/${s.id}/visual`, { method: 'POST' });
          await pollJob(jobId);
          await loadCollection(s.id);
          stickerModal(s.id);
        } catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.textContent = 'Tentar de novo'; }
      });
    });
    return;
  }

  openModal(`<h3>${IC.sticker.replace('<svg', '<svg style="width:24px;height:24px;vertical-align:-4px"')} Figurinha com som</h3>
    <div class="st-wrap"><img class="st-prev" src="/media/${s.id}.webp?v=${encodeURIComponent(s.createdAt)}" alt="Prévia da figurinha" title="Toque para ouvir"><span class="st-badge">🔊</span></div>
    <p style="text-align:center" class="small">${esc(s.title)} · ${s.duration.toFixed(1)}s · toque na figurinha para ouvir</p>
    <div class="stack">
      <button class="btn wa" id="stSound">${IC.wa} Enviar figurinha com som <span class="tag-exp">experimental</span></button>
      <button class="btn" id="stPlain">${IC.sticker} Enviar só a figurinha (sem som)</button>
      <button class="btn" id="stAudio">${IC.wa} Enviar só o áudio (mensagem de voz)</button>
      <a class="btn" href="/media/${s.id}.mp4?download=1">${IC.dl} Baixar vídeo .mp4 (para criar no WhatsApp)</a>
      <a class="btn" href="/media/${s.id}.webp?download=1">${IC.dl} Baixar figurinha .webp</a>
      <button class="btn" id="stComboV">🌀 Usar esta imagem com outro som</button>
      <button class="btn" id="stBgV">✂️ Tirar o fundo da imagem (cria um Stick)</button>
      ${!tooLong ? '<button class="btn" id="stComboA">🌀 Usar este som com outra imagem</button>' : ''}
    </div>
    <details class="howto"><summary>Como montar a figurinha com som no próprio WhatsApp</summary>
      <ol>
        <li>Mande o <b>vídeo .mp4</b> para o seu celular (ou baixe pelo celular) e salve na galeria.</li>
        <li>Numa conversa, toque em <b>😊 → Figurinhas → Criar</b> (ou <b>+</b>).</li>
        <li>Escolha o vídeo. Se aparecer o <b>ícone de áudio</b>, deixe o som do vídeo ligado (ou escolha o .ogg).</li>
        <li>Salve e envie. Quem receber toca na figurinha para ouvir.</li>
      </ol>
      <p class="small">O recurso começou a ser liberado no Brasil em 24/11/2026 e ainda não chegou para todo mundo — se não aparecer o ícone de áudio, atualize o WhatsApp e aguarde.</p>
    </details>
    <div class="note">O envio “com som” monta a mensagem num formato que o WhatsApp acabou de lançar e que a biblioteca ainda não suporta oficialmente. Se chegar como “mensagem não suportada”, use o vídeo .mp4 pelo passo a passo acima.</div>`, (b) => {
    $('.st-prev', b).onclick = () => playSticker(s.id);
    $('#stSound', b).onclick = (e) => sendStickerMsg(s.id, 'sound', e.currentTarget);
    $('#stPlain', b).onclick = (e) => sendStickerMsg(s.id, 'plain', e.currentTarget);
    $('#stAudio', b).onclick = (e) => sendSticker(s.id, e.currentTarget);
    $('#stComboV', b).onclick = () => openComboWith({ visual: s });
    $('#stBgV', b).onclick = () => bgFromSticker(s);
    $('#stComboA', b)?.addEventListener('click', () => openComboWith({ audio: s }));
  });
}

async function sendStickerMsg(id, mode, btn) {
  if (waState.status !== 'open') { toast('Conecte seu WhatsApp primeiro 👇'); return openWa(); }
  const old = btn.innerHTML;
  const compact = btn.classList.contains('send-btn'); // botão só com ícone: não troca o texto
  btn.disabled = true;
  btn.classList.add('busy');
  if (!compact) btn.textContent = 'Enviando…';
  try {
    await api(`/api/stickers/${id}/send-sticker`, { method: 'POST', body: JSON.stringify({ mode, to: target.id }) });
    toast(mode === 'sound' ? `Enviada para ${target.name}! Confira se ela tocou o som 👀` : `Figurinha enviada para ${target.name} ✓`, 'ok');
    const r = btn.getBoundingClientRect();
    burst('🔊', r.left + r.width / 2, r.top);
    if (compact) { btn.classList.add('ok'); setTimeout(() => btn.classList.remove('ok'), 2500); }
  } catch (err) { toast(err.message, 'err'); if (err.status === 409) openWa(); }
  btn.disabled = false;
  btn.classList.remove('busy');
  btn.innerHTML = old;
}

// ============ coleção ============
let stickers = [];
let packs = [];
const createPackSel = new Set(); // pacotes marcados no passo 3 (valem para as próximas figurinhas)
const filters = { q: '', fav: false, sort: 'recent', pack: '' };

async function loadCollection(highlightId) {
  const p = new URLSearchParams({ q: filters.q, sort: filters.sort, favorites: filters.fav ? '1' : '', pack: filters.pack });
  const data = await api(`/api/stickers?${p}`);
  stickers = data.stickers;
  packs = data.packs;
  if (filters.pack && !packs.some((x) => x.id === filters.pack)) { filters.pack = ''; return loadCollection(highlightId); }
  for (const id of [...createPackSel]) if (!packs.some((x) => x.id === id)) createPackSel.delete(id);
  $('#stats').dataset.total = data.stats.total;
  renderPackBar();
  renderCreatePacks();
  const st = data.stats;
  $('#stats').textContent = st.total ? `${st.total} figurinha${st.total > 1 ? 's' : ''} · ${Math.round(st.seconds)}s de áudio · ${st.sends} enviada${st.sends === 1 ? '' : 's'}` : '';
  $('#empty').hidden = stickers.length > 0;
  $('#empty p').innerHTML = st.total ? 'Nada encontrado com esse filtro.' : 'Nenhuma figurinha ainda.<br>Crie a primeira aqui do lado.';
  $('#grid').innerHTML = stickers.map((s, i) => card(s, i, s.id === highlightId)).join('');
}

const bars = (w) => w.map((v) => `<i style="height:${Math.max(8, v)}%"></i>`).join('');
function card(s, i, fresh) {
  const inPacks = (s.packs || []).map((id) => packs.find((p) => p.id === id)).filter(Boolean);
  const silent = !s.hasAudio; // Stick: só a figurinha
  const kindTag = silent ? '🖼️ Stick' : s.kind === 'combo' ? '🌀 Combo' : '';
  const meta = [silent ? (s.animated ? 'animada' : 'parada') : `${s.duration.toFixed(1)}s`, s.plays ? `▶ ${s.plays}` : '', inPacks.map((p) => p.emoji).join(''), ...s.tags.map((t) => `#${t}`)].filter(Boolean).join(' · ');
  return `<article class="sticker${fresh ? ' fresh' : ''}" data-id="${s.id}" style="animation-delay:${Math.min(i, 12) * 25}ms">
    <button class="s-emoji${s.visual ? ' has-img' : ''}" data-act="play" aria-label="${silent ? 'Ver' : 'Tocar'} ${esc(s.title)}">${s.visual ? `<img src="/media/${s.id}.webp" alt="" loading="lazy"><span class="s-mini">${esc(s.emoji)}</span>` : esc(s.emoji)}${i < 9 ? `<span class="s-key">${i + 1}</span>` : ''}</button>
    <div class="s-info"><div class="s-title" title="${esc(s.videoTitle || s.title)}">${esc(s.title)}</div><div class="s-meta">${kindTag ? `<span class="kind-badge${s.kind === 'combo' ? ' combo' : ''}">${kindTag}</span> ` : ''}${esc(meta)}</div></div>
    ${silent
      ? `<div class="wave silent">🖼️ figurinha sem som</div>`
      : `<div class="wave" data-act="play"><div class="bars">${bars(s.waveform)}</div><div class="prog">${bars(s.waveform)}</div></div>`}
    <div class="s-actions">
      ${silent
        ? `<button class="send-btn" data-act="send-plain" title="Enviar a figurinha pro WhatsApp" aria-label="Enviar a figurinha pro WhatsApp">${IC.wa}</button>`
        : s.visual
        ? `<button class="send-btn" data-act="send-sound" title="Enviar a figurinha com som pro meu WhatsApp" aria-label="Enviar a figurinha com som pro meu WhatsApp">${IC.wa}</button>`
        : `<button class="send-btn" data-act="send" title="Enviar o áudio pro meu WhatsApp" aria-label="Enviar o áudio pro meu WhatsApp">${IC.wa}</button>`}
      <button class="icon-btn sticker-btn${s.visual ? ' ready' : ''}" data-act="sticker" title="${silent ? 'Opções da figurinha' : s.visual ? 'Figurinha com som' : s.duration <= STICKER_MAX + 0.05 ? 'Gerar figurinha animada' : 'Figurinha com som: só trechos de até 10s'}">${IC.sticker}</button>
      <button class="icon-btn ${s.favorite ? 'fav-on' : ''}" data-act="fav" title="Favorita">${IC.star}</button>
      <button class="icon-btn" data-act="share" title="Compartilhar">${IC.share}</button>
      <button class="icon-btn" data-act="edit" title="Editar">${IC.edit}</button>
      <button class="icon-btn" data-act="del" title="Excluir">${IC.trash}</button>
    </div>
  </article>`;
}

$('#grid').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const id = btn.closest('.sticker').dataset.id;
  const s = stickers.find((x) => x.id === id);
  const act = btn.dataset.act;
  if (act === 'play') playSticker(id);
  else if (act === 'send') sendSticker(id, btn);
  else if (act === 'send-sound') sendStickerMsg(id, 'sound', btn);
  else if (act === 'send-plain') sendStickerMsg(id, 'plain', btn);
  else if (act === 'sticker') stickerModal(id);
  else if (act === 'share') shareSticker(id);
  else if (act === 'fav') {
    s.favorite = !s.favorite; btn.classList.toggle('fav-on', s.favorite);
    if (s.favorite) btn.animate([{ transform: 'scale(1.4) rotate(15deg)' }, { transform: 'none' }], { duration: 300 });
    await api(`/api/stickers/${id}`, { method: 'PATCH', body: JSON.stringify({ favorite: s.favorite }) });
    if (filters.fav) loadCollection();
  } else if (act === 'edit') editSticker(s);
  else if (act === 'del') {
    if (!(await confirmBox('Excluir figurinha?', `“${s.title}” vai sumir da coleção e o áudio será apagado.`, 'Excluir', true))) return;
    const el = btn.closest('.sticker');
    el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.8)' }], { duration: 220 }).onfinish = async () => { await api(`/api/stickers/${id}`, { method: 'DELETE' }); loadCollection(); };
  }
});

// reprodução
const audio = new Audio();
let playingId = null;
function playSticker(id) {
  const el = $(`.sticker[data-id="${id}"]`);
  // Stick (sem som): só reinicia a animação
  const meta = stickers.find((x) => x.id === id);
  if (meta && !meta.hasAudio) {
    $$(`img[src*="/media/${id}.webp"]`).forEach((img) => { img.src = `/media/${id}.webp?play=${Date.now()}`; });
    return;
  }
  if (playingId === id && !audio.paused) { audio.pause(); audio.currentTime = 0; return clearPlaying(); }
  clearPlaying();
  playingId = id;
  audio.src = `/media/${id}.ogg`;
  el?.classList.add('playing');
  // A animação fica em loop o tempo todo; ao tocar, ela precisa recomeçar do 1º quadro junto com o som
  // (senão a imagem aparece num ponto qualquer e parece que imagem e som são de trechos diferentes).
  const imgs = $$(`img[src*="/media/${id}.webp"]`);
  const go = () => audio.play().catch(() => toast('O navegador não conseguiu tocar o áudio.', 'err'));
  if (!imgs.length) go();
  else {
    let started = false;
    const start = () => { if (!started) { started = true; go(); } };
    const fresh = `/media/${id}.webp?play=${Date.now()}`;
    imgs.forEach((img) => { img.addEventListener('load', start, { once: true }); img.src = fresh; });
    setTimeout(start, 500); // se a imagem demorar, não segura o som
  }
  fetch(`/api/stickers/${id}/play`, { method: 'POST' }).catch(() => {});
}
function clearPlaying() { $$('.sticker.playing').forEach((x) => { x.classList.remove('playing'); $('.prog', x).style.clipPath = ''; }); playingId = null; }
audio.addEventListener('ended', clearPlaying);
(function progress() {
  if (playingId && audio.duration) {
    const el = $(`.sticker[data-id="${playingId}"] .prog`);
    if (el) el.style.clipPath = `inset(0 ${100 - (audio.currentTime / audio.duration) * 100}% 0 0)`;
  }
  requestAnimationFrame(progress);
})();

// enviar pro WhatsApp
async function sendSticker(id, btn) {
  if (waState.status !== 'open') { toast('Conecte seu WhatsApp primeiro 👇'); return openWa(); }
  btn.classList.add('busy');
  const label = btn.querySelector('span');
  const old = label?.textContent;
  if (label) label.textContent = 'Enviando…';
  try {
    await api(`/api/stickers/${id}/send`, { method: 'POST', body: JSON.stringify({ to: target.id }) });
    btn.classList.add('ok');
    if (label) label.textContent = 'Enviado ✓';
    toast(target.id === 'me' ? 'Chegou no seu WhatsApp ✓' : `Enviado para ${target.name} ✓`, 'ok');
    const s = stickers.find((x) => x.id === id);
    const r = btn.getBoundingClientRect();
    burst(s?.emoji || '🔊', r.left + r.width / 2, r.top);
    setTimeout(() => { btn.classList.remove('ok'); if (label) label.textContent = old; }, 2500);
  } catch (err) {
    if (label) label.textContent = old;
    toast(err.message, 'err');
    if (err.status === 409) openWa();
  } finally { btn.classList.remove('busy'); }
}

// compartilhar
async function shareSticker(id) {
  const s = stickers.find((x) => x.id === id);
  const link = `${location.origin}/s/${id}`;
  const local = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  let file = null;
  if (navigator.canShare) {
    try {
      const blob = await (await fetch(`/media/${id}.ogg`)).blob();
      const f = new File([blob], `${(s.title || 'figurinha').replace(/[^\p{L}\p{N} _-]/gu, '')}.ogg`, { type: 'audio/ogg' });
      if (navigator.canShare({ files: [f] })) file = f;
    } catch { /* sem suporte */ }
  }
  openModal(`<h3>${esc(s.emoji)} Compartilhar</h3><p>${esc(s.title)}</p>
    <div class="stack">
      ${file ? `<button class="btn wa" id="shFile">${IC.share} Enviar o áudio pelo celular (WhatsApp, Telegram…)</button>` : ''}
      <a class="btn" href="/media/${id}.ogg?download=1">${IC.dl} Baixar o arquivo .ogg</a>
      <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${s.emoji} ${s.title} ${link}`)}">${IC.wa} Mandar o link no WhatsApp</a>
    </div>
    <p style="margin:14px 0 6px">Link da figurinha</p>
    <div class="copy-row"><input readonly value="${esc(link)}" id="shLink"><button class="btn small" id="shCopy">Copiar</button></div>
    ${local ? '<div class="note">⚠ Esse link só abre em aparelhos da sua rede de casa. Para mandar para outras pessoas, use “Enviar o áudio” ou exponha o app pelo túnel (veja o LEIAME).</div>' : ''}
    ${!file ? '<div class="note">Para enviar o arquivo direto pelo menu do celular, abra o app pelo endereço https do túnel (no celular) — o navegador só libera isso em conexão segura.</div>' : ''}`,
  (b) => {
    if (file) $('#shFile', b).onclick = () => navigator.share({ files: [file], title: s.title }).catch(() => {});
    $('#shCopy', b).onclick = async () => {
      try { await navigator.clipboard.writeText(link); } catch { $('#shLink', b).select(); document.execCommand('copy'); }
      $('#shCopy', b).textContent = 'Copiado ✓';
    };
  });
}

function editSticker(s) {
  openModal(`<h3>Editar figurinha</h3>
    <div style="display:grid;gap:12px">
      <label class="field"><span>Emoji</span><input id="eEmoji" value="${esc(s.emoji)}" maxlength="8" style="font-size:1.6rem;width:90px;text-align:center"></label>
      <div class="emoji-grid" style="width:auto;grid-template-columns:repeat(9,1fr)">${EMOJIS.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
      <label class="field"><span>Nome</span><input id="eTitle" value="${esc(s.title)}" maxlength="80"></label>
      <label class="field"><span>Tags</span><input id="eTags" value="${esc(s.tags.join(', '))}" maxlength="120"></label>
      <div class="field"><span>Pacotes</span><div class="pack-pick" id="ePacks"></div></div>
      ${s.sourceUrl ? `<a class="dim small" target="_blank" rel="noopener" href="${esc(s.videoId ? `https://www.youtube.com/watch?v=${s.videoId}&t=${Math.floor(s.start || 0)}s` : s.sourceUrl)}">${siteIcon(s.sourceSite)} ${esc(s.sourceSite || 'Origem')} · ${esc(s.videoTitle || 'vídeo original')} (${fmt(s.start)}–${fmt(s.end)})</a>`
        : s.sourceKind === 'upload' ? `<span class="dim small">📁 Arquivo · ${esc(s.videoTitle || '')} (${fmt(s.start)}–${fmt(s.end)})</span>` : ''}
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="eSave">Salvar</button></div>
    </div>`, (b) => {
    $('.emoji-grid', b).onclick = (e) => { const x = e.target.closest('button'); if (x) $('#eEmoji', b).value = x.dataset.e; };
    const sel = new Set(s.packs || []);
    packPicker($('#ePacks', b), sel, { allowNew: false });
    $('#eSave', b).onclick = async () => {
      await api(`/api/stickers/${s.id}`, { method: 'PATCH', body: JSON.stringify({ emoji: $('#eEmoji', b).value.trim() || '🔊', title: $('#eTitle', b).value.trim() || s.title, tags: $('#eTags', b).value }) });
      await api(`/api/stickers/${s.id}/packs`, { method: 'PUT', body: JSON.stringify({ packs: [...sel] }) });
      closeModal(); toast('Salvo ✓'); loadCollection();
    };
  });
}

// ============ pacotes (categorias) ============
const PACK_EMOJIS = ['📦', '😂', '🔥', '⚽', '🎵', '💀', '🐸', '❤️', '🎬', '🍺', '🎮', '📢', '🤡', '🐐', '⭐', '🇧🇷'];

function renderPackBar() {
  const bar = $('#packBar');
  const total = Number($('#stats').dataset.total || 0);
  bar.innerHTML = `<button class="pack-chip${!filters.pack ? ' on' : ''}" data-pack="">🗂️ <span class="nm">Todas</span><span class="n">${total}</span></button>`
    + packs.map((p) => `<button class="pack-chip${filters.pack === p.id ? ' on' : ''}" data-pack="${p.id}" title="${esc(p.name)}">${esc(p.emoji)} <span class="nm">${esc(p.name)}</span><span class="n">${p.count}</span></button>`).join('')
    + '<button class="pack-chip add" data-new>＋ Novo pacote</button>';
  renderPackTools();
}

$('#packBar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-new')) return newPackModal((p) => { filters.pack = p.id; createPackSel.add(p.id); loadCollection(); });
  filters.pack = b.dataset.pack;
  loadCollection();
});

function renderPackTools() {
  const box = $('#packTools');
  const p = packs.find((x) => x.id === filters.pack);
  box.hidden = !p;
  if (!p) return;
  box.innerHTML = `
    <div class="pt-title">
      ${p.cover ? `<img class="pt-cover" src="/media/${p.cover}.webp" alt="">` : `<span class="pt-cover">${esc(p.emoji)}</span>`}
      <div style="min-width:0"><div class="pt-name">${esc(p.emoji)} ${esc(p.name)}</div><div class="dim small">${p.count} figurinha${p.count === 1 ? '' : 's'}</div></div>
    </div>
    <div class="pt-actions">
      <button class="btn wa small" data-pt="send" ${p.count ? '' : 'disabled'}>${IC.wa} Enviar pacote</button>
      <button class="btn small" data-pt="more" title="Mais opções do pacote">⋯ Mais</button>
    </div>`;
}

$('#packTools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pt]'); if (!b) return;
  const p = packs.find((x) => x.id === filters.pack); if (!p) return;
  if (b.dataset.pt === 'send') sendPack(p, b);
  else packOptions(p);
});

function packOptions(p) {
  const animated = stickers.filter((s) => s.visual).length;
  openModal(`<h3>${esc(p.emoji)} ${esc(p.name)}</h3><p>${p.count} figurinha${p.count === 1 ? '' : 's'} · ${animated} com animação</p>
    <div class="stack">
      <button class="btn" id="poPlain">${IC.sticker} Enviar pacote sem som (figurinhas comuns)</button>
      <button class="btn" id="poAudio">${IC.wa} Enviar pacote só como áudios</button>
      <a class="btn" href="/api/packs/${p.id}/wastickers" id="poWa">${IC.dl} Baixar .wastickers (pacote para apps de figurinhas)</a>
      <a class="btn" href="/api/export?pack=${p.id}">${IC.dl} Exportar pacote (.zip para outro Audio Sticks)</a>
      <button class="btn" id="poRename">${IC.edit} Renomear / trocar emoji</button>
      <button class="btn ghost" id="poDel" style="color:var(--danger)">${IC.trash} Excluir pacote</button>
    </div>
    <details class="howto"><summary>O que é o .wastickers?</summary>
      <p class="small dim" style="margin:6px 0 10px">É o formato de pacote que apps gratuitos de figurinhas (como o <b>Sticker Maker</b>) importam para adicionar ao WhatsApp como <b>pacote de verdade</b>, com botão “Adicionar ao WhatsApp”. Vai só a animação (sem som). O WhatsApp exige de 3 a 30 figurinhas.</p>
    </details>`, (b) => {
    $('#poPlain', b).onclick = (e) => sendPack(p, e.currentTarget, 'plain');
    $('#poAudio', b).onclick = (e) => sendPack(p, e.currentTarget, 'audio');
    $('#poWa', b).onclick = async (e) => {
      // checa antes para mostrar o motivo em vez de baixar um erro
      if (animated < 3) { e.preventDefault(); toast(`O WhatsApp exige pelo menos 3 figurinhas animadas no pacote (este tem ${animated}).`, 'err'); }
    };
    $('#poRename', b).onclick = () => newPackModal(() => loadCollection(), p);
    $('#poDel', b).onclick = async () => {
      if (!(await confirmBox('Excluir pacote?', `O pacote “${p.name}” some, mas as figurinhas continuam na coleção.`, 'Excluir pacote', true))) return;
      await api(`/api/packs/${p.id}`, { method: 'DELETE' });
      filters.pack = ''; toast('Pacote excluído'); loadCollection();
    };
  });
}

/** Modal para criar (ou editar, se `pack` vier) um pacote. */
function newPackModal(onDone, pack = null) {
  let emo = pack?.emoji || '📦';
  openModal(`<h3>${pack ? 'Editar pacote' : 'Novo pacote'}</h3>
    <div style="display:grid;gap:12px">
      <label class="field"><span>Nome</span><input id="pkName" maxlength="40" placeholder="ex.: Memes, Futebol, Família" value="${esc(pack?.name || '')}"></label>
      <div class="field"><span>Emoji</span><div class="emoji-grid" id="pkEmo" style="width:auto;grid-template-columns:repeat(8,1fr)">${PACK_EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === emo ? 'on' : ''}">${e}</button>`).join('')}</div></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="pkSave">${pack ? 'Salvar' : 'Criar pacote'}</button></div>
    </div>`, (b) => {
    const name = $('#pkName', b);
    setTimeout(() => name.focus(), 50);
    $('#pkEmo', b).onclick = (e) => { const x = e.target.closest('button'); if (!x) return; emo = x.dataset.e; $$('#pkEmo button', b).forEach((y) => y.classList.toggle('on', y === x)); };
    const save = async () => {
      if (!name.value.trim()) { name.focus(); return toast('Dê um nome ao pacote.', 'err'); }
      try {
        const p = await api(pack ? `/api/packs/${pack.id}` : '/api/packs', { method: pack ? 'PATCH' : 'POST', body: JSON.stringify({ name: name.value.trim(), emoji: emo }) });
        closeModal(); toast(pack ? 'Pacote salvo ✓' : `Pacote “${p.name}” criado ✓`); onDone?.(p);
      } catch (err) { toast(err.message, 'err'); }
    };
    $('#pkSave', b).onclick = save;
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  });
}

/** Chips de pacotes para marcar/desmarcar (`sel` é um Set de ids). */
function packPicker(container, sel, { allowNew = true } = {}) {
  const draw = () => {
    container.innerHTML = packs.map((p) => `<button type="button" class="pack-chip${sel.has(p.id) ? ' on' : ''}" data-id="${p.id}">${esc(p.emoji)} ${esc(p.name)}</button>`).join('')
      + (allowNew ? '<button type="button" class="pack-chip add" data-new>＋ novo</button>' : '')
      + (!packs.length && !allowNew ? '<span class="dim small">Nenhum pacote ainda.</span>' : '');
  };
  container.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    // criar pacote daqui: ao voltar ele já vem marcado (loadCollection redesenha os chips)
    if (b.hasAttribute('data-new')) return newPackModal((p) => { sel.add(p.id); loadCollection(); });
    sel.has(b.dataset.id) ? sel.delete(b.dataset.id) : sel.add(b.dataset.id);
    draw();
  };
  draw();
}
function renderCreatePacks() { packPicker($('#createPacks'), createPackSel); }

async function sendPack(p, btn, mode = 'sound') {
  if (waState.status !== 'open') { toast('Conecte seu WhatsApp primeiro 👇'); return openWa(); }
  const old = btn.innerHTML;
  btn.disabled = true;
  try {
    const { jobId } = await api(`/api/packs/${p.id}/send`, { method: 'POST', body: JSON.stringify({ mode, to: target.id }) });
    let job;
    for (;;) {
      await new Promise((r) => setTimeout(r, 700));
      job = await api(`/api/jobs/${jobId}`);
      btn.textContent = `Enviando ${job.done}/${job.total}…`;
      if (job.step === 'done' || job.step === 'error') break;
    }
    if (job.error) throw new Error(job.error);
    toast(job.failed ? `Pacote enviado, mas ${job.failed} falharam.` : `Pacote “${p.name}” enviado para ${target.name} ✓ (${job.total})`, job.failed ? 'err' : 'ok');
    const r = btn.getBoundingClientRect();
    burst(p.emoji, r.left + r.width / 2, r.top);
  } catch (err) { toast(err.message, 'err'); if (err.status === 409) openWa(); }
  btn.disabled = false;
  btn.innerHTML = old;
}

// filtros
let searchT;
$('#search').addEventListener('input', (e) => { clearTimeout(searchT); searchT = setTimeout(() => { filters.q = e.target.value.trim(); loadCollection(); }, 180); });
$('#sort').addEventListener('change', (e) => { filters.sort = e.target.value; loadCollection(); });
$('#filterSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; filters.fav = b.dataset.f === 'fav'; $$('#filterSeg button').forEach((x) => x.classList.toggle('on', x === b)); loadCollection(); });

// importar pacote
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const fd = new FormData(); fd.append('pack', f);
  try {
    const r = await api('/api/import', { method: 'POST', body: fd });
    toast(`${r.added} figurinha${r.added === 1 ? '' : 's'} importada${r.added === 1 ? '' : 's'}${r.packsAdded ? ` e ${r.packsAdded} pacote${r.packsAdded === 1 ? '' : 's'}` : ''}${r.skipped ? ` (${r.skipped} já existiam)` : ''}`, 'ok');
    loadCollection();
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
};

// ============ WhatsApp ============
let waState = { status: 'disconnected' };
let waPoll = null;
async function refreshWa() {
  try { waState = await api('/api/whatsapp'); } catch { return; }
  const pill = $('#waPill');
  pill.dataset.status = waState.status;
  $('.label', pill).textContent = waState.status === 'open' ? `+${waState.me?.number ?? ''}` : waState.status === 'disconnected' ? 'Conectar WhatsApp' : 'Conectando…';
  if (!modal.hidden && $('.modal-body [data-wa]')) renderWa();
  renderTarget();
}
function openWa() {
  openModal('<div data-wa></div>');
  renderWa();
  clearInterval(waPoll);
  waPoll = setInterval(refreshWa, 1500);
  modalClosed = () => { clearInterval(waPoll); waPoll = setInterval(refreshWa, 15000); };
}
function renderWa() {
  const box = $('.modal-body [data-wa]'); if (!box) return;
  const st = waState.status;
  if (st === 'open') {
    box.innerHTML = `<h3>${IC.wa.replace('<svg', '<svg style="width:26px;height:26px;fill:var(--wa);vertical-align:-5px"')} Conectado</h3>
      <p>As figurinhas vão chegar na conversa <b>“Você”</b> (mensagem para si mesmo) do número <b>+${esc(waState.me?.number)}</b>.</p>
      <div class="stack"><button class="btn" data-close>Fechar</button><button class="btn ghost" id="waOut">Desconectar este PC</button></div>`;
    $('#waOut', box).onclick = async () => { if (await confirmBox('Desconectar?', 'Para enviar de novo será preciso ler o QR code outra vez.', 'Desconectar', true)) { await api('/api/whatsapp/logout', { method: 'POST' }); refreshWa(); } };
  } else if (st === 'qr' || st === 'connecting') {
    box.innerHTML = `<h3>Conectar o WhatsApp</h3>
      <ol class="steps-wa"><li>Abra o <b>WhatsApp</b> no celular</li><li>Toque em <b>⋮ / Configurações → Aparelhos conectados</b></li><li><b>Conectar um aparelho</b> e aponte para o código</li></ol>
      <div class="qr">${waState.qr ? `<img src="${waState.qr}" alt="QR code do WhatsApp">` : '<div class="spin"></div>'}</div>
      <p class="small" style="text-align:center">É grátis e fica conectado como um WhatsApp Web. O código muda a cada ~20s.</p>`;
  } else {
    box.innerHTML = `<h3>Conectar o WhatsApp</h3>
      <p>Conecte o seu número uma vez (igual ao WhatsApp Web) e as figurinhas chegam direto na sua conversa “Você”.</p>
      ${waState.error ? `<div class="note" style="margin-bottom:12px">${esc(waState.error)}</div>` : ''}
      <div class="stack"><button class="btn wa" id="waGo">${IC.wa} Gerar QR code</button></div>
      <div class="note">Usa uma conexão não oficial (gratuita). Mandar só para você mesmo é de baixo risco, mas não é algo que o WhatsApp suporta oficialmente.</div>`;
    $('#waGo', box).onclick = async (e) => { e.currentTarget.disabled = true; try { waState = await api('/api/whatsapp/connect', { method: 'POST' }); } catch (err) { toast(err.message, 'err'); } renderWa(); };
  }
}
$('#waPill').onclick = openWa;

// ============ destino do envio (você, contato, grupo ou número) ============
const ME = { id: 'me', name: 'Você', kind: 'me' };
let target = ME;
let recents = [];
try { const t = JSON.parse(localStorage.getItem('sticks.target')); if (t?.id) target = t; } catch { /* sem armazenamento */ }
try { recents = JSON.parse(localStorage.getItem('sticks.recents')) || []; } catch { /* sem armazenamento */ }

const initials = (name) => (String(name || '').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '#').toUpperCase();
const hueOf = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
function avatar(t) {
  if (t.kind === 'me') return '<span class="avatar" style="background:var(--accent);color:var(--accent-ink)">Eu</span>';
  return `<span class="avatar${t.kind === 'group' ? ' grp' : ''}" style="background:hsl(${hueOf(t.id)} 45% 42%)">${t.kind === 'group' ? '👥' : esc(initials(t.name))}</span>`;
}
const subOf = (t) => (t.kind === 'me' ? `Sua conversa “Você”${waState.me?.number ? ` · +${waState.me.number}` : ''}`
  : t.kind === 'group' ? `Grupo${t.size ? ` · ${t.size} participantes` : ''}` : t.phone || 'Contato');

function setTarget(t) {
  target = t;
  try { localStorage.setItem('sticks.target', JSON.stringify(t)); } catch { /* ok */ }
  if (t.kind !== 'me') {
    recents = [t, ...recents.filter((r) => r.id !== t.id)].slice(0, 6);
    try { localStorage.setItem('sticks.recents', JSON.stringify(recents)); } catch { /* ok */ }
  }
  renderTarget();
}
function renderTarget() {
  $('#targetBtn').innerHTML = `${avatar(target)}<span class="tb-txt"><div class="tb-name">${esc(target.name)}</div><div class="tb-sub">${esc(subOf(target))}</div></span><span class="tb-caret">Trocar ▾</span>`;
}
$('#targetBtn').onclick = () => openTargetPicker();

const picker = { contacts: null, groups: null, tab: 'contacts' };
function openTargetPicker() {
  if (waState.status !== 'open') { toast('Conecte seu WhatsApp primeiro 👇'); return openWa(); }
  picker.tab = target.kind === 'group' ? 'groups' : 'contacts';
  openModal(`<h3>Enviar para…</h3>
    <button class="picker-item${target.id === 'me' ? ' on' : ''}" data-me>${avatar(ME)}<span class="pi-txt"><div class="pi-name">Você</div><div class="pi-sub">${esc(subOf(ME))}</div></span></button>
    <div class="picker-tabs"><div class="seg" id="pkTabs"><button data-tab="contacts">👤 Contatos</button><button data-tab="groups">👥 Grupos</button><button data-tab="number">#️⃣ Número</button></div></div>
    <div id="pkBody"></div>`, (b) => {
    $('[data-me]', b).onclick = () => choose(ME);
    $('#pkTabs', b).onclick = (e) => { const x = e.target.closest('button'); if (x) showTab(x.dataset.tab); };
    showTab(picker.tab);
  });
}
function choose(t) {
  setTarget(t);
  closeModal();
  toast(t.kind === 'me' ? 'Enviando para você mesmo' : `Agora enviando para ${t.name}`, 'ok');
}

async function showTab(tab) {
  picker.tab = tab;
  $$('#pkTabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  const body = $('#pkBody'); if (!body) return;

  if (tab === 'number') {
    body.innerHTML = `<p class="small" style="margin:0 0 8px">Digite o número com DDD. Se não tiver o código do país, uso +55.</p>
      <div class="copy-row"><input id="pkNum" inputmode="tel" placeholder="ex.: 11 98888-7777" autocomplete="off"><button class="btn primary small" id="pkCheck">Verificar</button></div>
      <div id="pkNumRes" class="picker-list"></div>`;
    const go = async () => {
      const btn = $('#pkCheck'), res = $('#pkNumRes');
      btn.disabled = true; btn.textContent = 'Verificando…';
      try {
        const r = await api('/api/whatsapp/check', { method: 'POST', body: JSON.stringify({ number: $('#pkNum').value }) });
        const t = { id: r.id, name: r.name || r.phone, phone: r.phone, kind: 'contact' };
        res.innerHTML = `<button class="picker-item on">${avatar(t)}<span class="pi-txt"><div class="pi-name">${esc(t.name)}</div><div class="pi-sub">✓ tem WhatsApp · toque para usar</div></span></button>`;
        res.firstElementChild.onclick = () => choose(t);
      } catch (err) { res.innerHTML = `<div class="picker-empty">${esc(err.message)}</div>`; }
      btn.disabled = false; btn.textContent = 'Verificar';
    };
    $('#pkCheck').onclick = go;
    $('#pkNum').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    setTimeout(() => $('#pkNum')?.focus(), 50);
    return;
  }

  body.innerHTML = `<input id="pkSearch" type="search" placeholder="${tab === 'groups' ? 'Buscar grupo…' : 'Buscar contato por nome ou número…'}" autocomplete="off"><div id="pkList" class="picker-list"><div class="picker-empty">Carregando…</div></div>`;
  try {
    if (tab === 'groups') picker.groups ||= await api('/api/whatsapp/groups');
    else picker.contacts ||= await api('/api/whatsapp/contacts');
  } catch (err) { $('#pkList').innerHTML = `<div class="picker-empty">${esc(err.message)}</div>`; return; }
  const draw = () => drawList(tab, $('#pkSearch')?.value || '');
  $('#pkSearch').addEventListener('input', draw);
  setTimeout(() => $('#pkSearch')?.focus(), 50);
  draw();
}

function drawList(tab, q) {
  const box = $('#pkList'); if (!box) return;
  const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const nq = norm(q), dq = q.replace(/\D/g, '');
  const match = (t) => !q || norm(t.name).includes(nq) || (dq && String(t.phone || '').replace(/\D/g, '').includes(dq));
  const item = (t) => `<button class="picker-item${t.id === target.id ? ' on' : ''}" data-id="${esc(t.id)}">${avatar(t)}<span class="pi-txt"><div class="pi-name">${esc(t.name)}</div><div class="pi-sub">${esc(subOf(t))}</div></span></button>`;
  let html = '', pool = [];

  if (tab === 'groups') {
    pool = picker.groups.map((g) => ({ ...g, kind: 'group' })).filter(match);
    html = pool.length ? pool.map(item).join('') : `<div class="picker-empty">${picker.groups.length ? 'Nenhum grupo com esse nome.' : 'Você não participa de nenhum grupo.'}</div>`;
  } else {
    const all = picker.contacts.map((c) => ({ ...c, name: c.name || c.phone, kind: 'contact' }));
    const rec = recents.filter((r) => r.kind !== 'me' && match(r));
    pool = [...rec, ...all.filter(match).slice(0, 300)];
    if (rec.length && !q) html += '<div class="picker-sec">Recentes</div>' + rec.map(item).join('') + '<div class="picker-sec">Contatos</div>';
    const list = all.filter(match).slice(0, 300);
    html += list.length ? list.map(item).join('')
      : `<div class="picker-empty">${picker.contacts.length ? 'Ninguém com esse nome ou número.' : 'Ainda não tenho seus contatos.'}</div>`;
    html += `<div class="picker-empty"><button class="btn small" id="pkSync">🔄 ${picker.contacts.length ? 'Atualizar contatos do WhatsApp' : 'Buscar meus contatos no WhatsApp'}</button>
      <div class="small" style="margin-top:6px">${picker.contacts.length} contato${picker.contacts.length === 1 ? '' : 's'} · ou use a aba “Número”</div></div>`;
  }
  box.innerHTML = html;
  box.onclick = async (e) => {
    if (e.target.closest('#pkSync')) return syncContactsNow(e.target.closest('#pkSync'));
    const b = e.target.closest('[data-id]'); if (!b) return;
    const t = pool.find((x) => x.id === b.dataset.id);
    if (t) choose({ id: t.id, name: t.name, kind: t.kind, phone: t.phone, size: t.size });
  };
}

async function syncContactsNow(btn) {
  btn.disabled = true; btn.textContent = 'Buscando no WhatsApp… (pode levar alguns segundos)';
  try {
    const { count } = await api('/api/whatsapp/contacts/sync', { method: 'POST' });
    picker.contacts = await api('/api/whatsapp/contacts');
    toast(`${count} contato${count === 1 ? '' : 's'} carregado${count === 1 ? '' : 's'} ✓`, 'ok');
    drawList('contacts', $('#pkSearch')?.value || '');
  } catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.textContent = 'Tentar de novo'; }
}

// ============ abas: Audio Stick / Stick / Combinação Caótica ============
const MODE_TEXT = {
  audio: {
    step1: 'Cole um link ou envie um arquivo',
    hint: 'O YouTube abre na hora. Instagram, TikTok, X, Facebook, Kwai e outros sites são baixados antes. Também dá para <b>arrastar um vídeo ou áudio</b> para cá.',
    welcome: ['<b>Cole</b> o link de qualquer vídeo', '<b>Marque</b> o começo e o fim do trecho', '<b>Mande</b> pro WhatsApp: áudio ou figurinha com som'],
  },
  sticker: {
    step1: 'Escolha uma foto, um GIF ou um vídeo',
    hint: 'Clique em <b>📁 Arquivo</b> (ou arraste) para usar uma <b>foto</b>, um <b>GIF</b> ou um vídeo. Também dá para colar o link de um vídeo e recortar até 10s.',
    welcome: ['<b>Escolha</b> uma foto, um GIF ou um vídeo', '<b>Recorte</b> (vídeo: até 10s) e escolha o enquadramento', '<b>Mande</b> como figurinha, sem som'],
  },
};

function setMode(m) {
  if (!['audio', 'sticker', 'combo'].includes(m)) m = 'audio';
  mode = m;
  try { localStorage.setItem('sticks.mode', m); } catch { /* ok */ }
  $$('#modeTabs button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  $('#studioMain').hidden = m === 'combo';
  $('#comboPanel').hidden = m !== 'combo';
  if (m === 'combo') { stopPreview(); renderCombo(); return; }
  const t = MODE_TEXT[m];
  $('#step1Title').textContent = t.step1;
  if (!vid.kind) $('#urlHint').innerHTML = t.hint;
  $('#welcome ol').innerHTML = t.welcome.map((x) => `<li>${x}</li>`).join('');
  $('#soundOpts').hidden = m === 'sticker';
  $('#fitField').hidden = m !== 'sticker';
  // aviso de que esta peça vai para a combinação
  let banner = $('#comboBanner');
  if (!banner) { banner = document.createElement('div'); banner.id = 'comboBanner'; banner.className = 'mode-hint'; $('#studioMain').prepend(banner); }
  banner.hidden = !comboReturn;
  if (comboReturn) {
    banner.innerHTML = `🌀 Criando a peça de <b>${comboReturn === 'visual' ? 'imagem' : 'som'}</b> para a Combinação Caótica. Assim que criar, ela volta sozinha para lá. <button class="btn small ghost" id="cancelCombo" type="button">cancelar</button>`;
    $('#cancelCombo').onclick = () => { comboReturn = null; banner.hidden = true; };
  }
  if (vid.kind) {
    if (m === 'sticker' && !isPicture() && sel.end - sel.start > STICK_ANIM_MAX) { sel.end = sel.start + STICK_ANIM_MAX; recenter(); }
    render();
  }
}
$('#modeTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]'); if (!b) return;
  if (b.dataset.mode === 'combo') comboReturn = null; // voltou para a combinação por conta própria
  setMode(b.dataset.mode);
});
function setFit(f) {
  fit = f === 'pad' ? 'pad' : 'crop';
  $$('#fitSeg button').forEach((x) => x.classList.toggle('on', x.dataset.fit === fit));
  frameKey = null;
  schedulePreview();
}
$('#fitSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-fit]'); if (b) setFit(b.dataset.fit);
});

// ============ ✂️ tirar o fundo (editor com IA no navegador: public/bgeditor.js) ============
$('#bgBtn').onclick = async () => {
  const btn = $('#bgBtn');
  if (!vid.kind || !vid.hasVideo) return;
  const { openBgEditor } = await import('./bgeditor.js');
  const name = ($('#title').value.trim() || vid.title || 'figurinha').slice(0, 50);

  // FOTO: o editor devolve um PNG transparente, que vira a nova origem (enquadramento "inteiro")
  if (vid.media === 'image') {
    openBgEditor({ mode: 'photo', src: `/api/sources/${vid.sourceId}/media`, onDone: async ({ blob }) => {
      try {
        const fd = new FormData();
        fd.append('file', new File([blob], `${name} sem fundo.png`, { type: 'image/png' }));
        const { jobId } = await uploadWithProgress('/api/sources/upload', fd, () => {});
        const { source } = await pollJob(jobId);
        setFit('pad');
        keepTextOv = true;
        openSource(source);
        $('#title').value = `${name} sem fundo`.slice(0, 80); delete $('#title').dataset.auto;
        toast('Fundo removido! Confira a prévia e clique em Criar ✂️', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    } });
    return;
  }

  // VÍDEO / GIF / YouTube: o servidor separa os quadros, o editor recorta a pessoa em cada um
  const start = vid.media === 'gif' ? 0 : sel.start;
  const end = vid.media === 'gif' ? Math.min(STICK_ANIM_MAX, vid.duration) : sel.end;
  if (end - start > STICK_ANIM_MAX + 0.05) return toast(`Para tirar o fundo, marque um trecho de até ${STICK_ANIM_MAX}s.`, 'err');
  btn.disabled = true; btn.textContent = 'Separando os quadros…';
  let fr;
  try {
    fr = await api('/api/frames', { method: 'POST', body: JSON.stringify({ sourceId: isYT() ? undefined : vid.sourceId, url: isYT() ? vid.url : undefined, start, end }) });
  } catch (err) { toast(err.message, 'err'); return; }
  finally { btn.disabled = false; btn.textContent = '✂️ Tirar o fundo'; }
  stopPreview();
  openBgEditor({ mode: 'frames', token: fr.token, count: fr.count, fps: fr.fps, onDone: async ({ frames }) => {
    const prog = $('#progress');
    prog.hidden = false;
    for (const li of $$('li', prog)) { li.hidden = li.dataset.step !== 'visual'; li.className = li.dataset.step === 'visual' ? 'active' : ''; }
    $('li[data-step="visual"]', prog).textContent = 'Montando a figurinha sem fundo';
    try {
      const fd = new FormData();
      frames.forEach((b, i) => fd.append('frames', b, `${String(i + 1).padStart(4, '0')}.png`));
      const overlayId = await uploadTextOverlay();
      if (overlayId) fd.append('overlayId', overlayId);
      for (const [k, v] of Object.entries({ title: `${name} sem fundo`, emoji, tags: $('#tags').value, fps: fr.fps, start, end,
        ...(isYT() ? { url: vid.url } : { sourceId: vid.sourceId }) })) fd.append(k, String(v));
      const { jobId } = await uploadWithProgress(`/api/frames/${fr.token}/result`, fd, () => {});
      const { sticker } = await pollJob(jobId);
      if (createPackSel.size) await api(`/api/stickers/${sticker.id}/packs`, { method: 'PUT', body: JSON.stringify({ packs: [...createPackSel] }) });
      $('li[data-step="visual"]', prog).className = 'done';
      await loadCollection(sticker.id);
      if (comboReturn) backToCombo(sticker); else showCreated(sticker);
    } catch (err) { toast(err.message, 'err'); }
    setTimeout(() => { prog.hidden = true; }, 1200);
  } });
};

// ============ 🔤 texto e emoji ============
function setTextOverlay(layers, blob) {
  if (textOv.url) URL.revokeObjectURL(textOv.url);
  Object.assign(textOv, { layers, blob, url: blob ? URL.createObjectURL(blob) : null });
  const img = $('#prevOv');
  if (textOv.url) img.src = textOv.url; else img.removeAttribute('src');
  $('#stickerPrev').classList.toggle('has-ov', !!blob);
  const b = $('#txtBtn');
  b.classList.toggle('on', !!blob);
  b.textContent = blob ? `🔤 Texto e emoji (${layers.length})` : '🔤 Texto e emoji';
}
/** Manda a camada para o servidor (vale para UMA criação) e devolve o id, ou undefined se não houver texto. */
async function uploadTextOverlay() {
  if (!textOv.blob) return undefined;
  const fd = new FormData();
  fd.append('overlay', textOv.blob, 'texto.png');
  const r = await fetch('/api/overlays', { method: 'POST', body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Não consegui enviar o texto da figurinha.');
  return data.id;
}
$('#txtBtn').onclick = async () => {
  if (!vid.kind) return;
  stopPreview();
  const { openTextEditor } = await import('./texteditor.js');
  openTextEditor({
    bg: $('#prevImg').src, pad: mode === 'sticker' && fit === 'pad', layers: textOv.layers,
    onDone: ({ layers, blob }) => {
      setTextOverlay(layers, blob);
      if (blob) toast('Texto pronto! Ele vai em cima da figurinha inteira 🔤', 'ok');
    },
  });
};

/** Figurinha que já existe → abre no Stick para tirar o fundo (vira uma CÓPIA; a original fica). */
async function bgFromSticker(s) {
  closeModal();
  try {
    const src = await api(`/api/stickers/${s.id}/as-source`, { method: 'POST' });
    setMode('sticker');
    openSource(src);
    if (src.media === 'video') { sel.start = 0; sel.end = Math.min(STICK_ANIM_MAX, src.duration); recenter(); render(); }
    $('#title').value = s.title; delete $('#title').dataset.auto;
    scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => $('#bgBtn').click(), 500);
  } catch (err) { toast(err.message, 'err'); }
}

// ============ Combinação Caótica ============
/** Limite do som na combinação: 5 s com imagem animada, 10 s com imagem parada. */
const soundLimit = () => (combo.visual && !combo.visual.animated ? STICKER_MAX : combo.visual ? ANIM_SOUND_MAX : STICKER_MAX);
function slotHtml(slot) {
  const s = combo[slot];
  const isV = slot === 'visual';
  const head = `<div class="slot-head"><span class="n">${isV ? 1 : 2}</span>${isV ? '🖼️ Imagem' : '🔊 Som'}</div>`;
  if (!s) {
    return `${head}<p class="small dim" style="margin:0">${isV ? 'A cara da figurinha: da coleção ou nova (foto, GIF ou trecho de vídeo).' : `O som que ela vai fazer (até ${soundLimit()}s): da coleção ou recortado agora.`}</p>
      <div class="stack">
        <button class="btn" type="button" data-c="pick">🗂️ Escolher da coleção</button>
        <button class="btn" type="button" data-c="file">${isV ? '📁 Foto, GIF ou vídeo do computador' : '📁 Áudio ou vídeo do computador'}</button>
        <button class="btn" type="button" data-c="new">${isV ? '✂️ Recortar de um vídeo (aba Stick)' : '✂️ Recortar de um vídeo ou áudio (aba Audio Stick)'}</button>
      </div>
      <p class="slot-drop">📋 Ou <b>arraste</b> para cá, ou passe o mouse aqui e aperte <b>CTRL+V</b> (imagem copiada, arquivo ou link)</p>`;
  }
  return `${head}<div class="slot-card">
      <button class="slot-thumb" type="button" data-c="${isV ? 'view' : 'listen'}" title="${isV ? 'Imagem escolhida' : 'Ouvir o som'}">${s.visual ? `<img src="/media/${s.id}.webp" alt="">` : esc(s.emoji)}</button>
      <div class="t">${esc(s.title)}</div>
      <div class="m">${isV ? (s.animated ? 'animada' : 'parada') : `${s.duration.toFixed(1)}s de som · toque para ouvir`}${combo.temp.has(s.id) ? ' · peça nova' : ''}</div>
      <div class="row"><button class="btn small" type="button" data-c="pick">Trocar</button>${isV ? '<button class="btn small" type="button" data-c="bg">✂️ Sem fundo</button>' : ''}<button class="btn small ghost" type="button" data-c="clear">Remover</button></div>
    </div>`;
}

function renderCombo() {
  for (const slot of ['visual', 'audio']) {
    const el = $(slot === 'visual' ? '#slotVisual' : '#slotAudio');
    el.innerHTML = slotHtml(slot);
    el.classList.toggle('filled', !!combo[slot]);
  }
  const ready = !!(combo.visual && combo.audio);
  $('#comboOut').hidden = !ready;
  if (!ready) return;
  // imagem animada + som > 5s não vira figurinha com som no WhatsApp
  const tooLongSound = combo.audio.duration > soundLimit() + 0.05;
  let warn = $('#comboWarn');
  if (!warn) { warn = document.createElement('div'); warn.id = 'comboWarn'; warn.className = 'mode-hint'; $('#comboOut').prepend(warn); }
  warn.hidden = !tooLongSound;
  warn.innerHTML = tooLongSound ? `⚠️ O som tem <b>${combo.audio.duration.toFixed(1)}s</b>, mas com imagem <b>animada</b> o WhatsApp aceita até <b>5s</b>. Troque por um som mais curto ou por uma imagem parada (foto), que aceita até 10s.` : '';
  $('#comboBtn').disabled = tooLongSound;
  $('#comboImg').src = `/media/${combo.visual.id}.webp`;
  const title = $('#comboTitle');
  if (!title.value || title.dataset.auto) { title.value = `${combo.visual.title} + ${combo.audio.title}`.slice(0, 80); title.dataset.auto = '1'; }
  const temps = [combo.visual, combo.audio].filter((p) => combo.temp.has(p.id));
  $('#comboDeleteRow').hidden = !temps.length;
  $('#comboDeleteTxt').textContent = `Apagar ${temps.length === 1 ? 'a peça criada' : 'as 2 peças criadas'} só para esta combinação (não acumula repetidas)`;
  packPicker($('#comboPacks'), comboPackSel);
}
$('#comboTitle').addEventListener('input', () => delete $('#comboTitle').dataset.auto);

/** Abre a combinação já com uma peça encaixada (atalho das janelas de figurinha). */
function openComboWith({ visual, audio }) {
  closeModal();
  if (visual) combo.visual = visual;
  if (audio) combo.audio = audio;
  setMode('combo');
  scrollTo({ top: 0, behavior: 'smooth' });
}

/** Peça criada numa das outras abas para a combinação: volta e encaixa. */
function backToCombo(s) {
  const slot = comboReturn;
  const fits = slot === 'visual' ? s.visual : s.hasAudio && s.duration <= soundLimit() + 0.05;
  if (!fits) {
    toast(slot === 'visual' ? 'Essa peça ficou sem imagem. Tente de novo na aba Stick.' : `Para a combinação, o som precisa ter até ${soundLimit()}s. Recorte um trecho menor.`, 'err');
    return; // continua na aba para tentar de novo
  }
  comboReturn = null;
  combo[slot] = s;
  combo.temp.add(s.id);
  setMode('combo');
  toast('Peça pronta! De volta à Combinação Caótica 🌀', 'ok');
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function pickForCombo(slot) {
  let all;
  try { ({ stickers: all } = await api('/api/stickers')); } catch (err) { return toast(err.message, 'err'); }
  const isV = slot === 'visual';
  const usable = (s) => (isV ? s.visual : s.hasAudio && s.duration <= soundLimit() + 0.05);
  const list = all.filter((s) => (isV ? s.visual : s.hasAudio));
  openModal(`<h3>${isV ? '🖼️ Escolha a imagem' : '🔊 Escolha o som'}</h3>
    <p class="small">${isV ? 'Qualquer figurinha com imagem: Stick, Audio Stick animado ou outra combinação.' : `Qualquer figurinha com som de até ${soundLimit()}s${combo.visual?.animated ? ' (a imagem escolhida é animada: o WhatsApp aceita até 5s de som)' : ''}.`}</p>
    <input id="pkSearch" type="search" placeholder="Buscar por nome ou tag…" autocomplete="off">
    <div class="pick-grid" id="pickGrid"></div>`, (b) => {
    const norm = (x) => String(x || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const draw = () => {
      const q = norm($('#pkSearch', b).value);
      const shown = list.filter((s) => !q || norm(s.title).includes(q) || s.tags.some((t) => norm(t).includes(q)));
      $('#pickGrid', b).innerHTML = shown.map((s) => `<button class="pick-item" type="button" data-id="${s.id}" ${usable(s) ? '' : `disabled title="Som com mais de ${soundLimit()}s"`}>
          <span class="pt">${s.visual ? `<img src="/media/${s.id}.webp" alt="" loading="lazy">` : esc(s.emoji)}</span>
          <span class="pn">${esc(s.title)}</span>
          <span class="pm">${isV ? (s.hasAudio ? '🔊 tem som' : s.animated ? 'animada' : 'parada') : `${s.duration.toFixed(1)}s${usable(s) ? '' : ' · longo'}`}</span>
        </button>`).join('')
        || `<div class="picker-empty">${list.length ? 'Nada com esse nome.' : `Nada por aqui ainda. Use “${isV ? 'Foto ou GIF' : 'Recortar'}” para criar a peça.`}</div>`;
    };
    $('#pkSearch', b).addEventListener('input', draw);
    $('#pickGrid', b).onclick = (e) => {
      const it = e.target.closest('.pick-item'); if (!it || it.disabled) return;
      combo[slot] = list.find((s) => s.id === it.dataset.id);
      closeModal();
      renderCombo();
    };
    draw();
    setTimeout(() => $('#pkSearch', b)?.focus(), 50);
  });
}

// Arquivo, imagem colada ou link direto numa caixa da combinação: vira uma peça nova e já encaixa.
// Vídeo/áudio mais longo que o limite abre a aba certa para marcar o trecho (e volta encaixado).
let comboFileSlot = 'visual';
$('#comboFile').onchange = (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (f) comboTake(comboFileSlot, { file: f });
};
async function comboTake(slot, inp) {
  const isV = slot === 'visual';
  const el = $(isV ? '#slotVisual' : '#slotAudio');
  const busy = (msg) => { el.innerHTML = `<div class="slot-head"><span class="n">${isV ? 1 : 2}</span>${isV ? '🖼️ Imagem' : '🔊 Som'}</div><p class="small"><span class="spin-inline"></span> ${msg}</p>`; };
  const cutInTab = (open) => {
    comboReturn = slot;
    setMode(isV ? 'sticker' : 'audio');
    open();
    scrollTo({ top: 0, behavior: 'smooth' });
    toast(`Marque o trecho (até ${isV ? STICK_ANIM_MAX : soundLimit()}s) e clique em Criar: ele volta para a combinação 🌀`);
  };
  try {
    let file = inp.file;
    if (!file) {
      if (isV && looksLikeImageUrl(inp.url)) { busy('Baixando a imagem…'); file = await imageUrlToFile(inp.url); }
      if (!file) return cutInTab(() => { $('#url').value = inp.url; loadAny(inp.url); }); // link de vídeo
    }
    busy('Enviando…');
    const source = await uploadSourceFile(file, busy);
    if (isV && !source.hasVideo) throw new Error('Esse arquivo não tem imagem. Solte-o na caixa do Som.');
    if (!isV && !source.hasAudio) throw new Error('Esse arquivo não tem som. Solte-o na caixa da Imagem.');
    const limit = isV ? STICK_ANIM_MAX : soundLimit();
    const fixed = isV && (source.media === 'image' || source.media === 'gif'); // foto e GIF não precisam de trecho
    if (!fixed && source.duration > limit + 0.05) return cutInTab(() => openSource(source));
    busy('Criando a peça…');
    const body = isV
      ? { mode: 'sticker', sourceId: source.id, fit: 'crop', title: source.title, emoji: '🌀', start: 0, end: source.media === 'image' ? 0 : Math.min(STICK_ANIM_MAX, source.duration || STICK_ANIM_MAX) }
      : { sourceId: source.id, start: 0, end: Math.min(limit, source.duration), title: source.title, videoTitle: source.title, emoji: '🔊', makeVisual: false };
    const { jobId } = await api('/api/stickers', { method: 'POST', body: JSON.stringify(body) });
    const { sticker } = await pollJob(jobId);
    combo[slot] = sticker; combo.temp.add(sticker.id);
    await loadCollection();
    toast(isV ? 'Imagem encaixada 🖼️' : 'Som encaixado 🔊', 'ok');
  } catch (err) { toast(err.message, 'err'); }
  renderCombo();
}

const comboAudio = new Audio();
function playCombo() {
  if (!combo.audio) return;
  comboAudio.pause();
  comboAudio.src = `/media/${combo.audio.id}.ogg`;
  const img = $('#comboImg');
  const btn = $('#comboPrev');
  btn.classList.add('on');
  let started = false;
  const go = () => { if (!started) { started = true; comboAudio.play().catch(() => {}); } };
  if (combo.visual) { img.addEventListener('load', go, { once: true }); img.src = `/media/${combo.visual.id}.webp?play=${Date.now()}`; setTimeout(go, 500); } else go();
}
comboAudio.addEventListener('ended', () => $('#comboPrev').classList.remove('on'));
$('#comboPrev').onclick = playCombo;

$('#comboPanel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  const slot = b.closest('.slot')?.dataset.slot;
  const c = b.dataset.c;
  if (c === 'pick') pickForCombo(slot);
  else if (c === 'clear') { combo[slot] = null; renderCombo(); }
  else if (c === 'file') {
    comboFileSlot = slot;
    $('#comboFile').accept = slot === 'visual' ? 'image/*,.gif,.webp,video/*' : 'audio/*,video/*';
    $('#comboFile').click();
  }
  else if (c === 'bg') { const v = combo.visual; comboReturn = 'visual'; bgFromSticker(v); }
  else if (c === 'listen') { comboAudio.pause(); comboAudio.src = `/media/${combo.audio.id}.ogg`; comboAudio.play().catch(() => {}); }
  else if (c === 'new') {
    comboReturn = slot;
    setMode(slot === 'visual' ? 'sticker' : 'audio');
    toast(slot === 'visual' ? 'Escolha uma foto, GIF ou vídeo e crie a figurinha: ela volta para a combinação 🌀' : `Recorte o som (até ${soundLimit()}s) e crie: ele volta para a combinação 🌀`);
    scrollTo({ top: 0, behavior: 'smooth' });
  }
});

$('#comboBtn').onclick = async () => {
  if (!combo.visual || !combo.audio) return;
  const btn = $('#comboBtn');
  btn.disabled = true; btn.textContent = 'Combinando o caos…';
  try {
    const deleteIds = $('#comboDelete').checked ? [combo.visual.id, combo.audio.id].filter((id) => combo.temp.has(id)) : [];
    const r = await api('/api/combos', { method: 'POST', body: JSON.stringify({
      visualId: combo.visual.id, audioId: combo.audio.id, title: $('#comboTitle').value.trim(), tags: $('#comboTags').value, deleteIds,
    }) });
    if (comboPackSel.size) await api(`/api/stickers/${r.sticker.id}/packs`, { method: 'PUT', body: JSON.stringify({ packs: [...comboPackSel] }) });
    const rect = btn.getBoundingClientRect();
    burst('🌀', rect.left + rect.width / 2, rect.top);
    combo.visual = null; combo.audio = null; combo.temp.clear();
    $('#comboTitle').value = ''; $('#comboTags').value = '';
    await loadCollection(r.sticker.id);
    renderCombo();
    showCreated(r.sticker);
    if (r.deleted?.length) toast(`${r.deleted.length} peça${r.deleted.length > 1 ? 's' : ''} temporária${r.deleted.length > 1 ? 's' : ''} apagada${r.deleted.length > 1 ? 's' : ''} 🧹`);
  } catch (err) { toast(err.message, 'err'); }
  btn.disabled = false; btn.textContent = '🌀 Criar combinação caótica';
};

// ============ ajuda (?) ============
const HELP_TABS = {
  inicio: { label: '🚀 Começando', html: () => `
    <h4>Três jeitos de criar (abas no topo do estúdio)</h4>
    <div class="feat">
      <div class="card"><div class="t"><span>🎙️</span>Audio Stick</div><p>Um trecho de vídeo ou áudio vira <b>som</b> (e, até 10s, figurinha animada com som).</p></div>
      <div class="card"><div class="t"><span>🖼️</span>Stick</div><p><b>Só a figurinha</b>, sem som: de foto, GIF ou trecho de vídeo.</p></div>
      <div class="card"><div class="t"><span>🔤</span>Texto e emoji</div><p>Escreva na figurinha com a <b>fonte</b>, a <b>cor</b>, a <b>borda</b>, o <b>tamanho</b> e a <b>inclinação</b> que quiser, e cole <b>emojis</b>. Arraste para posicionar. Tem o atalho <b>Meme clássico</b> (em cima e embaixo). Vale para foto, GIF e vídeo.</p></div>
      <div class="card"><div class="t"><span>🌀</span>Combinação Caótica</div><p>A <b>imagem</b> de uma + o <b>som</b> de outra. Da coleção ou criadas na hora.</p></div>
    </div>
    <h4>Do vídeo à figurinha em 4 passos</h4>
    <div class="steps4">
      <div class="step4"><span class="n">1</span><div class="big">🔗</div><h5>Cole o link</h5><p>YouTube, Instagram, TikTok, X, Facebook… ou use <b>📁 Arquivo</b> / arraste um vídeo do PC.</p></div>
      <div class="step4"><span class="n">2</span><div class="big">✂️</div><h5>Marque o trecho</h5><p>Arraste as alças amarelas ou use <b>I</b> e <b>O</b>. O <b>▶</b> toca só o pedaço.</p></div>
      <div class="step4"><span class="n">3</span><div class="big">🎨</div><h5>Dê a cara</h5><p>Nome, emoji, tags e pacote. Até <b>5s</b> vira figurinha animada com som; até <b>10s</b>, parada com som.</p></div>
      <div class="step4"><span class="n">4</span><div class="big">📲</div><h5>Envie</h5><p>O botão verde manda para o WhatsApp de quem você escolheu em <b>Enviar para</b>.</p></div>
    </div>
    <h4>Como as peças se conectam</h4>
    <div class="flow">
      <div class="node"><div class="ico">🎬</div><span class="nt">Vídeo de origem</span>YouTube, Instagram, TikTok… ou um arquivo seu</div>
      <div class="arrow">→</div>
      <div class="node me"><div class="ico">💻</div><span class="nt">Audio Sticks</span>roda no <b>seu</b> PC: baixa, recorta e guarda</div>
      <div class="arrow">→</div>
      <div class="node"><div class="ico">💬</div><span class="nt">WhatsApp</span>conectado pelo QR, como o WhatsApp Web</div>
    </div>
    <p class="small">Nada passa por servidores de terceiros: suas figurinhas ficam no seu computador e o envio sai direto da sua conta.</p>
    <h4>De onde dá para tirar o som</h4>
    <div class="feat">
      <div class="card"><div class="t"><span>▶️</span>YouTube</div><p>Abre na hora, sem baixar antes. Links com tempo (<b>?t=90</b>) já começam no ponto certo.</p></div>
      <div class="card"><div class="t"><span>📸</span>Instagram, TikTok, X, Facebook, Kwai…</div><p>Cole o link: o app <b>baixa o vídeo</b> (alguns segundos) e você recorta igual. Posts privados ou que pedem login não funcionam — baixe e use “Arquivo”.</p></div>
      <div class="card"><div class="t"><span>📁</span>Arquivo do seu PC</div><p>Botão <b>Arquivo</b> ou arraste para o estúdio. Vídeo (mp4, mov, webm, mkv…) ou áudio (mp3, m4a, wav, ogg…). Só áudio vira figurinha de áudio.</p></div>
    </div>
    <h4>Primeira vez? Conecte o WhatsApp</h4>
    <p>Clique no botão do <b>status</b> (no topo, à esquerda do Tour) → <b>Gerar QR code</b> → no celular: <b>Configurações → Aparelhos conectados → Conectar aparelho</b>. Fica conectado até você desconectar.</p>` },

  recursos: { label: '✨ Recursos', html: () => `
    <div class="feat">
      <div class="card"><div class="t"><span>🎞️</span>Figurinha com som</div><p>Trechos de até <b>5s</b> viram figurinha <b>animada</b> com som; de <b>5 a 10s</b>, figurinha <b>parada</b> com som (limites do WhatsApp).</p><span class="tag">experimental</span></div>
      <div class="card"><div class="t"><span>🖼️</span>Stick (só a figurinha)</div><p>Figurinha <b>sem som</b> de uma <b>foto</b> (parada), de um <b>GIF</b> ou de um trecho de <b>vídeo</b> de até 10s (animada). Dá para <b>recortar quadrado</b> ou mostrar <b>inteira, com fundo transparente</b>.</p></div>
      <div class="card"><div class="t"><span>✂️</span>Tirar o fundo</div><p>Como no WhatsApp: a IA recorta <b>pessoas</b> sozinha (até em <b>vídeo e GIF</b>, quadro a quadro) ou você <b>toca no que manter</b>. Tem pincel, sensibilidade e <b>borda branca</b>. Roda no seu navegador.</p></div>
      <div class="card"><div class="t"><span>🌀</span>Combinação Caótica</div><p>Junte a <b>imagem</b> de uma figurinha com o <b>som</b> de outra (até 10s). Cada peça vem da coleção ou é criada na hora. As peças criadas só para isso podem ser apagadas depois.</p></div>
      <div class="card"><div class="t"><span>🎙️</span>Áudio (mensagem de voz)</div><p>Trechos de até <b>60s</b> viram áudio com a ondinha desenhada, como se você tivesse gravado.</p></div>
      <div class="card"><div class="t"><span>📦</span>Pacotes</div><p>Organize por categoria (Memes, Futebol…). Uma figurinha pode estar em vários. Envie o pacote inteiro de uma vez.</p></div>
      <div class="card"><div class="t"><span>🎯</span>Enviar para</div><p>Você, um <b>contato</b>, um <b>grupo</b> ou um <b>número</b> digitado. O destino vale para todos os botões até você trocar.</p></div>
      <div class="card"><div class="t"><span>🧩</span>.wastickers</div><p>Baixe um pacote no formato que apps de figurinhas (ex.: Sticker Maker) adicionam ao WhatsApp como <b>pacote de verdade</b> (sem som).</p></div>
      <div class="card"><div class="t"><span>🗂️</span>Exportar / Importar</div><p>Um <b>.zip</b> com figurinhas e pacotes para backup ou para dar a um amigo que também usa o Audio Sticks.</p></div>
      <div class="card"><div class="t"><span>🔗</span>Link da figurinha</div><p>Cada figurinha tem uma página para ouvir e baixar. Útil quando o app está exposto pelo túnel.</p></div>
      <div class="card"><div class="t"><span>🖥️</span>Bandeja do Windows</div><p>No executável, o app vive num ícone perto do relógio: abrir, pasta, registro, trocar porta e sair.</p></div>
    </div>` },

  atalhos: { label: '⌨️ Atalhos', html: () => `
    <table class="keys-table">
      <tr><td><kbd>I</kbd></td><td>Marca o <b>início</b> do trecho no ponto atual do vídeo</td></tr>
      <tr><td><kbd>O</kbd></td><td>Marca o <b>fim</b> do trecho</td></tr>
      <tr><td><kbd>espaço</kbd></td><td>Ouve só o trecho marcado (de novo para parar)</td></tr>
      <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>Volta / avança 1 segundo no vídeo</td></tr>
      <tr><td><kbd>shift</kbd> + <kbd>←</kbd> <kbd>→</kbd></td><td>Ajuste fino de 0,1 segundo</td></tr>
      <tr><td><kbd>1</kbd> … <kbd>9</kbd></td><td>Toca as primeiras figurinhas da coleção (mesa de som)</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Fecha janelas e o tour</td></tr>
      <tr><td><kbd>Ctrl</kbd> + <kbd>V</kbd></td><td>Cola uma <b>imagem copiada</b> (botão direito → Copiar imagem, ou um print), um arquivo ou um link, sem precisar salvar. Na Combinação, cai na caixa em que o mouse está</td></tr>
    </table>
    <h4>Dicas de recorte</h4>
    <ul>
      <li>Soltar a <b>alça do fim</b> toca o último segundo e meio, para conferir o corte.</li>
      <li>Arraste o <b>meio</b> da seleção para mover o trecho inteiro sem mudar o tamanho.</li>
      <li>Em <b>Ajustes de som</b>: volume equalizado, entrada/saída suave e reforço de volume.</li>
    </ul>` },

  duvidas: { label: '❓ Dúvidas', html: () => `
    <div class="faq">
      <details open><summary>É de graça mesmo?</summary><p>Sim. Tudo roda no seu PC com ferramentas gratuitas (yt-dlp, ffmpeg) e a conexão com o WhatsApp é gratuita, como o WhatsApp Web.</p></details>
      <details><summary>A figurinha com som chegou como “não suportada”. E agora?</summary><p>O WhatsApp lançou esse formato em 24/11/2026 e ainda não existe suporte oficial para enviá-lo por aplicativos como este — por isso é experimental. Alternativas: <b>Enviar só a figurinha</b> (sem som), mandar como <b>áudio</b>, ou baixar o <b>vídeo .mp4</b> e criar a figurinha com som no próprio WhatsApp (Figurinhas → Criar).</p></details>
      <details><summary>Meu número pode ser bloqueado?</summary><p>A conexão não é oficial. Mandar para você mesmo é de baixíssimo risco. Para outras pessoas e grupos o risco cresce se você disparar muita coisa para muita gente — o app já espaça os envios de pacotes.</p></details>
      <details><summary>Onde ficam minhas figurinhas?</summary><p>No executável: <b>%LOCALAPPDATA%\\Audio Sticks\\data</b> (veja em ⚙ Configurações ou no menu da bandeja → Abrir pasta). Rodando pelo código: na pasta <b>data</b> do projeto.</p></details>
      <details><summary>Não aparecem meus contatos.</summary><p>Em <b>Enviar para → Contatos</b>, clique em <b>Buscar meus contatos no WhatsApp</b>. Se ainda faltar alguém, use a aba <b>Número</b>.</p></details>
      <details><summary>Como tiro o fundo de uma figurinha?</summary><p>Na aba <b>Stick</b>, depois de carregar a foto, GIF ou vídeo, clique em <b>✂️ Tirar o fundo</b> (embaixo da prévia). Para uma figurinha que já existe: botão amarelo → <b>Tirar o fundo (cria uma cópia)</b>. Na primeira vez a IA é baixada (~22 MB, precisa de internet).</p></details>
      <details><summary>Como escrevo na figurinha?</summary><p>No passo 3, embaixo da prévia, clique em <b>🔤 Texto e emoji</b>. Use <b>＋ Texto</b>, <b>＋ Emoji</b> ou <b>Meme clássico</b>, arraste no quadro para posicionar e clique em <b>Usar</b>. O texto aparece na prévia e fica fixo por cima da animação inteira. Ele vale até você trocar de vídeo ou foto.</p></details>
      <details><summary>Por que o nome (ou a legenda) não aparece no WhatsApp?</summary><p>Figurinha <b>não tem legenda</b> no WhatsApp, nem quando vem de um GIF. O app grava o <b>nome</b> e o <b>emoji</b> dentro da figurinha: quem recebe vê ao <b>tocar nela</b> no celular (o nome aparece como nome do pacote, e o autor como "Audio Sticks"). Para ler na conversa, escreva o texto <b>na imagem</b> com <b>🔤 Texto e emoji</b>.</p></details>
      <details><summary>Dá para colar uma imagem sem salvar?</summary><p>Dá. Copie a imagem (botão direito → <b>Copiar imagem</b>, ou um print) e aperte <b>Ctrl+V</b> no app. Também dá para <b>arrastar</b> uma imagem direto de outra página. Na <b>Combinação Caótica</b>, passe o mouse na caixa (Imagem ou Som) antes de colar, ou arraste para ela. Para GIF <b>animado</b>, arraste o GIF ou cole o <b>link</b> dele: ao copiar a imagem, o navegador só guarda o primeiro quadro.</p></details>
      <details><summary>Qual o tempo máximo?</summary><p>Figurinha <b>animada</b>: até <b>10s</b>. Figurinha com som: até <b>5s</b> de som se for animada e até <b>10s</b> se for parada (regras do WhatsApp). Áudio (mensagem de voz): até 60s.</p></details>
      <details><summary>O app vai acumulando arquivos?</summary><p>Não muito: vídeos baixados ou enviados ficam num cache que se limpa sozinho (no máximo 25 e nada com mais de 7 dias), e dá para limpar tudo em <b>⚙ Configurações → Limpar cache</b>. Na Combinação Caótica, as peças criadas só para ela podem ser apagadas automaticamente.</p></details>
      <details><summary>Quais sites funcionam?</summary><p>Além do YouTube: Instagram, TikTok, X/Twitter, Facebook, Kwai, Reddit, Twitch, SoundCloud, Dailymotion e centenas de outros (tudo que o <b>yt-dlp</b> suporta). Conteúdo privado, de “melhores amigos” ou que exige login não dá — nesse caso, salve o vídeo no celular/PC e use <b>📁 Arquivo</b>.</p></details>
      <details><summary>O Instagram/TikTok deu erro.</summary><p>Esses sites mudam com frequência e às vezes pedem login. Feche e abra o app (o baixador se atualiza sozinho) e tente de novo. Se persistir, baixe o vídeo e envie como arquivo.</p></details>
      <details><summary>O YouTube parou de baixar.</summary><p>O YouTube muda com frequência. O app atualiza o yt-dlp sozinho ao abrir; feche e abra de novo. Pelo código, rode <b>npm run setup</b>.</p></details>
      <details><summary>A página não abre / outro programa usa a mesma porta.</summary><p>Troque a porta em <b>⚙ Configurações</b> ou no menu da bandeja → <b>Trocar porta…</b>. Ao abrir, se a porta estiver ocupada por outro programa, o app já escolhe a próxima livre sozinho.</p></details>
      <details><summary>Como uso no celular?</summary><p>No mesmo Wi-Fi, abra o endereço “no celular” mostrado em ⚙ Configurações. Para usar fora de casa, veja a seção do túnel no LEIAME.</p></details>
    </div>` },
};

async function openHelp(tab = 'inicio') {
  let info = {};
  try { info = await api('/api/settings'); } catch { /* sem info */ }
  openModal(`
    <div class="help-hero">
      <span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <h3>Como o Audio Sticks funciona</h3>
      <p>Transforme qualquer trecho de vídeo — YouTube, Instagram, TikTok ou um arquivo seu — em figurinha de áudio e mande para o WhatsApp em um clique.</p>
      <div class="hero-actions"><button class="btn primary" id="hTour">🧭 Fazer o tour guiado</button><button class="btn" id="hSet">⚙ Configurações</button></div>
    </div>
    <nav class="help-tabs" id="hTabs">${Object.entries(HELP_TABS).map(([k, t]) => `<button data-k="${k}">${t.label}</button>`).join('')}</nav>
    <div class="help-body" id="hBody"></div>`, (b) => {
    const show = (k) => {
      $$('#hTabs button', b).forEach((x) => x.classList.toggle('on', x.dataset.k === k));
      $('#hBody', b).innerHTML = HELP_TABS[k].html() + `<div class="help-foot"><span>Audio Sticks ${esc(info.version || '')} · <a href="${REPO_URL}" target="_blank" rel="noopener">código no GitHub ↗</a></span><span>${info.url ? `Aberto em ${esc(info.url)}` : ''}</span></div>`;
    };
    $('#hTabs', b).onclick = (e) => { const x = e.target.closest('button'); if (x) show(x.dataset.k); };
    $('#hTour', b).onclick = () => { closeModal(); startTour(); };
    $('#hSet', b).onclick = () => openSettings();
    show(tab);
  }, { wide: true });
}
$('#helpBtn').onclick = () => openHelp();

// ============ configurações (⚙) ============
const mb = (bytes) => `${((bytes || 0) / 1e6).toFixed((bytes || 0) < 1e7 ? 1 : 0)} MB`;
async function openSettings() {
  let s;
  try { s = await api('/api/settings'); } catch (err) { return toast(err.message, 'err'); }
  openModal(`<div class="set-body">
    <h3>⚙ Configurações</h3>
    <div class="set-sec">
      <h4>🔌 Porta do aplicativo</h4>
      <p>O Audio Sticks funciona como um pequeno site no seu PC, num “número de porta”. Se outro programa usar a mesma porta, troque aqui — a mudança é na hora, sem reiniciar.</p>
      <div class="set-row">
        <span class="url-pill">Agora: ${esc(s.url)}</span>
      </div>
      <div class="set-row" style="margin-top:10px">
        <input id="sPort" type="number" min="1024" max="65535" value="${s.port}" ${s.envPort ? 'disabled' : ''} aria-label="Nova porta">
        <button class="btn primary" id="sPortGo" ${s.envPort ? 'disabled' : ''}>Trocar porta</button>
        <button class="btn ghost small" id="sPortRand" ${s.envPort ? 'disabled' : ''} title="Sugerir uma porta pouco usada">🎲 sugerir</button>
      </div>
      ${s.envPort ? '<p style="margin:10px 0 0">A porta está fixada pela variável de ambiente <b>PORT</b>.</p>' : '<p style="margin:10px 0 0" class="small">Portas comuns livres: 3000–3999, 8000–8999. A escolha fica salva para as próximas vezes.</p>'}
      ${s.isExe ? '<p style="margin:8px 0 0" class="small">Também dá para trocar pelo ícone da bandeja → <b>Trocar porta…</b> (útil se a página nem abrir).</p>' : ''}
    </div>
    <div class="set-sec">
      <h4>📱 Abrir no celular (mesmo Wi-Fi)</h4>
      <div class="set-list">${(s.lanUrls || []).map((u) => `<span class="url-pill">${esc(u)}</span>`).join('') || '<span class="dim small">Nenhuma rede encontrada.</span>'}</div>
    </div>
    <div class="set-sec">
      <h4>🗂️ Seus dados${s.portable ? ' <span class="tag-exp" style="margin:0;background:var(--panel2)">modo portátil</span>' : ''}</h4>
      <p>Figurinhas, pacotes, configurações e a conexão do WhatsApp ficam aqui:</p>
      <div class="mono-path">${esc(s.dataDir)}</div>
      <div class="set-row" style="margin-top:10px"><button class="btn small" id="sFolder">📂 Abrir pasta</button><a class="btn small" href="/api/export">⬇ Fazer backup (.zip)</a></div>
      <p style="margin:12px 0 8px">Sua coleção ocupa <b>${mb(s.collectionBytes)}</b>. O <b>cache</b> (vídeos baixados ou enviados, que servem para recortar de novo sem baixar outra vez) ocupa <b id="sCacheSize">${mb(s.cacheBytes)}</b>. Ele se limpa sozinho: no máximo 25 vídeos, nada com mais de 7 dias.</p>
      <div class="set-row"><button class="btn small" id="sClear">🧹 Limpar cache agora</button><span class="dim small">a coleção não é afetada</span></div>
    </div>
    ${s.isExe ? `<div class="set-sec">
      <h4>🖥️ Aplicativo</h4>
      <p>Status: <b style="color:var(--wa)">● rodando</b> em ${esc(s.url)} · WhatsApp ${waState.status === 'open' ? '<b>conectado</b>' : 'desconectado'}. O mesmo fica no ícone da bandeja (botão direito).</p>
      <div class="set-row"><button class="btn small" id="sRestart">🔄 Reiniciar</button><button class="btn small" id="sQuit" style="color:var(--danger)">⏻ Encerrar</button></div>
    </div>` : ''}
    <div class="set-sec">
      <h4>🧭 Ajuda</h4>
      <div class="set-row"><button class="btn small" id="sTour">Refazer o tour</button><button class="btn small" id="sHelp">Como funciona</button><a class="btn small" href="${REPO_URL}" target="_blank" rel="noopener">⭐ Projeto no GitHub</a><span class="dim small">versão ${esc(s.version)}</span></div>
    </div>
  </div>`, (b) => {
    const go = async () => {
      const port = Number($('#sPort', b).value);
      const btn = $('#sPortGo', b);
      btn.disabled = true; btn.textContent = 'Trocando…';
      try {
        const r = await api('/api/settings/port', { method: 'POST', body: JSON.stringify({ port }) });
        if (r.port === s.port) { btn.disabled = false; btn.textContent = 'Trocar porta'; return toast('Já está nessa porta.'); }
        toast(`Porta trocada! Indo para a porta ${r.port}…`, 'ok');
        // mantém o mesmo endereço (localhost ou IP da rede), só troca a porta
        setTimeout(() => { location.href = `${location.protocol}//${location.hostname}:${r.port}/`; }, 700);
      } catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.textContent = 'Trocar porta'; }
    };
    $('#sPortGo', b).onclick = go;
    $('#sPort', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    $('#sPortRand', b).onclick = () => { $('#sPort', b).value = 3000 + Math.floor(Math.random() * 6000) + 1000; };
    $('#sClear', b).onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { const r = await api('/api/cache/clear', { method: 'POST' }); $('#sCacheSize', b).textContent = '0 MB'; toast(`Cache limpo: ${mb(r.freed)} liberados 🧹`, 'ok'); }
      catch (err) { toast(err.message, 'err'); }
      btn.disabled = false;
    };
    $('#sFolder', b).onclick = () => api('/api/open-folder', { method: 'POST' }).then(() => toast('Pasta aberta no seu PC')).catch((e) => toast(e.message, 'err'));
    $('#sTour', b).onclick = () => { closeModal(); startTour(); };
    $('#sRestart', b)?.addEventListener('click', async () => {
      if (!(await confirmBox('Reiniciar o Audio Sticks?', 'Leva alguns segundos. A página volta sozinha quando ele estiver de pé.', 'Reiniciar'))) return;
      try { await api('/api/app/restart', { method: 'POST' }); } catch (err) { return toast(err.message, 'err'); }
      waitForComeback();
    });
    $('#sQuit', b)?.addEventListener('click', async () => {
      if (!(await confirmBox('Encerrar o Audio Sticks?', 'O app e o ícone da bandeja serão fechados. Para usar de novo, abra o Audio Sticks.exe.', 'Encerrar', true))) return;
      try { await api('/api/app/quit', { method: 'POST' }); } catch (err) { return toast(err.message, 'err'); }
      document.body.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px;font-family:var(--font)"><div><div style="font-size:48px">👋</div><h2 style="font-family:var(--display)">Audio Sticks encerrado</h2><p class="dim">Para usar de novo, abra o <b>Audio Sticks.exe</b>.</p></div></div>';
    });
    $('#sHelp', b).onclick = () => openHelp();
  }, { wide: true });
}
$('#settingsBtn').onclick = openSettings;

/** Depois de reiniciar: mostra o aviso e recarrega a página quando o app responder de novo. */
function waitForComeback() {
  openModal('<div style="text-align:center;padding:10px 0"><div class="qr" style="width:auto;height:auto;background:none;margin:0 0 10px"><div class="spin"></div></div><h3 style="padding:0">Reiniciando…</h3><p>A página volta sozinha em alguns segundos.</p></div>');
  const started = Date.now();
  const tryPing = async () => {
    try {
      const r = await fetch('/api/ping', { cache: 'no-store' });
      if (r.ok && Date.now() - started > 1500) return location.reload();
    } catch { /* ainda reiniciando */ }
    if (Date.now() - started < 60000) setTimeout(tryPing, 1000);
    else openModal('<h3>Não voltou sozinho</h3><p>Abra o Audio Sticks.exe de novo.</p>');
  };
  setTimeout(tryPing, 1200);
}

// ============ tour guiado ============
// Cada passo destaca um elemento (ou nenhum: cartão no centro). Passos cujo elemento não existe/está oculto são pulados.
function tourSteps() {
  const editorOn = !$('#editor').hidden;
  const hasCard = !!$('#grid .sticker');
  const steps = [
    { emoji: '👋', title: 'Bem-vindo ao Audio Sticks!', text: 'Em 1 minuto eu te mostro como transformar <b>trechos de vídeos</b> (YouTube, Instagram, TikTok ou arquivos seus) em <b>figurinhas de áudio</b> e mandar para o WhatsApp. Use as setas do teclado ou os botões.' },
    { el: '#modeTabs', emoji: '🧭', title: 'Três jeitos de criar', text: '<b>🎙️ Audio Stick</b>: trecho de vídeo vira som + figurinha. <b>🖼️ Stick</b>: só a figurinha, de foto, GIF ou vídeo. <b>🌀 Combinação Caótica</b>: a imagem de uma com o som de outra.' },
    { el: '#waPill', emoji: '💬', title: 'Conexão com o WhatsApp', text: 'Aqui você vê se o WhatsApp está conectado. Clique para ler o <b>QR code</b> uma única vez — igual ao WhatsApp Web.' },
    { el: '#urlForm', emoji: '🔗', title: '1. Cole o link ou envie um arquivo', text: '<b>YouTube</b> abre na hora; <b>Instagram, TikTok, X, Facebook</b> e outros são baixados antes. Ou clique em <b>📁 Arquivo</b> — dá até para arrastar um vídeo do PC para cá.' },
  ];
  if (editorOn) {
    steps.push(
      { el: '#zoom', emoji: '✂️', title: '2. Marque o trecho', text: 'Arraste as <b>alças amarelas</b> para o início e o fim. Arrastar o meio move o trecho inteiro. Atalhos: <b>I</b> e <b>O</b>.' },
      { el: '#previewBtn', emoji: '▶️', title: 'Ouça antes de criar', text: 'Toca <b>só o trecho marcado</b> (ou aperte <b>espaço</b>). Ligue <b>repetir</b> para ajustar no ouvido.' },
      { el: '.details', emoji: '🎨', title: '3. Dê a cara da figurinha', text: 'A prévia mostra como a figurinha vai ficar. Escolha <b>emoji</b>, <b>nome</b>, <b>tags</b> e em quais <b>pacotes</b> ela entra. Em <b>🔤 Texto e emoji</b>, escreva na figurinha com a fonte, a cor e a borda que quiser.' },
      { el: '#createBtn', emoji: '✨', title: 'Criar!', text: 'Até <b>5s</b> vira <b>figurinha animada com som</b>; até <b>10s</b>, figurinha parada com som; até 60s, <b>áudio</b>. Leva poucos segundos.' },
    );
  } else {
    steps.push({ el: '.studio', emoji: '✂️', title: '2 e 3. Recorte e personalize', text: 'Depois de colar o link, aparecem aqui o vídeo, a <b>régua com alças amarelas</b> para marcar o trecho, a <b>prévia</b> da figurinha e o botão <b>Criar</b>.' });
  }
  steps.push(
    { el: '.target-bar', emoji: '🎯', title: '4. Para quem enviar', text: 'Escolha o destino: <b>você</b>, um <b>contato</b>, um <b>grupo</b> ou um <b>número</b>. Vale para todos os botões de envio até você trocar.' },
    { el: '.pack-side', emoji: '📦', title: 'Pacotes', text: 'Crie categorias (Memes, Futebol…) e filtre a coleção. Com um pacote aberto, aparece <b>Enviar pacote</b> para mandar todas de uma vez.' },
  );
  if (hasCard) steps.push({ el: '#grid .sticker', emoji: '🎛️', title: 'Sua mesa de som', text: 'Toque na imagem para ouvir. <b>Verde</b> envia; <b>amarelo</b> abre as opções da figurinha com som; depois vêm favoritar, compartilhar, editar e excluir.' });
  steps.push(
    { el: '#helpBtn', emoji: '❓', title: 'Ajuda sempre à mão', text: 'Guia completo com recursos, atalhos e dúvidas frequentes.' },
    { el: '#githubBtn', emoji: '🐙', title: 'Projeto no GitHub', text: 'O código, as novidades e as versões para baixar ficam no GitHub. Deixa uma ⭐ lá!' },
    { el: '#settingsBtn', emoji: '⚙️', title: 'Configurações', text: 'Troque a <b>porta</b> se outro programa estiver usando a mesma, veja o endereço para abrir <b>no celular</b> e onde ficam seus dados.' },
    { emoji: '🎉', title: 'Pronto!', text: 'Agora é com você: cole um link e crie a sua primeira figurinha. Dá para refazer este tour no botão <b>Tour</b> lá em cima.' },
  );
  return steps.filter((s) => !s.el || ($(s.el) && $(s.el).getClientRects().length));
}

let tour = null;
function startTour() {
  endTour();
  closeModal();
  const steps = tourSteps();
  const block = document.createElement('div'); block.className = 'tour-block';
  const spot = document.createElement('div'); spot.className = 'tour-spot';
  const tip = document.createElement('div'); tip.className = 'tour-tip'; tip.setAttribute('role', 'dialog');
  document.body.append(block, spot, tip);
  tour = { steps, i: 0, block, spot, tip };
  block.onclick = () => go(1);
  tip.onclick = (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    if (b.dataset.t === 'next') go(1); else if (b.dataset.t === 'prev') go(-1); else endTour(true);
  };
  addEventListener('resize', placeTour);
  addEventListener('scroll', placeTour, true);
  showStep();
}
function go(d) {
  if (!tour) return;
  const n = tour.i + d;
  if (n >= tour.steps.length) return endTour(true);
  if (n < 0) return;
  tour.i = n; showStep();
}
function showStep() {
  const { steps, i, tip } = tour;
  const st = steps[i];
  const last = i === steps.length - 1;
  tip.innerHTML = `<div class="tt-emoji">${st.emoji}</div><h4>${st.title}</h4><p>${st.text}</p>
    <div class="tour-nav">
      <div class="tour-dots">${steps.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
      ${last ? '' : '<button class="tour-skip" data-t="skip">Pular</button>'}
      ${i ? '<button class="btn small" data-t="prev">Voltar</button>' : ''}
      <button class="btn primary small" data-t="next">${last ? 'Começar ✓' : i ? 'Próximo' : 'Vamos lá →'}</button>
    </div>`;
  const el = st.el && $(st.el);
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  placeTour();
  setTimeout(placeTour, 380); // depois da rolagem suave
}
function placeTour() {
  if (!tour) return;
  const { steps, i, spot, tip } = tour;
  const el = steps[i].el && $(steps[i].el);
  const pad = 8, gap = 14, tw = tip.offsetWidth, th = tip.offsetHeight;
  if (!el) {
    spot.className = 'tour-spot center';
    Object.assign(spot.style, { top: `${innerHeight / 2}px`, left: `${innerWidth / 2}px`, width: '0px', height: '0px' });
    Object.assign(tip.style, { top: `${Math.max(12, (innerHeight - th) / 2)}px`, left: `${Math.max(12, (innerWidth - tw) / 2)}px` });
    return;
  }
  spot.className = 'tour-spot';
  const r = el.getBoundingClientRect();
  Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height, innerHeight - 40) + pad * 2}px` });
  // balão: abaixo se couber, senão acima, senão ao lado/centro
  let top = r.bottom + pad + gap;
  if (top + th > innerHeight - 12) top = r.top - pad - gap - th;
  if (top < 12) top = Math.max(12, Math.min(innerHeight - th - 12, r.top + 12));
  const left = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), innerWidth - tw - 12);
  Object.assign(tip.style, { top: `${top}px`, left: `${left}px` });
}
function endTour(done = false) {
  if (!tour) return;
  tour.block.remove(); tour.spot.remove(); tour.tip.remove();
  removeEventListener('resize', placeTour);
  removeEventListener('scroll', placeTour, true);
  tour = null;
  if (done) { try { localStorage.setItem('sticks.tourDone', '1'); } catch { /* ok */ } }
}
addEventListener('keydown', (e) => {
  if (!tour) return;
  if (e.key === 'Escape') { e.stopImmediatePropagation(); endTour(true); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); go(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); go(-1); }
}, true);
$('#tourBtn').onclick = startTour;

// Primeira visita: abre o tour sozinho (uma vez)
setTimeout(() => {
  let seen = false;
  try { seen = !!localStorage.getItem('sticks.tourDone'); } catch { seen = true; }
  if (!seen && modal.hidden && !new URLSearchParams(location.search).has('url')) startTour();
  else if (!seen) $('#tourBtn').classList.add('pulse');
}, 900);

// demo da tela inicial
$('.demo-wave').innerHTML = Array.from({ length: 22 }, (_, i) => `<i style="height:${20 + Math.abs(Math.sin(i * 1.7)) * 80}%;animation-delay:${-i * 0.09}s"></i>`).join('');

// volta na aba usada da última vez
let savedMode = 'audio';
try { savedMode = localStorage.getItem('sticks.mode') || 'audio'; } catch { /* ok */ }
setMode(savedMode);
renderTarget();
// versão instalada ao lado do logo
api('/api/settings').then((st) => { $('#appVer').textContent = `v${st.version}`; $('#appVer').title = `Audio Sticks ${st.version} · instalado e rodando em ${st.url}`; }).catch(() => {});
refreshWa();
waPoll = setInterval(refreshWa, 15000);
loadCollection();
render();
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
