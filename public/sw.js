// Service worker mínimo: só existe para o app poder ser "instalado" no celular
// e aparecer no menu Compartilhar do app do YouTube. Não guarda nada em cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
