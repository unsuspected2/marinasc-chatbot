# Arranque automático do bot (systemd)

O ficheiro `deploy/marinasc-bot.service` põe o bot a correr como serviço do teu utilizador:
arranca quando entras no PC e, se cair, volta sozinho 5 segundos depois.

## Ligar (uma vez)

```bash
mkdir -p ~/.config/systemd/user
ln -sf /run/media/josaid/4A2EE4DC2EE4C255/main_web/marinasc-chatbot/deploy/marinasc-bot.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now marinasc-bot
```

Antes, fecha qualquer `npm start` que esteja aberto, senão a porta 3100 fica ocupada.

## Comandos do dia a dia

| Para…                         | Comando                                   |
|-------------------------------|-------------------------------------------|
| Ver se está a correr          | `systemctl --user status marinasc-bot`    |
| Reiniciar (depois de mudar preços) | `systemctl --user restart marinasc-bot` |
| Parar                         | `systemctl --user stop marinasc-bot`      |
| Ver o que está a acontecer    | `tail -f logs/bot.log`                    |
| Desligar o arranque automático | `systemctl --user disable --now marinasc-bot` |

## Notas

- O bot só arranca depois de entrares na sessão, porque o projecto está no disco
  `/run/media/...`, que só monta no login. Se o disco ainda não estiver montado, o serviço
  vai tentando até conseguir.
- Se actualizares o Node (nvm), corrige o caminho em `ExecStart` no ficheiro do serviço e corre
  `systemctl --user daemon-reload`.
- O túnel Cloudflare é um serviço à parte (fase 4).
