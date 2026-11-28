#!/usr/bin/env python3
"""Compile the #354 PDF specimens with the existing print fonts and inline renderer."""

import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory


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


def render_preview(work):
    command = ["magick", "-size", "1760x674", "xc:#e9ebe7"]
    font = REPO / "data/fonts/pdf/akribos-text-semibold.ttf"
    for index, (name, label) in enumerate(SPECIMENS):
        image = work / name
        subprocess.run(
            [
                "pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-scale-to-x", "416",
                "-scale-to-y", "-1", "-png", str(HERE / f"{name}.pdf"), str(image),
            ],
            check=True,
        )
        x = 24 + index * 432
        command.extend([
            str(image.with_suffix(".png")), "-geometry", f"+{x}+60", "-composite",
            "-font", str(font), "-pointsize", "30", "-fill", "#27312b",
            "-annotate", f"+{x}+43", label,
        ])
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
