# Arranque automático do bot e do túnel (systemd)

Dois serviços do teu utilizador, que arrancam quando entras no PC e voltam sozinhos se caírem:

| Serviço | O que faz | Ficheiro no projecto |
|---|---|---|
| `marinasc-bot` | o bot (porta 3100) | `deploy/marinasc-bot.service` |
| `marinasc-tunnel` | o túnel Cloudflare com nome, que liga a Meta ao bot | `deploy/marinasc-tunnel.service` |

## 1. Bot (já está ligado neste PC)

Se for preciso instalar de novo (outro PC, ou depois de mudar o ficheiro):

```bash
cp /run/media/josaid/4A2EE4DC2EE4C255/main_web/marinasc-chatbot/deploy/marinasc-bot.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now marinasc-bot
```

O ficheiro é **copiado** (não ligado com `ln`) porque o projecto está no disco `/run/media/...`, que só monta
depois do login: o systemd tem de encontrar o serviço antes disso. Enquanto o disco não monta, o serviço
vai tentando de 5 em 5 segundos.

## 2. Túnel com nome no teu domínio

O túnel rápido (`cloudflared tunnel --url …`) muda de endereço sempre que reinicia, e aí a Meta deixa de
encontrar o bot. O túnel com nome tem um endereço fixo, por exemplo `https://bot.o-teu-dominio.com`.

1. Entra em https://one.dash.cloudflare.com → **Networks → Tunnels → Create a tunnel** → tipo
   **Cloudflared** → nome `marinasc-bot`.
   (Se preferires usar o túnel do ClipForge, abre esse túnel e salta para o passo 3.)
2. No ecrã "Install and run a connector", copia só o **token** (o texto comprido depois de `--token`).
   Guarda-o neste PC:
   ```bash
   mkdir -p ~/.config/marinasc
   nano ~/.config/marinasc/tunnel-token      # cola o token, grava com Ctrl+O e sai com Ctrl+X
   chmod 600 ~/.config/marinasc/tunnel-token
   ```
3. Em **Public Hostname → Add a public hostname**: subdomínio `bot`, o teu domínio, tipo **HTTP**,
   URL `localhost:3100`. Guarda.
4. Liga o serviço do túnel:
   ```bash
   cp /run/media/josaid/4A2EE4DC2EE4C255/main_web/marinasc-chatbot/deploy/marinasc-tunnel.service ~/.config/systemd/user/
   systemctl --user daemon-reload
   systemctl --user enable --now marinasc-tunnel
   ```
5. Testa no browser: `https://bot.o-teu-dominio.com/health` deve mostrar `"status":"ok"`.
6. Na Meta (app → WhatsApp → Configuração → Webhook → Editar), troca o Callback URL para
   `https://bot.o-teu-dominio.com/webhook`, com o mesmo token de verificação. Depois já podes fechar o
   terminal do túnel rápido.

Se usares o túnel do ClipForge, o token é o desse túnel e o serviço `marinasc-tunnel` não é preciso
(o ClipForge já o mantém ligado): basta o passo 3.

## Comandos do dia a dia

| Para…                         | Comando                                   |
|-------------------------------|-------------------------------------------|
| Ver se está a correr          | `systemctl --user status marinasc-bot`    |
| Reiniciar (depois de mudar preços) | `systemctl --user restart marinasc-bot` |
| Parar                         | `systemctl --user stop marinasc-bot`      |
| Ver o que está a acontecer    | `tail -f logs/bot.log`                    |
| Estado do túnel               | `systemctl --user status marinasc-tunnel` |
| Desligar o arranque automático | `systemctl --user disable --now marinasc-bot` |

## Notas

- Se actualizares o Node (nvm), corrige o caminho em `ExecStart` no ficheiro do serviço, copia-o outra vez
  e corre `systemctl --user daemon-reload`.
- Para o bot funcionar com o PC ligado mas sem ninguém com sessão aberta, era preciso
  `loginctl enable-linger josaid` **e** o projecto num disco que monte no arranque (ex.: `/home`).
