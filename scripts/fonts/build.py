#!/usr/bin/env python3
# SPDX-License-Identifier: OFL-1.1
"""Build and validate the Akribos Text derivative from a pinned OFL release.

See docs/typography.md. This is font software under OFL, not the app's AGPL.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unicodedata
import urllib.request
import zipfile

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.ttProgram import Program
import uharfbuzz as hb


ROOT = Path(__file__).resolve().parents[2]
SOURCE_URL = (
    "https://github.com/silnrsi/font-gentium/releases/download/v7.000/"
    "GentiumBook-7.000.zip"
)
SOURCE_SHA256 = "fa4e35bcea62dd68befabf4bb7c2765aacd2691f51ec8ae008f5f913ef49f419"
VERSION = "1.000"
# 2026-09-21 00:00 UTC in the OpenType epoch (1904): fixed, never wall-clock time.
TIMESTAMP = 3872793600
STYLES = {
    "Regular": (400, False, "regular"),
    "Italic": (400, True, "italic"),
    "SemiBold": (600, False, "semibold"),
    "SemiBoldItalic": (600, True, "semibold-italic"),
    "Bold": (700, False, "bold"),
    "BoldItalic": (700, True, "bold-italic"),
}
# Point selections are for this exact release; the archive hash pins topology.
# Move each terminal together with its controls; adjacent controls move halfway
# to keep its transition into the bowl smooth. Values are design units (2048/em).
TERMINALS = {
    "Regular": {"e": ([24, 25, 26, 27], [23, 28]),
                "c_lower": ([35, 0], [34, 1]),
                "c_upper": ([18, 19, 20, 21], [17, 22])},
    "Italic": {"e": ([27, 28, 29, 30], [26, 31]),
               "c_lower": ([19, 20, 21, 22], [18, 23]),
               "c_upper": ([2, 3, 4, 5, 6], [1, 7])},
    "SemiBold": {"e": ([23, 24, 25, 26], [22, 27]),
                 "c_lower": ([36, 0], [35, 1]),
                 "c_upper": ([19, 20, 21, 22, 23], [18, 24])},
    "SemiBoldItalic": {"e": ([26, 27, 28, 29], [25, 30]),
                       "c_lower": ([18, 19, 20, 21], [17, 22]),
                       "c_upper": ([2, 3, 4, 5], [1, 6])},
    "Bold": {"e": ([23, 24, 25, 26], [22, 27]),
             "c_lower": ([36, 0], [35, 1]),
             "c_upper": ([19, 20, 21, 22, 23], [18, 24])},
    "BoldItalic": {"e": ([26, 27, 28, 29, 30], [25, 31]),
                   "c_lower": ([19, 20, 21, 22], [18, 23]),
                   "c_upper": ([2, 3, 4, 5, 6], [1, 7])},
}
POINT_COUNTS = {
    "Regular": (46, 36), "Italic": (47, 41),
    "SemiBold": (43, 37), "SemiBoldItalic": (45, 38),
    "Bold": (43, 37), "BoldItalic": (47, 39),
}
# Latin, IPA/transliteration, Greek including polytonic, combining marks,
# punctuation, currency, number forms and scholarly symbols; no Hebrew glyphs.
RANGES = (
    (0x0000, 0x03FF), (0x1AB0, 0x1AFF), (0x1DC0, 0x218F),
    (0xFE20, 0xFE2F),
)
SAMPLES = (
    "Im Anfang war das Wort, und das Wort war bei Gott. ÄÖÜ äöü ß ẞ.",
    "Il1 rn m cl d 0123456789 3,16–18 „Wahrheit“ ›Wort‹ … € †",
    "Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν.",
    "ᾠδή ᾗ ᾧ Ἄ Ὦ ΐ ῗ ῧ ῥ ἀ ἁ ἄ ἅ ἆ ἇ ῳ ᾆ",
    "šālôm ḥesed ʾĕlōhîm ʿālam r̥ ḗ ō̂ ā́",
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_archive(path: Path | None) -> bytes:
    if path is not None:
        data = path.read_bytes()
    else:
        request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Akribos-font-build/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
    if digest(data) != SOURCE_SHA256:
        raise ValueError("Source checksum mismatch; refusing to modify unreviewed font outlines")
    return data


def move(font: TTFont, glyph: str, indices: list[int], dx: int, dy: int) -> None:
    coordinates = font["glyf"][glyph].coordinates
    for index in indices:
        x, y = coordinates[index]
        coordinates[index] = (x + dx, y + dy)


def descendants(font: TTFont, bases: set[str]) -> set[str]:
    affected = set(bases)
    while True:
        added = {
            name for name in font.getGlyphOrder()
            if font["glyf"][name].isComposite()
            and any(c.glyphName in affected for c in font["glyf"][name].components)
        } - affected
        if not added:
            return affected
        affected.update(added)


def customize(font: TTFont, style: str) -> dict:
    for glyph, expected in zip(("e", "c"), POINT_COUNTS[style]):
        assert len(font["glyf"][glyph].coordinates) == expected, (style, glyph)
    for key, (dx, dy) in {"e": (-12, -32), "c_lower": (-10, -24), "c_upper": (0, 18)}.items():
        full, half = TERMINALS[style][key]
        glyph = key[0]
        move(font, glyph, full, dx, dy)
        move(font, glyph, half, dx // 2, dy // 2)
    changed = {"e", "c"}
    if not STYLES[style][1]:
        assert len(font["glyf"]["l"].coordinates) == 20
        # Asymmetric foot: less left serif, clearer rightward exit.
        for glyph, left_start in (("l", 0), ("lslash", 0),
                                  ("lcaron", 13 if style == "Regular" else 14)):
            end = len(font["glyf"][glyph].coordinates)
            for points, dx in (([left_start, left_start + 1], 14),
                               ([left_start + 2], 8), ([left_start + 3], 4),
                               ([end - 4], 6), ([end - 3], 14),
                               ([end - 2, end - 1], 28)):
                move(font, glyph, points, dx, 0)
            changed.add(glyph)
    # Preserve the breathing room also on accented composite descendants.
    advance_changes = {name: 12 for name in descendants(font, {"r"})}
    if "l" in changed:
        advance_changes.update({name: 20 for name in descendants(font, {"l", "lcaron", "lslash"})})
    cmap = font.getBestCmap()
    for cp in (0x20, 0xA0):
        advance_changes[cmap[cp]] = 32
    for name, delta in advance_changes.items():
        advance, lsb = font["hmtx"][name]
        font["hmtx"][name] = (advance + delta, lsb)
    # Old point instructions must not undo new outlines or distort composites.
    # Unchanged glyphs retain the upstream screen hinting and global programs.
    affected = descendants(font, changed)
    for name in affected:
        glyph = font["glyf"][name]
        glyph.program = Program()
        glyph.program.fromBytecode([])
        glyph.recalcBounds(font["glyf"])
        advance, _ = font["hmtx"][name]
        font["hmtx"][name] = (advance, glyph.xMin)
    return {"outline_roots": sorted(changed), "outline_glyphs": len(affected),
            "spacing_glyphs": len(advance_changes)}


def rename(font: TTFont, style: str, license_text: str) -> None:
    weight, italic, _ = STYLES[style]
    names = font["name"]
    copyright_text = names.getDebugName(0) + " Akribos modifications copyright 2026 Akribos contributors."
    designer = names.getDebugName(9) or "Victor Gaultney and SIL Global"
    family = "Akribos Text"
    subfamily = {"SemiBold": "SemiBold", "SemiBoldItalic": "SemiBold Italic",
                 "BoldItalic": "Bold Italic"}.get(style, style)
    legacy_family = family + (" SemiBold" if weight == 600 else "")
    legacy_style = ("Italic" if italic else "Regular") if weight == 600 else subfamily
    # Recreate naming records deliberately; retain attribution in copyright and
    # designer, never the reserved upstream family in primary font names.
    names.names = []
    values = {
        0: copyright_text, 1: legacy_family, 2: legacy_style,
        3: f"AkribosText-{style}-{VERSION}", 4: f"{family} {subfamily}",
        5: f"Version {VERSION}", 6: f"AkribosText-{style}",
        8: "Akribos contributors", 9: designer + "; Akribos modifications: Akribos contributors",
        11: "https://github.com/akribos-biblestudy/akribos",
        13: license_text, 14: "https://openfontlicense.org/",
        16: family, 17: subfamily,
    }
    for name_id, value in values.items():
        names.setName(value, name_id, 3, 1, 0x409)
    font["head"].fontRevision = float(VERSION)
    font["head"].created = TIMESTAMP
    font["head"].modified = TIMESTAMP
    font["OS/2"].achVendID = "AKRB"
    font["OS/2"].fsType = 0
    for table in ("DSIG", "Silt"):
        if table in font:
            del font[table]


def web_subset(font: TTFont) -> None:
    options = subset.Options()
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 13, 14, 16, 17]
    options.name_legacy = True
    options.name_languages = [0x409]
    options.layout_features = [
        "ccmp", "locl", "kern", "mark", "mkmk", "liga", "clig", "calt", "case",
        "frac", "lnum", "onum", "pnum", "tnum", "sups", "subs", "smcp", "c2sc",
    ]
    options.glyph_names = False
    options.notdef_glyph = True
    options.notdef_outline = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes={cp for start, end in RANGES for cp in range(start, end + 1)})
    subsetter.subset(font)


def sfnt_bytes(font: TTFont) -> bytes:
    flavor = font.flavor
    font.flavor = None
    target = io.BytesIO()
    font.save(target)
    font.flavor = flavor
    return target.getvalue()


def shape(font: hb.Font, text: str) -> list[tuple]:
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(font, buffer)
    return [(info.codepoint, pos.x_advance, pos.y_advance, pos.x_offset, pos.y_offset)
            for info, pos in zip(buffer.glyph_infos, buffer.glyph_positions)]


def validate(font: TTFont, source: TTFont, style: str) -> dict:
    weight, italic, _ = STYLES[style]
    assert font["OS/2"].usWeightClass == weight
    assert bool(font["OS/2"].fsSelection & 1) == italic
    assert (font["post"].italicAngle != 0) == italic
    assert font["name"].getDebugName(16) == "Akribos Text"
    for name_id in (1, 3, 4, 6, 16, 17):
        assert not any(reserved in font["name"].getDebugName(name_id) for reserved in ("Gentium", "SIL"))
    assert "SIL OPEN FONT LICENSE" in font["name"].getDebugName(13)
    assert all(table in font for table in ("GSUB", "GPOS", "GDEF"))
    cmap = font.getBestCmap()
    required = {ord(c) for sample in SAMPLES for c in unicodedata.normalize("NFD", sample)}
    missing = sorted(required - cmap.keys())
    assert not missing, f"Missing codepoints: {missing}"
    for cp, name in source.getBestCmap().items():
        if any(start <= cp <= end for start, end in RANGES):
            assert cp in cmap, f"Subset lost U+{cp:04X}"
    assert not any(cp in cmap for cp in range(0x590, 0x600)), "Hebrew must use its complete fallback"
    # Composed e/c/l forms inherit outlines; untouched shapes retain their design.
    for char in "ecéèêëćč" + ("lĺľļł" if not italic else ""):
        cp = ord(char)
        actual = font["glyf"][cmap[cp]].getCoordinates(font["glyf"])[0]
        original = source["glyf"][source.getBestCmap()[cp]].getCoordinates(source["glyf"])[0]
        assert list(actual) != list(original), f"Custom outline lost: {char}"
    for char in "aogßΩἦᾧ":
        cp = ord(char)
        actual = font["glyf"][cmap[cp]].getCoordinates(font["glyf"])[0]
        original = source["glyf"][source.getBestCmap()[cp]].getCoordinates(source["glyf"])[0]
        assert list(actual) == list(original), f"Unexpected outline change: {char}"
    hb_font = hb.Font(hb.Face(sfnt_bytes(font)))
    for sample in SAMPLES:
        nfc = shape(hb_font, unicodedata.normalize("NFC", sample))
        nfd = shape(hb_font, unicodedata.normalize("NFD", sample))
        assert all(glyph[0] != 0 for glyph in nfc + nfd), f".notdef in {sample}"
        assert nfc == nfd, f"Canonical shaping mismatch: {sample}"
    # Retained kerning and actual Greek accent positioning are essential.
    assert shape(hb_font, "AV")[0][1] < shape(hb_font, "A")[0][1]
    assert any(item[3] or item[4] for item in shape(hb_font, "a\u0304\u0301"))
    return {"codepoints": len(cmap), "glyphs": len(font.getGlyphOrder()),
            "nfc_nfd_samples": len(SAMPLES), "weight": weight, "italic": italic}


def build(archive_data: bytes, destination: Path) -> dict:
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {"family": "Akribos Text", "version": VERSION,
                "source": {"url": SOURCE_URL, "sha256": SOURCE_SHA256}, "files": {}}
    with zipfile.ZipFile(io.BytesIO(archive_data)) as archive:
        license_text = archive.read("GentiumBook-7.000/OFL.txt").decode("utf-8")
        for style, (_, _, slug) in STYLES.items():
            raw = archive.read(f"GentiumBook-7.000/GentiumBook-{style}.ttf")
            font = TTFont(io.BytesIO(raw), recalcTimestamp=False)
            source = TTFont(io.BytesIO(raw), recalcTimestamp=False)
            modifications = customize(font, style)
            rename(font, style, license_text)
            web_subset(font)
            filename = f"akribos-text-{slug}.woff2"
            font.flavor = "woff2"
            font.save(destination / filename)
            # Validate the encoded artifact, not merely the in-memory source.
            encoded = TTFont(destination / filename, recalcTimestamp=False)
            validation = validate(encoded, source, style)
            data = (destination / filename).read_bytes()
            manifest["files"][filename] = {"sha256": digest(data), "bytes": len(data),
                                         **validation, **modifications}
            print(f"{filename}: {len(data):,} bytes, {validation['codepoints']} codepoints; shaping OK")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Verified upstream ZIP (avoids network)")
    parser.add_argument("--output", type=Path, default=ROOT / "src/lib/assets/fonts")
    parser.add_argument("--check", action="store_true", help="Rebuild in /tmp and compare all committed bytes")
    args = parser.parse_args()
    archive_data = source_archive(args.source)
    manifest_path = ROOT / "data/fonts/akribos-text/manifest.json"
    if args.check:
        with tempfile.TemporaryDirectory(prefix="akribos-text-") as temporary:
            destination = Path(temporary)
            manifest = build(archive_data, destination)
            expected = json.loads(manifest_path.read_text())
            assert manifest == expected, "Font manifest differs from reproducible build"
            for filename in manifest["files"]:
                assert (destination / filename).read_bytes() == (args.output / filename).read_bytes(), filename
        print("All six WOFF2 files reproduce byte-for-byte; metadata, coverage and shaping checks passed.")
    else:
        manifest = build(archive_data, args.output)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
