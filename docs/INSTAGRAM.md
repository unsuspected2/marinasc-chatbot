# Ligar o bot às mensagens do Instagram

O código já está pronto e publicado: quando a ligação estiver feita, o bot responde às mensagens
directas do Instagram (@marynasc_salao_de_beleza_) como responde no WhatsApp: preços, horas livres,
pré-marcações. As opções aparecem como respostas rápidas (botões por baixo da mensagem).

## Passos (cerca de 15 minutos)

1. **Conta profissional.** No Instagram: Definições → Tipo de conta e ferramentas → Mudar para conta
   profissional → Empresa (se ainda não for).
2. **Permitir o acesso às mensagens.** No Instagram: Definições → Mensagens e respostas a stories →
   Ferramentas ligadas → activar **Permitir acesso às mensagens**.
3. **Adicionar o Instagram à app da Meta.** Em developers.facebook.com → app **wawabusinees** →
   Adicionar produto → **Instagram** → **Configuração da API com login do Instagram**.
4. **Gerar o token.** Em "Gerar tokens de acesso" → Adicionar conta → entrar com o Instagram do salão →
   copiar o token. Colá-lo no `.env` numa linha `INSTAGRAM_TOKEN=...` (não o envie por mensagem).
5. **Segredo da app do Instagram.** Na mesma página aparece o "Segredo da app do Instagram". Colá-lo no
   `.env` numa linha `INSTAGRAM_APP_SECRET=...`.
6. **Webhook.** Em "Configurar webhooks": Callback URL `https://marinasc.marinasc-chatbot.workers.dev/webhook`,
   token de verificação igual ao do WhatsApp → Verificar e guardar → subscrever o campo **messages**.
7. Avisar o Claude (ou correr os comandos abaixo) para passar os dois valores para a Cloudflare:
   ```bash
   npx wrangler secret put INSTAGRAM_TOKEN
   npx wrangler secret put INSTAGRAM_APP_SECRET
   ```

## A ter em conta

- **Revisão da Meta:** para responder a qualquer pessoa (não só a quem gere a app), a permissão
  `instagram_business_manage_messages` precisa de acesso avançado, pedido em "Revisão da app" com um
  vídeo curto a mostrar o bot. Até lá funciona com as contas de teste da app.
- **O token dura 60 dias.** Antes de expirar, gera-se outro no mesmo sítio (passo 4) e repete-se o
  passo 7.
- O Instagram só deixa responder até 24 h depois da última mensagem do cliente, como o WhatsApp.
