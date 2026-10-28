# Como usar o bot do MARINASC

O bot atende no WhatsApp **955 705 188**, 24 horas por dia. A equipa continua no **946 397 096**:
recebe os pedidos de marcação, confirma-os e fala com as clientes quando é preciso uma pessoa.

---

## 1. O que o bot faz pelas clientes

| A cliente escreve… | O bot… |
|---|---|
| "Olá", "bom dia" | cumprimenta pela hora de Luanda, diz se o salão está aberto e mostra o menu |
| "qt custa bobes?", "faz degradê?" | responde com o preço da tabela; se não houver preço, diz que depende e dá o contacto da equipa |
| um áudio | ouve, transcreve e responde como se fosse texto |
| uma foto | pede para a enviar também à equipa no 946, com o botão já pronto |
| "quero marcar cordoletes sábado às 10h" | prepara a marcação (ver abaixo) |
| "minhas marcações" | mostra as marcações futuras dela, com o estado |
| "remarcar", "mudar a hora" | deixa escolher outro dia/hora; a marcação antiga é cancelada quando a nova fica pronta |
| "cancelar marcação", "desmarcar" | pede confirmação, cancela e avisa a equipa |
| "falar com uma pessoa", uma reclamação | envia o botão para o WhatsApp da equipa (946) |
| "tem promoção?" | mostra a promoção activa (se houver) |

O menu tem 9 opções: Tranças · Unhas · Sobrancelhas · Cabelo · Spa e estética · Barbearia ·
Horário e localização · Marcar · Falar com a equipa. Os números ("1" a "9") também funcionam.

### Como funciona uma marcação

1. **Serviço** → o bot percebe da frase ou mostra uma lista para escolher (primeiro a área, depois o
   serviço). Cada linha da lista já tem o **preço e o sinal** (ex.: "17.500 Kz · sinal 5.300 Kz"), e o
   resumo final mostra preço, sinal e o que fica a pagar no salão. Se a cliente escreve algo geral
   ("tranças", "corte", "massagem"), o bot mostra só os serviços parecidos.
2. **Dia** → mostra os próximos dias **com vaga** para esse serviço.
3. **Hora** → mostra só as **horas livres** desse dia. Se a cliente escrever uma hora ocupada, o bot
   explica ("às 10h já não temos vaga") e sugere as 3 horas livres mais perto.
4. **Nome** → botão com o nome do perfil, ou escreve outro.
5. **Pedido registado** com um código (ex.: **#K7Q2**), o preço e o **sinal de 30%** (ex.: cordoletes
   com cachos 17.500 Kz → sinal 5.300 Kz, arredondado aos 100 Kz) com o IBAN da empresa. A vaga fica
   **reservada** até a equipa responder. A equipa recebe o aviso no 946 (ver "Avisos" abaixo).
6. A cliente faz a transferência e **envia o comprovativo** (foto ou PDF) ao bot. O bot reenvia-o para
   o 946 com o código da marcação, e em `/agenda` aparece "💳 comprovativo enviado".
7. A equipa vê o dinheiro na conta e responde `/confirmar K7Q2` → a cliente recebe "✅ Marcação
   confirmada · sinal recebido" com a morada.

### Sinal e faltas (regras do salão)

- **Toda a marcação pede um sinal de 30%** do valor do serviço, por transferência para o IBAN
  **AO06.0006.0000.7839.6727.3011.1**. O resto paga-se no salão.
- **Prazo do comprovativo: 24 horas** depois do pedido (ou até 1 h antes da hora marcada, se for mais
  cedo). A cliente vê o prazo na mensagem do pedido. Sem comprovativo no prazo, o pedido **expira**
  (⌛): a vaga fica logo livre para outra cliente, e a cliente e a equipa são avisadas. O bot verifica
  isto de 15 em 15 minutos.
- **Comprovativo depois do prazo:** o bot reenvia-o à equipa com "⌛ chegou depois do prazo". A equipa
  pode fazer `/confirmar K7Q2` na mesma: se a hora ainda estiver livre, fica confirmada; se já tiver
  sido ocupada, o bot avisa para combinar outra hora com a cliente.
- **Só horas livres:** a cliente só pode escolher horas sem marcações. Se escrever uma hora ocupada, o
  bot recusa e sugere as 3 horas livres mais perto.
- Serviços **sem preço na tabela** (sob consulta): o bot diz "30% do valor" e a equipa diz o valor à
  cliente.
- **Remarcar** (a cliente escreve *remarcar*): o sinal já pago passa para a nova marcação.
- **Cancelar com aviso:** o bot diz à cliente que a equipa fala com ela sobre o sinal (a equipa decide).
- **Falta sem aviso:** a equipa escreve `/faltou K7Q2`. A cliente recebe a mensagem: a justificação é
  tratada **presencialmente no salão**; com uma justificação válida, a equipa procura uma solução
  (ex.: nova hora com `/ocupar`); **sem justificação válida, o sinal não é devolvido** e ela tem de
  fazer uma **nova marcação**.
- Estas regras aparecem à cliente no fim de cada marcação e quando pergunta por "sinal", "reembolso",
  "faltar", "IBAN" ou "comprovativo".
