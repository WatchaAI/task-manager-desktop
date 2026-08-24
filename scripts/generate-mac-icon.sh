#!/bin/zsh

set -euo pipefail

script_dir="${0:A:h}"
project_dir="${script_dir:h}"
source_svg="$project_dir/build/icon.svg"
output_png="$project_dir/build/icon.png"
output_icns="$project_dir/build/icon.icns"
render_dir="$(mktemp -d)"
iconset_dir="$render_dir/TaskManager.iconset"

cleanup() {
  rm -rf "$render_dir"
}
trap cleanup EXIT

test -f "$source_svg"
mkdir -p "$iconset_dir"

qlmanage -t -s 1024 -o "$render_dir" "$source_svg" >/dev/null 2>&1
rendered_png="$render_dir/$(basename "$source_svg").png"
test -f "$rendered_png"

ditto "$rendered_png" "$output_png"

make_icon() {
  local size="$1"
  local filename="$2"
  sips -z "$size" "$size" "$output_png" --out "$iconset_dir/$filename" >/dev/null
}

make_icon 16 icon_16x16.png
make_icon 32 icon_16x16@2x.png
make_icon 32 icon_32x32.png
make_icon 64 icon_32x32@2x.png
make_icon 128 icon_128x128.png
make_icon 256 icon_128x128@2x.png
make_icon 256 icon_256x256.png
make_icon 512 icon_256x256@2x.png
make_icon 512 icon_512x512.png
make_icon 1024 icon_512x512@2x.png

iconutil -c icns "$iconset_dir" -o "$output_icns"

test -s "$output_png"
test -s "$output_icns"
