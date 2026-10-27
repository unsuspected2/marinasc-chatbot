# Ligar o bot ao WhatsApp (número +244 955 705 188)

O bot usa o número **955 705 188**, só para atendimento automático. A equipa continua a atender
no WhatsApp Business do salão (**946 397 096**), que não é tocado. Sempre que o cliente quer marcar,
reclamar ou falar com uma pessoa, o bot envia-o para o 946 397 096.

Nunca envies tokens ou chaves por mensagem. Ficam só no ficheiro `.env` do teu PC.

## 1. Preparar o chip 955 705 188

- [ ] O chip tem de estar num telemóvel e receber SMS ou chamadas (para o código de verificação).
- [ ] Se este número já tiver conta no WhatsApp ou WhatsApp Business, apaga essa conta primeiro
      (na app: Definições → Conta → Apagar conta). Um número registado na app não entra na API.

## 2. Criar a conta empresarial na Meta

- [ ] Entra em https://business.facebook.com com a conta do salão e cria o portefólio
      **MARINASC - Comércio e Prestação de Serviços, Lda** (email marinasc.official1@gmail.com).
- [ ] Em https://developers.facebook.com → **My Apps → Create App** → tipo **Business** →
      nome "MARINASC Bot" → liga ao portefólio MARINASC.
- [ ] Na app, adiciona o produto **WhatsApp**.

## 3. Adicionar o número do bot

- [ ] **WhatsApp → API Setup → Add phone number**.
- [ ] Nome de apresentação: **MARINASC Salão de Beleza**; categoria: beleza/cabeleireiro.
- [ ] Número: **+244 955 705 188**; verifica com o código que chega por SMS ou chamada.
- [ ] Copia o **Phone number ID** (não é o número de telefone, é um ID comprido).

## 4. Gerar o token permanente

- [ ] Em business.facebook.com → **Definições da empresa → Utilizadores → Utilizadores do sistema** →
      adiciona um utilizador "marinasc-bot" com função **Admin**.
- [ ] **Atribuir activos**: a app "MARINASC Bot" (controlo total) e a conta WhatsApp (controlo total).
- [ ] **Gerar token** para a app, com as permissões `whatsapp_business_messaging` e
      `whatsapp_business_management`. Copia o token (só aparece uma vez).

## 5. Preencher o `.env` no PC

```bash
cp .env.example .env
```

Preenche no `.env`:

- `WHATSAPP_TOKEN` = o token do passo 4
- `PHONE_NUMBER_ID` = o ID do passo 3
- `VERIFY_TOKEN` = uma palavra secreta inventada por ti (ex.: marinasc-2026-xyz)
- `OPENAI_API_KEY` = a tua chave da OpenAI (opcional; sem ela o bot responde só com o FAQ)

Testa: `npm run simular` e depois `npm start`. Em http://localhost:3100/health deve aparecer `"status":"ok"`.

## 6. Pôr o bot acessível na internet (Cloudflare Tunnel, como no ClipForge)

A Meta precisa de um endereço HTTPS público.

- **Teste rápido** (o endereço muda sempre que reinicias):
  ```bash
  cloudflared tunnel --url http://localhost:3100
  ```
  Usa o endereço `https://….trycloudflare.com` que aparecer.
- **Definitivo:** túnel com nome no teu domínio, como serviço que arranca com o PC. Passo a passo em
  [ARRANQUE-AUTOMATICO.md](ARRANQUE-AUTOMATICO.md#2-túnel-com-nome-no-teu-domínio).

O bot usa a porta 3100 (a 3000 é do ClipForge) e só responde enquanto o PC e o túnel estiverem ligados.

## 7. Registar o webhook na Meta

- [ ] Na app → **WhatsApp → Configuration → Webhook → Edit**.
- [ ] Callback URL: `https://<endereço-do-passo-6>/webhook`
- [ ] Verify token: o mesmo `VERIFY_TOKEN` do `.env` → **Verify and save**.
- [ ] Em **Webhook fields**, subscreve **messages**.

## 8. Testar

- [ ] De outro telemóvel, envia "Olá" para o **955 705 188**. Deve chegar o menu do MARINASC.
- [ ] Experimenta "1", "quanto custa cordoletes?" e "7".

Responder a mensagens enviadas pelos clientes (conversas de serviço) é normalmente grátis na Meta;
confirma os preços actuais no painel antes de enviar mensagens por iniciativa do salão.
