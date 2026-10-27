# Redes sociais do MARINASC: como usar

| Rede | Conta | Para quê |
|---|---|---|
| Instagram | @marynasc_salao_de_beleza_ | fotos e Reels dos trabalhos, stories, mensagens (bot, depois de ligado) |
| TikTok | @salo.marinasc | os mesmos vídeos curtos, para chegar a quem ainda não nos conhece |
| Facebook | página MariNasc (link no Instagram) | os mesmos posts; partilhar a partir do Instagram |
| Google (Maps e Pesquisa) | MARINASC | quem procura "salão Kilamba": horário, preços, avaliações, direcções |
| WhatsApp do bot | 955 705 188 | marcações 24 h; a equipa confirma no 946 397 096 |

## 1. Bio (copiar e colar)

**Instagram**: Editar perfil → Biografia (máx. 150 caracteres):
```
Realçamos a tua beleza com cuidado ✨
Cabelo • Tranças • Barbearia • Unhas • Spa
📍Kilamba | C19, Apt. 41
📲 Marcações 24h pelo WhatsApp ⬇️
```
(É a bio em uso desde 27/10/2026.)
Ligações (só se mudam na app do telemóvel: Editar perfil → Ligações): hoje são marinasc.rf.gr,
TikTok e Facebook. Acrescentar o site `https://marinasc.marinasc-chatbot.workers.dev` e o WhatsApp
`https://wa.me/244955705188`.
Botão de contacto (conta profissional → Opções de contacto): WhatsApp **955 705 188**.

**TikTok** (@salo.marinasc, a conta nova; a antiga @salao.marinasc deixou de ser usada):
Editar perfil → Descrição (máx. 80 caracteres). Em uso desde 27/10/2026:
```
Kilamba C19 · Cabelo, Unhas, Spa e Barbearia
📲 Marque 24h: WhatsApp 955705188
```
Website (aparece com 1.000 seguidores ou conta Empresa): o link do site. No Instagram, a ligação do
TikTok deve apontar para `https://www.tiktok.com/@salo.marinasc`.

## 2. Publicar

- O plano de cada mês está em [PUBLICACOES.md](PUBLICACOES.md): o que publicar em cada dia, com a
  legenda e as hashtags prontas.
- Três publicações por semana. O mesmo vídeo vai para Reels e TikTok.
- Grave na vertical, com boa luz, 10 a 20 segundos: antes → durante → resultado.
- Termine sempre a legenda com o próximo passo: "Marque pelo WhatsApp 955 705 188".
- Peça autorização à cliente antes de mostrar a cara.

## 3. Promoções

1. Anuncie nas redes (post + story).
2. No WhatsApp do salão (946), envie ao bot: `/promo 10% nas tranças até sexta`.
   O bot passa a falar da promoção a quem perguntar e no menu.
3. No fim: `/promo off`.

## 4. Responder a mensagens e comentários

- **WhatsApp 955:** o bot responde sozinho; a equipa só confirma marcações (`/agenda`, `/confirmar`).
- **Instagram:** quando o bot estiver ligado ([INSTAGRAM.md](INSTAGRAM.md)), responde às mensagens
  directas como no WhatsApp. Até lá, responda e envie o link `wa.me/244955705188` para marcar.
- **Comentários** ("quanto custa?"): responda com o preço e "marque pelo WhatsApp 955 705 188".
- **Reclamações:** nunca discutir em público. Responder "Lamentamos, vamos falar consigo por
  mensagem" e tratar no 946.

## 5. Google

- Peça às clientes satisfeitas uma avaliação: no Google, perfil MARINASC → "Pedir críticas" dá um link
  para enviar por WhatsApp.
- Responda a todas as avaliações, boas e más, em 1–2 frases.
- Mudou o horário (feriado, evento)? Actualize no Google ("Editar perfil → Horário → Horário especial"),
  em `src/data/horario.json` (o bot) e no site.
- Serviços com preço: "Editar serviços" no perfil. A tabela completa está sempre no site (link do menu).

## 6. Ver os resultados (uma vez por mês)

- Instagram e TikTok: Painel profissional / Estatísticas → que vídeos tiveram mais visualizações e
  guardados. Repetir o tipo de vídeo que funcionou.
- Google: "Desempenho" no perfil → chamadas, pedidos de direcções, cliques no site.
- Bot: `/stats` no WhatsApp → conversas e pré-marcações da semana.
