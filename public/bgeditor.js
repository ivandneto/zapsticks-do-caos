// Editor de "tirar o fundo" (estilo WhatsApp), 100% no navegador.
// IA: MediaPipe Tasks Vision (Google, Apache-2.0). Na primeira vez baixa a biblioteca e os modelos (~22 MB) e o
// navegador guarda em cache. As imagens NÃO saem do computador.
//
//  - Foto:  recorte automático de pessoas, "tocar no que manter" (qualquer objeto), pincel apagar/recuperar,
//           sensibilidade, borda branca. Devolve um PNG 512x512 com transparência.
//  - Vídeo/GIF: recorte automático de pessoas quadro a quadro (+ sensibilidade e borda). Devolve os quadros PNG.

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
const MODEL_PERSON = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';
const MODEL_TOUCH = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite';
const OUT = 512;        // tamanho da figurinha
const WORK_MAX = 768;   // maior lado da foto durante a edição (desempenho)

// ---------------------------------------------------------------------------
// IA (carregada sob demanda e reaproveitada)
// ---------------------------------------------------------------------------
let lib = null, fileset = null;
const models = {};
async function vision() {
  if (!lib) {
    lib = await import(`${MP}/vision_bundle.mjs`);
    fileset = await lib.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  }
  return lib;
}
async function model(kind, runningMode = 'IMAGE') {
  const key = `${kind}:${runningMode}`;
  if (models[key]) return models[key];
  const m = await vision();
  const make = (delegate) => (kind === 'touch'
    ? m.InteractiveSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL_TOUCH, delegate }, outputCategoryMask: false, outputConfidenceMasks: true })
    : m.ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL_PERSON, delegate }, runningMode, outputCategoryMask: false, outputConfidenceMasks: true }));
  try { models[key] = await make('GPU'); } catch { models[key] = await make('CPU'); }
  return models[key];
}

/** Probabilidade de ser pessoa (1 - fundo), como Float32Array do tamanho da máscara. */
function personProb(result) {
  const bg = result.confidenceMasks[0];
  const a = bg.getAsFloat32Array();
  const p = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) p[i] = 1 - a[i];
  return { prob: p, w: bg.width, h: bg.height };
}

async function segmentPerson(source) {
  const seg = await model('person', 'IMAGE');
  let out;
  seg.segment(source, (r) => { out = personProb(r); });
  return cleanIslands(out);
}
async function segmentPersonVideo(source) {
  const seg = await model('person', 'VIDEO');
  let out;
  seg.segmentForVideo(source, performance.now(), (r) => { out = personProb(r); });
  return cleanIslands(out);
}
async function segmentTouch(source, x, y) {
  const seg = await model('touch');
  let out;
  seg.segment(source, { keypoint: { x, y } }, (r) => {
    const m = r.confidenceMasks[0];
    const a = m.getAsFloat32Array();
    // o modelo devolve a confiança do objeto tocado; se no ponto tocado der baixo, está invertido
    const px = Math.min(m.width - 1, Math.round(x * m.width)), py = Math.min(m.height - 1, Math.round(y * m.height));
    const invert = a[py * m.width + px] < 0.5;
    const p = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) p[i] = invert ? 1 - a[i] : a[i];
    out = { prob: p, w: m.width, h: m.height };
  });
  return cleanIslands(out);
}

/**
 * Remove "manchinhas" soltas: pedaços com menos de 12% da área do maior pedaço recortado.
 * (a IA às vezes marca pontinhos isolados no fundo)
 */
function cleanIslands(r) {
  const { prob, w, h } = r;
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const sizes = [];
  const stack = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (label[i] !== -1 || prob[i] < 0.5) continue;
    const id = sizes.length;
    let top = 0, size = 0;
    stack[top++] = i; label[i] = id;
    while (top) {
      const p = stack[--top]; size++;
      const x = p % w;
      const nb = [p - w, p + w, x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1];
      for (const q of nb) if (q >= 0 && q < n && label[q] === -1 && prob[q] >= 0.5) { label[q] = id; stack[top++] = q; }
    }
    sizes.push(size);
  }
  if (sizes.length < 2) return r;
  const keep = Math.max(...sizes) * 0.12;
  const out = new Float32Array(prob);
  for (let i = 0; i < n; i++) {
    const l = label[i];
    if (l >= 0 && sizes[l] < keep) out[i] = 0;
    else if (l < 0 && out[i] > 0) {
      // borda suave (abaixo de 0.5): some junto se estiver ao lado de um pedaço descartado
      const x = i % w;
      const nb = [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1];
      if (nb.some((q) => q >= 0 && q < n && label[q] >= 0 && sizes[label[q]] < keep)) out[i] = 0;
    }
  }
  return { prob: out, w, h };
}

