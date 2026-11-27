# Audio Sticks: documentação técnica

Para quem vai manter ou evoluir o código. O guia de uso está no [LEIAME](../LEIAME.md).

## Visão geral

```
 navegador (public/)  ──HTTP──►  servidor Node (server.js, Express 5)
                                   ├─ lib/audio.js     → yt-dlp + ffmpeg (YouTube: download, corte, webp, mp4)
                                   ├─ lib/sources.js   → outras origens: link de qualquer site (yt-dlp) ou arquivo do PC
                                   ├─ lib/db.js        → SQLite embutido (node:sqlite)
                                   ├─ lib/whatsapp.js  → Baileys (conexão por QR, envio, contatos/grupos)
                                   ├─ lib/tools.js     → acha/baixa yt-dlp, ffmpeg, deno
                                   ├─ lib/tray.js      → ícone da bandeja (PowerShell + WinForms)
                                   ├─ lib/config.js    → data/config.json (porta)
                                   └─ lib/paths.js     → onde fica cada pasta (dev, exe, portátil)
```

- **Só JavaScript.** Node no servidor, HTML, CSS e JS puros no navegador, **sem etapa de build** na página.
- **Programas externos:** `yt-dlp` (baixar do YouTube), `ffmpeg` (áudio e vídeo) e, se não houver Node no PC, `deno` (motor de JavaScript de que o yt-dlp precisa para o YouTube). Ficam em `bin/` e são baixados sozinhos.
- **Requisito:** Node ≥ 22.5 (usa `node:sqlite`; testado no Node 26).

## Estrutura de arquivos

