// 🔤 Texto e emoji na figurinha. Desenha as camadas num quadro 512x512 transparente (o tamanho da figurinha);
// o servidor "carimba" esse PNG sobre cada quadro na hora de gerar (lib/audio.js → withOverlay).
// As camadas ficam guardadas na página para dar para reabrir e mexer de novo.

const SIZE = 512;
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
// fontes: as do sistema (Impact, Arial Black, Comic Sans) e as do Google Fonts (carregadas só quando o editor abre)
export const FONTS = [
  { name: 'Impact', label: 'Impact (meme clássico)', css: 'Impact, Anton, "Arial Black", sans-serif' },
  { name: 'Anton', label: 'Anton', css: 'Anton, Impact, sans-serif', google: 'Anton' },
  { name: 'Bangers', label: 'Bangers (gibi)', css: 'Bangers, Impact, sans-serif', google: 'Bangers' },
  { name: 'Luckiest Guy', label: 'Luckiest Guy', css: '"Luckiest Guy", Impact, sans-serif', google: 'Luckiest+Guy' },
  { name: 'Permanent Marker', label: 'Permanent Marker (pincel)', css: '"Permanent Marker", "Comic Sans MS", cursive', google: 'Permanent+Marker' },
  { name: 'Pacifico', label: 'Pacifico (cursiva)', css: 'Pacifico, cursive', google: 'Pacifico' },
  { name: 'Lobster', label: 'Lobster', css: 'Lobster, cursive', google: 'Lobster' },
  { name: 'Bricolage', label: 'Bricolage (a do app)', css: '"Bricolage Grotesque", sans-serif', weight: 800 },
  { name: 'Arial Black', label: 'Arial Black', css: '"Arial Black", Arial, sans-serif' },
  { name: 'Comic Sans', label: 'Comic Sans 🤡', css: '"Comic Sans MS", "Comic Neue", cursive', weight: 700 },
];
const font = (name) => FONTS.find((f) => f.name === name) || FONTS[0];
const SWATCHES = ['#ffffff', '#000000', '#ffd23f', '#ff3b30', '#ff5d8f', '#25d366', '#2f80ff', '#a259ff', '#ff8a00'];
const EMOJIS = ['😂', '🤣', '😭', '😱', '🤡', '💀', '🔥', '👀', '😎', '🥳', '😡', '🙄', '🤯', '🫠', '❤️', '💔', '👏', '🙏', '💸', '🚨', '⚽', '🍺', '🐸', '🐐', '✨', '💯', '❌', '✅', '👉', '⭐'];

