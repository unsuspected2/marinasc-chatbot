# O bot na Cloudflare

O bot corre no **Cloudflare Workers**, no mesmo Worker do site (`marinasc`). Não precisa deste PC
ligado, nem de túnel: está sempre no ar, com endereço fixo e de graça (plano Free).

| O quê | Endereço |
|---|---|
| Site | https://marinasc.marinasc-chatbot.workers.dev/ |
| Webhook da Meta | https://marinasc.marinasc-chatbot.workers.dev/webhook |
| Estado | https://marinasc.marinasc-chatbot.workers.dev/health |

## Como funciona

- `src/worker.js` recebe o webhook, responde logo 200 à Meta e passa a mensagem ao **Durable
  Object "Bot"**, que corre o mesmo código que corria no PC (`src/controllers`, `src/services`).
- Os dados ficam no armazenamento desse Durable Object, em vez da pasta `data/`: pré-marcações,
  promoções, contagem de conversas, pausa, conversas a meio e a memória das últimas 10 mensagens.
  Vêem-se pelo WhatsApp do salão com `/stats` e `/marcacoes`.
- A IA é o Groq (gratuito): `openai/gpt-oss-120b` para conversar e `whisper-large-v3-turbo` para os
  áudios.

## Segredos

Ficam na Cloudflare (nunca no git). Para pôr ou trocar um:

```bash
npx wrangler secret put WHATSAPP_TOKEN     # cola o valor quando pedir
```

| Segredo | Para quê |
|---|---|
| `WHATSAPP_TOKEN` | token permanente da Meta (utilizador do sistema) |
| `VERIFY_TOKEN` | palavra secreta da verificação do webhook (a mesma que está na Meta) |
| `GROQ_API_KEY` | IA gratuita, em https://console.groq.com/keys |
| `APP_SECRET` | (recomendado) "Segredo da app" da Meta: o bot recusa pedidos que não venham da Meta |

O `APP_SECRET` está em developers.facebook.com → a app → **Definições da app → Básico → Segredo da
app → Mostrar**.

Os valores que não são segredo (`PHONE_NUMBER_ID`, `ADMIN_NUMBERS`…) estão em `wrangler.jsonc`.

## Publicar uma alteração

Depois de mudar preços (`src/data/faq.json`), horário (`src/data/horario.json`), o site ou o código:

```bash
npm run simular        # confirma que está tudo bem, no terminal
npm run deploy         # publica o site e o bot (cerca de 30 segundos)
```

As pré-marcações, promoções e estatísticas não se perdem ao publicar.

## Ver o que o bot está a fazer

- No painel: https://dash.cloudflare.com → **Workers & Pages → marinasc → Logs**.
- No terminal, em directo: `npx wrangler tail marinasc --format pretty`

## Limites do plano gratuito

- Cloudflare: 100.000 pedidos por dia, muito acima do que o salão precisa.
- Groq: cerca de 1.000 respostas da IA por dia. Se passar, o bot responde com as respostas prontas e
  volta a tentar a IA 10 minutos depois.

## Correr no PC em vez da Cloudflare

O mesmo código também corre no PC (`npm start`, com os dados em `data/`), como antes: ver
[ARRANQUE-AUTOMATICO.md](ARRANQUE-AUTOMATICO.md). Só um dos dois pode receber as mensagens: o que
estiver no webhook da Meta.
