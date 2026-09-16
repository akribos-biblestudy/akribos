#!/usr/bin/env python3
"""Build an offline, sorted lemma lookup file using only Python's standard library."""

import argparse
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unicodedata


def field(value: object, location: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{location}: expected a non-empty string")
    if any(unicodedata.category(char) == "Cc" for char in value):
        raise ValueError(f"{location}: control characters are not allowed")
    normalized = unicodedata.normalize("NFC", value)
    normalized.encode("utf-8", errors="strict")
    return normalized


def iwnlp_entries(source: Path):
    with source.open(encoding="utf-8-sig") as handle:
        rows = json.load(handle)
    if not isinstance(rows, list) or not rows:
        raise ValueError("IWNLP input must be a non-empty JSON array")
    for index, row in enumerate(rows, 1):
        location = f"IWNLP row {index}"
        if not isinstance(row, dict):
            raise ValueError(f"{location}: expected an object")
        # The outer Form is a lowercase lookup key. The inner Form retains the
        # actual spelling, which distinguishes nouns from adjectives and verbs.
        field(row.get("Form"), f"{location}.Form")
        candidates = row.get("Lemmas")
        if not isinstance(candidates, list) or not candidates:
            raise ValueError(f"{location}.Lemmas: expected a non-empty array")
        for candidate_index, candidate in enumerate(candidates, 1):
            entry = f"{location}.Lemmas[{candidate_index}]"
            if not isinstance(candidate, dict):
                raise ValueError(f"{entry}: expected an object")
            yield (
                field(candidate.get("Form"), f"{entry}.Form"),
                field(candidate.get("Lemma"), f"{entry}.Lemma"),
                field(candidate.get("POS"), f"{entry}.POS"),
            )


def tsv_entries(source: Path):
    with source.open(encoding="utf-8-sig", newline=None) as handle:
        for line_number, line in enumerate(handle, 1):
            fields = line.removesuffix("\n").split("\t")
            if len(fields) != 3:
                raise ValueError(f"TSV line {line_number}: expected Form<TAB>Lemma<TAB>POS")
            yield tuple(
                field(value, f"TSV line {line_number}, {name}")
                for name, value in zip(("Form", "Lemma", "POS"), fields)
            )


def sha256(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def build(source: Path, destination: Path, input_format: str, expected_sha: str | None):
    if source.resolve() == destination.resolve():
        raise ValueError("input and output must be different files")
    source_sha = sha256(source)
    if expected_sha is not None and source_sha != expected_sha.lower():
        raise ValueError(f"input SHA-256 mismatch: expected {expected_sha}, got {source_sha}")

    forms: dict[str, set[tuple[str, str]]] = defaultdict(set)
    entries = iwnlp_entries(source) if input_format == "iwnlp-json" else tsv_entries(source)
    source_entries = 0
    for form, lemma, pos in entries:
        forms[form].add((lemma, pos))
        source_entries += 1
    if not forms:
        raise ValueError("input contains no lemma entries")

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    unpacked_sha = hashlib.sha256()
    unpacked_bytes = 0
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle:
            temporary = Path(handle.name)
            # Empty filename and zero mtime remove path/time-dependent gzip fields.
            with gzip.GzipFile(
                fileobj=handle, filename="", mode="wb", compresslevel=9, mtime=0
            ) as output:
                for form in sorted(forms, key=lambda value: value.encode("utf-8")):
                    candidates = sorted(
                        forms[form], key=lambda pair: (pair[0].encode("utf-8"), pair[1].encode("utf-8"))
                    )
                    value = json.dumps(candidates, ensure_ascii=False, separators=(",", ":"))
                    line = f"{form}\t{value}\n".encode("utf-8")
                    output.write(line)
                    unpacked_sha.update(line)
                    unpacked_bytes += len(line)
        temporary.replace(destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)

    return {
        "format": "lemma-candidates-tsv-v1",
        "source_sha256": source_sha,
        "source_entries": source_entries,
        "forms": len(forms),
        "candidates": sum(len(values) for values in forms.values()),
        "uncompressed_bytes": unpacked_bytes,
        "uncompressed_sha256": unpacked_sha.hexdigest(),
        "gzip_bytes": destination.stat().st_size,
        "gzip_sha256": sha256(destination),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="local UTF-8 input file")
    parser.add_argument("--output", type=Path, required=True, help="destination .tsv.gz file")
    parser.add_argument("--format", choices=("iwnlp-json", "tsv"), required=True)
    parser.add_argument("--sha256", help="optional expected SHA-256 of the uncompressed input file")
    args = parser.parse_args()
    try:
        result = build(args.input, args.output, args.format, args.sha256)
    except (OSError, UnicodeError, ValueError) as error:
        parser.exit(2, f"{parser.prog}: {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
