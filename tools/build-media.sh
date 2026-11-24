#!/bin/bash
# Фото и короткие видео для сайта из исходной съёмки — одной командой.
#
#   bash tools/build-media.sh            — собрать всё
#   bash tools/build-media.sh yasno      — только Ясно Поле
#   bash tools/build-media.sh cirali     — только Чиралы
#   bash tools/build-media.sh istanbul   — только Стамбул
#
# Исходники (на рабочем столе):
#   ~/Desktop/Ясно Поле видео/IMG_*.MOV  — iPhone, 4K, вертикально, HDR (сентябрь 2026)
#   ~/Desktop/Чиралы/C*.MP4              — камера Sony, 4K, горизонтально (ноябрь 2025)
#
# Результат — в assets/media/<место>/:
#   *.mp4   — видео 5–7 секунд без звука, зациклено плавно (конец перетекает в начало)
#   *.webp  — фото (и первый кадр для каждого видео)
# Эти же файлы можно брать для календаря платформы Мастера — они не привязаны к этому сайту.
#
# Нужно: ffmpeg, cwebp (brew install ffmpeg webp) и macOS (avconvert — переводит iPhone HDR в обычный цвет).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$HOME/.cache/evo-tools"
YSRC="$HOME/Desktop/Ясно Поле видео"
CSRC="$HOME/Desktop/Чиралы"
FADE=0.8                       # сколько секунд конец видео перетекает в начало
X264="-c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -movflags +faststart -an"
# Камера Sony снимала в плоском профиле: чуть больше контраста и цвета, немного теплее
GRADE_SONY="eq=contrast=1.08:saturation=1.2:gamma=1.03,colorbalance=rm=0.025:gm=-0.01:bm=-0.025"
GRADE_IPHONE="eq=saturation=1.04"

calc() { python3 -c "print(round($1, 3))"; }

# iPhone HDR → обычный цвет (один раз, результат кешируется)
sdr() {
  local name="$1" out="$CACHE/yasno/sdr4k/$1.mp4"
  mkdir -p "$CACHE/yasno/sdr4k"
  [ -s "$out" ] || avconvert -s "$YSRC/$name.MOV" -p Preset3840x2160 -o "$out" --replace >/dev/null
  echo "$out"
}

# Зацикленное видео: loop <исходник> <старт> <длина> <папка/имя> <кадрирование> <ширина:высота> <цвет> [замедление] [crf]
loop() {
  local src="$1" ss="$2" dur="$3" out="$ROOT/assets/media/$4" crop="$5" size="$6" grade="$7" slow="${8:-1}" crf="${9:-29}"
  local raw; raw=$(calc "($dur + $FADE) / $slow + 0.2")
  local off; off=$(calc "$dur - $FADE")
  mkdir -p "$(dirname "$out")"
  ffmpeg -v error -y -ss "$ss" -t "$raw" -i "$src" -filter_complex "
    [0:v]setpts=$slow*(PTS-STARTPTS),fps=24,$crop,scale=$size:flags=lanczos,$grade,trim=0:$(calc "$dur + $FADE"),setpts=PTS-STARTPTS,split[x][y];
    [x]trim=$FADE:$(calc "$dur + $FADE"),setpts=PTS-STARTPTS[main];
    [y]trim=0:$FADE,setpts=PTS-STARTPTS[head];
    [main][head]xfade=transition=fade:duration=$FADE:offset=$off,format=yuv420p[v]" \
    -map "[v]" $X264 -crf "$crf" "$out.mp4"
  ffmpeg -v error -y -i "$out.mp4" -frames:v 1 -f image2pipe -vcodec png - | cwebp -quiet -q 70 -o "$out.webp" -- -
  printf "  %-34s %6s KB видео · %4s KB кадр\n" "$4" "$(( $(wc -c < "$out.mp4") / 1024 ))" "$(( $(wc -c < "$out.webp") / 1024 ))"
}

