#!/bin/bash
# filepath: ./make_thumbnail.sh

input="$1"
base=$(basename "$input")
name="${base%.*}"
output="${name}-new.jpg"
date_text="$(date +%Y-%m-%d)"

if [[ "$2" == "-y" ]]; then
    date_text="$(date -d 'yesterday' +%Y-%m-%d)"
fi

ffmpeg -i "$input" -y -vf "drawtext=text='${date_text}':fontcolor=white:fontsize=(h/5.4):x=50:y=h-th-50:box=1:boxcolor=black@0.75:boxborderw=20:" "$output"