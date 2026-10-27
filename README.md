# MARINASC: chatbot de WhatsApp e site

Atendimento automático no WhatsApp e site de uma página do **MARINASC Salão de Beleza**
(Cabeleireiro · Manicure · Spa), Centralidade do Kilamba, Edifício C19, Apt. 41, Luanda.

- **Chatbot** (`src/`): WhatsApp Cloud API (Meta), a correr no Cloudflare Workers (sempre ligado,
  sem depender do PC; ver [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md)). Também corre no PC com Node.js. Menu com lista e botões
  interactivos, conversa natural com IA gratuita no Groq (gpt-oss-120b; só com a informação do salão, nunca inventa preços),
  áudios transcritos com o Whisper, marcações com agenda (só oferece horas livres, evita sobreposições,
  confirmar/recusar/remarcar/cancelar) que seguem para a equipa no 946 397 096,
  promoções e comandos da equipa (`/stats`, `/promo`, `/pausa`, `/retomar`). Sem IA, responde com
  `src/data/faq.json`.
- **Site** (`site/`): página estática com serviços e preços, galeria de trabalhos, horário, mapa e
  botão "Marcar pelo WhatsApp" (946 397 096). Publicada no mesmo Worker do bot:
  https://marinasc.marinasc-chatbot.workers.dev/

**Como usar (marcações, comandos da equipa): [docs/COMO-USAR.md](docs/COMO-USAR.md).**
**Uso diário (preços, promoções, horário, o que fazer se o bot parar): [docs/GUIA.md](docs/GUIA.md).**

## Estrutura

```
src/
├── worker.js                  ← entrada na Cloudflare (webhook, Durable Object "Bot", site)
├── server.js                  ← entrada no PC (Express; site em /, webhook em /webhook)
├── config/env.js              ← variáveis de ambiente
├── routes/webhook.js          ← GET/POST /webhook e /health
├── controllers/messageController.js ← encaminhamento das mensagens (menu, marcação, IA, FAQ)
├── services/
│   ├── whatsappService.js     ← envio pela Graph API (texto, botões, listas, media)
│   ├── aiService.js           ← IA: Groq ou OpenAI (persona, memória de 24 h) e Whisper
│   ├── faqService.js          ← respostas prontas, tolerantes a erros de escrita
│   ├── bookingService.js      ← pré-marcação: serviço, dia, hora, nome
│   ├── agendaService.js       ← agenda: vagas, durações, profissionais, bloqueios
│   ├── promoService.js        ← promoções activas
│   ├── statsService.js        ← conversas por dia e resumo para /stats
│   └── adminService.js        ← comandos da equipa e pausa
├── data/faq.json              ← preços, morada, respostas (editar aqui)
├── data/horario.json          ← horário de abertura e feriados
├── data/agenda.json           ← duração dos serviços e profissionais por área
└── utils/                     ← logger, horário de Luanda, dados (Cloudflare ou data/)
data/promocoes.json            ← promoções de exemplo (no dia a dia: /promo no WhatsApp)
data/*.json                    ← dados do bot quando corre no PC, fora do git
deploy/                        ← serviços systemd, para correr no PC (opcional)
scripts/simular.js             ← testa o bot no terminal, sem WhatsApp
site/                          ← site estático (index.html, privacidade.html, media/)
```

## Correr localmente

```bash
npm install
cp .env.example .env          # preencher as chaves (o .env nunca vai para o git)
npm run simular               # conversa de exemplo no terminal, sem Meta
npm run simular -- "quanto custa bobes?"
npm run deploy                # publica o bot e o site na Cloudflare
npx wrangler tail marinasc    # ver o bot a trabalhar, em directo
npm run dev                   # (opcional) o bot no PC, em http://localhost:3100
```

## Actualizar preços, promoções e horário

Ver [docs/GUIA.md](docs/GUIA.md).

## Publicar o site e o bot

O `wrangler.jsonc` publica a pasta `site/` e o bot (`src/worker.js`) no Worker `marinasc`:

```bash
npx wrangler login            # só na primeira vez
npm run preview               # ver localmente antes de publicar (usa o .env)
npm run deploy                # publica a nova versão
```

## Ligar ao WhatsApp

O bot usa o número **955 705 188**; a equipa continua no WhatsApp Business **946 397 096**, para onde
o bot encaminha marcações, reclamações e pedidos de falar com uma pessoa.
Passo a passo completo (Meta, token, Cloudflare, webhook): [docs/LIGAR-WHATSAPP.md](docs/LIGAR-WHATSAPP.md).
