#!/bin/bash
# filepath: /home/vicente/yt-uploader/make_video_thumbnails.sh

video="$1"
output_dir="$2"
make_thumpnail="/usr/local/bin/make_thumpnail" # Adjust path if needed
date_text="$(date +%Y-%m-%d)"
if [[ -z "$video" || -z "$output_dir" ]]; then
  echo "Usage: $0 <video_file> <output_folder>"
  exit 1
fi

mkdir -p "$output_dir"

# Get video duration in seconds
duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$video")
duration=${duration%.*}

for i in $(seq 1 20); do
  # Calculate timestamp
  ts=$(awk "BEGIN {print int($duration * $i / 21)}")
  thumb="$output_dir/thumb_$i.jpg"
  ffmpeg -hide_banner -loglevel error -y -ss "$ts" -i "$video" -frames:v 1 "$thumb"
  ffmpeg -i "$thumb" -y -vf "drawtext=text='${date_text}':fontcolor=white:fontsize=(h/5.4):x=50:y=h-th-50:box=1:boxcolor=black@0.75:boxborderw=20:" "$thumb"
done