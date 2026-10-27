# MARINASC: chatbot de WhatsApp e site

Atendimento automático no WhatsApp e site de uma página do **MARINASC Salão de Beleza**
(Cabeleireiro · Manicure · Spa), Centralidade do Kilamba, Edifício C19, Apt. 41, Luanda.

- **Chatbot** (`src/`): Node.js + Express + WhatsApp Cloud API (Meta). Menu com lista e botões
  interactivos, conversa natural com a OpenAI (só com a informação do salão, nunca inventa preços),
  áudios transcritos com o Whisper, pré-marcações guiadas que seguem para a equipa no 946 397 096,
  promoções e comandos da equipa (`/stats`, `/promo`, `/pausa`, `/retomar`). Sem IA, responde com
  `src/data/faq.json`.
- **Site** (`site/`): página estática com serviços e preços, galeria de trabalhos, horário, mapa e
  botão "Marcar pelo WhatsApp" (946 397 096). O servidor do bot também a serve em `/`, mas está
  publicada sozinha no Cloudflare Workers: https://marinasc.marinasc-chatbot.workers.dev/

**Uso diário (preços, promoções, horário, o que fazer se o bot parar): [docs/GUIA.md](docs/GUIA.md).**

## Estrutura

```
src/
├── server.js                  ← arranque do Express (site em /, webhook em /webhook)
├── config/env.js              ← variáveis de ambiente
├── routes/webhook.js          ← GET/POST /webhook e /health
├── controllers/messageController.js ← encaminhamento das mensagens (menu, marcação, IA, FAQ)
├── services/
│   ├── whatsappService.js     ← envio pela Graph API (texto, botões, listas, media)
│   ├── aiService.js           ← OpenAI (persona, memória de 24 h) e Whisper
│   ├── faqService.js          ← respostas prontas, tolerantes a erros de escrita
│   ├── bookingService.js      ← pré-marcação: serviço, dia, hora, nome → link do 946
│   ├── promoService.js        ← promoções activas
│   ├── statsService.js        ← conversas por dia e resumo para /stats
│   └── adminService.js        ← comandos da equipa e pausa
├── data/faq.json              ← preços, morada, respostas (editar aqui)
├── data/horario.json          ← horário de abertura e feriados
└── utils/                     ← logger (logs/bot.log), horário de Luanda, ficheiros JSON
data/promocoes.json            ← promoções (também por /promo no WhatsApp)
data/marcacoes.json, conversas.json, estado.json ← criados pelo bot, fora do git
deploy/                        ← serviços systemd do bot e do túnel
scripts/simular.js             ← testa o bot no terminal, sem WhatsApp
site/                          ← site estático (index.html, privacidade.html, media/)
```

## Correr localmente

```bash
npm install
cp .env.example .env          # preencher as chaves (o .env nunca vai para o git)
npm run simular               # conversa de exemplo no terminal, sem Meta
npm run simular -- "quanto custa bobes?"
npm run dev                   # servidor em http://localhost:3100
systemctl --user status marinasc-bot   # no PC do salão o bot corre como serviço
```

## Actualizar preços, promoções e horário

Ver [docs/GUIA.md](docs/GUIA.md).

## Publicar o site

O `wrangler.jsonc` serve a pasta `site/` no Worker `marinasc`. Depois de alterar o site:

```bash
npx wrangler login            # só na primeira vez
npm run preview               # ver localmente antes de publicar
npm run deploy                # publica a nova versão
```

## Ligar ao WhatsApp

O bot usa o número **955 705 188**; a equipa continua no WhatsApp Business **946 397 096**, para onde
o bot encaminha marcações, reclamações e pedidos de falar com uma pessoa.
Passo a passo completo (Meta, token, Cloudflare Tunnel, webhook): [docs/LIGAR-WHATSAPP.md](docs/LIGAR-WHATSAPP.md).
