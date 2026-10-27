# Guia do bot MARINASC

Guia para o dia a dia: mudar preços, promoções e horário, e o que fazer se o bot parar.
O bot corre na Cloudflare ([CLOUDFLARE.md](CLOUDFLARE.md)), não neste PC. Para usar o bot no dia a dia (comandos, marcações), ver [COMO-USAR.md](COMO-USAR.md).
Os ficheiros abrem-se no
VS Code; depois de mudar um ficheiro em `src/` ou `site/`, publica a alteração:

```bash
npm run simular    # confirma que não estragaste nada (conversas de exemplo, sem enviar nada a ninguém)
npm run deploy     # publica o bot e o site
```

---

## Mudar preços

Ficheiro: **`src/data/faq.json`**

1. As listas completas estão nas entradas que começam por `menu_`:
   `menu_trancas`, `menu_unhas`, `menu_rosto` (sobrancelhas, pestanas, henna), `menu_cabelo`.
   São estas listas que o bot mostra nas opções do menu e que a IA usa para responder.
2. Há também respostas curtas para um serviço só (ex.: `"cordoletes": "💖 *Cordoletes*: 15.000 Kz…"`).
   Usa **Ctrl+F** no VS Code com o nome do serviço para encontrares todas e muda o preço em cada uma.
3. Respostas que começam por `@` (ex.: `"domingo": "@menu_horario"`) não têm texto próprio: usam o
   texto da entrada indicada. Não precisas de mexer nelas.
4. Cuidado com as aspas e vírgulas: cada linha é `"chave": "texto",` e `\n` é uma mudança de linha.
   Se o bot não arrancar depois de mudares, o erro está quase sempre aí (o `npm run simular` mostra-o).
5. Actualiza também o site, em `site/index.html`, e publica-o com `npm run deploy`.

Serviço novo: acrescenta a linha `• Nome: preço` na lista `menu_…` certa. O bot passa a reconhecê-lo
nas marcações automaticamente.

## Promoções

Pelo WhatsApp do salão (946 397 096), envia ao bot (955 705 188):

| Mensagem | O que faz |
|---|---|
| `/promo 10% de desconto nas tranças até sexta` | passa a ser a promoção activa |
| `/promo` | mostra a promoção actual |
| `/promo off` | desliga as promoções |

As promoções ficam guardadas na Cloudflare (o ficheiro `data/promocoes.json` só é usado quando o bot
corre no PC).

O bot mostra a promoção no menu, responde a quem perguntar por promoções e a IA pode mencioná-la.

## Horário

Ficheiro: **`src/data/horario.json`**: é este que decide "Bom dia… estamos abertos até às 21h" e que
valida a hora das marcações.

- Cada dia tem `["abre", "fecha"]` no formato `"08:00"`. Dia fechado: `null` (ex.: `"domingo": null`).
- Feriados ou dias fechados: acrescenta a data em `"fechado_em"`, no formato `"2026-12-25"`.

Se o horário mudar de vez, actualiza também:
- o texto da entrada `menu_horario` em `src/data/faq.json`;
- o site (`site/index.html`, procura "Horário") e `npm run deploy`.

## Agenda: durações e profissionais

Ficheiro: **`src/data/agenda.json`**. É este que decide quando uma hora está cheia.

- `areas` → cada área (barbearia, tranças, unhas, rosto, cabelo, spa) tem:
  - `profissionais`: quantas clientes atende ao mesmo tempo;
  - `duracao_min`: duração normal de um serviço dessa área, em minutos;
  - `palavras`: palavras que põem um serviço nessa área (sem acentos);
  - `horario` (só a barbearia): horário próprio, em vez do do salão.
- `duracoes` → duração de serviços que fogem à regra da área (ex.: `"Micro twists": 360`).
- `intervalo_min` → de quanto em quanto tempo o bot oferece horas (30 = 9h, 9h30, 10h…).
- `antecedencia_min` → com quanta antecedência se pode marcar para hoje (60 = só daqui a 1 hora).

Os valores que lá estão são estimativas: **corrija-os com a realidade do salão** e publique com
`npm run deploy`.

## Comandos da equipa

Todos os comandos (agenda, confirmar, recusar, ocupar, bloquear, promoções, pausa) estão explicados em
**[COMO-USAR.md](COMO-USAR.md#2-o-que-a-equipa-faz-a-partir-do-946-397-096)**.

---

## O bot parou de responder: o que fazer

Vai por esta ordem:

1. **O bot está no ar?** Abre https://marinasc.marinasc-chatbot.workers.dev/health no browser. Deve
   aparecer `"status":"ok"`. Se não aparecer, vê o estado da Cloudflare em https://www.cloudflarestatus.com
2. **O que diz o registo?** Em https://dash.cloudflare.com → **Workers & Pages → marinasc → Logs**, ou
   no terminal, em directo, enquanto alguém manda uma mensagem:
   ```bash
   npx wrangler tail marinasc --format pretty
   ```
   - `Status: 401` ou `Invalid OAuth access token` → o token da Meta deixou de valer. Gera um novo
     (Utilizadores do sistema, ver `docs/LIGAR-WHATSAPP.md`, passo 4) e põe-no com
     `npx wrangler secret put WHATSAPP_TOKEN` (fica logo activo).
   - `Groq: sem créditos ou limite atingido` → passou o limite gratuito do Groq (cerca de 1.000 conversas
     com IA por dia). O bot continua com as respostas prontas e tenta a IA outra vez 10 minutos depois;
     o limite renova-se sozinho no dia seguinte. Se acontecer todos os dias, ver os limites em
     https://console.groq.com/settings/limits
   - `Status: 401` com `groq` → a chave do Groq foi apagada: cria outra em https://console.groq.com/keys
     e põe-na com `npx wrangler secret put GROQ_API_KEY`.
   - `sem assinatura válida da Meta` em todas as mensagens → o `APP_SECRET` não é o da app: copia-o outra
     vez (Definições da app → Básico) com `npx wrangler secret put APP_SECRET`.
   - Não aparece nada quando mandas uma mensagem → a Meta não está a enviar para o bot (passos 3 e 4).
3. **O webhook está certo?** Na Meta (app → WhatsApp → Configuração → Webhook), o Callback URL tem de ser
   `https://marinasc.marinasc-chatbot.workers.dev/webhook`, com o campo **messages** subscrito.
4. **O número está ligado à app?** Se o 955 foi registado de novo ou mudou de conta, é preciso voltar a
   ligar a app à conta WhatsApp (docs/LIGAR-WHATSAPP.md).
5. **A app da Meta está "Ao vivo"?** Em developers.facebook.com → a app → interruptor no topo. Em
   "Desenvolvimento" a Meta não entrega mensagens de clientes.
6. **O bot foi posto em pausa?** Manda `/stats` do 946: se disser "em pausa", manda `/retomar`.

Enquanto o bot estiver parado, os clientes podem sempre falar com a equipa no 946 397 096.

---

## Mais documentação

- `docs/LIGAR-WHATSAPP.md`: ligação à Meta (número, token, webhook).
- `docs/COMO-USAR.md`: o que o bot faz e os comandos da equipa.
- `docs/CLOUDFLARE.md`: onde o bot corre, segredos, publicar, logs.
- `docs/ARRANQUE-AUTOMATICO.md`: (opcional) correr o bot no PC em vez da Cloudflare.
