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
# cena:duração(s):vídeo de fundo (vazio = imagem parada com zoom)
PLANO=(
  "1:3.5:trabalho7.mp4"
  "2:5.5:"
  "3:6:"
  "4:4.5:"
  "5:4.5:"
  "6:4.5:trabalho6.mp4"
  "7:4.5:"
  "8:5:"
  "9:4.5:"
)

# 2. Um clip por cena
for p in "${PLANO[@]}"; do
  IFS=: read -r n dur bg <<<"$p"
  frames=$(awk "BEGIN{print int($dur*$FPS)}")
  if [[ -n "$bg" ]]; then
    ffmpeg -v error -y -stream_loop -1 -i "$MEDIA/$bg" -i "$CENAS/c$n.png" -filter_complex \
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=$FPS[bg];[bg][1:v]overlay=0:0,format=yuv420p" \
      -t "$dur" -an -c:v libx264 -crf 20 -preset medium "$TMP/c$n.mp4"
  else
    ffmpeg -v error -y -loop 1 -i "$CENAS/c$n.png" -filter_complex \
      "[0:v]scale=1188:2112,zoompan=z='min(1+0.0006*on,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$frames:s=1080x1920:fps=$FPS,setsar=1,format=yuv420p" \
      -frames:v "$frames" -an -c:v libx264 -crf 20 -preset medium "$TMP/c$n.mp4"
  fi
done

# 3. Juntar com transições de 0,4 s
T=0.4
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
