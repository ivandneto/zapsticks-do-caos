// Monta a versão web (site estático) em dist-web/: a mesma tela de public/ + o motor do navegador (web/).
// Uso: npm run build:web   (é o comando de build da Cloudflare Pages; a pasta publicada é dist-web)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { pixCopiaECola } from '../lib/pix.js';
import * as seo from '../web/seo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-web');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.cpSync(path.join(root, 'web'), path.join(out, 'web'), { recursive: true });
// service worker na raiz (precisa do escopo "/" para atender /media e /api) e as bibliotecas pequenas (MIT)
fs.renameSync(path.join(out, 'web', 'sw.js'), path.join(out, 'sw-web.js'));
fs.mkdirSync(path.join(out, 'web', 'vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules', 'mp4-muxer', 'build', 'mp4-muxer.mjs'), path.join(out, 'web', 'vendor', 'mp4-muxer.mjs'));
fs.copyFileSync(path.join(root, 'node_modules', 'fflate', 'esm', 'browser.js'), path.join(out, 'web', 'vendor', 'fflate.js'));

// A página sabe que é o site por estas marcas (public/app.js liga o motor do navegador ao ver "motor=navegador")
const index = path.join(out, 'index.html');
const html = fs.readFileSync(index, 'utf8');
const marcas = `<meta charset="utf-8">\n  <meta name="motor" content="navegador">\n  <meta name="versao" content="${pkg.version}-web">`;
if (!html.includes('<meta charset="utf-8">')) throw new Error('index.html mudou: não achei <meta charset="utf-8">');
// 🔎 SEO. SITE_URL = endereço oficial (sem barra no fim). Na Cloudflare, só o branch main é indexado; prévias ficam fora do Google.
const url = (process.env.SITE_URL || 'https://audio-sticks.pages.dev').replace(/\/+$/, '');
const indexar = !process.env.CF_PAGES_BRANCH || process.env.CF_PAGES_BRANCH === 'main';
let pagina = html.replace('<meta charset="utf-8">', marcas).replace(/<title>[^<]*<\/title>/, seo.cabecalho({ url, indexar }));
if (!pagina.includes('</main>')) throw new Error('index.html mudou: não achei </main>');
pagina = pagina.replace('</main>', `</main>
  ${seo.rodape()}`);
fs.writeFileSync(index, pagina);
fs.writeFileSync(path.join(out, 'robots.txt'), seo.robots({ url, indexar }));
if (indexar) fs.writeFileSync(path.join(out, 'sitemap.xml'), seo.sitemap({ url }));
fs.rmSync(path.join(out, 'web', 'seo.js'));
// cabeçalhos de segurança (CSP etc.): a Cloudflare Pages lê o _headers da raiz
fs.renameSync(path.join(out, 'web', '_headers'), path.join(out, '_headers'));

// ☕ "Me paga um café": Pix copia e cola + QR (SVG) gerados aqui, a partir de web/apoio.json (dados públicos)
const apoio = JSON.parse(fs.readFileSync(path.join(root, 'web', 'apoio.json'), 'utf8'));
const pix = pixCopiaECola(apoio);
fs.writeFileSync(path.join(out, 'web', 'pix.svg'), await QRCode.toString(pix, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#101017', light: '#ffffff' } }));
fs.writeFileSync(path.join(out, 'web', 'pix.json'), JSON.stringify({ copiaECola: pix, nome: apoio.nome }));
fs.rmSync(path.join(out, 'web', 'apoio.json'));

const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
walk(out);
const kb = files.reduce((a, f) => a + fs.statSync(f).size, 0) / 1024;
console.log(`Versão web montada em dist-web/ · ${files.length} arquivos · ${kb.toFixed(0)} KB`);
