#!/usr/bin/env python3
"""Render the account settings examples from the production PDF template."""

import json
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory


REPO = Path(__file__).resolve().parents[1]
EXAMPLES = REPO / "static/pdf-layout-examples"
TEMPLATES = ("studienausgabe", "buchsatz", "lesemanuskript")


def main():
    typst = os.environ.get("PDF_TYPST_BIN", "typst")
    version = subprocess.check_output([typst, "--version"], text=True).strip()
    if not version.startswith("typst 0.15.1 ("):
        raise SystemExit(f"Expected Typst 0.15.1, found {version}")

    fixture = REPO / "docs/planning/pdf-354/document.json"
    document = json.loads(fixture.read_text(encoding="utf-8"))
    document["firstPassage"] = "Jakobus 1,22–25"
    EXAMPLES.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="akribos-pdf-layout-examples-") as temporary:
        work = Path(temporary)
        source = work / "pdf-template.typ"
        shutil.copyfile(REPO / "src/lib/server/documents/pdf-template.typ", source)
        for template in TEMPLATES:
            document["template"] = template
            (work / "document.json").write_text(json.dumps(document), encoding="utf-8")
            pdf = EXAMPLES / f"{template}.pdf"
            subprocess.run([
                typst, "compile", "--creation-timestamp", "0", "--ignore-system-fonts",
                "--font-path", str(REPO / "data/fonts/pdf"), str(source), str(pdf),
            ], check=True)
            image = work / "first-page"
            subprocess.run([
                "pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-scale-to-x", "600",
                "-scale-to-y", "-1", "-png", str(pdf), str(image),
            ], check=True)
            subprocess.run([
                "magick", str(image.with_suffix(".png")), "-strip", "-quality", "88",
                str(EXAMPLES / f"{template}.webp"),
            ], check=True)


if __name__ == "__main__":
    main()
