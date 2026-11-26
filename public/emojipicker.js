// 😀 Seletor com TODOS os emojis, por categoria, com busca em português e "recentes" — igual ao do WhatsApp.
// Dados: public/emoji-pt.json, gerado do Emojibase 15.3.2 (MIT, emojibase.dev), até o Emoji 15 (o que o Windows 11 desenha).
// Uso: openEmojiPicker(botãoOuElemento, (emoji) => { … })

const RECENT_KEY = 'sticks.emojiRecents';
const RECENT_MAX = 32;
let data = null;      // { groups: [{ key, label, icon }], emojis: [[grupo, emoji, busca]] }
let loading = null;
let open = null;      // o seletor aberto agora (só um por vez)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

// O Windows não desenha bandeiras de país (🇧🇷 vira as letras "BR", sem cor). Testa: desenha a do Brasil e vê se sai colorida.
function countryFlagsWork() {
  try {
    const c = document.createElement('canvas'); c.width = 40; c.height = 40;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.font = '32px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('🇧🇷', 0, 2);
    const px = ctx.getImageData(0, 0, 40, 40).data;
    let colored = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128 && Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]) > 60) colored++;
    return colored > 40; // verde e amarelo de verdade; as letras saem cinza
  } catch { return true; }
}
const isCountryFlag = (e) => /[\u{1F1E6}-\u{1F1FF}\u{E0067}]/u.test(e); // países e Inglaterra/Escócia/País de Gales

function loadData() {
  if (data) return Promise.resolve(data);
  loading ||= fetch('/emoji-pt.json').then((r) => { if (!r.ok) throw new Error('sem emojis'); return r.json(); }).then((d) => {
    if (!countryFlagsWork()) d.emojis = d.emojis.filter(([, e]) => !isCountryFlag(e));
    return (data = d);
  });
  return loading;
}
function recents() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } }
function remember(e) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...recents().filter((x) => x !== e)].slice(0, RECENT_MAX))); } catch { /* ok */ }
}

export function closeEmojiPicker() {
  if (!open) return;
  open.el.remove();
  removeEventListener('pointerdown', open.outside, true);
  removeEventListener('keydown', open.key, true);
  removeEventListener('resize', open.place);
  open = null;
}

export async function openEmojiPicker(anchor, onPick, { title = 'Escolha um emoji' } = {}) {
  if (open?.anchor === anchor) return closeEmojiPicker(); // clicou de novo no mesmo botão: fecha
  closeEmojiPicker();
  const el = document.createElement('div');
  el.className = 'emo-pick';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  el.innerHTML = `<div class="emo-top"><input type="search" class="emo-search" placeholder="Buscar emoji (ex.: risada, gato, fogo)" aria-label="Buscar emoji" autocomplete="off"></div>
    <nav class="emo-tabs"></nav><div class="emo-body"><p class="emo-msg">Carregando emojis…</p></div>`;
  document.body.append(el);
  const state = { el, anchor };
  open = state;

  // posição: embaixo (ou em cima) do botão; no celular, ocupa a largura toda embaixo
  state.place = () => {
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    if (innerWidth < 560) { Object.assign(el.style, { left: '8px', right: '8px', top: 'auto', bottom: '8px' }); return; }
    let top = r.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
    Object.assign(el.style, { left: `${Math.min(Math.max(8, r.left), innerWidth - w - 8)}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
  };
  state.outside = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeEmojiPicker(); };
  state.key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeEmojiPicker(); } };
  addEventListener('pointerdown', state.outside, true);
  addEventListener('keydown', state.key, true);
  addEventListener('resize', state.place);
  state.place();

  try { await loadData(); } catch { el.querySelector('.emo-msg').textContent = 'Não consegui carregar os emojis.'; return; }
  if (open !== state) return;

  const body = el.querySelector('.emo-body'), tabs = el.querySelector('.emo-tabs'), search = el.querySelector('.emo-search');
  const btn = (e, label = '') => `<button type="button" data-e="${esc(e)}" title="${esc(label)}">${e}</button>`;
  const labelOf = new Map(data.emojis.map(([, e, k]) => [e, k]));

  const drawAll = () => {
    const rec = recents();
    const sections = [];
    if (rec.length) sections.push({ key: 'recent', label: 'Recentes', icon: '🕘', list: rec.map((e) => [null, e, labelOf.get(e) || '']) });
    for (const g of data.groups) sections.push({ ...g, list: data.emojis.filter((x) => x[0] === g.key) });
    tabs.innerHTML = sections.map((s) => `<button type="button" data-g="${s.key}" title="${esc(s.label)}">${s.icon}</button>`).join('');
    body.innerHTML = sections.map((s) => `<section data-sec="${s.key}"><h5>${esc(s.label)}</h5><div class="emo-grid">${s.list.map(([, e, k]) => btn(e, k)).join('')}</div></section>`).join('');
    body.scrollTop = 0;
    markTab();
  };
  const drawSearch = (q) => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const found = data.emojis.filter(([, , k]) => words.every((w) => k.includes(w))).slice(0, 240);
    tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    body.innerHTML = found.length ? `<div class="emo-grid">${found.map(([, e, k]) => btn(e, k)).join('')}</div>` : '<p class="emo-msg">Nenhum emoji com esse nome.</p>';
    body.scrollTop = 0;
  };
  // categoria em destaque acompanha a rolagem
  const markTab = () => {
    const top = body.getBoundingClientRect().top;
    let cur = null;
    for (const s of body.querySelectorAll('section')) { if (s.getBoundingClientRect().top - top <= 24) cur = s.dataset.sec; }
    cur ||= body.querySelector('section')?.dataset.sec;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.g === cur));
  };

  body.addEventListener('scroll', () => { if (!search.value) markTab(); });
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    if (search.value) { search.value = ''; drawAll(); }
    const sec = body.querySelector(`[data-sec="${b.dataset.g}"]`);
    if (sec) body.scrollTop = sec.offsetTop - body.offsetTop;
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    remember(b.dataset.e);
    closeEmojiPicker();
    onPick(b.dataset.e);
  });
  let t = null;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => (search.value.trim() ? drawSearch(search.value) : drawAll()), 120); });
  drawAll();
  state.place();
  if (matchMedia('(hover: hover)').matches) search.focus();
}
