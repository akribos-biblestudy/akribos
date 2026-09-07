# Hebrew dictionary: German review draft

Issue #174 adds a German edition to all 8,674 entries of `data/hebrewstrong.xml`.
The English source, Hebrew/Aramaic headwords, transliteration, pronunciation and Strong links remain
intact. The German text is an **automatic draft, not a philologically reviewed dictionary**. It must
be reviewed before this issue is approved for production. In particular, short glosses, archaic
English, names and grammatical terminology can be mistranslated. The interface identifies this
status and offers the complete English original below the German article.

## XML and persistence

The Open Scriptures fields `source`, `meaning` and `usage` remain the English original. A sibling
`translation` element carries the corresponding German fields:

```xml
<translation xml:lang="de" method="machine">
  <source>Plural von <w src="H433">433</w>;</source>
  <meaning>Gott, Götter</meaning>
</translation>
```

`data/schemas/hebrew-lexicon.xsd` extends the public-domain Open Scriptures Strong schema with this
optional element. `xml-lang.xsd` keeps validation independent of the network. Validate with:

```sh
xmllint --noout --nonet --schema data/schemas/hebrew-lexicon.xsd data/hebrewstrong.xml
```

The parser escapes both editions with the same rules. A German article must cover every populated
original field; an incomplete article produces an import warning and falls back to English as a
whole. Unknown languages are ignored. An explicitly human-reviewed import may use `method="human"`;
every bundled draft, including the edited examples, currently remains `method="machine"`.

Migration 0035 adds nullable `lexicon_entries.german_translation`. Existing original HTML columns
and API fields retain their meaning; the API adds the separate translation object. Resource language
remains `hbo`, so Strong routing and tab reuse continue to distinguish Hebrew from Greek.

Startup and backup restoration enrich existing ready `hebrew-lexicon-xml` resources only where the
Strong ID, lemma and all three original HTML fields match the bundled source exactly. Existing
translations and differing editions are preserved. This backfill is idempotent and does not create
resources or make private ones public. Normal imports store both editions directly. A replacement
import replaces any previous translation together with its source. Reader GETs never write.

German is the default wherever a translation exists, in reader tabs and standalone Strong pages.
The native “Englisches Original” disclosure also works without JavaScript. Opening it is temporary,
like other article disclosures; it does not change the workspace. German explanations of the KJV
renderings are labelled as such and are not presented as quotations from a German Bible.

## Translation provenance and reproduction

The original is the [Open Scriptures Hebrew Lexicon](https://github.com/openscriptures/HebrewLexicon).
Its dictionary text is public domain; retain the project's CC BY 4.0 attribution for the electronic
edition. The German additions are contributed under this repository's license.

The draft was generated locally with the [Argos English–German 1.3 model](https://argos-net.com/v1/translate-en_de-1_3.argosmodel),
listed in the [official package index](https://github.com/argosopentech/argospm-index), using
CTranslate2 4.8.2 and SentencePiece 0.2.2. Model archive SHA-256:
`6cd847f0c06c9c66013e6b0932e07fd54a6d90894659c02bf6c5247b72fb25b1`.
Models and translation dependencies are optional local tools, absent from the application and image.
There are no runtime translation requests, API keys or external transfers of lexicon text.

`scripts/translate-hebrew-lexicon.py` translates complete descriptions while protecting Strong references, original-language words and proper names with checked placeholders. It refuses to write XML when a placeholder is lost or duplicated; explicit field corrections resolve these cases. Original emphasis remains intact in English; the German prose can be plain text. `data/hebrewstrong-de-glossary.json` overrides recurring terminology;
`data/hebrewstrong-de-corrections.json` contains source-compared corrections, including the reported article/inflection errors and every field whose automatic translation lost a protected reference. These entries are still marked as machine drafts pending human review.

Using an isolated Python environment with the pinned packages and the unpacked model directory:

```sh
python scripts/translate-hebrew-lexicon.py /path/to/english-original.xml /tmp/hebrew-bilingual.xml \
  --cache /tmp/hebrew-translation-cache.json --model /path/to/translate-en_de-1_3
```

The tool requires separate input and output paths and an English-only source. Review the generated
file before replacing the bundled XML; corrections to the XML must also be recorded in the correction
file if they should survive regeneration. The parser test checks all 8,674 translations and a fixed
SHA-256 fingerprint of every parsed original field to detect accidental changes to the source.
