#!/bin/sh
# Install only the reviewed official Typst release; never resolve a floating latest tag.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
prefix="$script_dir/../var/tools/typst"
archive=''
while [ "$#" -gt 0 ]; do
    case "$1" in
        --prefix) prefix=$2; shift 2 ;;
        --archive) archive=$2; shift 2 ;;
        *) echo "Usage: sh scripts/install-typst.sh [--prefix DIRECTORY] [--archive VERIFIED-RELEASE.tar.xz]" >&2; exit 2 ;;
    esac
done

version=0.15.1
# GitHub's official release asset digests, reviewed for v0.15.1:
# https://api.github.com/repos/typst/typst/releases/tags/v0.15.1
case "$(uname -s):$(uname -m)" in
    Linux:x86_64)
        target=x86_64-unknown-linux-musl
        sha256=a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c ;;
    Linux:aarch64|Linux:arm64)
        target=aarch64-unknown-linux-musl
        sha256=5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee ;;
    Darwin:x86_64)
        target=x86_64-apple-darwin
        sha256=7f9fdd9584866245de9a79e0add8f9236fae6f40a8a45e2c4771ccc14db4e0fa ;;
    Darwin:arm64)
        target=aarch64-apple-darwin
        sha256=48f62ed034aa3a7978309579ac6ca00045e2ef0da73114e8af27cfd8e74dc05a ;;
    *) echo 'Typst installer supports Linux/macOS on x86_64 or arm64.' >&2; exit 2 ;;
esac

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
if [ -n "$archive" ]; then
    cp "$archive" "$scratch/release.tar.xz"
else
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
        --connect-timeout 20 --max-time 180 --retry 3 \
        "https://github.com/typst/typst/releases/download/v$version/typst-$target.tar.xz" \
        --output "$scratch/release.tar.xz"
fi
if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$scratch/release.tar.xz" | cut -d ' ' -f 1)
else
    actual=$(shasum -a 256 "$scratch/release.tar.xz" | cut -d ' ' -f 1)
fi
if [ "$actual" != "$sha256" ]; then
    echo 'Typst archive SHA256 mismatch; refusing extraction or installation.' >&2
    exit 1
fi
tar -xJf "$scratch/release.tar.xz" -C "$scratch"
release="$scratch/typst-$target"
case "$("$release/typst" --version)" in
    "typst $version ("*) ;;
    *) echo 'Unexpected Typst binary version.' >&2; exit 1 ;;
esac
install -d "$prefix/bin" "$prefix/share/typst"
install -m 0755 "$release/typst" "$prefix/bin/typst"
for file in LICENSE NOTICE README.md; do
    if [ -f "$release/$file" ]; then
        install -m 0644 "$release/$file" "$prefix/share/typst/$file"
    fi
done
"$prefix/bin/typst" --version
