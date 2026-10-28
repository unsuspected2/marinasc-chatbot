# Tráfego pago: estudo de viabilidade (Outubro 2026)

**Pergunta:** vale a pena pagar anúncios no Instagram, Facebook ou TikTok para trazer clientes ao MARINASC?

**Resposta curta:** sim, mas **começar com um teste pequeno e medido** (2 semanas, 40.000–60.000 Kz) antes de
gastar mais. O salão já tem o que torna o anúncio rentável: o bot responde em segundos, a qualquer
hora, mostra as horas livres e pede o sinal de 30%. Assim, cada conversa paga pode virar uma
marcação com dinheiro já na conta.

---

## 1. O que já está a favor

| Ponto | Porque conta |
|---|---|
| Bot no WhatsApp 955, 24 h | O anúncio "Enviar mensagem" abre a conversa e o bot atende na hora. Sem isto, metade das conversas morre à espera de resposta. |
| Sinal de 30% | Uma marcação vinda do anúncio já paga parte do serviço; as faltas deixam de custar dinheiro. |
| Vídeos reais do salão | O anúncio usa os mesmos Reels (ex.: `marketing/novidades-marinasc.mp4`, os vídeos de tranças e do spa). Não é preciso produzir nada novo. |
| Local fixo no Kilamba | Dá para mostrar o anúncio só a quem está perto (raio de 5–8 km), o que gasta menos e traz clientes que vêm mesmo. |
| Conversas grátis | Na WhatsApp Cloud API, as conversas que começam num anúncio "Clique para o WhatsApp" não pagam mensagens durante 72 h. |

## 2. O que joga contra (e como resolver)

| Risco | Solução |
|---|---|
| Não há números públicos fiáveis do custo dos anúncios em Angola (os estudos que existem são dos EUA e da Europa). | O teste da secção 4 serve para medir o custo **real** do salão em vez de adivinhar. |
| A Meta e o TikTok cobram em dólares, com cartão Visa/Mastercard que aceite pagamentos internacionais. | Confirmar com o banco da empresa um cartão (ou cartão pré-pago) com compras internacionais. Contar com a taxa de câmbio e as comissões do banco. |
| Público que só pergunta o preço e não marca. | O bot já responde aos preços. No anúncio, mostrar logo o preço ("Cordoletes com cachos 17.500 Kz"), para quem escreve já saber quanto custa. |
| Gastar sem saber o que resultou. | Medir as conversas no Gestor de Anúncios e as marcações com sinal no bot (`/stats`, `/marcacoes`). Ver a secção 5. |

## 3. Onde anunciar

1. **Instagram + Facebook (Meta), anúncio "Enviar mensagem pelo WhatsApp" para o 955.** É a primeira escolha:
   o público das clientes do salão está lá e a conversa cai directamente no bot.
2. **TikTok (Spark Ads, que impulsionam um vídeo já publicado em @salo.marinasc).** Fica para segundo
   teste: alcance barato, mas leva para o perfil e não para o WhatsApp, por isso converte menos.
   Usar só depois de a Meta dar resultado.
3. **Google (perfil da empresa).** Não precisa de anúncio pago: basta manter o perfil completo e pedir
   avaliações (ver [REDES-SOCIAIS.md](REDES-SOCIAIS.md#5-google)).

**Ligação necessária:** no Meta Business Suite, ligar o número **955 705 188** (a conta WhatsApp Business da
API, WABA 1144426978108648) à página do Facebook e ao Instagram. Sem esta ligação, o anúncio não consegue
abrir o WhatsApp do bot.

## 4. Teste recomendado (2 semanas)

| | |
|---|---|
| Orçamento | **3.000–4.000 Kz por dia**, 14 dias (cerca de 40.000–60.000 Kz no total, mais as taxas do cartão) |
| Objectivo da campanha | Interacção → **Mensagens** → WhatsApp (955) |
| Público | Mulheres e homens dos 18 aos 45 anos, num **raio de 5–8 km do Kilamba** (incluir Zango, Camama e Talatona se estiverem dentro do raio) |
| Anúncios (2 ou 3) | 1) Reel de cordoletes/bobes com o preço · 2) vídeo "Novidades" (marcar 24 h, sinal, localização) · 3) spa ou barbearia |
| Mensagem inicial | "Olá! Vi o anúncio e quero marcar." (o bot responde e abre o menu de marcação) |
| Dias e horas | Todos os dias. Ao fim de 1 semana, cortar o anúncio mais fraco e pôr o dinheiro no melhor |

Não mexer nos anúncios nos primeiros 3–4 dias: a Meta precisa desse tempo para aprender a quem os mostrar.

## 5. Como saber se é viável (as contas)

No fim do teste, preencher:

| Número | Onde ver | Resultado |
|---|---|---|
| A. Dinheiro gasto (Kz) | Gestor de Anúncios → Valor gasto | |
| B. Conversas iniciadas | Gestor de Anúncios → "Conversas por mensagem iniciadas" | |
| C. Marcações com sinal pago vindas do anúncio | Bot: `/marcacoes` e `/agenda` (as que têm "💳 sinal pago" de números novos nessas 2 semanas) | |
| D. Valor médio de cada marcação (Kz) | Preço dos serviços marcados (ex.: tranças 15.000–17.500 Kz) | |

- **Custo por conversa** = A ÷ B
- **Custo por cliente** = A ÷ C
- **Receita trazida** = C × D

**Regra de decisão:**

- **Custo por cliente abaixo de 25% do valor médio da marcação** (ex.: abaixo de 4.000 Kz numa trança de
  16.000 Kz) → **viável**: manter e subir o orçamento aos poucos (+20% por semana).
- **Entre 25% e 50%** → rever os anúncios (outro vídeo, mostrar o preço, outro público) e testar mais 2 semanas.
- **Acima de 50%**, ou menos de 3 marcações no teste → **parar** e apostar só nas publicações orgânicas
  ([PUBLICACOES.md](PUBLICACOES.md)) e nas avaliações do Google.

Uma cliente que volta (tranças a cada 1–2 meses) vale várias marcações, por isso um custo por cliente no
limite pode compensar na mesma. A equipa decide com os números na mão.

## 6. Cenários de exemplo

Estes valores são **hipóteses para preencher com o teste**, não preços da Meta em Angola:

| Cenário | Custo por conversa | Conversas que marcam | Custo por cliente | Numa trança de 16.000 Kz |
|---|---|---|---|---|
| Bom | 300 Kz | 1 em 5 | 1.500 Kz | 9% → **viável** |
| Médio | 600 Kz | 1 em 8 | 4.800 Kz | 30% → rever |
| Fraco | 1.200 Kz | 1 em 10 | 12.000 Kz | 75% → **parar** |

O que mais mexe no resultado é **quantas conversas viram marcação**, e isso depende do bot (já pronto),
de mostrar o preço no anúncio e de haver horas livres. O custo por conversa depende sobretudo do vídeo.

## 7. Antes de começar (lista)

- [ ] Cartão da empresa com pagamentos internacionais (ou pré-pago) e limite para o teste
- [ ] Conta de anúncios no Meta Business Suite, em nome de MARINASC, ligada à página e ao Instagram
- [ ] Número 955 ligado à página (Configurações → Contas → WhatsApp)
- [ ] 2–3 vídeos escolhidos (vertical, 10–20 s, preço no texto)
- [ ] A equipa manda `/agenda` ao bot todas as manhãs (para receber os avisos de novas marcações)
- [ ] Data de início e de fim do teste anotadas, para a contagem da secção 5

Depois do teste, guardar aqui os números reais e a decisão.