let fontsLinked = false;
function linkFonts() {
  if (fontsLinked) return;
  fontsLinked = true;
  const fam = FONTS.filter((f) => f.google).map((f) => `family=${f.google}`).join('&');
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?${fam}&display=swap`;
  document.head.append(l);
}
/** Espera a fonte carregar (sem internet, segue com a fonte reserva). */
async function ensureFont(name) {
  const f = font(name);
  try { await Promise.race([document.fonts.load(`${f.weight || 400} 40px ${f.css}`, 'Aa'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* fonte reserva */ }
}

let seq = 0;
const newId = () => `l${Date.now().toString(36)}${seq++}`;
export const newText = (o = {}) => ({ id: newId(), type: 'text', text: 'TEXTO', font: 'Impact', size: 72, color: '#ffffff', stroke: '#000000', strokeW: 8, rot: 0, upper: true, x: SIZE / 2, y: 440, ...o });
export const newEmoji = (o = {}) => ({ id: newId(), type: 'emoji', text: '😂', size: 120, rot: 0, x: SIZE / 2, y: SIZE / 2, ...o });

// ---------- desenho ----------
function setFont(ctx, l, size) {
  if (l.type === 'emoji') { ctx.font = `${size}px ${EMOJI_FONT}`; return; }
  const f = font(l.font);
  ctx.font = `${f.weight || 400} ${size}px ${f.css}`;
}
const linesOf = (l) => String(l.type === 'text' && l.upper ? l.text.toLocaleUpperCase('pt-BR') : l.text).split('\n');

/** Mede a camada; texto largo demais encolhe sozinho para caber na figurinha. */
function measure(ctx, l) {
  const lines = linesOf(l);
  let size = l.size;
  setFont(ctx, l, size);
  let w = Math.max(1, ...lines.map((t) => ctx.measureText(t).width));
  const maxW = SIZE - 24;
  if (l.type === 'text' && w > maxW) { size = Math.max(10, Math.floor(size * maxW / w)); setFont(ctx, l, size); w = Math.max(1, ...lines.map((t) => ctx.measureText(t).width)); }
  const lh = size * (l.type === 'emoji' ? 1.05 : 1.08);
  const pad = l.type === 'text' ? l.strokeW : 0;
  const h = lh * lines.length + pad * 2;
  // texto "ancorado" (Meme clássico): cresce para dentro da figurinha a partir da borda de cima ou de baixo
  const cy = l.anchor === 'top' ? l.y + h / 2 : l.anchor === 'bottom' ? l.y - h / 2 : l.y;
  return { lines, size, lh, w: w + pad * 2, h, cy };
}

function drawLayer(ctx, l) {
  const m = measure(ctx, l);
  ctx.save();
  ctx.translate(l.x, m.cy);
  ctx.rotate((l.rot * Math.PI) / 180);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setFont(ctx, l, m.size);
  const top = -((m.lines.length - 1) * m.lh) / 2;
  m.lines.forEach((t, i) => {
    const y = top + i * m.lh;
    if (l.type === 'text') {
      if (l.strokeW > 0) { ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = l.strokeW * 2; ctx.strokeStyle = l.stroke; ctx.strokeText(t, 0, y); }
      ctx.fillStyle = l.color;
    } else ctx.fillStyle = '#000';
    ctx.fillText(t, 0, y);
  });
  ctx.restore();
  return m;
}

export function drawLayers(ctx, layers) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  for (const l of layers) if (String(l.text).trim()) drawLayer(ctx, l);
}

/** PNG 512x512 transparente com as camadas (ou null se não houver nada para desenhar). */
export async function renderOverlay(layers) {
  const list = layers.filter((l) => String(l.text).trim());
  if (!list.length) return null;
  linkFonts();
  await Promise.all([...new Set(list.filter((l) => l.type === 'text').map((l) => l.font))].map(ensureFont));
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  drawLayers(c.getContext('2d'), list);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

// ---------- editor ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Abre o editor. opts: { bg: url da prévia, pad: bool (fundo transparente), layers, onDone({ layers, blob }) }
 */
export function openTextEditor({ bg, pad = false, layers: initial = [], onDone }) {
  linkFonts();
  let layers = initial.map((l) => ({ ...l }));
  let selId = layers.at(-1)?.id || null;
  const back = document.createElement('div');
  back.className = 'bge-back';
  back.innerHTML = `
    <div class="bge tte" role="dialog" aria-modal="true" aria-label="Texto e emoji">
      <header class="bge-head"><h3>🔤 Texto e emoji</h3><button class="modal-x" data-b="cancel" aria-label="Fechar">×</button></header>
      <div class="bge-main">
        <div class="bge-stage tte-stage${pad ? '' : ' crop'}">
          <div class="tte-box">${bg ? `<img class="tte-bg" src="${esc(bg)}" alt="">` : ''}<canvas class="bge-canvas tte-canvas" width="${SIZE}" height="${SIZE}"></canvas></div>
        </div>
        <aside class="bge-tools">
          <div class="bge-group">
            <div class="bge-row"><button class="btn" data-b="addText">＋ Texto</button><button class="btn" data-b="addEmoji">＋ Emoji</button></div>
            <button class="btn" data-b="meme">😂 Meme clássico (em cima e embaixo)</button>
          </div>
          <div data-r="props"></div>
          <p class="bge-tip">Arraste no quadro para <b>mover</b>. Clique num texto ou emoji para <b>escolher</b>. A rodinha do mouse muda o <b>tamanho</b>, e <b>Delete</b> apaga.</p>
        </aside>
      </div>
      <footer class="bge-foot">
        <span class="bge-status" data-r="status"></span>
        <button class="btn" data-b="clear">Limpar tudo</button>
        <button class="btn" data-b="cancel">Cancelar</button>
        <button class="btn primary" data-b="apply">Usar</button>
      </footer>
    </div>`;
  document.body.append(back);
  const q = (s) => back.querySelector(s);
  const canvas = q('.tte-canvas');
  const ctx = canvas.getContext('2d');
  const props = q('[data-r="props"]');
  const sel = () => layers.find((l) => l.id === selId) || null;

  function draw() {
    drawLayers(ctx, layers);
    const l = sel();
    if (!l) return;
    const m = measure(ctx, l);
    ctx.save();
    ctx.translate(l.x, m.cy);
    ctx.rotate((l.rot * Math.PI) / 180);
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd23f';
    ctx.strokeRect(-m.w / 2 - 6, -m.h / 2 - 6, m.w + 12, m.h + 12);
    ctx.restore();
  }
  const fontsReady = () => document.fonts.ready.then(draw);
  document.fonts.addEventListener?.('loadingdone', draw);

  // ---------- painel da camada escolhida ----------
  function renderProps() {
    const l = sel();
    q('[data-b="clear"]').disabled = !layers.length;
    if (!l) { props.innerHTML = `<p class="bge-tip">${layers.length ? 'Clique num texto ou emoji do quadro para editar.' : 'Comece com <b>＋ Texto</b>, <b>＋ Emoji</b> ou o <b>Meme clássico</b>.'}</p>`; return; }
    const range = (k, label, min, max, step = 1) => `<label class="bge-label">${label} <span class="tte-val" data-v="${k}">${l[k]}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${l[k]}"></label>`;
    const sw = (k) => `<div class="tte-sw">${SWATCHES.map((c) => `<button type="button" data-sw="${k}" data-c="${c}" style="background:${c}" class="${l[k] === c ? 'on' : ''}" aria-label="${c}"></button>`).join('')}<input type="color" data-k="${k}" value="${l[k]}" title="Outra cor"></div>`;
    props.innerHTML = l.type === 'text' ? `
      <div class="bge-group">
        <label class="bge-label">Texto <textarea data-k="text" rows="2" maxlength="120">${esc(l.text)}</textarea></label>
        <label class="bge-label">Fonte <select data-k="font">${FONTS.map((f) => `<option value="${f.name}"${f.name === l.font ? ' selected' : ''} style="font-family:${esc(f.css)}">${f.label}</option>`).join('')}</select></label>
        <label class="switch"><input type="checkbox" data-k="upper"${l.upper ? ' checked' : ''}><span></span> TUDO MAIÚSCULO</label>
        ${range('size', 'Tamanho', 16, 200)}
      </div>
      <div class="bge-group"><span class="bge-label">Cor da letra</span>${sw('color')}</div>
      <div class="bge-group"><span class="bge-label">Borda</span>${sw('stroke')}${range('strokeW', 'Espessura da borda', 0, 20)}</div>
      <div class="bge-group">${range('rot', 'Inclinação (°)', -45, 45)}<div class="bge-row"><button class="btn small" data-b="center">↔ Centralizar</button><button class="btn small danger-txt" data-b="del">🗑 Apagar</button></div></div>`
      : `
      <div class="bge-group">
        <div class="tte-emojis">${EMOJIS.map((e) => `<button type="button" data-e="${e}" class="${e === l.text ? 'on' : ''}">${e}</button>`).join('')}</div>
        <label class="bge-label">Ou cole qualquer emoji <input data-k="text" maxlength="16" value="${esc(l.text)}"></label>
        ${range('size', 'Tamanho', 32, 320)}
        ${range('rot', 'Inclinação (°)', -45, 45)}
        <div class="bge-row"><button class="btn small" data-b="center">↔ Centralizar</button><button class="btn small danger-txt" data-b="del">🗑 Apagar</button></div>
      </div>`;
  }
  props.addEventListener('input', (e) => {
    const l = sel(); const k = e.target.dataset.k; if (!l || !k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    l[k] = v;
    const out = props.querySelector(`[data-v="${k}"]`); if (out) out.textContent = v;
    if (k === 'font') ensureFont(v).then(draw);
    if (e.target.type === 'color') props.querySelectorAll(`[data-sw="${k}"]`).forEach((b) => b.classList.remove('on'));
    draw();
  });
  props.addEventListener('click', (e) => {
    const l = sel(); if (!l) return;
    const swb = e.target.closest('[data-sw]');
    if (swb) { l[swb.dataset.sw] = swb.dataset.c; renderProps(); draw(); return; }
    const eb = e.target.closest('[data-e]');
    if (eb) { l.text = eb.dataset.e; renderProps(); draw(); return; }
    const b = e.target.closest('[data-b]')?.dataset.b;
    if (b === 'del') removeSel();
    else if (b === 'center') { l.x = SIZE / 2; draw(); }
  });

  const add = (l) => { layers.push(l); selId = l.id; renderProps(); draw(); };
  function removeSel() { layers = layers.filter((l) => l.id !== selId); selId = layers.at(-1)?.id || null; renderProps(); draw(); }

  // ---------- arrastar / escolher / tamanho ----------
  const toCanvas = (e) => { const r = canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE }; };
  function hit(p) {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i]; const m = measure(ctx, l);
      const a = (-l.rot * Math.PI) / 180, dx = p.x - l.x, dy = p.y - m.cy;
      const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(rx) <= m.w / 2 + 10 && Math.abs(ry) <= m.h / 2 + 10) return l;
    }
    return null;
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e); const l = hit(p);
    if (l?.id !== selId) { selId = l?.id || null; renderProps(); }
    draw();
    if (l) { const m = measure(ctx, l); l.y = m.cy; delete l.anchor; drag = { dx: p.x - l.x, dy: p.y - l.y }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging'); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    if (!drag) { canvas.style.cursor = hit(p) ? 'move' : 'default'; return; }
    const l = sel(); if (!l) return;
    l.x = Math.round(Math.min(SIZE, Math.max(0, p.x - drag.dx)));
    l.y = Math.round(Math.min(SIZE, Math.max(0, p.y - drag.dy)));
    draw();
  });
  const endDrag = () => { drag = null; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    const l = sel(); if (!l) return;
    e.preventDefault();
    const [min, max] = l.type === 'emoji' ? [32, 320] : [16, 200];
    l.size = Math.round(Math.min(max, Math.max(min, l.size * (e.deltaY < 0 ? 1.08 : 0.93))));
    const r = props.querySelector('[data-k="size"]'); if (r) { r.value = l.size; props.querySelector('[data-v="size"]').textContent = l.size; }
    draw();
  }, { passive: false });

  // ---------- botões ----------
  const close = () => { back.remove(); removeEventListener('keydown', onKey, true); document.fonts.removeEventListener?.('loadingdone', draw); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); return; }
    const typing = e.target.closest?.('input, textarea, select');
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && sel()) { e.preventDefault(); removeSel(); }
  };
  addEventListener('keydown', onKey, true);
  back.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-b]')?.dataset.b;
    if (b === 'cancel') close();
    else if (b === 'addText') { add(layers.some((l) => l.type === 'text') ? newText({ y: SIZE / 2 }) : newText({ y: SIZE - 14, anchor: 'bottom' })); setTimeout(() => props.querySelector('textarea')?.select(), 30); }
    else if (b === 'addEmoji') add(newEmoji());
    else if (b === 'meme') {
      layers = layers.filter((l) => l.type !== 'text');
      const top = newText({ text: 'TEXTO DE CIMA', y: 14, anchor: 'top' }); const bot = newText({ text: 'TEXTO DE BAIXO', y: SIZE - 14, anchor: 'bottom' });
      layers.push(top, bot); selId = top.id; renderProps(); draw();
      setTimeout(() => props.querySelector('textarea')?.select(), 30);
    }
    else if (b === 'clear') { layers = []; selId = null; renderProps(); draw(); }
    else if (b === 'apply') {
      const btn = q('[data-b="apply"]'); btn.disabled = true; btn.textContent = 'Preparando…';
      try {
        const keep = layers.filter((l) => String(l.text).trim());
        const blob = await renderOverlay(keep);
        close();
        onDone?.({ layers: keep, blob });
      } catch (err) { q('[data-r="status"]').textContent = err.message; btn.disabled = false; btn.textContent = 'Usar'; }
    }
  });

  renderProps();
  draw();
  fontsReady();
  Promise.all(FONTS.filter((f) => f.google).map((f) => ensureFont(f.name))).then(draw);
}