# Фото из кадра: still <исходник> <время> <папка/имя> <кадрирование> <ширина> <цвет> [качество]
still() {
  local src="$1" t="$2" out="$ROOT/assets/media/$3" crop="$4" w="$5" grade="$6" q="${7:-74}"
  mkdir -p "$(dirname "$out")"
  local seek=(); [ "$t" != "-" ] && seek=(-ss "$t")     # «-» — исходник фото, а не видео
  ffmpeg -v error -y ${seek[@]+"${seek[@]}"} -i "$src" -frames:v 1 -vf "$crop,scale=$w:-2:flags=lanczos,$grade" -f image2pipe -vcodec png - \
    | cwebp -quiet -q "$q" -m 6 -sharp_yuv -o "$out.webp" -- -
  printf "  %-34s %6s KB\n" "$3" "$(( $(wc -c < "$out.webp") / 1024 ))"
}

yasno() {
  echo "Ясно Поле (iPhone, сентябрь 2026)"
  local Y="yasno-pole-2026"
  local grass pond hall hay pump
  grass=$(sdr IMG_1950); pond=$(sdr IMG_1947); hall=$(sdr IMG_1987); hay=$(sdr IMG_2003); pump=$(sdr IMG_2023)
  # Обложка: золотая трава и солнце сквозь деревья — без блика (блик ниже кадра)
  still "$grass" 3 "$Y/cover"     "crop=1880:2350:30:0" 1600 "$GRADE_IPHONE,eq=gamma=1.14:brightness=0.015" 78
  still "$grass" 3 "$Y/cover-800" "crop=1880:2350:30:0" 800  "$GRADE_IPHONE,eq=gamma=1.14:brightness=0.015" 76
  loop  "$grass" 0.5 6   "$Y/grass" "crop=1406:2500:180:0" 540:960  "$GRADE_IPHONE"
  loop  "$pond"  6   6   "$Y/pond"  "crop=2160:3840:0:0"   540:960  "$GRADE_IPHONE"
  loop  "$hall"  0.4 3.4 "$Y/hall"  "crop=2160:1620:0:1300" 1280:960 "$GRADE_IPHONE"       # встреча с Мастером в зале
  still "$hay"   1.5 "$Y/hay"      "crop=2160:2160:0:1300" 900 "$GRADE_IPHONE"
  still "$pump"  5   "$Y/pumpkins" "crop=2160:2160:0:1000" 900 "$GRADE_IPHONE"
  still "$pond"  1   "$Y/pier"     "crop=2160:2160:0:700"  900 "$GRADE_IPHONE"
  still "$pond"  19  "$Y/pine"     "crop=2160:2160:0:1100" 900 "$GRADE_IPHONE"
  # Превью ссылки (1200×630, JPG)
  ffmpeg -v error -y -ss 3 -i "$grass" -frames:v 1 -vf "crop=2160:1134:0:620,scale=1200:630,$GRADE_IPHONE,eq=gamma=1.14:brightness=0.015" -q:v 4 "$ROOT/assets/img/og-yasno-pole.jpg"
}

cirali() {
  echo "Чиралы (камера Sony, ноябрь 2025)"
  local C="cirali-2025" S="$CSRC"
  # Часть роликов снята вертикально: ffmpeg сам поворачивает их в 2160×3840
  loop  "$S/C0183.MP4" 2  6 "$C/hall"  "crop=3840:2160:0:0"    1280:720 "$GRADE_SONY" 2.5   # встреча с Мастером, замедленно (снято 120 к/с)
  loop  "$S/C0147.MP4" 16 6 "$C/path"  "crop=2160:3840:0:0"    540:960  "$GRADE_SONY"       # дорожка среди пальм (вертикально)
  loop  "$S/C0139.MP4" 8  6 "$C/tree"  "crop=2160:3840:0:0"    540:960  "$GRADE_SONY"       # старое дерево (вертикально)
  still "$S/C0152.MP4" 40 "$C/bougainvillea" "crop=2160:2160:840:0"  900 "$GRADE_SONY"
  still "$S/C0143.MP4" 8  "$C/pond"          "crop=2160:2160:0:1100" 900 "$GRADE_SONY"
  still "$S/C0151.MP4" 6  "$C/lemons"        "crop=2160:2160:0:800"  900 "$GRADE_SONY"
  still "$S/C0153.MP4" 9  "$C/oleander"      "crop=2160:2160:0:250"  900 "$GRADE_SONY"
}

