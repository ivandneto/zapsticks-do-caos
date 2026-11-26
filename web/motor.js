// 🌐 Motor do navegador (versão web).
// Responde às MESMAS rotas que o server.js (/api/…), só que aqui dentro da página, sem servidor.
// A tela (public/app.js) não sabe a diferença: ela chama api()/apiRaw()/uploadWithProgress() e essas
// funções desviam para cá quando o site foi montado com <meta name="motor" content="navegador">.
//
// Fase 1 (agora): só o esqueleto. A coleção começa vazia e o resto responde "em construção".
// Próximos passos: abrir arquivos, gerar a figurinha no navegador e guardar a coleção (IndexedDB).

const EM_OBRA = 'Na versão web isso ainda está em construção. Por enquanto, use o app para Windows (link no topo da página).';
const versao = () => document.querySelector('meta[name="versao"]')?.content || 'web';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export function criarMotor() {
  return {
    /** Mesmo contrato do fetch(): recebe a rota e devolve uma Response. */
    async fetch(path, opts = {}) {
      const url = new URL(path, location.origin);
      const metodo = (opts.method || 'GET').toUpperCase();
      const rota = url.pathname;
      if (metodo === 'GET' && rota === '/api/stickers') return json({ stickers: [], packs: [], stats: { total: 0, seconds: 0, sends: 0 } });
      if (rota === '/api/whatsapp') return json({ status: 'unavailable', qr: null, me: null, error: null });
      if (rota === '/api/settings') return json({ version: versao(), url: location.origin, web: true });
      if (rota === '/api/ping') return new Response('pong');
      return json({ error: EM_OBRA }, 501);
    },
    /** Mesmo contrato do uploadWithProgress(): devolve o JSON da resposta. */
    async upload() {
      throw new Error(EM_OBRA);
    },
  };
}
