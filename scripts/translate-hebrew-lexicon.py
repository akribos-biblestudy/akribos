"""Generate a German review draft using the local Argos en/de 1.3 model.

Optional tools: ctranslate2==4.8.2 and sentencepiece==0.2.2. No application dependency.
See docs/hebrew-lexicon.md. Original XML stays intact; translations use separate fields.
"""
import argparse
import collections
import copy
import html
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path


def plain_field(field, proper_name=False):
    protected = {}
    value = copy.deepcopy(field)
    for node in value.iter():
        if node.tag == "w" or (proper_name and node.tag == "def"):
            token = f"ZXQ{len(protected)}"
            original = copy.deepcopy(node)
            original.tail = None
            protected[token] = ET.tostring(original, encoding="unicode")
            node.text = token
    text = "".join(value.itertext()).strip()
    # Expand dated dictionary terminology for the general-purpose translation model.
    text = text.replace("a primitive root", "an original word root")
    text = text.replace("a primitive word", "an original word")
    text = text.replace("properly,", "in its basic sense,")
    text = text.replace("by implication", "by extension")
    return text, protected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--model", type=Path)
    args = parser.parse_args()
    if args.source.resolve() == args.output.resolve():
        parser.error("Use separate input and output paths.")
    with args.source.open(newline="") as stream:
        source = stream.read()
    corrections = json.loads(Path("data/hebrewstrong-de-corrections.json").read_text())
    glossary = json.loads(Path("data/hebrewstrong-de-glossary.json").read_text())
    cache = json.loads(args.cache.read_text()) if args.cache.exists() else {}
    blocks = re.findall(r"<entry\b[^>]*>.*?</entry>", source, re.S)
    if any("<translation" in block for block in blocks):
        parser.error("The source must be the original English-only XML.")
    prepared = {}
    for block in blocks:
        entry = ET.fromstring(block)
        headword = entry.find("w")
        proper_name = headword is not None and "pr" in headword.get("pos", "")
        prepared[entry.get("id")] = {
            tag: plain_field(entry.find(tag), proper_name)
            for tag in ("source", "meaning", "usage") if entry.find(tag) is not None
        }
    texts = {text for fields in prepared.values() for text, _ in fields.values()}
    missing = sorted(texts - cache.keys() - glossary.keys())
    if missing:
        if not args.model:
            parser.error(f"{len(missing)} uncached fields; pass --model.")
        import ctranslate2
        import sentencepiece
        tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(args.model / "sentencepiece.model"))
        translator = ctranslate2.Translator(str(args.model / "model"), device="cpu", compute_type="int8", inter_threads=2, intra_threads=4)
        for start in range(0, len(missing), 128):
            batch = missing[start:start + 128]
            results = translator.translate_batch([tokenizer.encode(text, out_type=str) for text in batch], beam_size=4, max_batch_size=32, max_decoding_length=512, max_input_length=0)
            cache.update({text: tokenizer.decode(result.hypotheses[0]) for text, result in zip(batch, results)})
            args.cache.write_text(json.dumps(cache, ensure_ascii=False, indent=2))
            print(f"Translated {min(start + 128, len(missing))}/{len(missing)}", flush=True)
    cache.update(glossary)
    rejected = {}

    def translate_entry(match):
        original = match[0]
        entry = ET.fromstring(original)
        fields = []
        for tag, (text, protected) in prepared[entry.get("id")].items():
            if tag in corrections.get(entry.get("id"), {}):
                value = corrections[entry.get("id")][tag]
            else:
                translated = cache[text]
                # Reject missing, duplicated or invented placeholders instead of losing Strong links.
                if collections.Counter(re.findall(r"ZXQ\d+", translated)) != collections.Counter(protected.keys()):
                    rejected[f"{entry.get('id')}.{tag}"] = {"source": text, "translation": translated}
                    continue
                value = html.escape(translated)
                value = re.sub(r"ZXQ\d+", lambda token: protected[token[0]], value)
            fields.append(f"\t\t\t<{tag}>{value}</{tag}>")
        newline = "\r\n" if "\r\n" in original else "\n"
        addition = '<translation xml:lang="de" method="machine">' + newline + newline.join(fields) + newline + "\t\t</translation>"
        return original[:-len("</entry>")] + "\t" + addition + newline + "\t</entry>"

    result = re.sub(r"<entry\b[^>]*>.*?</entry>", translate_entry, source, flags=re.S)
    if rejected:
        report = args.output.with_suffix(".rejected.json")
        report.write_text(json.dumps(rejected, ensure_ascii=False, indent=2))
        parser.error(f"{len(rejected)} fields need correction; see {report}. No output XML written.")
    result = result.replace(" StrongSchema.xsd\" ", ' schemas/hebrew-lexicon.xsd"')
    with args.output.open("w", newline="") as stream:
        stream.write(result)
    print(f"Wrote {len(blocks)} bilingual entries. Editorial review is still required.")


if __name__ == "__main__":
    main()