// ---------------------------------------------------------------------------
// Utilidades de canvas
// ---------------------------------------------------------------------------
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const loadImage = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Não consegui abrir a imagem.')); i.src = src; });

/** Probabilidade → máscara (canvas branco com alpha), aplicando a sensibilidade (0..100) e ajustando ao tamanho. */
function probToMask({ prob, w, h }, sens, W, H) {
  const t = 0.8 - (sens / 100) * 0.6;           // sensibilidade alta = limiar baixo = mantém mais
  const lo = t - 0.12, span = 0.24;
  const small = canvas(w, h);
  const ctx = small.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < prob.length; i++) {
    const a = Math.max(0, Math.min(1, (prob[i] - lo) / span));
    const o = i * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const m = canvas(W, H);
  const mctx = m.getContext('2d');
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(small, 0, 0, W, H);
  return m;
}

/** Imagem ∩ máscara → recorte transparente. */
function cutout(img, mask, W, H) {
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  return c;
}

/** Caixa que envolve o que sobrou (alpha > 24). */
function alphaBox(c) {
  const { width: w, height: h } = c;
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const unionBox = (a, b) => (!a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) });

/** Monta a figurinha 512x512: recorte enquadrado na caixa, centralizado, com borda branca opcional. */
function compose(cut, box, border) {
  const out = canvas(OUT, OUT);
  const ctx = out.getContext('2d');
  if (!box) return out;
  const r = border ? 12 : 0;
  const pad = r + 6;
  const scale = Math.min((OUT - pad * 2) / box.w, (OUT - pad * 2) / box.h);
  const dw = box.w * scale, dh = box.h * scale;
  const dx = (OUT - dw) / 2, dy = (OUT - dh) / 2;
  if (border) {
    // silhueta branca desenhada em volta (vários deslocamentos em círculo) = contorno de figurinha
    const sil = canvas(OUT, OUT);
    const sctx = sil.getContext('2d');
    sctx.drawImage(cut, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, OUT, OUT);
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      ctx.drawImage(sil, Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.drawImage(sil, 0, 0);
  }
  ctx.drawImage(cut, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
  return out;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------
function buildUI(mode) {
  const back = document.createElement('div');
  back.className = 'bge-back';
  back.innerHTML = `
    <div class="bge" role="dialog" aria-modal="true" aria-label="Tirar o fundo">
      <header class="bge-head"><h3>✂️ Tirar o fundo</h3><button class="modal-x" data-b="cancel" aria-label="Fechar">×</button></header>
      <div class="bge-main">
        <div class="bge-stage"><canvas class="bge-canvas"></canvas><div class="bge-busy" hidden><div class="spin"></div><span></span></div></div>
        <aside class="bge-tools">
          ${mode === 'photo' ? `
          <div class="bge-group">
            <button class="btn" data-b="auto">🧍 Recortar pessoa</button>
            <button class="btn bge-tool on" data-tool="touch">👆 Tocar no que manter</button>
          </div>
          <div class="bge-group">
            <span class="bge-label">Ajuste fino</span>
            <div class="bge-row"><button class="btn bge-tool" data-tool="erase">🧽 Apagar</button><button class="btn bge-tool" data-tool="restore">🖌️ Recuperar</button></div>
            <label class="bge-label">Pincel <input type="range" data-r="size" min="6" max="90" value="28"></label>
          </div>` : `
          <p class="bge-tip">No vídeo/GIF, o recorte é <b>automático de pessoas</b>, quadro a quadro.</p>`}
          <div class="bge-group">
            <label class="bge-label">Sensibilidade <input type="range" data-r="sens" min="0" max="100" value="50"></label>
            <label class="switch"><input type="checkbox" data-r="border" checked><span></span> Borda branca</label>
            ${mode === 'photo' ? '<label class="switch"><input type="checkbox" data-r="ghost" checked><span></span> Ver o que foi apagado</label>' : ''}
          </div>
          ${mode === 'photo' ? '<div class="bge-row"><button class="btn small" data-b="undo">↺ Desfazer</button><button class="btn small" data-b="reset">Original</button></div>' : ''}
          <p class="bge-tip" data-r="tip">${mode === 'photo' ? 'Toque na pessoa, no bicho ou no objeto que você quer manter. Depois, use o pincel para os detalhes.' : 'Mexa na sensibilidade se sobrar fundo (diminua) ou se cortar a pessoa (aumente).'}</p>
        </aside>
      </div>
      <footer class="bge-foot">
        <span class="bge-status" data-r="status"></span>
        <button class="btn" data-b="cancel">Cancelar</button>
        <button class="btn primary" data-b="apply" disabled>Usar este recorte</button>
      </footer>
    </div>`;
  document.body.append(back);
  const q = (s) => back.querySelector(s);
  return {
    back, canvas: q('.bge-canvas'), busy: q('.bge-busy'),
    status: q('[data-r="status"]'), tip: q('[data-r="tip"]'), apply: q('[data-b="apply"]'),
    sens: q('[data-r="sens"]'), border: q('[data-r="border"]'), ghost: q('[data-r="ghost"]'), size: q('[data-r="size"]'), q,
  };
}

function setBusy(ui, text) {
  ui.busy.hidden = !text;
  if (text) ui.busy.querySelector('span').textContent = text;
}

const AI_FAIL = 'Não consegui carregar a IA de recorte. Ela precisa de internet na primeira vez (depois fica guardada no navegador).';

/**
 * Abre o editor.
 *  mode 'photo':  { src, onDone({ blob }) }
 *  mode 'frames': { token, count, fps, onDone({ frames: Blob[] }) }
 */
export async function openBgEditor(opts) {
  const ui = buildUI(opts.mode);
  const close = () => { cancelled = true; ui.back.remove(); removeEventListener('keydown', onKey, true); };
  let cancelled = false;
  const onKey = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } };
  addEventListener('keydown', onKey, true);
  ui.back.addEventListener('click', (e) => { if (e.target.closest('[data-b="cancel"]')) close(); });

  try {
    if (opts.mode === 'photo') await photoEditor(ui, opts, close, () => cancelled);
    else await framesEditor(ui, opts, close, () => cancelled);
  } catch (err) {
    setBusy(ui, '');
    ui.status.textContent = /import|fetch|network|Failed/i.test(err.message) ? AI_FAIL : err.message;
    ui.status.classList.add('err');
  }
}

// ---------------- foto ----------------
async function photoEditor(ui, opts, close, isCancelled) {
  setBusy(ui, 'Abrindo a imagem…');
  const img = await loadImage(opts.src);
  const k = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
  const base = canvas(W, H); base.getContext('2d').drawImage(img, 0, 0, W, H);
  ui.canvas.width = W; ui.canvas.height = H;
  const view = ui.canvas.getContext('2d');

  let raw = null;                       // última probabilidade da IA (para refazer com outra sensibilidade)
  let mask = canvas(W, H);              // o que fica (branco com alpha)
  const full = () => { const m = mask.getContext('2d'); m.globalCompositeOperation = 'source-over'; m.fillStyle = '#fff'; m.fillRect(0, 0, W, H); };
  full();
  const undo = [];
  const snap = () => { undo.push(mask.getContext('2d').getImageData(0, 0, W, H)); if (undo.length > 25) undo.shift(); };
  let tool = 'touch';

  const draw = () => {
    view.clearRect(0, 0, W, H);
    if (ui.ghost?.checked) { view.globalAlpha = 0.22; view.drawImage(base, 0, 0); view.globalAlpha = 1; }
    view.drawImage(cutout(base, mask, W, H), 0, 0);
  };
  const fromRaw = () => { if (raw) { mask = probToMask(raw, Number(ui.sens.value), W, H); } draw(); ui.apply.disabled = false; };

  // abre já tentando achar pessoas (como o WhatsApp faz)
  setBusy(ui, 'Carregando a IA de recorte (só demora na primeira vez)…');
  const auto = async () => {
    setBusy(ui, 'Procurando pessoas…');
    const r = await segmentPerson(base);
    let sum = 0; for (const v of r.prob) sum += v;
    setBusy(ui, '');
    if (sum / r.prob.length < 0.02) { ui.status.textContent = 'Não achei pessoas. Toque no que você quer manter 👆'; return false; }
    snap(); raw = r; fromRaw();
    ui.status.textContent = 'Pessoa recortada. Ajuste com o pincel se precisar.';
    return true;
  };
  try { await auto(); } catch (err) { throw err; }
  setBusy(ui, '');
  draw();
  ui.apply.disabled = false;
  if (isCancelled()) return;

  // ferramentas
  ui.q('.bge-tools').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tool]');
    if (t) { tool = t.dataset.tool; ui.q('.bge-tools').querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b === t)); ui.canvas.dataset.tool = tool; return; }
    const b = e.target.closest('[data-b]'); if (!b) return;
    if (b.dataset.b === 'auto') { try { await auto(); } catch (err) { ui.status.textContent = AI_FAIL; } }
    else if (b.dataset.b === 'undo') { const u = undo.pop(); if (u) { mask.getContext('2d').putImageData(u, 0, 0); draw(); } }
    else if (b.dataset.b === 'reset') { snap(); raw = null; full(); draw(); ui.status.textContent = 'Imagem original. Toque no que manter ou use “Recortar pessoa”.'; }
  });
  ui.sens.addEventListener('input', () => { if (raw) { fromRaw(); ui.status.textContent = 'Sensibilidade aplicada (refaz o recorte; ajustes do pincel são descartados).'; } });
  ui.ghost?.addEventListener('change', draw);
  ui.border.addEventListener('change', () => { ui.status.textContent = ui.border.checked ? 'Com borda branca na figurinha.' : 'Sem borda.'; });
  ui.canvas.dataset.tool = tool;

  // cliques e pincel
  const toImg = (e) => { const r = ui.canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  const paint = (p) => {
    const m = mask.getContext('2d');
    const rad = Number(ui.size.value) * (W / ui.canvas.getBoundingClientRect().width);
    const g = m.createRadialGradient(p.x, p.y, rad * 0.55, p.x, p.y, rad);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    m.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    m.fillStyle = g;
    m.beginPath(); m.arc(p.x, p.y, rad, 0, Math.PI * 2); m.fill();
  };
  ui.canvas.addEventListener('pointerdown', async (e) => {
    const p = toImg(e);
    if (tool === 'touch') {
      setBusy(ui, 'Recortando o que você tocou…');
      try {
        const r = await segmentTouch(base, p.x / W, p.y / H);
        snap(); raw = r; fromRaw();
        ui.status.textContent = 'Pronto! Toque em outro ponto para trocar, ou use o pincel.';
      } catch { ui.status.textContent = AI_FAIL; }
      setBusy(ui, '');
      return;
    }
    snap();
    ui.canvas.setPointerCapture(e.pointerId);
    let last = p;
    paint(p); draw();
    const move = (ev) => {
      const q2 = toImg(ev);
      const steps = Math.ceil(Math.hypot(q2.x - last.x, q2.y - last.y) / 4) || 1;
      for (let i = 1; i <= steps; i++) paint({ x: last.x + ((q2.x - last.x) * i) / steps, y: last.y + ((q2.y - last.y) * i) / steps });
      last = q2; draw();
    };
    ui.canvas.addEventListener('pointermove', move);
    ui.canvas.addEventListener('pointerup', () => ui.canvas.removeEventListener('pointermove', move), { once: true });
  });

  ui.apply.onclick = async () => {
    const cut = cutout(base, mask, W, H);
    const box = alphaBox(cut);
    if (!box) { ui.status.textContent = 'Não sobrou nada da imagem 😅 Use “Original” ou o pincel Recuperar.'; return; }
    const out = compose(cut, box, ui.border.checked);
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    close();
    opts.onDone({ blob });
  };
}