# Стамбул: фото с Wikimedia Commons (свободные лицензии, авторы — в _data/site.yml → photo_credits).
# Исходники скачаны в ~/.cache/evo-tools/istanbul/ (оригиналы с Commons; что откуда — в assets/media/СОСТАВ.md).
# На страницах — спокойные виды на море: вечернее Мраморное море (обложка января), Тузла и Гебзе. Городские фото (мечети, паром) лежат в запасе.
istanbul() {
  echo "Стамбул (Wikimedia Commons и фото отеля)"
  local I="$CACHE/istanbul" O="istanbul" spec n c
  # имя:кадрирование — у двух фото из Тузлы снизу срезан штамп с датой съёмки
  for spec in "marmara-evening:null" "eskihisar-sea:null" "eskihisar-coast:null" "pines-sunset:null" \
              "tuzla-promenade:crop=iw:ih*0.86:0:0" "tuzla-alley:crop=iw:ih*0.86:0:0" \
              "blue-mosque:null" "suleymaniye-night:null" "ortakoy-interior:null" "ferry:null"; do
    n="${spec%%:*}"; c="${spec#*:}"
    [ -s "$I/$n.jpg" ] || { echo "  нет исходника $n.jpg — пропускаю"; continue; }
    still "$I/$n.jpg" - "$O/$n"     "$c" 1600 "null" 80
    still "$I/$n.jpg" - "$O/$n-800" "$c" 800  "null" 78
  done
  # Elite Hotel Darıca (январский интенсив) — официальные фото отеля, с согласия отеля. Идут в галерею «Место проведения».
  # Взяты в полном размере (2000 px) со страницы отеля на Trip.com: на сайте самого отеля те же кадры выложены мелкими.
  # имя|кадрирование под 3:2|ширина большого файла. Рядом кладётся «-800» для галереи.
  local w
  for spec in "hotel-balcony-sea|null|1600" "hotel-terrace|crop=1688:1125:0:0|1600" "hotel-exterior|null|1600" \
              "hotel-room-sea|null|1600" "hotel-window-sea|null|1600" "hotel-seafront|crop=1200:800:80:0|1200"; do
    IFS='|' read -r n c w <<< "$spec"
    [ -s "$I/$n.jpg" ] || { echo "  нет исходника $n.jpg — пропускаю"; continue; }
    still "$I/$n.jpg" - "$O/$n"     "$c" "$w" "null" 80
    still "$I/$n.jpg" - "$O/$n-800" "$c" 800  "null" 78
  done
  # Превью ссылок двух стамбульских интенсивов (январь и август)
  ffmpeg -v error -y -i "$I/marmara-evening.jpg" -vf "scale=1200:-2,crop=1200:630:0:(ih-630)*0.62" -q:v 3 "$ROOT/assets/img/og-istanbul-january.jpg"
  ffmpeg -v error -y -i "$I/eskihisar-sea.jpg" -vf "scale=1200:-2,crop=1200:630:0:(ih-630)*0.45" -q:v 3 "$ROOT/assets/img/og-istanbul-august.jpg"
}

case "${1:-all}" in
  yasno) yasno ;;
  cirali) cirali ;;
  istanbul) istanbul ;;
  *) yasno; cirali; istanbul ;;
esac
echo "Готово: $ROOT/assets/media"