- Mudar a percentagem ou o IBAN: `src/data/agenda.json` → `sinal`, e o texto em `src/data/faq.json`
  (chaves `sinal`, `pagamento`, `menu_marcar`). Depois `npx wrangler deploy`.

**Como o bot evita marcações sobrepostas:** cada serviço tem uma duração (ex.: cordoletes ~3h) e cada
área tem um número de profissionais (ex.: tranças 2, unhas 1). Uma hora só aparece livre se, durante
todo o serviço, houver uma profissional livre nessa área, dentro do horário. Pedidos à espera de
confirmação também ocupam a vaga, para duas clientes não ficarem com a mesma hora.

A barbearia tem horário próprio (seg–sex 8h30–19h30, sáb 8h30–17h30, domingo fechado).

---

## 2. O que a equipa faz (a partir dos números da equipa)

Os comandos escrevem-se como uma mensagem normal **para o 955 705 188**. Só funcionam destes números,
que também recebem os avisos de novas marcações e os comprovativos (lista em `src/data/equipa.json`;
o comando `/equipa` mostra-a):

| Número | Quem |
|---|---|
| 946 397 096 | WhatsApp do salão (equipa) |
| 941 051 108 | Eng. Josaid do Nascimento, Marketing (CEO) |
| 921 610 705 | Sra. Marisa, CEO, dona do MARINAS BOSS |
| 931 376 018 | Josefa do Nascimento, gerente oficial |

A WhatsApp só entrega os avisos a quem escreveu ao bot nas últimas 24 horas: cada um manda `/agenda`
de manhã.

### No dia a dia

| Comando | Para quê |
|---|---|
| `/agenda` | marcações de hoje, por hora, com o código e o contacto de cada cliente |
| `/agenda amanhã` · `/agenda sábado` · `/agenda 15/11` | outro dia |
| `/confirmar K7Q2` | confirma o pedido **depois de o sinal entrar na conta**; a cliente é avisada |
| `/recusar K7Q2 já não temos essa hora` | recusa, liberta a vaga e avisa a cliente com o motivo |
| `/cancelar K7Q2 profissional doente` | cancela uma marcação já confirmada e avisa a cliente |
| `/faltou K7Q2` | a cliente não apareceu: a marcação fecha, o sinal fica retido e ela é avisada das regras |

### Marcações que não vieram pelo bot

Quando uma cliente marca **pelo 946, por telefone ou ao balcão**, registe-a para o bot não dar essa
hora a outra pessoa:

```
/ocupar sábado 10h cordoletes Maria
/ocupar 15/11 14h30 unhas de gel Ana
```

### Fechar dias ou horas

```
/bloquear 25/12                → o dia todo
/bloquear sábado 14h-17h       → só esse período (formação, falta de pessoal…)
/desbloquear 25/12
```

Se já houver marcações no período bloqueado, o bot mostra-as para as cancelar com `/cancelar`.

### Outros

| Comando | Para quê |
|---|---|
| `/marcacoes` | os últimos 10 pedidos, com o estado (⏳ pendente · ✅ confirmada · ❌ recusada · 🚫 cancelada · ⚠️ faltou · ⌛ expirada; 💳 = sinal) |
| `/stats` | conversas de hoje e da semana, pedidos, serviços mais pedidos, quantos estão por confirmar |
| `/promo 10% nas tranças até sexta` · `/promo off` | liga ou desliga a promoção |
| `/pausa` · `/retomar` | o bot deixa de atender (só envia o link do 946) e volta a atender |
| `/admin` | lista todos os comandos |

### Avisos de novos pedidos

Quando chega um pedido, o bot envia para o 946:
"📅 Novo pedido de marcação · #K7Q2 Cordoletes, sábado, 10h–13h · Maria · wa.me/2449…".

**Limite da WhatsApp:** o bot só consegue escrever para o 946 se o 946 lhe tiver escrito nas
**últimas 24 horas**. Para garantir os avisos, **mande `/agenda` ao bot todas as manhãs**: além de ver o
dia, isso abre a janela de 24 horas. Mesmo sem aviso, o pedido fica sempre em `/agenda` e a cliente
tem o botão "Enviar à equipa".

O mesmo limite vale para avisar as clientes: se a equipa confirmar mais de 24 h depois da última
mensagem da cliente, o bot diz que não conseguiu e dá o link para a avisar pelo 946.

---

## 3. Mudar preços, durações e profissionais

| O quê | Ficheiro |
|---|---|
| Preços e respostas | `src/data/faq.json` |
| Horário do salão e feriados | `src/data/horario.json` |
| Duração dos serviços, profissionais por área, horário da barbearia | `src/data/agenda.json` |
| Site | `site/index.html` |

Depois de mudar: `npm run simular` (confirma que está tudo bem) e `npm run deploy` (publica).
Detalhes em [GUIA.md](GUIA.md).

---

## 4. Ver se o bot está bem

- https://marinasc.marinasc-chatbot.workers.dev/health → `"status":"ok"` e a hora da última mensagem
  recebida (`ultimaMensagem`) e quantas houve hoje (`mensagensHoje`).
- Se algo falhar: [GUIA.md → O bot parou de responder](GUIA.md#o-bot-parou-de-responder-o-que-fazer).
