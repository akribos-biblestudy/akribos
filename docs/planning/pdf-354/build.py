#!/usr/bin/env python3
"""Compile the #354 PDF specimens with the existing print fonts and inline renderer."""

import math
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
from xml.etree import ElementTree


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
BASELINE = "f1c068c"
TEMPLATE = "src/lib/server/documents/pdf-template.typ"
SPECIMENS = (
    ("00-heutiger-export", "Heutiger Export"),
    ("01-buchsatz", "A · Buchsatz"),
    ("02-studienausgabe", "B · Studienausgabe"),
    ("03-lesemanuskript", "C · Lesemanuskript"),
)


def compile_pdf(typst, source, output, *options):
    result = subprocess.run(
        [
            typst, "compile", "--creation-timestamp", "0", "--ignore-system-fonts",
            "--font-path", str(REPO / "data/fonts/pdf"),
            *options, str(source), str(output),
        ],
        capture_output=True, text=True,
    )
    if result.returncode or result.stderr:
        raise RuntimeError(result.stderr)


def list_crop(pdf, width):
    # Locate the numbered list in this specimen even when it moves to another page.
    layout = ElementTree.fromstring(subprocess.check_output(["pdftotext", "-bbox-layout", pdf, "-"]))
    for page_number, page in enumerate(layout.findall(".//{*}page"), start=1):
        start = None
        for line in page.findall(".//{*}line"):
            words = " ".join(word.text or "" for word in line.findall("./{*}word"))
            if "Jakobus 1,19–27 lesen," in words:
                start = float(line.attrib["yMin"])
            if start is not None and words.endswith("finden lässt."):
                scale = width / float(page.attrib["width"])
                top = math.floor(start * scale)
                bottom = math.ceil(float(line.attrib["yMax"]) * scale)
                return page_number, top, bottom - top
    raise RuntimeError(f"Die vollständige nummerierte Liste fehlt in {pdf}")


def render_preview(work):
    preview_width = 416
    command = ["magick", "-size", "1760x848", "xc:#e9ebe7"]
    font = REPO / "data/fonts/pdf/akribos-text-semibold.ttf"
    for index, (name, label) in enumerate(SPECIMENS):
        pdf = HERE / f"{name}.pdf"
        image = work / name
        list_image = work / f"{name}-list"
        poppler = [
            "pdftoppm", "-singlefile", "-scale-to-x", str(preview_width), "-scale-to-y", "-1", "-png",
        ]
        subprocess.run([*poppler, "-f", "1", "-l", "1", pdf, image], check=True)
        page, top, height = list_crop(pdf, preview_width)
        subprocess.run(
            [
                *poppler, "-f", str(page), "-l", str(page), "-y", str(top),
                "-W", str(preview_width), "-H", str(height), pdf, list_image,
            ],
            check=True,
        )
        x = 24 + index * 432
        command.extend([
            str(image.with_suffix(".png")), "-geometry", f"+{x}+60", "-composite",
            "-font", str(font), "-pointsize", "30", "-fill", "#27312b",
            "-annotate", f"+{x}+43", label,
            "-fill", "white", "-draw", f"rectangle {x},700 {x + preview_width - 1},826",
            str(list_image.with_suffix(".png")), "-geometry", f"+{x}+708", "-composite",
        ])
    command.extend(["-pointsize", "22", "-fill", "#27312b", "-annotate", "+24+687", "Nummerierte Liste"])
    subprocess.run([*command, "-strip", f"PNG8:{HERE / 'vergleich.png'}"], check=True)


def main():
    typst = (
        os.environ.get("PDF_TYPST_BIN") or shutil.which("typst") or REPO / "var/tools/typst/bin/typst"
    )
    version = subprocess.check_output([typst, "--version"], text=True).strip()
    if version != "typst 0.15.1 (9dfd3a08)":
        raise SystemExit(f"Benötigt wird Typst 0.15.1 (9dfd3a08), gefunden: {version}")

    baseline = subprocess.check_output(
        ["git", "show", f"{BASELINE}:{TEMPLATE}"], cwd=REPO, text=True,
    )
    inline_renderer = baseline[
        baseline.index("// Only overwide tokens"):baseline.index("#let render-blocks(items)")
    ]
    layout = (HERE / "entwuerfe.typ").read_text(encoding="utf-8")
    with TemporaryDirectory(prefix="akribos-pdf-354-") as temporary:
        work = Path(temporary)
        shutil.copyfile(HERE / "document.json", work / "document.json")
        template = work / "studienblatt.typ"
        template.write_text(baseline, encoding="utf-8")
        compile_pdf(typst, template, HERE / "00-heutiger-export.pdf")

        template = work / "entwuerfe.typ"
        template.write_text(layout.replace("// INLINE_RENDERER", inline_renderer), encoding="utf-8")
        for name, _ in SPECIMENS[1:]:
            design = name.split("-", maxsplit=1)[1]
            compile_pdf(typst, template, HERE / f"{name}.pdf", "--input", f"design={design}")
        render_preview(work)


if __name__ == "__main__":
    main()
