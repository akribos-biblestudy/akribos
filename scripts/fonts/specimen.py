#!/usr/bin/env python3
# SPDX-License-Identifier: OFL-1.1
"""Create an offline visual proof; output is a review artifact, not a public route."""

import argparse
import base64
import io
from pathlib import Path
import sys
import zipfile

sys.dont_write_bytecode = True
from build import ROOT, STYLES, source_archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path, default=Path("/tmp/akribos-font-proof.html"))
    args = parser.parse_args()
    font_rules = []
    with zipfile.ZipFile(io.BytesIO(source_archive(args.source))) as archive:
        for style, (weight, italic, slug) in STYLES.items():
            variants = (
                ("Original", archive.read(f"GentiumBook-7.000/GentiumBook-{style}.ttf"), "ttf", "truetype"),
                ("Akribos Text", (ROOT / f"src/lib/assets/fonts/akribos-text-{slug}.woff2").read_bytes(), "woff2", "woff2"),
            )
            for family, data, extension, format_name in variants:
                encoded = base64.b64encode(data).decode("ascii")
                font_rules.append(
                    f'@font-face{{font-family:"{family}";font-weight:{weight};'
                    f'font-style:{"italic" if italic else "normal"};'
                    f'src:url(data:font/{extension};base64,{encoded}) format("{format_name}")}}'
                )
    passage = (
        "Im Anfang war das Wort, und das Wort war bei Gott, und das Wort war Gott. "
        "Dieses war im Anfang bei Gott. Alles ward durch dasselbe, und ohne dasselbe "
        "ward auch nicht eines, das geworden ist. In ihm war Leben, und das Leben "
        "war das Licht der Menschen."
    )
    greek = "Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν, καὶ θεὸς ἦν ὁ λόγος."
    style_rows = "".join(
        f'<div class="weight"><label>{weight} · {"Kursiv" if italic else "Aufrecht"}</label>'
        f'<p style="font-weight:{weight};font-style:{"italic" if italic else "normal"}">'
        'Alles hat seine Zeit. ÄÖÜ äöü ß ẞ · Ἐν ἀρχῇ ἦν ὁ λόγος.</p></div>'
        for weight, italic, _ in STYLES.values()
    )
    html = """<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Akribos Text – Schriftprobe 1.000</title><style>FONT_RULES
*{box-sizing:border-box}body{margin:0;background:#f4f2ed;color:#282d27;font-family:system-ui,sans-serif}
main{max-width:1440px;margin:auto;padding:48px}h1{font-size:32px;letter-spacing:-.03em;margin:0 0 12px}
h2{font-size:15px;margin:0 0 18px}label,.caption{font:12px/1.5 system-ui,sans-serif;color:#65705f}
.intro{max-width:850px;font:15px/1.6 system-ui,sans-serif;margin:0 0 32px}.row{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
.card{padding:28px;background:#fffef9;border:1px solid #d9dfd2;border-radius:12px;overflow:hidden}
.text{font-family:"Akribos Text",serif;font-size:18px;line-height:1.7}.text p{margin:0 0 16px}
.original{font-family:Original,serif}.dark{background:#17231e;color:#e3e7df;border-color:#17231e}.dark label,.dark .caption{color:#b1bbaa}
.glyphs{font-size:68px;line-height:1.5;letter-spacing:.04em;margin:0;white-space:nowrap}.detail{font-size:100px;line-height:1.4}
.study{font-size:17px}.weight{border-top:1px solid #e0e4da;padding:12px 0}.weight p{font:22px/1.7 "Akribos Text",serif;margin:6px 0}
.translit{font-size:22px}.note{font:12px/1.6 system-ui,sans-serif}.wide{grid-column:1/-1}
@media(max-width:700px){main{padding:20px}.row{grid-template-columns:1fr}.glyphs{font-size:42px}.detail{font-size:66px}}
</style><main>
<h1>Akribos Text <span style="font-weight:400;color:#65705f">1.000</span></h1>
<p class="intro">Humanistische Leseschrift für Bibelstudium. Eine offen dokumentierte Weiterentwicklung von Gentium Book 7.000 unter OFL-1.1. Schriftprobe zur visuellen Prüfung; keine Behauptung einer wissenschaftlich nachgewiesenen Überlegenheit.</p>
<div class="row">
<section class="card text original"><h2>Ausgangsschrift · Gentium Book 7.000</h2><p>PASSAGE</p><p>GREEK</p><div class="caption">18px · Zeilenhöhe 1,7 · unveränderte Ausgangsdatei</div></section>
<section class="card text"><h2>Akribos Text · Regular</h2><p>PASSAGE</p><p>GREEK</p><div class="caption">18px · Zeilenhöhe 1,7 · gleiche Größe, keine globale Skalierung</div></section>
</div><div class="row">
<section class="card text original"><h2>Konturen vorher</h2><p class="detail">e c l ľ ł</p><p class="glyphs">é è ê ë ć č</p><p class="glyphs"><i>e c é è ć</i></p></section>
<section class="card text"><h2>Gezielte Akribos-Details</h2><p class="detail">e c l ľ ł</p><p class="glyphs">é è ê ë ć č</p><p class="glyphs"><i>e c é è ć</i></p><div class="caption">Offenere e/c-Ausgänge; asymmetrischer l-Fuß in aufrechten Schnitten; Akzentformen folgen.</div></section>
</div><div class="row">
<section class="card text"><h2>Bibel · 18px</h2><p>PASSAGE</p><h2>Kommentar / Lexikon · 17px</h2><p class="study">Das Wort „Leben“ verbindet die Aussage über den Anfang mit dem Bild des Lichts. <em>λόγος</em> bezeichnet hier das Wort. <strong>Johannes 1,1–4</strong> bildet den unmittelbaren Zusammenhang.</p><p class="translit">šālôm · ḥesed · ʾĕlōhîm · ʿālam · r̥ · ḗ · ā́</p></section>
<section class="card dark text"><h2>Dunkles Lesethema · gleiche Schnitte</h2><p>PASSAGE</p><p>GREEK</p><p class="study"><em>Auch kursive Erläuterungen bleiben echte gezeichnete Kursiven.</em> <strong>Ein klarer Schwerpunkt</strong> führt durch den Absatz.</p><p class="translit">ᾠδή ᾗ ᾧ Ἄ Ὦ ΐ ῗ ῧ ῥ ἀ ἁ ἄ ἅ ἆ ἇ ῳ ᾆ</p></section>
</div><section class="card text"><h2>Sechs echte Schnitte · keine künstliche Fettung oder Schrägstellung</h2>STYLE_ROWS
<p style="font-size:28px">Il1 · rn m · cl d · 0123456789 · 3,16–18 · „Wahrheit“ · ›Wort‹ · … †</p>
<p class="note">Originalcopyright: SIL Global. Akribos-Modifikationen: Akribos contributors. Die griechischen Grundkonturen und Anker bleiben erhalten; Hebräisch nutzt in der Anwendung separat Noto Sans Hebrew. Für die Freigabe zusätzlich Anwendung, Mobilansicht, Zoom und echte Urtextdaten im Browser prüfen.</p></section>
</main></html>"""
    html = html.replace("FONT_RULES", "\n".join(font_rules)).replace("PASSAGE", passage)
    html = html.replace("GREEK", greek).replace("STYLE_ROWS", style_rows)
    args.output.write_text(html)
    print(args.output)


if __name__ == "__main__":
    main()
