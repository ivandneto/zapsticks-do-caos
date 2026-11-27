# Audio Sticks

*O ZapSticks do Caos* 🌀

Transforme qualquer trecho de vídeo (**YouTube, Instagram, TikTok, X, Facebook…** ou um **arquivo seu**) em **figurinha de áudio** e mande para o WhatsApp: para você mesmo, para um contato, para um grupo ou para um número. Tudo roda no seu PC e é gratuito.

> Dentro do app, o botão **?** abre um guia ilustrado e o botão **Tour** faz uma apresentação guiada da tela.

---

## Sumário

1. [Instalar e abrir](#1-instalar-e-abrir)
2. [A tela, parte por parte](#2-a-tela-parte-por-parte)
3. [Criar uma figurinha](#3-criar-uma-figurinha) (🎬 Criar · 🌀 Combinação Caótica)
4. [Conectar o WhatsApp](#4-conectar-o-whatsapp)
5. [Enviar: para quem e como](#5-enviar-para-quem-e-como)
6. [Figurinha com som](#6-figurinha-com-som)
7. [Pacotes (categorias)](#7-pacotes-categorias)
8. [Guardar, compartilhar e levar para outro PC](#8-guardar-compartilhar-e-levar-para-outro-pc)
9. [Configurações e porta](#9-configurações-e-porta)
10. [Ícone na bandeja (executável)](#10-ícone-na-bandeja-executável)
11. [Usar no celular e fora de casa](#11-usar-no-celular-e-fora-de-casa)
12. [Atalhos de teclado](#12-atalhos-de-teclado)
13. [Problemas comuns](#13-problemas-comuns)
14. [Versão web](#14-versão-web)
15. [Para desenvolvedores](#15-para-desenvolvedores)

---

## 1. Instalar e abrir

### Opção A: executável (para quem só quer usar)

1. Descompacte o `Audio-Sticks-<versão>-win32-x64.zip` em qualquer pasta.
2. Dê dois cliques em **`Audio Sticks.exe`**.
3. O app abre sozinho numa **janela própria** (do Edge, sem abas, como um aplicativo), e fica como um **ícone na bandeja**, perto do relógio (pode estar escondido na setinha **^**).

Sobre o executável:
- Não precisa instalar Node, ffmpeg nem nada.
- **Na primeira vez**, ele baixa as ferramentas de áudio (cerca de 200 MB). Precisa de internet e leva alguns minutos, e um balão avisa quando está preparando.
- Se o Windows mostrar *"O Windows protegeu o computador"*, clique em **Mais informações → Executar assim mesmo**. O aviso aparece porque o programa não tem assinatura digital, que é paga.
- Abrir o `.exe` de novo com o app já rodando só abre a janela. Não duplica.
- **Por que uma janela própria?** Ela já vem com a gravação da própria tela liberada, que é o que faz o [🎙️ gravar enquanto toca](#-quando-o-youtube-bloqueia-gravar-enquanto-toca) funcionar sem pedir permissão. Ela usa um perfil separado do seu Edge (sem seus favoritos e logins). Sem o Edge, o app abre no navegador padrão. Para usar sempre o navegador padrão, ponha `"appWindow": false` no `config.json` da pasta de dados.
- Para atualizar de versão, apague a pasta antiga e descompacte a nova. **Suas figurinhas não ficam na pasta do programa** (veja a [seção 8](#8-guardar-compartilhar-e-levar-para-outro-pc)), então nada se perde.

### Opção B: pelo código (para desenvolver)

Precisa do **Node 22.5 ou mais novo**.

```powershell
npm install
npm start          # ou: npm run dev (reinicia sozinho ao salvar)
```

Abra **http://localhost:3000**. Para gerar o executável: `npm run build:exe` (detalhes na [seção 14](#15-para-desenvolvedores)).

---

## 2. A tela, parte por parte

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▮▮ Audio Sticks  v1.6.0    [● +55 11 9…] [Eu Enviar para: Você ▾] [🧭] [?] [⚙]│ ← topo
├──────────────────────────────────────────────────────────────────────────┤
│ [ 🎬 Criar ]     [ 🌀 Combinação Caótica ]     [ 📚 Biblioteca  15 ]       │ ← abas
├──────────────────────────────────────────────────────────────────────────┤
│ 1 Cole um link ou envie um arquivo   [ link…            ][Carregar][📁]   │
│ ┌────────── vídeo ───────────┐      3 Som e visual                        │
│ │      ┌─FIGURINHA─┐  [🔍]   │      Som: [🔊 Do vídeo 5s][🔇 Sem som 10s]  │
│ │      └───────────┘         │           [🎵 Enviar áudio 5s][🎙️ Voz 5s]  │
│ └────────────────────────────┘      Visual: [◼ Quadrado|⬚ Inteiro] 🔍 ✂️ 🔤│
│ 2 Marque o trecho                   [prévia] 😂🔥💀…＋                     │
│ [===⟦████ 4.0s ████⟧ ┊5s anima ==]   Nome · Tags · Pacotes                │
│ [Início aqui]   (▶)   [Fim aqui]    🎞️ Vira figurinha animada com som · 4s │
│                                     [ ✨ Criar figurinha               ]   │
└──────────────────────────────────────────────────────────────────────────┘
```

| Parte | O que faz |
|---|---|
| **Versão** (ao lado do logo, ex.: `v1.6.0`) | Qual versão está instalada e rodando. Também aparece na dica do ícone da bandeja, no **Sobre** e no registro. |
| **Status do WhatsApp** (topo) | Verde com o seu número = conectado. Clique para conectar ou desconectar. |
| **Enviar para** (topo) | Para quem vão todos os envios: você, um contato, um grupo ou um número. Vale em **qualquer aba**; clique para abrir o painel do lado direito ([seção 5](#5-enviar-para-quem-e-como)). |
| **🧭 Tour** | Apresentação guiada que destaca cada parte da tela (e abre a Biblioteca sozinho quando chega nela). Abre sozinho na primeira visita. |
| **?** | Guia ilustrado: começando, recursos, atalhos e dúvidas. |
| **GitHub** (ícone do gatinho) | Abre o [repositório do projeto](https://github.com/ivandneto/audio-sticks): código, novidades e versões para baixar. |
| **⚙** | Configurações: porta, endereço para o celular, pasta dos dados, backup. |
| **☕** | *Me paga um café*: o app é grátis; aqui tem um **Pix** de qualquer valor (QR code ou copia e cola). Também no rodapé da **Ajuda**. |
| **Abas** | **🎬 Criar** (figurinha com ou sem som, ou áudio), **🌀 Combinação Caótica** (a imagem de uma + o som de outra) e **📚 Biblioteca** (todas as suas figurinhas, com o número delas). |
| **Criar: esquerda** | O vídeo, com a **moldura amarela** do que vira figurinha e o botão **🔍 Enquadrar**, e a régua para marcar o trecho. Aceita **arrastar** um arquivo e **Ctrl+V** (imagem copiada, arquivo ou link). |
| **Criar: direita** | **Som**, **Visual** (Quadrado/Inteiro, 🔍 Enquadrar, ✂️ Tirar o fundo, 🔤 Texto e emoji), prévia e emoji, nome, tags, pacotes e o botão **Criar**, com uma linha dizendo **o que vai sair**. Essa coluna acompanha a rolagem, então o botão Criar está sempre à mão. |
| **📚 Biblioteca** | Suas figurinhas. Funciona como uma mesa de som: toque para ouvir. Filtros **Com som · Sem som · Combo**, busca, favoritas e os **pacotes** do lado. |

**Botões de cada figurinha**, da esquerda para a direita:

| Botão | Ação |
|---|---|
| 🟢 WhatsApp | Envia para o destino escolhido: **figurinha com som** se ela tiver animação, ou **áudio** se não tiver. |
| 🟨 Figurinha | Opções da figurinha animada: com som, sem som, só o áudio, baixar `.mp4` e `.webp`. |
| ★ | Favoritar. |
| ⇪ | Compartilhar: arquivo, link, baixar. |
| ✎ | Editar nome, emoji, tags e pacotes. |
| 🗑 | Excluir. |

---

## 3. Criar uma figurinha

No topo do estúdio há **duas abas**:

| Aba | Cria | De onde |
|---|---|---|
| 🎬 **Criar** | Figurinha **com ou sem som** (animada ou parada) ou **áudio** (mensagem de voz). Você escolhe o som | Vídeo, foto, GIF ou áudio (link ou arquivo) |
| 🌀 **Combinação Caótica** | Figurinha com a **imagem de uma** e o **som de outra** | Peças da sua coleção **ou** criadas na hora |

### 🎬 Criar

A tela tem duas colunas (no celular, uma embaixo da outra):

- **Esquerda: o vídeo e o trecho.** O vídeo mostra a **moldura da figurinha** por cima, e embaixo fica a régua para marcar o trecho.
- **Direita: tudo o que configura a figurinha**, sempre visível: **Som**, **Visual**, prévia e emoji, nome, tags, pacotes e o botão **Criar**. Logo acima do botão, uma linha diz **o que vai ser criado** (ex.: *Vira figurinha animada com som · 3,0s*).

1. **Escolha a origem** (veja a tabela abaixo). Colar um link já carrega o vídeo.
2. **Marque o trecho**:
   - arraste as **alças amarelas** na régua, ou toque o vídeo e use **Início aqui (I)** e **Fim aqui (O)**;
   - arraste o **meio** da seleção para mover o trecho inteiro;
   - os botões **−** e **+** ajustam de 0,1 em 0,1 segundo;
   - **▶** (ou `espaço`) toca só o trecho, e **repetir** fica tocando em loop.
3. **Som**: escolha de onde vem o som da figurinha:

   | Som | Trecho | Vira |
   |---|---|---|
   | 🔊 **Do vídeo** | até 5s | figurinha **animada com som** (e o áudio) |
   | 🔊 **Do vídeo** | 5 a 10s | figurinha **parada com som** (o 1º quadro) |
   | 🔊 **Do vídeo** | 10 a 60s | **só áudio** (mensagem de voz) |
   | 🔇 **Sem som** | até 10s | figurinha **animada** (foto: parada), sem som |
   | 🎵 **Enviar áudio** / 🎙️ **Gravar voz** | até 10s | figurinha com **o seu som** (até 5s se animada, 10s se parada) |

   Foto e GIF não têm som, então **Do vídeo** fica desligado. Um arquivo **só de áudio** vira áudio direto.
4. **Visual**: **◼ Quadrado** (escolha a parte em **🔍 Enquadrar**) ou **⬚ Inteiro** (a imagem toda, fundo transparente), além de **✂️ Tirar o fundo** e **🔤 Texto e emoji**.
5. **Dê a cara**: emoji (aparece no cantinho da prévia), nome, tags e **pacotes**.
6. **Ajustes de som** (opcional, quando há som): volume equalizado, entrada e saída suaves, reforço de volume.
7. Clique em **Criar**.

### De onde pode vir o som

| Origem | Como funciona |
|---|---|
| **YouTube** | Abre na hora, sem baixar antes. Links com tempo (`?t=90`) já começam no ponto certo. |
| **Instagram, TikTok, X/Twitter, Facebook, Kwai, Reddit, Twitch, SoundCloud, Dailymotion…** | Cole o link. O app **baixa o vídeo primeiro** (de alguns segundos a meio minuto) e depois você recorta igual. Funciona com tudo o que o *yt-dlp* suporta. |
| **Arquivo do seu PC** | Botão **📁 Arquivo** ou **arraste o arquivo** para o estúdio. Vídeo (mp4, mov, webm, mkv, avi…), áudio (mp3, m4a, wav, ogg, flac…), foto (jpg, png, webp) ou **GIF / .webp animado**. Formatos que o navegador não toca são convertidos automaticamente. |
| **Link direto de imagem ou GIF** | Links do **Giphy** (`media.giphy.com/…`), do **Tenor** ou terminados em `.gif`, `.webp`, `.png`, `.jpg`: o app baixa a imagem e trata como arquivo. |

- Posts **privados**, de "melhores amigos" ou que **exigem login** não podem ser baixados. Salve o vídeo no PC e use **Arquivo**.

#### 🎙️ Quando o YouTube bloqueia: gravar enquanto toca

Às vezes o YouTube **bloqueia downloads da sua internet** por algumas horas (*"Sign in to confirm you're not a bot"*), geralmente depois de muitos downloads seguidos. Não é defeito do app nem do vídeo, e passa sozinho. Para o app **não parar**, ele tem uma redundância automática:

1. Você clica em **Criar** normalmente.
2. Se o YouTube bloquear, o app **toca o trecho no player e grava a imagem e o som** direto da tela (só a área do vídeo).
3. A gravação vira a mídia carregada (*"… (gravado)"*), e a figurinha é criada sozinha, com o **mesmo nome, emoji, pacotes e texto**.
4. Por 30 minutos, o app já vai **direto para a gravação**, sem tentar baixar de novo.

- Na **janela própria do app** (a que o `.exe` abre), tudo acontece **sem pedir nada**.
- Num **navegador comum**, ele pergunta antes, e o navegador pede para compartilhar a tela: escolha **"Esta aba"** e deixe **"Compartilhar o áudio da aba"** ligado.
- O trecho toca em **tempo real** (um trecho de 5s leva uns 5s para gravar), e você ouve enquanto grava. Não minimize a janela durante a gravação.
- Antes de gravar, o player toca uns segundos **sem gravar** (às vezes em câmera lenta). É para o título e os botões do YouTube sumirem da imagem. O trecho gravado fica limpo e com o som no ponto certo.
- Trecho que começa no **primeiro segundo e meio** do vídeo pode sair com o título do YouTube no comecinho (não há vídeo antes para "aquecer").
- A qualidade é a do player. Funciona no **Edge e no Chrome do computador**. No celular, não.
- Limite: mídias de até **1 hora** (transmissões ao vivo não são aceitas).
- **Arquivo só de áudio** (mp3, por exemplo) vira figurinha de áudio, porque não há imagem para animar.
- Os vídeos baixados ou enviados ficam num cache para você recortar vários trechos sem baixar de novo. Ele **se limpa sozinho**: no máximo 25 origens e **nada com mais de 7 dias**. Também dá para limpar em ⚙ Configurações.

### O que é criado

| Duração do trecho | O que é criado |
|---|---|
| até **5 s** (origem com imagem) | áudio + **figurinha animada com som** (512×512, em loop) + vídeo `.mp4` quadrado com som |
| de 5 a **10 s** (origem com imagem) | áudio + **figurinha parada com som** (o 1º quadro do trecho) + vídeo `.mp4` |
| de 10 a **60 s** | só o áudio (mensagem de voz) |

### 🖼️ Figurinha sem som, foto e GIF

Em **Som**, escolha **🔇 Sem som** (com foto e GIF ele já vem escolhido).

1. Clique em **📁 Arquivo** (ou arraste) para usar uma **foto** ou um **GIF**, ou cole o link de um vídeo.
2. Vídeo: marque um trecho de **até 10s**. Foto e GIF não têm esse passo (o GIF usa os primeiros 10s).
3. Escolha o **enquadramento**:
   - **◼ Recortar quadrado**: arredonda os cantos e pega o centro, ou a parte que você escolher em **🔍 Enquadrar** (veja abaixo);
   - **⬚ Inteiro, fundo transparente**: mostra a imagem toda, sem cortar (ótimo para fotos recortadas e PNGs com transparência).
4. **Som** (opcional): **🔇 Sem som** (o normal), **🎵 Enviar áudio** (um arquivo seu) ou **🎙️ Gravar voz** (pelo microfone, na hora). Com som, ela vira **figurinha com som**: até **5s** de som se for animada, até **10s** se for parada (foto). Som mais comprido usa só o começo, e o app avisa.
5. **Criar figurinha**. O botão verde do card envia como figurinha comum (sem som) ou com som, se você escolheu um.

> 🎙️ **Gravar voz** só funciona no PC (endereço `localhost`): o navegador não libera o microfone no celular pelo Wi-Fi (`http://192.168…`). No celular, use **🎵 Enviar áudio**.

#### 🔍 Enquadrar (zoom e posição)

O botão **🔍 Enquadrar** fica no canto do vídeo (e embaixo da prévia). Ele abre o vídeo atrás de uma moldura quadrada:

- **Arraste** para escolher o que aparece e use o **zoom** pela barra ou pela rodinha do mouse: até **4x** para aproximar, ou **abaixo de 1x** para afastar. Afastado, sobra espaço no quadrado, e essa sobra fica **transparente** (aparece quadriculada).
- Em **vídeo**, o trecho marcado **toca em loop** dentro da moldura, para você ver se algo sai do quadro.
- **⬚ Caber inteiro** afasta até o vídeo inteiro caber; **↺ Centralizar** volta ao padrão.
- Vídeo horizontal no zoom 1x já usa a altura toda, então não dá para subir ou descer: aproxime ou afaste o zoom.

**Moldura em cima do vídeo:** enquanto você assiste ou marca o trecho, o player mostra o quadrado que vai virar figurinha, com o resto escurecido. No YouTube a moldura não aparece em cima do player (ele não informa o tamanho do vídeo), mas a tela de enquadrar funciona. Funciona no **Stick** (recorte quadrado) e no **Audio Stick** com imagem, em foto, GIF e vídeo. O botão passa a mostrar o zoom escolhido (ex.: *Enquadrado (2.0x)*), que vale até você trocar de mídia.

#### ✂️ Tirar o fundo (estilo WhatsApp)

Em **Visual**, o botão **✂️ Tirar o fundo** abre um editor com inteligência artificial que roda **no seu navegador**. As imagens não saem do seu computador.

| Ferramenta | Para quê | Onde funciona |
|---|---|---|
| 🧍 **Recortar pessoa** | Detecta as pessoas e apaga o resto. Já roda sozinho ao abrir | Foto, **GIF e vídeo** (quadro a quadro) |
| 👆 **Tocar no que manter** | Toque na pessoa, no bicho ou no objeto: ele recorta só aquilo | Foto |
| 🧽 **Apagar** / 🖌️ **Recuperar** | Pincel para ajustar o que a IA errou (tamanho ajustável) | Foto |
| **Sensibilidade** | Diminua se sobrar fundo; aumente se cortar a pessoa | Tudo |
| ⚪ **Borda branca** | Contorno branco em volta, igual figurinha de WhatsApp | Tudo |

- **Foto:** clique em **Usar este recorte**. A imagem sem fundo vira a nova origem (já no enquadramento "inteiro") e é só **Criar figurinha**.
- **Vídeo/GIF:** marque o trecho (até 10s) antes. O editor recorta cada quadro (12 por segundo) e mostra a animação. Ao usar, a figurinha animada sem fundo é criada direto.
- **Figurinhas que já existem:** no botão amarelo, **✂️ Tirar o fundo (cria uma cópia)**. A original continua intacta. Na Combinação Caótica, a imagem escolhida tem o botão **✂️ Sem fundo**, e o resultado volta encaixado.
- **Na primeira vez**, o navegador baixa a biblioteca e os modelos de IA (~22 MB, do Google). Depois ficam guardados. Por isso precisa de internet na primeira vez.
- **Limitações:** cabelo e bordas finas podem ficar serrilhados (use o pincel). No vídeo/GIF, só funciona o recorte automático de **pessoas**.

#### 🔤 Texto e emoji

Em **Visual**, o botão **🔤 Texto e emoji** abre um editor para escrever na figurinha, com ou sem som, em **foto, GIF e vídeo**: o texto fica fixo por cima da animação inteira.

| Recurso | Como |
|---|---|
| **＋ Texto** | Quantos quiser, com quebra de linha. Texto comprido demais encolhe sozinho para caber |
| **＋ Emoji** | Escolha na grade, no **＋** (todos os emojis, ver abaixo) ou cole qualquer emoji |
| 😂 **Meme clássico** | Texto branco com borda preta, em cima e embaixo |
| **Fonte** | Impact (a de meme), Anton, Bangers, Luckiest Guy, Permanent Marker, Pacifico, Lobster, Bricolage, Arial Black e Comic Sans |
| **Cor** e **borda** | Cores prontas ou qualquer outra. A borda tem cor e espessura (0 = sem borda) |
| **Tamanho** e **inclinação** | Pelos controles, ou a **rodinha do mouse** em cima do item escolhido |
| **Mover** | Arraste no quadro. **Delete** apaga o item escolhido |

- Clique em **Usar**: o texto aparece na **prévia**, e o botão mostra quantos itens há. Depois é só **Criar figurinha**.
- O texto vale até você **trocar de vídeo ou foto** (no ✂️ Tirar o fundo de uma foto, ele continua). Para tirar, abra o editor e clique em **Limpar tudo**.
- As fontes vêm do Google Fonts na primeira vez (precisa de internet). Sem internet, entra uma fonte parecida.

#### 😀 Todos os emojis

Ao lado dos emojis rápidos (o da figurinha, o do editor de texto, o de **Editar figurinha** e o dos **pacotes**) há um botão **＋**. Ele abre o seletor completo, igual ao do WhatsApp:

- **Categorias** no topo: 🕘 Recentes, 😀 Sorrisos e pessoas, 🐻 Animais e natureza, 🍔 Comida e bebida, ⚽ Atividades, 🚗 Viagens e lugares, 💡 Objetos, ❤️ Símbolos e 🏳️ Bandeiras.
- **Busca em português**: "risada", "gato", "fogo", "futebol"…
- Os que você usa ficam em **Recentes**.
- No Windows, as **bandeiras de país** não aparecem: o Windows não tem desenho para elas (🇧🇷 vira "BR").

> Soltar uma foto ou um GIF troca o **Som** sozinho para **Sem som**, já que eles não têm som do vídeo.

> **.webp animado** (o formato do Giphy e das figurinhas salvas do WhatsApp) é tratado como **animação**. Quem lê a animação é o navegador (Edge ou Chrome atualizados), e o app monta uma cópia sem perda que funciona em qualquer versão do ffmpeg.

### 🌀 Combinação Caótica

Junta a **imagem** de uma figurinha com o **som** de outra.

1. **Imagem** (lado esquerdo), de três jeitos:
   - **Escolher da coleção**: qualquer figurinha com imagem (com ou sem som, ou outra combinação);
   - **📁 Foto, GIF ou vídeo do computador**: vira uma figurinha na hora;
   - **✂️ Recortar de um vídeo**: abre a aba **🎬 Criar** (com **Sem som**) e, quando você cria, a peça **volta sozinha** para a combinação.
2. **Som** (lado direito): até **5s** se a imagem for **animada**, e até **10s** se for **parada** (limites do WhatsApp):
   - **Escolher da coleção**: qualquer figurinha com som dentro do limite;
   - **📁 Áudio ou vídeo do computador**: vira o som na hora;
   - **🎙️ Gravar minha voz**: grava pelo microfone (até o limite) e encaixa;
   - **✂️ Recortar de um vídeo ou áudio**: abre a aba **🎬 Criar** (com **Do vídeo**) e a peça volta sozinha.

   **Direto na caixa:** cada caixa também aceita **arrastar** (arquivo, ou imagem arrastada de outra página) e **Ctrl+V** com o mouse em cima dela (imagem copiada, sem precisar salvar, arquivo ou link). Se o vídeo ou o som passar do limite, abre a aba certa para você marcar o trecho, e a peça volta encaixada.
3. Toque na prévia para ouvir. Dê um nome, tags e pacotes e clique em **🌀 Criar combinação caótica**.

**Para não acumular lixo:** as peças **criadas só para a combinação** podem ser apagadas automaticamente (a opção vem marcada). As peças que você **escolheu da coleção nunca são apagadas**.

**Atalhos:** no botão amarelo de qualquer figurinha há *"Usar esta imagem com outro som"*, *"Usar este som com outra imagem"* e, na figurinha sem som, *"Dar voz a ela"*. Eles abrem a combinação já com a peça encaixada.

---

## 4. Conectar o WhatsApp

1. Clique no **status** do topo e depois em **Gerar QR code**.
2. No celular: **WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho**.
3. Aponte para o código. Pronto: o status fica verde com o seu número.

A conexão fica salva. Não precisa ler o QR de novo, a menos que você desconecte.

> A conexão funciona como um WhatsApp Web, por uma biblioteca **não oficial** (Baileys). Ela é gratuita. Mandar para você mesmo é de baixíssimo risco. Para outras pessoas, veja o aviso na [seção 5](#5-enviar-para-quem-e-como).
> A sessão fica em `data/whatsapp-auth/`. **Nunca compartilhe essa pasta**: ela dá acesso ao seu WhatsApp.

---

## 5. Enviar: para quem e como

No topo da tela, ao lado do status do WhatsApp, **Enviar para** mostra o destino atual, em qualquer aba. Clique nele: abre um **painel do lado direito** para escolher (ele fecha ao escolher, ao clicar fora ou com `Esc`):

| Aba | Como funciona |
|---|---|
| **Você** | A sua conversa "Você" (mensagem para si mesmo). É o padrão. |
| **Contatos** | Na primeira vez, clique em **Buscar meus contatos no WhatsApp**. O app pede a sua agenda ao WhatsApp, sem desconectar. Há busca por nome ou número. |
| **Grupos** | Todos os grupos em que você está, com o número de participantes. |
| **Número** | Digite DDD + número (ex.: `11 98888-7777`). O app confere se ele tem WhatsApp. Se faltar o código do país, usa +55. |

O destino **vale para todos os botões** (figurinha, áudio e pacote) até você trocar. Os últimos usados aparecem em **Recentes**.

> **Cuidado com bloqueio:** enviar para outras pessoas por conexão não oficial aumenta o risco se você disparar muita coisa para muita gente em pouco tempo. No envio de pacotes para outras pessoas e grupos, o app espera de 2 a 3,5 segundos entre uma figurinha e outra.

---

## 6. Figurinha com som

É o formato que o WhatsApp começou a liberar no Brasil em **24/11/2026**: uma figurinha que toca som quando tocam nela. Os limites são **5 segundos** de som numa figurinha **animada** e **10 segundos** numa **parada**. A figurinha animada em si pode ter até **10 segundos** de imagem.

- O botão **verde** do card envia a figurinha com som.
- Ela é **experimental**: o Baileys ainda não suporta esse formato oficialmente, então o app monta a mensagem por conta própria. Se chegar como *"mensagem não suportada"*, use uma alternativa no botão **amarelo**:
  - **Enviar só a figurinha** (animada, sem som);
  - **Enviar só o áudio** (mensagem de voz);
  - **Baixar vídeo .mp4** e criar a figurinha no próprio WhatsApp: *😊 → Figurinhas → Criar*, escolher o vídeo e ativar o áudio. Esse caminho é garantido, desde que o seu WhatsApp já tenha recebido o recurso.

> **Nome da figurinha:** o WhatsApp **não tem legenda** em figurinha. O app grava o **nome** e o **emoji** dentro dela (como nome do pacote, com autor "Audio Sticks"), e quem recebe vê isso ao **tocar na figurinha** no celular. Para o texto aparecer na conversa, escreva **na imagem** com **🔤 Texto e emoji**.

> **Fluidez:** o WhatsApp aceita figurinha animada de até ~**500 KB**. Para caber, o app mantém os quadros por segundo e baixa primeiro a qualidade (no tamanho de figurinha quase não se nota). Vídeo muito cheio de detalhe e longo (perto de 10s) ainda pode ficar menos fluido: nesse caso, um trecho de **até 5 ou 6 s** fica bem melhor.

Figurinhas antigas, de até 10s, que ainda não têm imagem: clique no botão amarelo e depois em **Gerar figurinha animada** (até 5s fica animada; de 5 a 10s, parada).

---

## 7. Pacotes (categorias)

- **＋ Novo pacote**: nome e emoji (ex.: 😂 Memes, ⚽ Futebol).
- **Colocar figurinhas no pacote**: na aba **Criar** (campo *Pacotes*, que fica marcado para as próximas) ou depois, pelo **✎** do card. Uma figurinha pode estar em **vários pacotes**.
- **Clique num pacote** (na **📚 Biblioteca**) para filtrar a coleção. Aparece a barra do pacote:
  - **Enviar pacote**: manda um título "📦 Memes · 8 figurinhas" e depois cada figurinha, com progresso;
  - **⋯ Mais**:
    - enviar sem som ou só os áudios;
    - **baixar `.wastickers`**;
    - exportar só esse pacote;
    - renomear;
    - excluir (as figurinhas continuam na coleção).

**O que é `.wastickers`?** É o formato de pacote que apps gratuitos de figurinhas, como o *Sticker Maker*, importam para adicionar ao WhatsApp como **pacote de verdade**, com o botão "Adicionar ao WhatsApp". Vai só a animação, sem som. O WhatsApp exige de 3 a 30 figurinhas.

---

## 8. Guardar, compartilhar e levar para outro PC

**Onde ficam os seus dados** (figurinhas, pacotes, configurações e a sessão do WhatsApp):

| Como você usa | Pasta |
|---|---|
| Executável | `%LOCALAPPDATA%\Audio Sticks\data` |
| Executável em **modo portátil** | `data\` ao lado do `.exe` (veja abaixo) |
| Pelo código (`npm start`) | `data\` dentro do projeto |

O caminho exato aparece em **⚙ Configurações → Seus dados**, que tem o botão *Abrir pasta*, e no menu da bandeja → *Abrir pasta das figurinhas*.

- **Modo portátil:** crie uma pasta chamada `data` ao lado do `Audio Sticks.exe`. A partir daí, ele guarda tudo nela. Serve para pendrive.
- **Backup:** **Exportar** (ou ⚙ → *Fazer backup*) baixa um `.zip` com todas as figurinhas **e pacotes**.
- **Outro PC ou um amigo:** **Importar** lê esse `.zip`. O que já existe não é duplicado.
- **Link da figurinha:** cada figurinha tem uma página (`/s/<id>`) para ouvir e baixar. Fora de casa, ela só funciona pelo túnel ([seção 11](#11-usar-no-celular-e-fora-de-casa)).

---

## 9. Configurações e porta

O botão **⚙** abre:

- **Porta do aplicativo.** O app funciona como um pequeno site no seu PC, num "número de porta" (padrão **3000**). Se outro programa usar a mesma porta, digite outra (de 1024 a 65535) e clique em **Trocar porta**:
  - a troca é **na hora, sem reiniciar**, e a página vai sozinha para o novo endereço;
  - se a porta escolhida estiver ocupada, nada muda e aparece um aviso;
  - a escolha fica salva em `data/config.json`.
- **Abrir no celular:** os endereços para usar no celular, no mesmo Wi-Fi.
- **Seus dados:** a pasta, o botão para abri-la, o backup, o espaço ocupado pela coleção e pelo cache, e o botão **🧹 Limpar cache agora** (a coleção não é afetada).
- **Aplicativo** (só no executável): status, **Reiniciar** e **Encerrar**. Ao reiniciar, a página volta sozinha.
- **Ajuda:** refazer o tour e abrir o guia.

**Troca automática ao abrir:** se a porta salva estiver ocupada por **outro programa**, o app escolhe a próxima livre, salva e avisa (no terminal ou num balão da bandeja).

**Ordem de prioridade da porta:** variável de ambiente `PORT` > `data/config.json` > 3000. Com `PORT` definida, a troca pela tela fica desativada.

---

## 10. Ícone na bandeja (executável)

**O ícone mostra o status** com uma bolinha no canto:

| Bolinha | Significa |
|---|---|
| 🟢 verde | App rodando e WhatsApp conectado |
| 🟠 laranja | Iniciando, preparando as ferramentas ou WhatsApp conectando (aguardando o QR) |
| ⚪ cinza | App rodando, WhatsApp desconectado |

Passar o mouse mostra a porta e o estado do WhatsApp.

**Clique com o botão esquerdo** para abrir o app no navegador. **Clique com o botão direito** para ver o menu:

| Item do menu | Resultado |
|---|---|
| **Abrir Audio Sticks** | Abre o app (na janela própria; sem o Edge, no navegador padrão) |
| **Sobre o Audio Sticks** | Janela com a **versão**, o endereço, o status do WhatsApp, o tamanho da coleção e do cache, a pasta dos dados e o link do projeto |
| ● **Rodando · http://localhost:3000** | Status do app e o endereço atual (clique para abrir) |
| **WhatsApp: conectado (+55…)** | Status da conexão (clique para abrir e conectar, se precisar) |
| **Abrir pasta das figurinhas** | Abre a pasta de dados no Explorador |
| **Ver registro (log)** | Abre `data/sticks.log` (útil para entender erros) |
| **Trocar porta…** | Caixinha para digitar a nova porta. Funciona mesmo se a página não abrir por causa do conflito |
| **Projeto no GitHub** | Abre o repositório no navegador |
| **Reiniciar** | Fecha e abre o app de novo, na mesma porta |
| **Encerrar** | Desliga o app (e some da bandeja) |

Erros na hora de abrir aparecem numa caixa de mensagem, porque no executável não há janela de terminal.

---

## 11. Usar no celular e fora de casa

**Mesmo Wi-Fi:** abra no celular um dos endereços de **⚙ → Abrir no celular** (ex.: `http://192.168.0.10:3000`).

**Fora de casa (grátis), com um túnel:** com o app rodando, abra um terminal e rode:

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000   # use a sua porta, se trocou
```

Ele mostra um endereço `https://….trycloudflare.com`, que muda a cada vez que você roda o comando. Pelo https, o celular também libera:
- **Compartilhar o arquivo** direto no menu do celular (WhatsApp, Telegram…);
- **Instalar como app** (Chrome → *Adicionar à tela inicial*). Depois, no app do YouTube, *Compartilhar → Sticks* já abre o vídeo pronto para recortar.

**Com o túnel, ponha senha**, senão qualquer pessoa com o endereço usa o seu app:

```powershell
$env:APP_PASSWORD = "uma-senha-sua"; npm start
```

Os links de figurinhas (`/s/...`) continuam abertos para quem os recebe. Se você trocar a porta, o túnel precisa ser reiniciado apontando para a porta nova.

---

## 12. Atalhos de teclado

| Tecla | Ação |
|---|---|
| `I` / `O` | Marca o início / fim do trecho no ponto atual do vídeo |
| `espaço` | Ouve o trecho marcado (de novo para parar) |
| `←` `→` | Volta / avança 1 s no vídeo |
| `shift` + `←` `→` | Ajuste fino de 0,1 s |
| `1` … `9` | Toca as primeiras figurinhas da Biblioteca (de qualquer aba) |
| `Esc` | Fecha janelas, o painel "Enviar para", o seletor de emojis e o tour |
| `Ctrl` + `V` | Cola uma **imagem copiada**, um arquivo ou um link direto no estúdio, sem salvar. Na Combinação, cai na caixa em que o mouse está |
| No tour: `→` / `Enter`, `←` | Próximo / anterior |

---

## 13. Problemas comuns

| Problema | Solução |
|---|---|
| O **nome** ou a "legenda" do GIF não aparece no WhatsApp | Figurinha não tem legenda no WhatsApp. O app grava o nome e o emoji **dentro** da figurinha: quem recebe vê ao **tocar nela** no celular. Para ler na conversa, escreva **na imagem** com **🔤 Texto e emoji** |
| Colei um GIF e ele ficou parado | Ao **copiar a imagem**, o navegador guarda só o primeiro quadro. **Arraste** o GIF para o app ou cole o **link** dele |
| A janela "Editar figurinha" fechava ao copiar o nome | Corrigido na 1.2.0: selecionar um texto e soltar o mouse fora da caixa não fecha mais a janela |
| A figurinha feita de um GIF do Giphy ficou **parada** | Corrigido na 1.1.1: o `.webp` animado agora vira animação. Recrie a figurinha a partir do arquivo ou do link. Use o Edge ou o Chrome atualizados |
| Qual versão eu tenho? | Ao lado do logo (`v1.6.0`), em ⚙ Configurações ou na bandeja → **Sobre o Audio Sticks** |
| *"Foto e GIF não têm som"* | Em **Som**, escolha **Sem som**, **Enviar áudio** ou **Gravar voz**, ou use a **🌀 Combinação Caótica** para juntar com um som |
| A figurinha animada ficou **travada** no WhatsApp | Corrigido na 1.5.0: o app segura os quadros por segundo para caber nos 500 KB. Crie de novo; vídeo muito detalhado fica mais fluido em trechos de até 5–6 s |
| A bandeira 🇧🇷 aparece como "BR" | O Windows não desenha bandeiras de país. Por isso elas nem aparecem no seletor de emojis no Windows |
| A combinação não aceita o som | Com imagem **animada**, o som pode ter até **5s**; com imagem **parada**, até **10s**. Recorte um trecho menor ou use uma foto |
| O "Tirar o fundo" não carrega | Na primeira vez, ele baixa a IA de recorte (~22 MB) da internet. Confira a conexão e tente de novo |
| O recorte deixou fundo ou cortou a pessoa | Mexa na **sensibilidade**; na foto, use o pincel **Apagar** / **Recuperar** ou **Tocar no que manter** |
| A página não abre ou mostra outro site | Outro programa está na mesma porta. Use **⚙ → Trocar porta** ou, no executável, a bandeja → **Trocar porta…** |
| *"O YouTube bloqueou downloads da sua internet"* | É temporário (algumas horas). O app **grava o trecho enquanto toca** e cria a figurinha assim mesmo ([como funciona](#-quando-o-youtube-bloqueia-gravar-enquanto-toca)). Num navegador comum, permita compartilhar **"Esta aba"** com áudio |
| A gravação veio **sem som** | Na janela de compartilhar, escolha **"Esta aba"** e ligue **"Compartilhar o áudio da aba"**. Na janela própria do app, isso já vem certo |
| YouTube de outro tipo de erro / não baixa | Feche e abra o app (o yt-dlp se atualiza sozinho). Pelo código: `npm run setup` |
| Link do Instagram/TikTok dá erro | O post pode ser privado ou exigir login. Feche e abra o app (o baixador se atualiza) e tente de novo, ou salve o vídeo e use **📁 Arquivo** |
| *"Formato não suportado"* ao enviar arquivo | Use vídeo (mp4, mov, webm, mkv…) ou áudio (mp3, m4a, wav, ogg…) |
| O app travou ou ficou estranho | Bandeja (botão direito) → **Reiniciar**, ou ⚙ → Aplicativo → Reiniciar |
| *"Esse vídeo não pode tocar fora do YouTube"* | O dono bloqueou o vídeo incorporado. Ainda dá para criar: digite os tempos de início e fim |
| No WhatsApp Web (PC), a figurinha com som parece fora de sincronia | É coisa do WhatsApp Web: a animação fica em loop por conta própria e o som entra em qualquer ponto dela. No celular toca certinho. A figurinha em si está sincronizada |
| Figurinha com som chega "não suportada" | Formato experimental, veja a [seção 6](#6-figurinha-com-som) |
| Não aparecem meus contatos | **Enviar para** (no topo) → Contatos → **Buscar meus contatos no WhatsApp**, ou use a aba **Número** |
| WhatsApp desconectou sozinho | Você encerrou a sessão no celular (Aparelhos conectados). Conecte de novo pelo status |
| Windows bloqueia o `.exe` | **Mais informações → Executar assim mesmo** |
| Quero ver o que aconteceu | Bandeja → **Ver registro (log)**, ou o terminal no `npm start` |

---

## 14. Versão web

O Audio Sticks também roda **no navegador**, sem instalar nada (computador ou celular): **[audio-sticks.pages.dev](https://audio-sticks.pages.dev/)**. É a mesma tela do app, e a figurinha é feita **no seu aparelho**: nada é enviado para servidor.

**O que muda em relação ao app:**

| No app | No site |
|---|---|
| Cola link (YouTube, Instagram, TikTok…) | **Arquivo** do aparelho (escolher, arrastar ou colar com Ctrl+V) ou link do **YouTube**: tudo igual ao app (Enquadrar, Tirar o fundo, Texto, Criar); a diferença é que o site não baixa, ele toca o trecho e **grava** antes de seguir (no computador, escolha "Esta aba" com o áudio; no celular não dá). Instagram/TikTok mostram um aviso |
| Botão verde **envia** pelo WhatsApp | Botão verde **baixa ou compartilha**: figurinha `.webp`, vídeo `.mp4` com som e áudio `.ogg` |
| "Enviar para", conexão do WhatsApp e ⚙ Configurações | Não existem no site |
| Coleção na pasta de dados do PC | Coleção **neste navegador**. Use **Exportar** de vez em quando para não perder |

**Como colocar no WhatsApp a figurinha feita no site:**

- **Celular:** botão verde → **Compartilhar** → WhatsApp → conversa.
- **WhatsApp Web (PC):** baixe o `.webp` e arraste para a conversa. Ele vira figurinha.
- **Figurinha com som:** baixe o `.mp4` e, no WhatsApp do celular, vá em 😊 → **Figurinhas → Criar**, escolha o vídeo e deixe o som ligado (se o seu WhatsApp já tiver o recurso).

**Levar a coleção entre o site e o app:** o **Exportar** dos dois gera o mesmo `.zip`. Exporte de um lado e use **Importar** do outro.

**Navegadores:** Chrome, Edge e Firefox atualizados. O Safari do iPhone ainda não gera WebP; o site avisa.

O site também tem o botão **⬇ Baixar para Windows** (sempre a última versão do app) e o **☕ Me paga um café**.

---

## 15. Para desenvolvedores

A documentação técnica (arquitetura, rotas da API, banco, build do executável e decisões) está em **[docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md)**.

Comandos:

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o app (porta 3000 ou a salva) |
| `npm run dev` | Igual, reiniciando ao salvar arquivos |
| `npm run setup` | Baixa ou atualiza o yt-dlp (e o ffmpeg, se faltar) |
| `npm run build:exe` | Gera `dist/Audio Sticks/` e o `.zip` para distribuir |

Docker (opcional, para servidor 24h):

```bash
docker build -t audio-sticks .
docker run -d -p 3000:3000 -v sticks-data:/data -e APP_PASSWORD=troque audio-sticks
```

---

## Sobre o nome

O app se chamava **Sticks Audio** e passou a se chamar **Audio Sticks**. Na primeira vez que a versão nova abre, a pasta `%LOCALAPPDATA%\Sticks Audio` é renomeada para `%LOCALAPPDATA%\Audio Sticks`. Figurinhas, pacotes, porta e a conexão do WhatsApp vão junto. Pacotes `.zip` exportados com o nome antigo continuam podendo ser importados.

---

Baixar conteúdo do YouTube, Instagram, TikTok e de outros sites pode ir contra os termos desses serviços. Use para fins pessoais e respeite os direitos de quem criou o conteúdo.
