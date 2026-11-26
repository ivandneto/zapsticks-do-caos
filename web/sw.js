// 🛰️ Service worker da versão web (publicado como /sw-web.js).
// A tela pede imagens, vídeos e downloads por endereços como /media/<id>.webp e /api/frame?… (os mesmos do app).
// No site não há servidor: este ajudante intercepta esses pedidos e pergunta ao motor que roda na página
// (web/motor.js), que responde com o arquivo guardado no navegador ou gerado na hora.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !/^\/(api|media)\//.test(url.pathname)) return;
  e.respondWith(perguntar(e));
});

async function perguntar(e) {
  let cliente = e.clientId ? await self.clients.get(e.clientId) : null;
  if (!cliente) cliente = (await self.clients.matchAll({ type: 'window' }))[0];
  if (!cliente) return new Response('Abra o site para usar este endereço.', { status: 503 });
  const corpo = ['GET', 'HEAD'].includes(e.request.method) ? null : await e.request.arrayBuffer();
  const canal = new MessageChannel();
  cliente.postMessage({ tipo: 'motor', url: e.request.url, method: e.request.method, headers: [...e.request.headers], body: corpo }, [canal.port2]);
  const r = await new Promise((ok) => {
    canal.port1.onmessage = (m) => ok(m.data);
    setTimeout(() => ok({ status: 504, headers: [], body: 'O site demorou demais para responder.' }), 180000);
  });
  return new Response(e.request.method === 'HEAD' ? null : r.body, { status: r.status, headers: r.headers });
}
