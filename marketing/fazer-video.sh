#!/usr/bin/env bash
# ============================================================
# marketing/fazer-video.sh
# Monta o vídeo "Novidades MariNasc" (1080x1920, para Reels/TikTok)
# a partir das cenas em cenas/cenas.html e dos vídeos do site.
#
# Uso: bash marketing/fazer-video.sh
#   1. desenha cada cena com o Chrome (cenas/c1.png … c9.png)
#   2. junta-as com o ffmpeg, com zoom suave e transições
# O vídeo sai sem música: escolha um som na própria app do TikTok/Instagram.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
CENAS="$PWD/cenas"
cp ../site/media/logo.jpg "$CENAS/logo.jpg"
MEDIA="$PWD/../site/media"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. Cenas em imagem (transparentes onde há vídeo por trás)
google-chrome --headless=new --disable-gpu --hide-scrollbars --window-size=410,560 --force-device-scale-factor=2 \
  --virtual-time-budget=10000 --screenshot="$CENAS/site.png" "https://marinasc.marinasc-chatbot.workers.dev/" 2>/dev/null
for i in 1 2 3 4 5 6 7 8 9; do
  google-chrome --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --window-size=1080,1920 --virtual-time-budget=6000 --screenshot="$CENAS/c$i.png" "file://$CENAS/cenas.html#c$i" 2>/dev/null
done

FPS=30
# cena:duração(s):vídeo de fundo:estilo (nítido = filmagem visível com sombra em baixo;
# desfocado = filmagem desfocada e escurecida, para o texto se ler bem)
PLANO=(
  "1:4:trabalho7.mp4:nitido"
  "2:5.5:trabalho1.mp4:desfocado"
  "3:5.5:trabalho2.mp4:desfocado"
  "4:4.5:trabalho4.mp4:desfocado"
  "5:4.5:trabalho3.mp4:desfocado"
  "6:4.5:trabalho6.mp4:nitido"
  "7:4.5:trabalho5.mp4:desfocado"
  "8:4.5:trabalho7.mp4:desfocado"
  "9:4.5:trabalho2.mp4:desfocado"
)

# Sombra em degradê para as cenas nítidas (transparente em cima, escura em baixo)
ffmpeg -v error -y -f lavfi -i "color=black:s=1080x1920,format=rgba" -frames:v 1 \
  -vf "geq=r=0:g=0:b=0:a='clip((Y-650)/1270*235,0,235)'" "$TMP/sombra.png"

# 2. Um clip por cena: fundo em movimento + texto que entra a subir devagar
for p in "${PLANO[@]}"; do
  IFS=: read -r n dur bg estilo <<<"$p"
  base="scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=$FPS"
  if [[ "$estilo" == nitido ]]; then
    fundo="[0:v]$base,eq=saturation=0.85[f0];[f0][2:v]overlay=0:0[bg]"
  else
    fundo="[0:v]$base,gblur=sigma=28,eq=brightness=-0.32:saturation=0.5:contrast=0.9[bg]"
  fi
  ffmpeg -v error -y -stream_loop -1 -i "$MEDIA/$bg" -loop 1 -i "$CENAS/c$n.png" -loop 1 -i "$TMP/sombra.png" -filter_complex \
    "$fundo;[1:v]format=rgba,fade=t=in:st=0.15:d=0.8:alpha=1[txt];[bg][txt]overlay=x=0:y='if(lt(t,1),36*(1-t)*(1-t),0)':shortest=1,format=yuv420p" \
    -t "$dur" -an -c:v libx264 -crf 19 -preset medium "$TMP/c$n.mp4"
done

# 3. Juntar com transições suaves de 0,6 s
T=0.6
inputs=(); filter=""; offset=0; prev="0:v"
for i in "${!PLANO[@]}"; do inputs+=(-i "$TMP/c$((i + 1)).mp4"); done
for i in $(seq 1 $((${#PLANO[@]} - 1))); do
  IFS=: read -r _ dur _ <<<"${PLANO[$((i - 1))]}"
  offset=$(awk "BEGIN{print $offset + $dur - $T}")
  out="v$i"
  filter+="[$prev][$i:v]xfade=transition=fade:duration=$T:offset=$offset[$out];"
  prev="$out"
done
ffmpeg -v error -y "${inputs[@]}" -f lavfi -i anullsrc=r=44100:cl=stereo -filter_complex "${filter%;}" \
  -map "[$prev]" -map "${#PLANO[@]}:a" -shortest -c:v libx264 -crf 21 -preset medium -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart novidades-marinasc.mp4

ffprobe -v error -show_entries format=duration,size -of default=nw=1 novidades-marinasc.mp4
echo "Pronto: marketing/novidades-marinasc.mp4"
