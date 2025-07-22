#!/bin/bash
# filepath: ./make_thumbnail.sh

input="$1"
date_text="$(date +%Y-%m-%d)"
base=$(basename "$input")
name="${base%.*}"
output="${name}-new.jpg"

ffmpeg -i "$input" -y -vf "drawtext=text='${date_text}':fontcolor=white:fontsize=(h/5.4):x=50:y=h-th-50:box=1:boxcolor=black@0.75:boxborderw=20:" "$output"