| Caminho | Papel |
|---|---|
| `server.js` | Rotas da API, página pública `/s/:id`, envio, pacotes, configurações e inicialização (porta, bandeja, log) |
| `lib/paths.js` | `ROOT`, `APP_HOME`, `DATA_DIR`, `BIN_DIR`… Decide entre dev, executável e modo portátil |
| `lib/config.js` | Leitura e escrita de `data/config.json`; validação de porta (1024–65535) |
| `lib/tools.js` | Resolve os binários (variável de ambiente > `bin/` > PATH), baixa o que faltar e roda `yt-dlp -U` em segundo plano |
| `lib/audio.js` | `getSourceAudio`, `cutToOgg`, `analyze` (forma de onda), `getVideoSection`, `makeAnimatedWebp`, `makeSquareMp4`, `getFrame`, `makeTrayIcon` |
| `lib/sources.js` | Origens além do YouTube: `fetchUrl` (qualquer site do yt-dlp), `addUpload` (arquivo), `probe` (duração e se tem imagem), conversão para formato tocável, `cutVideoSegment`, `frameFromFile`; cache em `data/cache/sources/` |
| `lib/webpexif.js` | Grava nome e emoji dentro do `.webp` (EXIF lido pelo WhatsApp) na hora do envio |
| `lib/db.js` | Tabelas `stickers`, `packs` e `pack_items`, mais as funções de consulta |
| `lib/whatsapp.js` | Conexão Baileys, agenda local, grupos, verificação de número e envios (voz, figurinha, figurinha com som, texto) |
| `lib/tray.js` | Script PowerShell (codificado em Base64) que desenha o ícone e o menu; conversa com o Node por stdin e stdout |
| `public/index.html`, `app.js`, `style.css` | A página: abas Criar · Combinação · Biblioteca, painel "Enviar para", ajuda, configurações e tour |
| `public/emojipicker.js`, `emoji-pt.json` | 😀 Seletor com todos os emojis (categorias, busca em português, recentes). Dados gerados do [Emojibase](https://emojibase.dev) 15.3.2 (MIT), até o Emoji 15 |
| `public/bgeditor.js` | ✂️ Editor de tirar o fundo (IA no navegador) |
| `public/texteditor.js` | 🔤 Editor de texto e emoji (camada PNG 512×512) |
| `public/public.css` | Estilo da página pública de uma figurinha |
| `public/manifest.webmanifest`, `sw.js` | PWA (instalar no celular e *share target* do YouTube) |
| `scripts/setup.js` | `npm run setup`: força o download ou atualização do yt-dlp (e do ffmpeg, se faltar) |
| `scripts/build-exe.js` | `npm run build:exe`: gera o executável |
| `scripts/build-web.js` | `npm run build:web`: monta a **versão web** (site estático) em `dist-web/` (ver "Versão web") |
| `web/motor.js` | 🌐 Motor do navegador: as mesmas rotas do `server.js` dentro da página (versão web) |
| `web/midia.js` | Abrir arquivo, quadros, enquadramento (mesma conta do `squareFilter`), figurinha parada/animada, som (corte, fades, volume, forma de onda), `.mp4` com som |
| `web/webp-anim.js` | Junta quadros `.webp` (canvas) num `.webp` animado (RIFF · VP8X · ANIM · ANMF) |
| `web/ogg.js` | `.ogg` Opus: WebCodecs `AudioEncoder` + páginas Ogg (CRC32) |
| `web/banco.js` | Biblioteca no IndexedDB (`stickers`, `packs`, `media`), no formato do `lib/db.js` |
| `web/sw.js` | Service worker (publicado como `/sw-web.js`): atende `/media/…` e `/api/…` pedindo ao motor da página |
| `web/apoio.json` | ☕ Dados **públicos** do "Me paga um café": chave Pix (aleatória), nome e cidade (obrigatória no padrão, vai `BRASIL`) |
| `lib/pix.js` | Pix copia e cola estático (BR Code do Banco Central, CRC16-CCITT), sem valor fixo |
| `assets/icon.ico` | Ícone do `.exe` |
| `Dockerfile` | Imagem para servidor; os dados ficam em `/data` |

## Pastas de dados

| Modo | `APP_HOME` (tem `data/` e `bin/`) |
|---|---|
| `npm start` | a raiz do projeto |
| executável | `%LOCALAPPDATA%\Audio Sticks` (Windows), `~/Library/Application Support/Audio Sticks` (macOS), `$XDG_DATA_HOME/audio-sticks` (Linux) |
| executável portátil | a pasta do `.exe`, quando existe uma pasta `data/` ao lado dele |

`DATA_DIR` pode ser forçado pela variável `DATA_DIR`. Conteúdo:

```
data/
  stickers.db            banco SQLite (WAL)
  config.json            { "port": 3000 }
  audio/<id>.ogg         áudio (Opus mono 48 kHz)
  audio/<id>.webp        figurinha animada 512×512 (só trechos ≤ 10 s)
  audio/<id>.mp4         vídeo quadrado com som (só trechos ≤ 10 s)
  cache/<videoId>.*      áudio completo de vídeos do YouTube ≤ 20 min (até 15 arquivos)
  cache/sources/<id>.*   mídia de outras origens (link baixado ou arquivo enviado) + <id>.json (metadados); até 25
  tmp/                   arquivos temporários e máscara dos cantos arredondados
  whatsapp-auth/         sessão do WhatsApp — SEGREDO
  whatsapp-contacts.json agenda sincronizada (nome por JID)
  sticks.log             registro (só no executável)
```

## Banco de dados (`lib/db.js`)

```sql
stickers  (id PK, title, emoji, tags "a,b", video_id, video_title, start_s, end_s,
           duration, waveform JSON[64], favorite, plays, sends, created_at, visual 0/1,
           source_kind 'youtube'|'url'|'upload', source_url, source_id, source_site,
           kind 'audio'|'sticker'|'combo', animated 0/1)
packs     (id PK, name, emoji, created_at)
pack_items(pack_id, sticker_id, added_at, PK(pack_id, sticker_id))   -- N:N
```

- Migração por acréscimo: `ALTER TABLE … ADD COLUMN` dentro de `try` (idempotente), para `visual` e as colunas `source_*`.
- Figurinhas antigas, só com `video_id`, são lidas como `sourceKind: 'youtube'`.
- `kind`: **audio** (Audio Stick, tem `.ogg`), **sticker** (Stick, sem som: `waveform` vazio, `hasAudio=false`), **combo** (Combinação Caótica: `.webp` de uma figurinha + `.ogg` de outra). `animated=0` = figurinha parada (foto).
- IDs: 6 bytes aleatórios em base64url (`newId()`).

## Origens

| Origem | Player na página | De onde sai o áudio e o vídeo |
|---|---|---|
| YouTube | iframe da API do YouTube | `lib/audio.js` (`getSourceAudio`, `getVideoSection`, `getFrame`) |
| Link de outro site | `<video>` servido por `/api/sources/:id/media` | `sources.fetchUrl`: yt-dlp com `-f bv*[height<=720]+ba/b…`, `--merge-output-format mp4`, `--match-filter "!is_live & duration <=? 3600"`, `--encoding utf-8` |
| Arquivo do PC | `<video>` (também toca áudio) | `sources.addUpload`: multer → `probe` → conversão para .mp4 ou .m4a se o navegador não tocar o formato |

- A página tem uma camada comum (`mPlay`, `mPause`, `now`, `seek`, `canPlay`), então a régua, a prévia e os atalhos não sabem qual player está ativo.
- `POST /api/stickers` recebe `{url}` (YouTube) **ou** `{sourceId}`.
- Ao regerar a animação depois (`buildVisual → videoSegmentFor`):
  - YouTube: baixa a janela de novo;
  - link: usa o cache ou baixa de novo pelo `source_url`;
  - arquivo: só funciona enquanto o arquivo estiver no cache.
- Mensagens de erro amigáveis em `friendlyFetchError` (login ou privado, site não suportado, ao vivo ou longo demais, removido).
- No Windows, o yt-dlp empacotado ignora `PYTHONIOENCODING`. É o `--encoding utf-8` que garante os acentos e emojis nos títulos.
- O nome do arquivo enviado vem do multer como latin1 e é convertido para UTF-8 só se o resultado for válido.

## Abas: Audio Stick, Stick e Combinação Caótica

| Aba | Rota | Arquivos gerados |
|---|---|---|
| Audio Stick | `POST /api/stickers` | `.ogg` + (≤10s com imagem) `.webp` animado + `.mp4` com som |
| Stick | `POST /api/stickers` com `mode: 'sticker'`, `fit: 'crop'\|'pad'`, `overlayId?` (texto e emoji) | foto: `.webp` parado (≤100 KB) + `.png` (molde); GIF/vídeo (≤10s): `.webp` animado + `.mp4` mudo (molde) |
| Combinação Caótica | `POST /api/combos` `{visualId, audioId, title, tags, deleteIds}` | copia o `.webp` da imagem e o `.ogg` do som; `.mp4` = molde da imagem em loop + som (`makeComboMp4`) |

- **Enquadramento** (`stickerFilter` em `lib/audio.js`): `crop` = quadrado central + máscara de cantos arredondados; `pad` = imagem inteira em 512×512 com fundo transparente (preserva a transparência de PNG e de GIF começando do zero).
- **Molde**: cada Stick guarda a base visual (`.png` para foto, `.mp4` mudo para animada), e é dele que a combinação faz o vídeo. Audio Sticks usam o próprio `.mp4` (só a faixa de vídeo).
- **Origens de foto/GIF** (`sources.addUpload`): `media: 'image' | 'gif' | 'video' | 'audio'`, `hasAudio`. Mídias sem som são aceitas, e quem precisa de som valida na criação (Audio Stick recusa com mensagem que indica a aba Stick).
- **Envio de Stick** (`sendOne`): sem som vai sempre como figurinha comum (`isAnimated` conforme `animated`). A rota de áudio recusa com 400.
- **`.wastickers`**: o WhatsApp não mistura figurinhas paradas e animadas no mesmo pacote, então vão só as animadas.
- **Colar e arrastar** (`readTransfer` / `takeInput` em `app.js`): `paste` global (fora de campos de texto e janelas) e `drop` no estúdio. Prioridade: GIF arrastado de outra página (`<img src>` do `text/html`, mantém a animação) → arquivo (`files`/`items`, a imagem copiada vem como `image.png` e é renomeada "imagem colada") → `data:image` → link (`text/uri-list`/`text/plain`). Tudo é lido **antes** do primeiro `await`. Na combinação, o destino é a caixa sob o mouse (`hoverSlot` no colar, `e.target.closest('.slot')` no soltar) ou `guessSlot` pelo tipo; `comboTake` envia (`uploadSourceFile`), cria a peça (Stick ou Audio Stick sem imagem) e encaixa. Acima do limite (10 s de imagem, `soundLimit()` de som) ou link de vídeo, abre a aba com `comboReturn`.
- **Na página**: `mode` (aba) fica em `localStorage` (`sticks.mode`). A combinação guarda `combo.visual`, `combo.audio` e `combo.temp` (peças criadas para ela). `comboReturn` faz a peça criada numa das outras abas voltar encaixada (`backToCombo`).

## Limites do WhatsApp (constantes)

| Regra | Valor | Onde |
|---|---|---|
| Figurinha animada | ≤ 10 s, 512×512, ≤ 500 KB | `STICK_MAX` (server), `STICK_ANIM_MAX` (página), `Math.min(10, …)` em `lib/audio.js` |
| Figurinha parada | ≤ 100 KB | `makeStaticSticker` |
| Som numa figurinha **animada** | ≤ 5 s | `ANIM_SOUND_MAX` (server e página) |
| Som numa figurinha **parada** | ≤ 10 s | `SOUND_STICKER_MAX` / `STICKER_MAX` |

- **Audio Stick:** até 5 s gera figurinha animada com som. De 5 a 10 s, `buildVisual` gera uma figurinha **parada** (1º quadro, `makeStaticSticker` aceita vídeo como entrada) e o `.mp4` via `makeComboMp4` (png + som). Grava `animated`.
- **Combinação:** o limite do som depende de `vis.animated` (5 s ou 10 s). A página espelha isso em `soundLimit()` e avisa antes de enviar.

## ✂️ Tirar o fundo (`public/bgeditor.js`)

- **IA no navegador:** [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) `@mediapipe/tasks-vision@0.10.35` (Apache-2.0), carregado sob demanda da jsDelivr (`vision_bundle.mjs` + `wasm/`). Modelos do Google Storage:
  - `selfie_multiclass_256x256` (~16 MB): pessoa = 1 − confiança de "fundo" (categoria 0). Modos `IMAGE` (foto) e `VIDEO` (quadros, timestamps de `performance.now()`);
  - `magic_touch` (~6 MB): `InteractiveSegmenter` com `keypoint` (tocar no que manter). Se a confiança no ponto tocado der < 0,5, a máscara é invertida.
  - Tenta `delegate: 'GPU'` e cai para `'CPU'` se falhar. As imagens não saem do computador.
- **Máscara:** probabilidade → `cleanIslands` (remove pedaços < 12% do maior, BFS 4-vizinhos) → `probToMask` com a **sensibilidade** (limiar 0,2–0,8 e rampa de 0,24) → canvas branco com alpha.
- **Foto:** imagem de trabalho com no máximo 768 px; pincel com gradiente radial (`destination-out` para apagar, `source-over` para recuperar); desfazer com até 25 `ImageData`.
- **Saída** (`compose`): recorta pela caixa do que sobrou (`alphaBox`), centraliza em 512×512 e aplica a **borda branca** (silhueta branca desenhada em 24 deslocamentos de raio 12 px). Foto → PNG enviado como nova origem (`/api/sources/upload`) e aberto com `fit: 'pad'`.
- **Vídeo/GIF:** `POST /api/frames {sourceId | url, start, end}` → o servidor extrai os quadros (12 fps, cabendo em 512, `extractFrames`) em `tmp/frames-<token>/in` → a página lê `GET /api/frames/:token/0001.png…`, recorta cada um (mesma caixa para todos, união das caixas, para a figurinha não "pular") → `POST /api/frames/:token/result` (multipart `frames[]` + título, emoji, tags, fps, origem) → `makeAnimatedWebpFromFrames` (≤ 490 KB; baixa a qualidade e depois pula quadros) + `makeSilentMp4FromFrames` (molde sobre fundo escuro) → Stick animado. A pasta de quadros é apagada no fim (e o `cleanupOnStart` pega sobras com mais de 1 dia).
- **Figurinha existente:** `POST /api/stickers/:id/as-source` copia o molde (`.png` ou `.mp4`) para uma origem nova. A página abre no Stick e dispara o editor. O resultado é uma **cópia**.

## 🔤 Texto e emoji (`public/texteditor.js`)

- **Página:** o editor desenha as camadas (`{type: 'text'|'emoji', text, font, size, color, stroke, strokeW, rot, upper, x, y, anchor?}`) num canvas **512×512 transparente**, o tamanho final da figurinha. O fundo de referência é a prévia `#prevImg` (`/api/frame`, já no enquadramento). `anchor: 'top'|'bottom'` (Meme clássico) faz o texto crescer para dentro a partir da borda; arrastar converte para centro. Texto mais largo que 488 px encolhe sozinho.
- **Fontes:** Impact, Arial Black e Comic Sans do sistema; Anton, Bangers, Luckiest Guy, Permanent Marker, Pacifico e Lobster do Google Fonts (link inserido ao abrir o editor; `document.fonts.load` com limite de 2,5 s antes de exportar). Emoji com `Segoe UI Emoji` / `Apple Color Emoji` / `Noto Color Emoji`.
- **Estado:** `textOv = {layers, blob, url}` em `app.js`. A camada aparece sobre a prévia (`#prevOv`) e é zerada em `openSource`, menos no recorte sem fundo de foto (`keepTextOv`).
- **Envio:** na criação, `uploadTextOverlay()` → `POST /api/overlays` (multipart `overlay`, PNG ≤ 5 MB, assinatura conferida) → `{id}` → `overlayId` no corpo de `POST /api/stickers` (Audio Stick e Stick) ou no multipart de `/api/frames/:token/result`. O arquivo (`tmp/ov-<uuid>.png`) é apagado no fim da criação ou em 30 min.
- **Servidor** (`lib/audio.js`): `withOverlay` acrescenta `-loop 1 -i camada.png` e `[base][ovl]overlay=0:0:shortest=1:format=auto` **depois** do enquadramento (recorte com máscara ou inteiro), então o texto pode passar por cima dos cantos arredondados. Vale para `makeAnimatedWebp`, `makeStaticSticker` (o `.png` molde também leva o texto, então a Combinação herda), `makeSilentMp4`, `makeSquareMp4` (`videoWithOverlay`) e os `…FromFrames`.

## Nome dentro da figurinha (`lib/webpexif.js`)

- O WhatsApp não tem legenda em figurinha. O que ele lê é o bloco **EXIF** do `.webp`: um TIFF com a tag `0x5741` contendo o JSON `{sticker-pack-id, sticker-pack-name, sticker-pack-publisher, emojis}`. Aparece ao tocar na figurinha (celular).
- `withStickerInfo(webp, {name, emojis})` é aplicado **na hora do envio** (`sendOne`), com `name` = título atual e autor "Audio Sticks". Assim, renomear vale para o próximo envio, e os arquivos guardados não mudam.
- Remove o EXIF antigo, acrescenta o bloco no fim e liga a bandeira EXIF do `VP8X`. Um `.webp` simples (`VP8 `/`VP8L`) ganha um `VP8X` com o tamanho lido do bitstream. Em qualquer erro, devolve o original.

## .webp animado e links diretos de imagem

- **Detecção** (`sources.webpInfo`): lê o RIFF (bandeira de animação no `VP8X` ou bloco `ANIM`, e soma das durações dos `ANMF`).
- **Decodificação no navegador** (`decodeAnimatedImage` em `public/app.js`): o ffmpeg 6.1 baixado pelo executável **não** lê `.webp` animado (`image data not found`); versões recentes têm o decodificador `webp_anim`. Para funcionar com qualquer ffmpeg, a página usa o **WebCodecs `ImageDecoder`** (Edge/Chrome), reamostra a 15 qps (até 10 s, máx. 512 px) e envia PNGs para `POST /api/sources/animated` (campos `original` + `frames[]` + `fps`).
- O servidor (`sources.addAnimatedFrames`) monta um **`.mov` com codec PNG** (sem perda, com transparência), que vira o `file` da origem (`media: 'gif'`). O `.webp` original fica em `display`, e `GET /api/sources/:id/media` serve o `display` para a tela mostrar a animação.
- Sem `ImageDecoder`, o upload segue normal: o servidor aceita o `.webp` animado se o ffmpeg tiver `webp_anim` (`ffmpeg -decoders`); senão, recusa com uma mensagem que orienta usar o Edge/Chrome.
- **Link direto** (`looksLikeImageUrl`: `.gif/.webp/.png/.jpg`, `media*.giphy.com`, `i.giphy.com`, `media*.tenor.com`): `POST /api/sources/image-url` baixa (até 60 MB, só `image/*`; se não for imagem devolve `{image:false}` e a página tenta como vídeo pelo yt-dlp) → `GET /api/sources/image-url/:id` → a página trata como arquivo (`uploadSourceFile`). Os temporários duram 10 min.

## Versão e "Sobre"

- A versão vem do `package.json` (`pkg.version`): `GET /api/settings` → selo ao lado do logo (`#appVer`), ⚙ Configurações, rodapé da ajuda, registro de abertura e dica do ícone da bandeja.
- Bandeja → **Sobre o Audio Sticks**: o PowerShell manda `about`, o Node (`showAbout`) responde `about|título|texto` com as linhas separadas por `¶` (o protocolo não aceita quebras de linha), e o script mostra um `MessageBox`.

## Limpeza (para não acumular lixo)

- `sources.pruneSources()`: no máximo 25 origens, nenhuma com mais de **7 dias**, e arquivos órfãos (downloads interrompidos) com mais de 1 h. Roda a cada origem nova e ao abrir o app (`cleanupOnStart`, que também apaga temporários com mais de 1 dia).
- `POST /api/cache/clear` limpa `cache/` e `tmp/` (a coleção não é tocada). `GET /api/settings` informa `cacheBytes` e `collectionBytes`.
- Combinação: `deleteIds` apaga só as peças indicadas (a página manda apenas as criadas para a combinação).

## Fluxo de criação

1. `POST /api/stickers` valida o pedido e devolve `202 { jobId }`. A página consulta `GET /api/jobs/:id` (etapas `download → cut → analyze → visual → done | error`).
2. **Áudio:** vídeos de até 20 min são baixados inteiros e ficam em cache. Os maiores baixam só a janela pedida (`--download-sections`, com folga de 3 s).
3. `cutToOgg`: corta com `-ss/-t`, aplica fades, `loudnorm` e ganho opcional, e gera libopus a 64 kb/s.
4. `analyze`: PCM a 8 kHz, gera 64 barras de RMS normalizadas de 0 a 100 (também é a forma de onda da mensagem de voz).
5. **Visual** (até 10 s): `getVideoSection` (≤ 480p, `--force-keyframes-at-cuts`) seguido de:
   - `makeAnimatedWebp`: recorte quadrado (central, ou no enquadramento escolhido: `squareFilter`/`cleanFrame`, zoom 0,25–4 e posição 0–1; abaixo de 1x a sobra fica transparente) e máscara de cantos arredondados (gerada uma única vez). Para ficar ≤ 490 KB (limite do WhatsApp) segue a escada `ANIM_LADDER`: **segura os fps e baixa primeiro a qualidade** (15→12→10 fps; só cai para 8/6/5 no fim). Trechos longos estimam o tamanho com um pedaço de 2,5 s e começam no degrau certo;
   - `makeSquareMp4`: H.264 + AAC.

   Falhar no visual não perde o áudio: o job devolve `warning`.
6. **Prévia na tela:** `GET /api/frame?v=&t=` extrai um quadro direto do stream (a URL vem de `yt-dlp -g`, guardada por 1 h).

## WhatsApp (`lib/whatsapp.js`)

- **Baileys 7 (rc)**, com versão fixa no `package.json`, porque é release candidate. Sessão em `useMultiFileAuthState(data/whatsapp-auth)`.
- **Destino** (`to`): `'me'`, `…@s.whatsapp.net`, `…@lid` ou `…@g.us`, validado em `resolveTarget()`. Toda função de envio chama `resolveTarget` **antes** de usar o socket, para o erro "não conectado" (`code: NOT_CONNECTED`, HTTP 409) ficar legível.
- **Mensagem de voz:** `ptt: true`, mais `seconds` e `waveform` calculados por nós, para o Baileys não precisar das dependências opcionais.
- **Agenda:** o WhatsApp não entrega contatos sob demanda. Os eventos `contacts.upsert/update`, `messaging-history.set` e `messages.upsert` (pushName) alimentam `whatsapp-contacts.json`. `syncContacts()` apaga a versão da coleção de app state `critical_unblock_low` e chama `resyncAppState([...], true)`. O servidor devolve então o *snapshot* completo, que gera `contactAction` para todos os contatos, sem precisar ler o QR de novo.
- **Grupos:** `groupFetchAllParticipating()`, com cache de 2 min.
- **Número:** `onWhatsApp(dígitos)`; números com 10 ou 11 dígitos ganham o prefixo 55.

### Figurinha com som (experimental)

O formato (lançado em 24/11/2026) ainda não existe no protocolo do Baileys. A mensagem é montada à mão:

```
Message.audioStickerMessage (campo 134, FutureProofMessage)
  └ FutureProofMessage.message (1) → Message
      └ Message.stickerMessage (26) → StickerMessage (+ isAnimated)
          └ StickerMessage.audioMessage (26) → AudioMessage (ogg/opus, ptt=false)
```

- As mídias são enviadas com `prepareWAMessageMedia` (sticker e audio).
- O `proto.Message.encode` é **envolvido** (patch em memória) para anexar os bytes brutos guardados em `message.__stickerRawTail`. Isso funciona também dentro de `deviceSentMessage`, quando se envia para si mesmo.
- Os números de campo vêm de engenharia reversa de terceiros (não confirmada). Quando o Baileys ganhar suporte oficial, troque `sendSoundSticker` por `sock.sendMessage`.

### Pacotes

- **Envio:** um texto de título e depois `sendOne()` para cada figurinha. Espera de 1,2 s entre envios para si mesmo, e de 2 a 3,5 s para outras pessoas.
- **`.wastickers`:** um zip com `title.txt`, `author.txt`, `tray.png` (96×96, tirado do 1º quadro do `.mp4`) e `NN.webp` (de 3 a 30 figurinhas animadas).
- **Exportar/importar:** o `manifest.json` (versão 2) tem `stickers[]` e `packs[{id, name, emoji, stickers[]}]`. A importação não duplica IDs e recria o vínculo com os pacotes.

## API

Todas as respostas de erro têm o formato `{ error: "mensagem em português" }`.

| Método e rota | Descrição |
|---|---|
| `GET /media/:id.(ogg\|webp\|mp4)[?download=1]` | Arquivos da figurinha (públicos) |
| `GET /s/:id` | Página pública da figurinha (ouvir/baixar) |
| `POST /api/stickers` | Cria: `{url \| sourceId, start, end, title, emoji, tags, videoTitle, videoDuration, fadeIn, fadeOut, normalize, gainDb, makeVisual}` → `202 {jobId}`. Com `mode: 'sticker'` e `fit`, cria um Stick (sem som) |
| `GET /api/jobs/:id` | Andamento de criação, visual ou envio de pacote |
| `GET /api/stickers?q=&favorites=1&sort=recent\|plays\|az&pack=` | Lista + `packs` + `stats` |
| `PATCH /api/stickers/:id` | `{title, emoji, tags, favorite}` |
| `PUT /api/stickers/:id/packs` | `{packs: [ids]}`, substitui os pacotes da figurinha |
| `POST /api/stickers/:id/visual` | Gera a animação de uma figurinha existente (≤ 10 s) → `202 {jobId}` |
| `POST /api/stickers/:id/play` | Conta uma reprodução |
| `DELETE /api/stickers/:id` | Apaga a figurinha, os arquivos e os vínculos |
| `POST /api/stickers/:id/send` | Envia como áudio: `{to}` |
| `POST /api/stickers/:id/send-sticker` | `{mode: 'sound'\|'plain', to}` |
| `GET/POST /api/packs`, `PATCH/DELETE /api/packs/:id` | Gestão de pacotes |
| `POST /api/packs/:id/send` | `{mode: 'sound'\|'plain'\|'audio', to}` → `202 {jobId}` (`done/total/failed`) |
| `GET /api/packs/:id/wastickers` | Baixa o pacote `.wastickers` |
| `GET /api/export[?pack=id][&ids=a,b]` | Zip com `manifest.json` + `audio/` |
| `POST /api/import` | Campo multipart `pack` (.zip) → `{added, skipped, packsAdded}` |
| `GET /api/frame?v=&t=` ou `?src=&t=` | JPEG quadrado de um quadro do vídeo (prévia), do YouTube ou de outra origem |
| `POST /api/sources` | `{url}` de qualquer site → `202 {jobId, site}`; o job termina com `source: {id, kind, url, site, title, duration, hasVideo}` |
| `POST /api/sources/upload` | Campo multipart `file` (até 1 GB): vídeo, áudio, foto ou GIF → `202 {jobId}`; o job termina com `source.media` |
| `POST /api/combos` | `{visualId, audioId, title, emoji, tags, deleteIds}` → `{sticker, deleted}` |
| `POST /api/frames` | `{sourceId \| url, start, end}` (≤10 s) → `{token, count, fps}` |
| `GET /api/frames/:token/:nnnn.png` | Quadro original para o editor |
| `POST /api/frames/:token/result` | Multipart `frames[]` (PNG recortados) + `title, emoji, tags, fps, sourceId\|url, start, end, overlayId?` → `202 {jobId}` (Stick animado) |
| `POST /api/overlays` | Multipart `overlay` (PNG 512×512 transparente, ≤ 5 MB) → `201 {id}`. Usado uma vez como `overlayId` |
| `POST /api/stickers/:id/as-source` | Molde da figurinha → nova origem (para tirar o fundo de uma cópia) |
| `POST /api/sources/animated` | Multipart `original` + `frames[]` (PNG) + `fps` → `202 {jobId}` (origem `media: 'gif'`) |
| `POST /api/sources/image-url` | `{url}` → `{image: true, id, name, type}` ou `{image: false}` |
| `GET /api/sources/image-url/:id` | A imagem baixada (temporária, 10 min) |
| `POST /api/cache/clear` | Limpa o cache → `{freed}` |
| `GET /api/sources/:id/media` | A mídia da origem (com suporte a Range) |
| `POST /api/app/restart` / `POST /api/app/quit` | Reinicia / encerra (só no executável) |
| `GET /api/whatsapp` | `{status: disconnected\|connecting\|qr\|open, qr, me, error}` |
| `POST /api/whatsapp/connect`, `/logout` | Conectar (gera o QR) / desconectar |
| `GET /api/whatsapp/contacts` | Agenda local `[{id, name, saved, phone}]` |
| `POST /api/whatsapp/contacts/sync` | Ressincroniza a agenda → `{count}` |
| `GET /api/whatsapp/groups` | `[{id, name, size}]` |
| `POST /api/whatsapp/check` | `{number}` → `{id, phone, name}` ou 404 |
| `GET /api/settings` | `{port, url, envPort, version, dataDir, portable, isExe, lanUrls}` |
| `POST /api/settings/port` | `{port}`: troca a porta sem reiniciar (409 se estiver ocupada) |
| `POST /api/open-folder` | Abre a pasta de dados no PC do servidor |
| `GET /api/ping` | `pong`: usado para detectar instância própria (público) |
| `GET /api/health` | Versões do yt-dlp e do ffmpeg |

**Senha opcional:** com `APP_PASSWORD`, tudo exige Basic Auth, exceto `/s/:id`, `/media/*`, `/public.css` e `/api/ping`.

## Porta e inicialização (`server.js → main`)

1. A porta vem de `PORT` > `config.json` > 3000.
2. Se a porta já responde `pong`, o app já está aberto: no executável, só abre o navegador; nos dois casos, sai.
3. `startTray()`, só no executável e se não houver `NO_TRAY`.
4. `ensureTools()` (baixa o que faltar) e depois `autoUpdateYtdlp()`.
5. `listenOn(porta)`: depois de escutar, confere que `127.0.0.1:porta/api/ping` responde `pong`. No Windows, outro programa pode ocupar só o 127.0.0.1 e a porta "abre" para nós mesmo assim. Se a porta estiver ocupada por **outro programa**, tenta as próximas (até +20), salva a escolhida e avisa.
6. **Troca em execução** (`switchPort`): abre a porta nova primeiro (se falhar, nada muda), depois troca a referência, salva no `config.json` e fecha a antiga, com um pequeno atraso para a resposta HTTP sair. A tela redireciona para `protocolo://host:novaPorta/`.

### Variáveis de ambiente

| Variável | Efeito |
|---|---|
| `PORT` | Fixa a porta (desativa a troca pela tela) |
| `DATA_DIR` | Pasta de dados |
| `APP_PASSWORD` | Liga a senha (Basic Auth) |
| `YTDLP_PATH`, `FFMPEG_PATH` | Usa binários específicos |
| `NO_BROWSER` | Executável não abre o navegador ao iniciar |
| `SIMULATE_YT_BLOCK` | Só para testes: finge que o YouTube bloqueou os downloads (testa o "gravar enquanto toca") |
| `NO_APP_WINDOW` | Abre no navegador padrão em vez da janela própria do Edge (o mesmo que `"appWindow": false` no `config.json`) |
| `NO_TRAY` | Executável sem ícone de bandeja (testes) |
| `BUILD_OUT` | `build:exe` gera noutra pasta (testes) |

## Bandeja do Windows (`lib/tray.js`)

- O Node inicia `powershell.exe -EncodedCommand <script>`. O script cria um `NotifyIcon` com o ícone do próprio `.exe` e um `ContextMenuStrip`.
- **PowerShell → Node:** linhas no stdout, como `open`, `folder`, `log`, `port`, `setport|3001`, `restart`, `quit`.
- **Node → PowerShell:** linhas no stdin:
  - `balloon|título|texto`;
  - `tip|texto`;
  - `askport|3000` (abre uma `InputBox`);
  - `state|texto do app|texto do WhatsApp|#cor|dica`, que atualiza os itens de status do menu, a bolinha desenhada sobre o ícone (`SetDot`) e a dica do mouse;
  - `exit`.
- **Status** (`pushTrayState` no `server.js`): verificado a cada 2 s, enviado só quando muda. A cor é verde (WhatsApp conectado), laranja (iniciando, preparando ou conectando) ou cinza (desconectado).
- **Reiniciar** (`restartApp`): fecha a bandeja e a porta, inicia `process.execPath` destacado (com `NO_BROWSER=1`) e sai. Como a porta já foi fechada, a nova cópia não se confunde com uma "instância já aberta". Na página, `waitForComeback()` consulta `/api/ping` e recarrega.
- Se o Node morre, o stdin fecha (`ReadLine` devolve null) e o ícone some junto.
- **Atenção:** o stdin é lido com `StreamReader([Console]::OpenStandardInput())`. **Não use `[Console]::In`**: no Windows PowerShell ele é sincronizado, e o `ReadLineAsync()` dele bloqueia a thread da interface até chegar a próxima linha. O ícone continua recebendo o status, mas não responde a cliques.
- **Atenção (janelas modais):** `MessageBox` e `InputBox` rodam um laço de mensagens próprio, e o `Timer` **continua disparando** dentro dele. Por isso o tick marca a linha como lida (`ReadLineAsync` de novo) **antes** de tratá-la, pausa o timer enquanto a janela está aberta e usa `$script:busy` contra reentrada. Sem isso, um único `about` abria janelas sem parar (bug da 1.1.1 antes da correção).
- **Atenção:** o script fica numa *template string* do JS. Não use crase (o escape do PowerShell) dentro dele; use `[Environment]::NewLine`.

## Versão web (branch `versao-web`)

O site é a **mesma tela** (`public/`) com outro motor. Em vez do `server.js`, quem responde às rotas `/api/…` é o `web/motor.js`, dentro da própria página.

- **As três portas:** toda conversa da tela com o motor passa por `api()` (JSON), `apiRaw()` (resposta crua) e `uploadWithProgress()` (envio de arquivo). Com `MOTOR.local` definido, as três desviam para o motor do navegador.
- **Como a página sabe que é o site:** `scripts/build-web.js` copia `public/` + `web/` para `dist-web/` e marca o `index.html` com `<meta name="motor" content="navegador">` e `<meta name="versao" content="<versão>-web">`. Sem a marca (o app), nada muda.
- **`CAPS`:** o que cada motor oferece (`whatsapp`, `linkDownload`, `settings`, `publicLink`). No site some o WhatsApp, o "Enviar para" e as configurações (`html.web` no CSS), e entram o **⬇ Baixar para Windows** (última versão via API de releases do GitHub; sem resposta, a página de releases) e o quadro "baixe o app" na tela inicial.
- **☕ Pix:** o build gera `web/pix.json` (`{copiaECola, nome}`) e `web/pix.svg` (QR, pacote `qrcode`) a partir de `web/apoio.json`. No app, o `server.js` responde às **mesmas rotas** (`GET /web/pix.json` e `/web/pix.svg`), lendo o `apoio.json` empacotado no `.exe`.
- **Tour e ajuda:** passos com elemento oculto são pulados; no site há boas-vindas própria e passos do Baixar e do quadro do app.
- **Motor (`web/motor.js`):** fontes ficam na memória da aba (`registrarFonte`; somem ao recarregar, como o cache do app); figurinhas, pacotes e mídias no IndexedDB (`web/banco.js`). Tarefas (`/api/jobs/:id`) com as mesmas etapas do servidor. Rotas: lista com filtros, `/api/frame` (prévia), `/api/overlays`, `POST /api/stickers` (sem som e com som), `/visual`, `/as-source`, `/play`, `PATCH`/`DELETE`, pacotes, `/api/combos`, `/api/frames` (+ `…/result`) para o "Tirar o fundo", `/api/export` e `/api/import` (`.zip` igual ao do app, com `fflate`). WhatsApp e links respondem com mensagem explicando.
- **Service worker:** `<img>`, `<video>`, `<audio>` e downloads de `/media/…` e `/api/…` são respondidos pelo motor (com `Range` para o vídeo poder pular no tempo). A página só começa depois que ele assume (`controllerchange`).
- **Figurinha animada no navegador:** quadros tirados **uma vez** a 15 qps (menos qps reaproveita os mesmos), tamanho estimado com amostra de 12 quadros, e a mesma escada de fps/qualidade do app (≤ 490 KB). Ex.: vídeo do Instagram de 10 s em ~10 s.
- **`.mp4` com som:** WebCodecs `VideoEncoder` (H.264 baseline 512×512, 20 qps) + `AudioEncoder` (AAC; Opus se não houver AAC), empacotado com `mp4-muxer`. É o arquivo para criar a figurinha com som no WhatsApp.
- **Som:** `OfflineAudioContext.decodeAudioData` → mono 48 kHz; volume equalizado pelo RMS (~ -16 dBFS, perto do -14 LUFS do app) com limitador suave.
- **Avisos:** "fica neste navegador" (fechável) e "navegador sem WebP" (Safari antigo). `navigator.storage.persist()` para o navegador não apagar a Biblioteca.
- **Bibliotecas (MIT), copiadas no build:** `mp4-muxer` e `fflate` → `dist-web/web/vendor/`.
- **Testar no PC:** `npm run build:web` e depois `python -m http.server 4000 --directory dist-web` (arquivos estáticos, sem servidor, como na Cloudflare Pages).
- **Publicação:** Cloudflare Pages. Comando de build: `npm run build:web` (com uma página "Em breve" de reserva enquanto o `main` não tem o site); pasta publicada: `dist-web`; `NODE_VERSION=22`.

## Página (`public/app.js`)

Módulo único, organizado por seções comentadas: utilidades, modal, player do YouTube (IFrame API), seleção e régua com zoom, prévia, criação, coleção, figurinha com som, pacotes, destino, WhatsApp, ajuda, configurações e tour.

- **Abas:** `setMode('create' | 'combo' | 'library')`. Dentro de Criar há dois motores, escolhidos pelo campo **Som**: `'audio'` (som do vídeo) e `'sticker'` (sem som, ou um som próprio juntado depois via `/api/combos`, em `attachSound`).
- **Estado só no navegador** (`localStorage`): aba (`sticks.mode`), destino atual (`sticks.target`), destinos recentes (`sticks.recents`), emojis recentes (`sticks.emojiRecents`) e tour concluído (`sticks.tourDone`). Tudo dentro de `try/catch`.
- **Tour:** `tourSteps()` monta os passos conforme o que está visível (editor aberto, se há figurinhas); passos cujo elemento não existe são pulados. Passos com `tab` trocam de aba sozinhos (ex.: a Biblioteca). O destaque é um `div` com `box-shadow` gigante. Navega por teclado (capturado antes dos atalhos do app) e abre sozinho na primeira visita, exceto quando a página foi aberta com `?url=`.
- **Ajuda:** o conteúdo está em `HELP_TABS`. Para acrescentar uma aba, basta um item novo `{label, html()}`.

## Executável (`npm run build:exe`)

1. **esbuild** junta `server.js` e as dependências em `build/app.cjs` (CJS, node22). Ficam de fora os extras opcionais do Baileys: `sharp`, `jimp`, `link-preview-js`, `audio-decode` e `music-metadata`.
2. Copia o `node.exe` e aplica **rcedit** (ícone e informações de versão).
3. `node --build-sea` injeta o app (Single Executable Application).
4. Muda o **subsistema PE para GUI** (campo `Subsystem` = 2), para não abrir o terminal.
5. Monta `dist/Audio Sticks/` (exe, `public/` e `LEIA-ME.txt`) e o `.zip`.

**Proteções do build:**
- nunca apaga a pasta de saída inteira, porque pode haver `data/` com a sessão do WhatsApp;
- o `.zip` leva **só** os arquivos do programa;
- se o `.exe` estiver aberto, para com uma mensagem clara.

## Testes manuais recomendados

- Criar figurinhas de ~4 s (gera o visual) e de ~20 s (só áudio), num vídeo curto (cache) e num longo (por janelas).
- Outras origens: um link do TikTok (ex.: o de testes do yt-dlp), um .mov (precisa converter) e um .mp3 (só áudio). Um link do Vimeo deve dar a mensagem de login.
- Bandeja: a bolinha muda ao conectar e desconectar o WhatsApp; testar **Reiniciar** e **Encerrar** pelo menu e por ⚙.
- Exportar → apagar o pacote → importar, e conferir se o pacote volta com as figurinhas.
- Trocar a porta pela tela e pela bandeja; ocupar a porta com outro programa (`python -m http.server 3000 --bind 127.0.0.1`) e abrir o app.
- Executável num PC sem Node nem ffmpeg: deve baixar o yt-dlp, o ffmpeg e o deno.
- WhatsApp: voz, figurinha sem som, figurinha com som, pacote, destino contato, grupo e número.

## Nome do app

O nome mudou de **Sticks Audio** para **Audio Sticks**. Compatibilidades mantidas:
- `paths.appDirWithMigration()` renomeia `%LOCALAPPDATA%\Sticks Audio` para `Audio Sticks` na primeira abertura (se a pasta antiga estiver em uso, continua usando-a);
- a importação aceita `manifest.app` igual a `audio-sticks` ou `sticks-audio`;
- as chaves `sticks.*` do localStorage e as variáveis internas `STICKS_*` da bandeja continuaram iguais.

## 🎙️ Gravar enquanto toca (redundância do YouTube)

- **Detecção:** `isYtBlocked(err)` (`Sign in to confirm` / `not a bot`) em `server.js`. Os trabalhos de criação gravam `job.code = 'yt-blocked'` junto com a mensagem. No Audio Stick, se o **som** veio do cache e só a **imagem** foi bloqueada, a figurinha recém-criada é apagada e o erro sobe, para a página gravar o trecho inteiro.
- **Janela própria** (`openApp`): no Windows, o .exe abre `msedge.exe --user-data-dir=%LOCALAPPDATA%\Audio Sticks\janela --auto-accept-this-tab-capture --app=<url>?janela=1`. A flag faz o `getDisplayMedia({preferCurrentTab: true})` ser aceito **sem diálogo e sem gesto do usuário** (testado no Edge 158). O perfil separado garante um processo novo, para a flag valer. Sem Edge, `"appWindow": false` ou `NO_APP_WINDOW`, cai em `openBrowser`. O GitHub continua no navegador padrão.
- **Página** (`recordYtSegment` / `recordAndRetry` em `app.js`): `IN_APP_WINDOW` vem do `?janela=1` e fica em `sessionStorage` (o endereço perde os parâmetros). Fora da janela, um `confirmBox` dá o gesto do usuário que o navegador exige. A gravação usa um **segundo player** (`makeRecordingPlayer`) por cima do principal, com `controls: 0`, sem legenda (`unloadModule('captions')`) e uma capa invisível que bloqueia o mouse: `getDisplayMedia` → `cropTo(CropTarget.fromElement(.rec-holder))` → `MediaRecorder` (`webm` vp9/vp8 + opus).
- **Aquecimento:** mesmo sem controles, o YouTube mostra título, logo e o ícone de pausa nos primeiros ~4 s depois do play, e de novo a cada `seekTo`. Por isso o player toca a partir de `início − 4,6 s` **sem gravar** e chega ao início **tocando direto**. Perto do começo do vídeo, o aquecimento usa câmera lenta (`setPlaybackRate` 0,25–0,75) para durar o bastante. Só então o `MediaRecorder` começa. Um laço de 40 ms anota em que ponto da gravação o vídeo passou pelo início (`offset`, + 0,065 s de atraso de captura medido) e para em `fim + 0,25 s`. Testado: o som cai a ~0,02 s do trecho certo (correlação com o áudio original).
- **Limite:** um trecho que começa no primeiro ~1,5 s do vídeo não tem como aquecer, e o título do YouTube aparece no início da gravação.
- **Depois:** o `.webm` vai por `uploadSourceFile` (`addUpload` regrava com `-c copy` quando o `MediaRecorder` não grava a duração), vira a origem, a seleção passa a ser `offset … offset + duração`, o nome, o emoji e o texto são mantidos (`keepTextOv`), e a página clica em **Criar** de novo. `ytBlockedUntil` (30 min) faz os próximos **Criar** do YouTube irem direto para a gravação.
- **Limites:** tempo real, a qualidade do player, só no computador (Edge/Chrome). Minimizar a janela pode congelar a imagem.

## Limitações conhecidas

- A figurinha com som é experimental (formato montado à mão).
- O recorte de fundo depende de baixar a IA (~22 MB) na primeira vez; no vídeo/GIF, só pessoas; bordas finas (cabelo) podem serrilhar.
- A conexão com o WhatsApp não é oficial, e há risco de bloqueio em envios em massa para terceiros.
- `.wastickers` não carrega som (limitação do formato).
- Baixar do YouTube e de outros sites depende do yt-dlp estar atualizado. Posts privados ou que exigem login não são baixados. Quando o YouTube bloqueia a sua internet, a redundância "gravar enquanto toca" cobre o YouTube (não os outros sites).
- Arquivos enviados só ficam no cache enquanto estiverem entre as 25 origens mais recentes. Depois disso, não dá para regerar a animação de uma figurinha feita a partir deles.
