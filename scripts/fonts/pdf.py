#!/usr/bin/env python3
# SPDX-License-Identifier: OFL-1.1
"""Losslessly unpack the existing web fonts for Typst; verify every OpenType table.

No outline edits, subsetting, synthesized styles or new timestamps are introduced.
The TTF files are checked in so normal app/image builds need neither Python nor a font CDN.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import unicodedata

import brotli
import fontTools
from fontTools.ttLib import TTFont
import uharfbuzz as hb


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data/fonts/pdf"
HEBREW = {
    400: "330b5c315ebac6a102bea95898207a4fdae4a6180d27783dfbb2a700deb61845",
    600: "6d5ef398060957c6eada76470717c23f1e3286f677ef15c1aa3064549eb05aa1",
    700: "09d244bd91527d88c47f4831bbbd90cec4013c1c59dea25744bdd2b063c7777c",
}
VERSIONS = {"fonttools": "4.59.0", "brotli": "1.2.0", "uharfbuzz": "0.51.0"}
SAMPLES = (
    "ÄÖÜ äöü ß ẞ šālôm ḥesed ʾĕlōhîm ʿālam",
    "Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν.",
    "ᾠδή ᾗ ᾧ Ἄ Ὦ ΐ ῗ ῧ ῥ ἀ ἁ ἄ ἅ ἆ ἇ ῳ ᾆ",
)
HEBREW_SAMPLE = "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃"


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def font_bytes(font: TTFont) -> bytes:
    font.flavor = None
    output = io.BytesIO()
    font.save(output, reorderTables=True)
    return output.getvalue()


def shape(value: bytes, text: str) -> list[tuple]:
    font = hb.Font(hb.Face(value))
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(font, buffer)
    result = [(glyph.codepoint, position.x_advance, position.y_advance,
               position.x_offset, position.y_offset)
              for glyph, position in zip(buffer.glyph_infos, buffer.glyph_positions)]
    if any(glyph[0] == 0 for glyph in result):
        raise ValueError("Missing glyph in the font's script proof")
    return result


def convert(source: Path, source_sha256: str, weight: int, italic: bool) -> tuple[bytes, dict]:
    raw = source.read_bytes()
    if digest(raw) != source_sha256:
        raise ValueError(f"Unreviewed source font: {source}")
    font = TTFont(io.BytesIO(raw), recalcTimestamp=False, recalcBBoxes=False)
    if font["OS/2"].usWeightClass != weight or bool(font["OS/2"].fsSelection & 1) != italic:
        raise ValueError(f"Incorrect real font style: {source}")
    # Materialize every table first. This also reconstructs WOFF2's glyf/loca transforms.
    before = {tag: font.getTableData(tag) for tag in font.keys() if tag != "GlyphOrder"}
    output = font_bytes(font)
    restored = TTFont(io.BytesIO(output), recalcTimestamp=False, recalcBBoxes=False)
    after = {tag: restored.getTableData(tag) for tag in restored.keys() if tag != "GlyphOrder"}
    if before.keys() != after.keys():
        raise ValueError(f"OpenType table set changed: {source}")
    for tag in before:
        left, right = before[tag], after[tag]
        if tag == "head":
            # Only the container's master checksum changes when WOFF2 becomes sfnt.
            left, right = left[:8] + left[12:], right[:8] + right[12:]
        if left != right:
            raise ValueError(f"OpenType table {tag} changed: {source}")
    family = restored["name"].getDebugName(16) or restored["name"].getDebugName(1)
    samples = (HEBREW_SAMPLE,) if family.startswith("Noto Sans Hebrew") else SAMPLES
    # Confirm composed/decomposed scholarly characters and Hebrew marks survive shaping.
    for sample in samples:
        if shape(output, unicodedata.normalize("NFC", sample)) != shape(
                output, unicodedata.normalize("NFD", sample)):
            raise ValueError(f"NFC/NFD shaping differs: {source}")
    return output, {
        "source": str(source.relative_to(ROOT)), "sourceSha256": source_sha256,
        "sha256": digest(output), "bytes": len(output), "family": family,
        "weight": weight, "italic": italic, "codepoints": len(restored.getBestCmap()),
        "verifiedTables": sorted(before), "nfcNfdSamples": len(samples),
    }


def generate() -> dict[str, bytes]:
    actual = {"fonttools": fontTools.__version__, "brotli": brotli.__version__,
              "uharfbuzz": hb.__version__}
    if actual != VERSIONS:
        raise ValueError(f"Use scripts/fonts/requirements.txt; found {actual}")
    source_manifest = json.loads((ROOT / "data/fonts/akribos-text/manifest.json").read_text())
    files, manifest = {}, {"conversion": "WOFF2 to sfnt; no font edits", "tools": VERSIONS,
                           "fontsourceNotoSansHebrew": "5.3.0", "files": {}}
    package = ROOT / "node_modules/@fontsource/noto-sans-hebrew"
    if json.loads((package / "package.json").read_text())["version"] != "5.3.0":
        raise ValueError("Noto Sans Hebrew package changed; review sources before regenerating")
    sources = [(ROOT / "src/lib/assets/fonts" / name, item["sha256"], item["weight"], item["italic"])
               for name, item in source_manifest["files"].items()]
    sources += [(package / "files" / f"noto-sans-hebrew-hebrew-{weight}-normal.woff2", sha, weight, False)
                for weight, sha in HEBREW.items()]
    for source, sha, weight, italic in sources:
        name = source.with_suffix(".ttf").name
        files[name], manifest["files"][name] = convert(source, sha, weight, italic)
    files["OFL-Akribos-Text.txt"] = (ROOT / "data/fonts/akribos-text/OFL.txt").read_bytes()
    files["OFL-Noto-Sans-Hebrew.txt"] = (package / "LICENSE").read_bytes()
    files["manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    return files


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify committed outputs without writing")
    args = parser.parse_args()
    files = generate()
    if args.check:
        expected = set(files)
        actual = {path.name for path in OUTPUT.iterdir() if path.is_file()}
        if expected != actual:
            raise ValueError(f"Unexpected/missing PDF font artifacts: {expected ^ actual}")
        for name, data in files.items():
            if (OUTPUT / name).read_bytes() != data:
                raise ValueError(f"PDF font artifact differs: {name}")
        print("PDF fonts verified: 9 real faces, all OpenType tables and NFC/NFD samples preserved")
    else:
        OUTPUT.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            (OUTPUT / name).write_bytes(data)
        print(f"Wrote {len(files)} deterministic PDF font artifacts to {OUTPUT}")


if __name__ == "__main__":
    main()
