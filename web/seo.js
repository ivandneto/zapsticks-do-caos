// 🔎 SEO da versão web: o que o Google e as redes sociais leem do site.
// Usado por scripts/build-web.js. Nada disso vai para o app do PC.

export const TITULO = 'Figurinha com som para WhatsApp: crie grátis online | Audio Sticks';
export const DESCRICAO = 'Transforme vídeo, GIF, foto ou um trecho do YouTube em figurinha animada com som para WhatsApp. Grátis, sem cadastro e sem instalar: tudo no seu navegador.';
const PALAVRAS = 'audio sticks, zapstick do caos, figurinha com som, figurinha whatsapp, figurinha com áudio, figurinha do youtube, criar figurinha, figurinha animada, sticker com som, figurinha de vídeo, gif para figurinha, figurinha de áudio, meme';

// Perguntas frequentes: aparecem na página (texto de verdade, que o buscador lê) e no FAQ estruturado
export const PERGUNTAS = [
  ['Como fazer figurinha com som para o WhatsApp?', 'Escolha um vídeo (ou cole um link do YouTube), marque um trecho de até 5 segundos e deixe o Som em “Do vídeo”. O site gera a figurinha animada e um vídeo .mp4 com som. No celular, use Compartilhar; para a figurinha com som, abra o WhatsApp → Figurinhas → Criar e escolha o vídeo.'],
  ['É grátis? Precisa de cadastro?', 'É grátis, sem cadastro, sem anúncio e sem marca d’água. A figurinha é feita no seu próprio aparelho: os arquivos não são enviados para servidor nenhum.'],
  ['Dá para transformar GIF ou foto em figurinha?', 'Dá. Envie o GIF, a foto ou o .webp animado: o site recorta em quadrado (ou mostra inteiro, com fundo transparente), e dá para escrever texto, pôr emoji e tirar o fundo.'],
  ['Quanto tempo pode ter a figurinha?', 'Figurinha animada: até 10 segundos (sem som). Com som: até 5 segundos animada ou até 10 segundos parada, que são os limites do WhatsApp. O site ajusta o tamanho para caber nos 500 KB que o WhatsApp aceita.'],
  ['Dá para fazer figurinha de vídeo do YouTube?', 'Dá. Cole o link, marque o trecho e use Enquadrar, Tirar o fundo e Texto como em qualquer vídeo. Como o site não baixa do YouTube, ele toca o trecho e grava a aba (no computador: escolha “Esta aba” e deixe o áudio ligado).'],
  ['E de Instagram, TikTok, X ou Facebook?', 'No site, baixe o vídeo e envie o arquivo (📁 Arquivo, arrastar ou Ctrl+V). O app grátis para Windows baixa direto desses links e ainda manda a figurinha pelo WhatsApp.'],
  ['Funciona no celular?', 'Funciona no Chrome, no Edge e no Firefox, no Android e no computador. No iPhone, o Safari ainda não gera o formato de figurinha (WebP). Para mandar direto pelo WhatsApp e baixar de links do Instagram ou TikTok, existe o app grátis para Windows.'],
];

const REPO = 'https://github.com/ivandneto/audio-sticks';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Tags do <head>. url = endereço oficial do site (sem barra no fim). indexar = false nas prévias. */
export function cabecalho({ url, indexar }) {
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Audio Sticks', alternateName: ['ZapStick do Caos', 'AudioSticks'], url: `${url}/`, sameAs: [REPO], downloadUrl: `${REPO}/releases/latest`, description: DESCRICAO, applicationCategory: 'MultimediaApplication', operatingSystem: 'Navegador (Chrome, Edge, Firefox), Windows', inLanguage: 'pt-BR', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' }, image: `${url}/web/og-audio-sticks.jpg` },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: PERGUNTAS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  return [
    `<title>${esc(TITULO)}</title>`,
    `<meta name="description" content="${esc(DESCRICAO)}">`,
    `<meta name="keywords" content="${esc(PALAVRAS)}">`,
    indexar ? '<meta name="robots" content="index, follow">' : '<meta name="robots" content="noindex, nofollow">',
    `<link rel="canonical" href="${url}/">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="pt_BR">',
    '<meta property="og:site_name" content="Audio Sticks">',
    `<meta property="og:title" content="${esc(TITULO)}">`,
    `<meta property="og:description" content="${esc(DESCRICAO)}">`,
    `<meta property="og:url" content="${url}/">`,
    `<meta property="og:image" content="${url}/web/og-audio-sticks.jpg">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Audio Sticks, o ZapStick do Caos: crie figurinha com som para WhatsApp, grátis, no navegador">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(TITULO)}">`,
    `<meta name="twitter:description" content="${esc(DESCRICAO)}">`,
    `<meta name="twitter:image" content="${url}/web/og-audio-sticks.jpg">`,
    '<link rel="apple-touch-icon" href="/icon-192.png">',
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ].join('\n  ');
}

/** Texto de verdade no fim da página (o buscador lê; quem usa vê como "Sobre"). */
export function rodape() {
  return `<section class="seo-sobre" aria-labelledby="seoTitulo">
    <h1 id="seoTitulo">Crie figurinha com som para WhatsApp, grátis e online</h1>
    <p>O <b>Audio Sticks</b> (o <i>ZapStick do Caos</i> 🌀) transforma um trecho de vídeo, um GIF, uma foto ou um vídeo do YouTube em <b>figurinha para WhatsApp</b>: animada, parada ou <b>com som</b>. Marque o trecho, escolha o som (do vídeo, nenhum, um áudio seu ou a sua voz), ajuste o enquadramento, escreva um texto de meme e baixe ou compartilhe. Tudo acontece no seu navegador, sem cadastro e sem instalar nada.</p>
    <h2>Perguntas frequentes</h2>
    ${PERGUNTAS.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n    ')}
    <p class="seo-nota">Audio Sticks é um projeto independente e <a href="${REPO}" target="_blank" rel="noopener">de código aberto</a>; também existe o <a href="${REPO}/releases/latest" target="_blank" rel="noopener">app grátis para Windows</a>. WhatsApp é marca da Meta; este site não tem ligação com ela.</p>
  </section>`;
}

export const robots = ({ url, indexar }) => (indexar ? `User-agent: *\nAllow: /\n\nSitemap: ${url}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
export const sitemap = ({ url }) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`;
