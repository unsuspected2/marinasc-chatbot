# MARINASC: chatbot de WhatsApp e site

Atendimento automático no WhatsApp e site de uma página do **MARINASC Salão de Beleza**
(Cabeleireiro · Manicure · Spa), Centralidade do Kilamba, Edifício C19, Apt. 41, Luanda.

- **Chatbot** (`src/`): Node.js + Express + WhatsApp Cloud API (Meta). Responde a preços, horário,
  localização e marcações a partir de `src/data/faq.json`. O que não estiver no FAQ vai para a OpenAI,
  que só pode usar a informação do salão e nunca confirma marcações sozinha.
- **Site** (`site/`): página estática com serviços e preços, galeria de trabalhos, horário, mapa e
  botão "Marcar pelo WhatsApp" (946 397 096). O servidor do bot também a serve em `/`, mas pode ser
  publicada sozinha no Cloudflare Pages (pasta `site/`, sem comando de build).

## Estrutura

```
src/
├── server.js                  ← arranque do Express (site em /, webhook em /webhook)
├── config/env.js              ← variáveis de ambiente
├── routes/webhook.js          ← GET/POST /webhook e /health
├── controllers/messageController.js ← menu, comandos, encaminhamento das mensagens
├── services/
│   ├── whatsappService.js     ← envio de mensagens pela Graph API
│   ├── aiService.js           ← OpenAI com a persona e os preços do salão
│   └── faqService.js          ← procura de respostas no FAQ
├── data/faq.json              ← preços, horário, morada, marcações (editar aqui)
└── utils/logger.js
scripts/simular.js             ← testa o bot no terminal, sem WhatsApp
site/                          ← site estático (index.html + media/)
```

## Correr localmente

```bash
npm install
cp .env.example .env          # preencher as chaves (o .env nunca vai para o git)
npm run simular               # conversa de exemplo no terminal, sem Meta
npm run simular -- "quanto custa bobes?"
npm run dev                   # servidor em http://localhost:3000
```

## Actualizar preços

Os preços estão em `src/data/faq.json`. As entradas `menu_*` são as respostas das opções 1 a 6 do menu
e também alimentam a IA. A ordem das chaves conta: a primeira chave encontrada na mensagem é a resposta,
por isso as mais específicas (ex.: "cordoletes com cachos") vêm antes das gerais ("cordoletes").
Lembre-se de actualizar também `site/index.html`.

## Ligar ao WhatsApp

O bot usa o número **955 705 188**; a equipa continua no WhatsApp Business **946 397 096**, para onde
o bot encaminha marcações, reclamações e pedidos de falar com uma pessoa.
Passo a passo completo (Meta, token, Cloudflare Tunnel, webhook): [docs/LIGAR-WHATSAPP.md](docs/LIGAR-WHATSAPP.md).
