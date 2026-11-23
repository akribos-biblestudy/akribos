#!/usr/bin/env bash
set -euo pipefail

if (( $# < 1 || $# > 2 )); then
	printf 'Usage: %s <akribos-videos checkout> [output directory]\n' "$0" >&2
	exit 1
fi

source_dir=$(realpath "$1")
project_dir=$(cd -- "$(dirname -- "$0")/.." && pwd)
destination=${2:-"$project_dir/static/videos"}
mkdir -p -- "$destination"
staging=$(mktemp -d "$destination/.prepare-XXXXXX")
trap 'rm -rf -- "$staging"' EXIT

prepare_episode() {
	local number=$1
	local basename="folge-$number"
	local directories=("$source_dir"/"$basename"-*)
	local source_episode=${directories[0]}
	local master="$source_episode/$basename.mp4"
	local thumbnail="$source_episode/youtube-thumbnail.jpg"

	printf 'Preparing %s\n' "$basename"
	ffmpeg -nostdin -loglevel error -threads 2 -i "$master" \
		-map 0:v:0 -map 0:a:0 -c:v libx264 -threads 3 -preset fast -crf 21 \
		-pix_fmt yuv420p -g 60 -c:a aac -b:a 128k -movflags +faststart \
		"$staging/$basename.mp4"
	ffmpeg -nostdin -loglevel error -i "$source_episode/voiceover/untertitel.srt" \
		-c:s webvtt "$staging/$basename.vtt"

	# Use a product shot from the introduction itself on the landing page.
	if [[ $number == 01 ]]; then
		ffmpeg -nostdin -loglevel error -ss 7.5 -i "$master" -frames:v 1 \
			-vf scale=1280:-2 -c:v libwebp -quality 84 "$staging/$basename.webp"
	else
		ffmpeg -nostdin -loglevel error -i "$thumbnail" -frames:v 1 \
			-vf scale=960:-2 -c:v libwebp -quality 84 "$staging/$basename.webp"
	fi
}

export source_dir staging
export -f prepare_episode
seq -w 1 15 | xargs -P 3 -n 1 bash -e -c 'prepare_episode "$1"' bash
mv -f -- "$staging"/* "$destination/"
