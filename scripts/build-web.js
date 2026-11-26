// Monta a versão web (site estático) em dist-web/: a mesma tela de public/ + o motor do navegador (web/).
// Uso: npm run build:web   (é o comando de build da Cloudflare Pages; a pasta publicada é dist-web)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { pixCopiaECola } from '../lib/pix.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-web');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.cpSync(path.join(root, 'web'), path.join(out, 'web'), { recursive: true });

// A página sabe que é o site por estas marcas (public/app.js liga o motor do navegador ao ver "motor=navegador")
const index = path.join(out, 'index.html');
const html = fs.readFileSync(index, 'utf8');
const marcas = `<meta charset="utf-8">\n  <meta name="motor" content="navegador">\n  <meta name="versao" content="${pkg.version}-web">`;
if (!html.includes('<meta charset="utf-8">')) throw new Error('index.html mudou: não achei <meta charset="utf-8">');
fs.writeFileSync(index, html.replace('<meta charset="utf-8">', marcas));

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