// ---------------- vídeo / GIF ----------------
async function framesEditor(ui, opts, close, isCancelled) {
  const { token, count, fps } = opts;
  setBusy(ui, 'Carregando a IA de recorte (só demora na primeira vez)…');
  await model('person', 'VIDEO');
  const frames = [];
  for (let i = 1; i <= count; i++) {
    if (isCancelled()) return;
    setBusy(ui, `Recortando a pessoa: quadro ${i} de ${count}…`);
    const img = await loadImage(`/api/frames/${token}/${String(i).padStart(4, '0')}.png`);
    const r = await segmentPersonVideo(img);
    frames.push({ img, raw: r, W: img.naturalWidth, H: img.naturalHeight });
  }
  setBusy(ui, '');
  ui.canvas.width = OUT; ui.canvas.height = OUT;
  const view = ui.canvas.getContext('2d');

  let outs = [];
  const build = () => {
    const sens = Number(ui.sens.value);
    const cuts = frames.map((f) => cutout(f.img, probToMask(f.raw, sens, f.W, f.H), f.W, f.H));
    // mesma moldura para todos os quadros (senão a figurinha "pula")
    let box = null;
    for (const c of cuts) box = unionBox(box, alphaBox(c));
    outs = cuts.map((c) => compose(c, box, ui.border.checked));
    ui.apply.disabled = !box;
    ui.status.textContent = box ? `${count} quadros recortados. Confira a animação.` : 'Não achei pessoas nesse trecho.';
  };
  build();

  // prévia animada
  let n = 0;
  const timer = setInterval(() => {
    if (!document.body.contains(ui.back)) return clearInterval(timer);
    view.clearRect(0, 0, OUT, OUT);
    if (outs.length) view.drawImage(outs[n % outs.length], 0, 0);
    n++;
  }, 1000 / fps);

  let pending = null;
  const rebuild = () => { clearTimeout(pending); pending = setTimeout(build, 120); };
  ui.sens.addEventListener('input', rebuild);
  ui.border.addEventListener('change', rebuild);

  ui.apply.onclick = async () => {
    ui.apply.disabled = true;
    setBusy(ui, 'Preparando os quadros…');
    const blobs = [];
    for (const o of outs) blobs.push(await new Promise((r) => o.toBlob(r, 'image/png')));
    clearInterval(timer);
    close();
    opts.onDone({ frames: blobs });
  };
}
