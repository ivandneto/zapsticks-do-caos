// Gera dist/Audio Sticks/ com "Audio Sticks.exe" (Node embutido) + public/, e um .zip pronto para distribuir.
// Uso: npm run build:exe
import { build } from 'esbuild';
import { rcedit } from 'rcedit';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const isWin = process.platform === 'win32';
const name = 'Audio Sticks';
const work = path.join(root, 'build');
const out = process.env.BUILD_OUT ? path.resolve(process.env.BUILD_OUT) : path.join(root, 'dist', name);
const exePath = path.join(out, isWin ? `${name}.exe` : name);

// IMPORTANTE: nunca apagar a pasta de saída inteira. Se alguém abriu o .exe dali, pode existir
// data/ (figurinhas + sessão do WhatsApp) e bin/ ao lado. Só trocamos os arquivos do programa.
const PROGRAM_FILES = [path.basename(exePath), 'public', 'LEIA-ME.txt'];

fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(out, { recursive: true });
try {
  if (fs.existsSync(exePath)) fs.closeSync(fs.openSync(exePath, 'r+')); // abrir para escrita falha se o programa estiver rodando
} catch {
  console.error(`\n✖ "${exePath}" está aberto.\n  Feche o Audio Sticks (ícone da bandeja → Sair) e rode o build de novo.\n`);
  process.exit(1);
}
for (const f of fs.readdirSync(path.join(root, 'dist'))) if (f.endsWith('.zip')) fs.rmSync(path.join(root, 'dist', f));

// 1) Junta o servidor e todas as dependências num único arquivo CommonJS
console.log('1/4 empacotando o código…');
await build({
  entryPoints: [path.join(root, 'server.js')],
  outfile: path.join(work, 'app.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  minify: true,
  legalComments: 'none',
  logLevel: 'error',
  // extras opcionais do Baileys (imagens, prévias de link) que o app não usa
  external: ['sharp', 'jimp', 'link-preview-js', 'audio-decode', 'music-metadata'],
});

// 2) Cópia do node com ícone e informações do app
console.log('2/4 preparando o executável…');
const baseExe = path.join(work, isWin ? 'node.exe' : 'node');
fs.copyFileSync(process.execPath, baseExe);
if (isWin) {
  await rcedit(baseExe, {
    icon: path.join(root, 'assets', 'icon.ico'),
    'product-version': pkg.version,
    'file-version': pkg.version,
    'version-string': { ProductName: name, FileDescription: name, CompanyName: name, LegalCopyright: '', OriginalFilename: `${name}.exe`, InternalName: name },
  });
}

// 3) Injeta o app no executável (Single Executable Application do Node)
console.log('3/4 embutindo o app…');
const seaConfig = path.join(work, 'sea-config.json');
fs.writeFileSync(seaConfig, JSON.stringify({
  main: path.join(work, 'app.cjs'),
  output: exePath,
  executable: baseExe,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
}, null, 2));
execFileSync(process.execPath, ['--build-sea', seaConfig], { stdio: 'inherit' });

// No Windows, marca o .exe como "programa de janela" (subsistema GUI): assim não abre o terminal preto.
// O app aparece só como ícone na bandeja do sistema.
if (isWin) {
  const buf = fs.readFileSync(exePath);
  const pe = buf.readUInt32LE(0x3c);
  if (buf.toString('latin1', pe, pe + 4) !== 'PE\0\0') throw new Error('Executável inesperado (sem cabeçalho PE).');
  const subsystemOffset = pe + 4 + 20 + 68; // assinatura + cabeçalho COFF + posição do campo Subsystem
  buf.writeUInt16LE(2, subsystemOffset);   // 2 = WINDOWS_GUI (3 = console)
  fs.writeFileSync(exePath, buf);
}

// 4) Arquivos que ficam ao lado do .exe + zip
console.log('4/4 montando a pasta e o .zip…');
fs.rmSync(path.join(out, 'public'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), path.join(out, 'public'), { recursive: true });
fs.writeFileSync(path.join(out, 'LEIA-ME.txt'), `AUDIO STICKS
============

Como usar:
  1. Dê dois cliques em "${name}${isWin ? '.exe' : ''}".
  2. O navegador abre sozinho e o app fica como um ícone na bandeja
     do sistema (perto do relógio; pode estar escondido na setinha ^).
     - Clique no ícone para abrir de novo.
     - Botão direito no ícone: STATUS do app e do WhatsApp, abrir a
       pasta das figurinhas, ver o registro, TROCAR PORTA (se outro
       programa usar a mesma), REINICIAR e ENCERRAR.
     - Bolinha no ícone: verde = WhatsApp conectado, laranja =
       conectando/preparando, cinza = desconectado.
  3. Dá para usar links do YouTube, Instagram, TikTok, X, Facebook
     e outros, ou arquivos de vídeo/áudio do seu PC.
  4. Dentro do app: botão "Tour" para uma apresentação guiada,
     "?" para o guia completo e a engrenagem para as configurações.

Na primeira vez ele baixa sozinho as ferramentas de áudio (cerca de 150 MB),
por isso precisa de internet e pode demorar alguns minutos.

Se o Windows mostrar "O Windows protegeu o computador":
  clique em "Mais informações" e depois em "Executar assim mesmo".
  (O aviso aparece porque o programa não tem assinatura digital paga.)

Onde ficam as suas figurinhas:
  ${isWin ? '%LOCALAPPDATA%\\Audio Sticks\\data' : '(pasta de dados do usuário)'}
  (botão direito no ícone da bandeja > "Abrir pasta das figurinhas")
  Por isso você pode guardar o programa em qualquer pasta, e trocar
  de versão (apagar esta pasta e descompactar a nova) não apaga nada.

Backup ou levar para outro PC: use os botões Exportar/Importar no app,
ou copie a pasta "data".

Modo portátil (pendrive): crie uma pasta chamada "data" aqui, ao lado
do programa. Ele passa a guardar tudo nela.

NUNCA envie a pasta "data\\whatsapp-auth" para ninguém: ela é o acesso
ao seu WhatsApp.
`.replace(/\n/g, isWin ? '\r\n' : '\n'));

// O zip leva SÓ os arquivos do programa — nunca data/ (sessão do WhatsApp!) nem bin/
const zip = new AdmZip();
for (const f of PROGRAM_FILES) {
  const p = path.join(out, f);
  if (fs.statSync(p).isDirectory()) zip.addLocalFolder(p, `${name}/${f}`);
  else zip.addLocalFile(p, name);
}
const zipPath = path.join(root, 'dist', `Audio-Sticks-${pkg.version}-${process.platform}-${process.arch}.zip`);
zip.writeZip(zipPath);

fs.rmSync(work, { recursive: true, force: true });
const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(0);
console.log(`\nPronto!\n  pasta: ${out}\n  exe:   ${mb(exePath)} MB\n  zip:   ${zipPath} (${mb(zipPath)} MB)`);
