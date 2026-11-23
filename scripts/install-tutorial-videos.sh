#!/bin/sh
# Keep the release tag and checksum in sync with the approved web media.
set -eu

if [ "$#" -gt 2 ]; then
	echo 'Usage: sh scripts/install-tutorial-videos.sh [output directory] [local release archive]' >&2
	exit 2
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
destination=${1:-"$script_dir/../static/videos"}
archive=${2:-}
version=web-media-1
sha256=ef46ed35af0dc1d1480394e596da14274a930f7512984042e0829e1d5f7e7303

if [ -z "$archive" ]; then
	scratch=$(mktemp -d)
	trap 'rm -rf "$scratch"' EXIT HUP INT TERM
	archive="$scratch/akribos-tutorial-videos.tar"
	curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
		--connect-timeout 20 --max-time 300 --retry 3 \
		"https://github.com/akribos-biblestudy/akribos-videos/releases/download/$version/akribos-tutorial-videos.tar" \
		--output "$archive"
fi

if command -v sha256sum >/dev/null 2>&1; then
	actual=$(sha256sum < "$archive")
else
	actual=$(shasum -a 256 < "$archive")
fi
if [ "${actual%% *}" != "$sha256" ]; then
	echo 'Tutorial media archive SHA256 mismatch; refusing extraction.' >&2
	exit 1
fi

mkdir -p "$destination"
tar -xmf "$archive" -C "$destination"
