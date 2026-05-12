#!/bin/bash 
# filepath: /home/vicente/yt-uploader/make_video_thumbnails.sh 

video="${2:-}"
output_dir="${3:-}"

date_text="$(date +%Y-%m-%d)"

if [[ "$1" == "-y" ]]; then
    date_text="$(date -d 'yesterday' +%Y-%m-%d)"
fi

if [[ -z "$video" ]]; then
    shopt -s nullglob
    files=( *.mp4 )
    if (( ${#files[@]} == 0 )); then
        echo "No .mp4 files found"
        exit 1
    fi
    video="${files[0]}"
fi

if [[ -z "$output_dir" ]]; then
    output_dir="out"
fi
mkdir -p "$output_dir" # Get video duration in seconds 
duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$video") 
duration=${duration%.*} 
max_jobs="$(nproc)"

for i in $(seq 1 100); do
  # Limit concurrent jobs to CPU count
  while (( $(jobs -rp | wc -l) >= max_jobs )); do
    wait -n
  done

  (
    ts=$(awk "BEGIN {print int($duration * $i / 101)}")

    thumb="$output_dir/thumb_$i.jpg"

    echo "Creating $thumb..."

    ffmpeg -hide_banner -loglevel error -y \
      -ss "$ts" \
      -i "$video" \
      -frames:v 1 \
      "$thumb" && \
    ffmpeg -hide_banner -loglevel error -y \
      -i "$thumb" \
      -vf "drawtext=text='${date_text}':fontcolor=white:fontsize=(h/5.4):x=50:y=h-th-50:box=1:boxcolor=black@0.75:boxborderw=20" \
      "${thumb%.jpg}_dated.jpg" && \
    mv "${thumb%.jpg}_dated.jpg" "$thumb"

  ) &
done

wait

echo "Finished generating thumbnails"