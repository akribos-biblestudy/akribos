# Importing resources and documents

Bible/reference-work imports and personal Markdown imports are deliberately separate trust and storage
boundaries. The resource pipeline below is administrative and can replace a public work. The document
pipeline at `/notes/import` is owner-scoped, creates only private working copies, and never calls the
resource ingesters.

## Obsidian and Markdown documents

The document importer accepts one or more safe `.md` files containing valid UTF-8, or exactly one ZIP
containing Markdown. Each Markdown body is limited to 1 MiB and YAML frontmatter to 64 KiB. A batch is
limited to 100 Markdown files and 16 MiB of both uploaded and relevant decompressed data. ZIP metadata is
preflighted before inflation; encryption, ZIP64 sizes, unsupported compression, symlinks and unsafe paths
are rejected, and entries are never written to the server filesystem. Loose Markdown and ZIP cannot be
mixed in one upload. Uploading produces a side-effect-free preview for every document. Confirmation sends
the originals back as a bounded package and the server reparses all of them; hidden parsed metadata is
never trusted. Every new working copy is `private` under the signed-in owner. The entire batch, its tags
and passages use one transaction: an invalid or conflicting child rolls all imported documents back.

Supported frontmatter fields are:

```yaml
---
title: Schöpfung und Ruhe
type: note # note or sermon; `kind` is also accepted
tags:
  - Studium/Schöpfung
passages:
  - reference: 1Mo 1,31-2,3
  - reference: Joh 3,16-18
    resource: SEEDDE # omit for a canonical anchor
sermon: # only used when type is sermon
  status: research # idea, research, outline, ready, delivered
  date: 2026-09-06
  series: Genesis
---
```

Use `note` for all non-sermon writing. Publishing is a later administrator-only action, not a separate
document type.

`references` is accepted as an alias for `passages`; flat `status`, `date`, `series` and
`sermon_*` fields are accepted for sermon metadata. Exported `created` and `updated` timestamps are
informational and are not restored. A passage resource must name a public, ready Bible visible to the
application. Unknown metadata and any attempted owner, role, id, visibility or publication authority
are ignored with a warning rather than trusted. Batch errors identify the failing loose filename or ZIP
entry path so one bad document can be found without guessing.

Tag names are never interpreted as Bible passages. A hierarchy containing a Bible book or chapter name
remains a tag hierarchy unless frontmatter contains an explicit `passages` entry.

An imported document may have at most 100 passage anchors and 50 selected tags. A tag path may be at
most eight levels deep; commas and backslashes are rejected inside segments because the interactive
editor uses those characters as separators/escapes. These bounds apply again on confirmation, not only
in the browser preview.

The safe round-trip subset is paragraphs, headings H1–H6, emphasis, strong and strike
text, lists, block quotes, inline and fenced code, horizontal rules, explicit line breaks and safe
HTTP(S), mail or relative links. Underline and highlighting use attribute-free `<u>` and `<mark>` tags.
Links whose entire label is a Bible reference become Akribos links, including the label's complete range.
Existing imports also receive this interpretation when displayed, without reimporting them.
Other raw HTML and unsupported tags/attributes are reduced to inert content;
scripts and other active elements disappear. Obsidian wikilinks become ordinary links or readable
labels. Images, embeds and attachment links are removed, and binary/NUL input, invalid/unsafe YAML,
path traversal and invalid UTF-8 fail the preview. The UI reports every lossy conversion it detects.

`GET /notes/[id]/export.md` is owner-only and returns deterministic UTF-8 Markdown with YAML
frontmatter for the portable fields above plus informational timestamps. It never exports account
email, owner/document ids or publication authority. `export.docx` creates an editable Word document and
`export.pdf` a readable A4 rendering with embedded Noto Sans fonts for Latin, Greek and Hebrew text;
these presentation formats may simplify Markdown formatting.
There is no attachment copying, transclusion/backlink reconstruction, merge/conflict resolution, or
automatic round-trip retention for formatting outside the supported subset.

## Public resources

Two ways in, one code path behind them: the admin UI at `/admin/import`, and

```sh
pnpm data:import <file-or-directory>
```

The format is detected from the file's contents, not its extension, because everything in this space is
called `.xml` or `.txt`. Detection is a suggestion: both the CLI (`--format`) and the wizard let you
override it.

A resource is identified by the identifier in its file, or by `--id`. Importing the same identifier
again **replaces** its content. Name, column title, ordering and licence text are not overwritten on
re-import, so edits made in the admin UI survive.

## Bible translations

| Format                  | Recognised by                   | Notes                                                                                                          |
| ----------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Zefania XML             | `<XMLBIBLE>`                    | What the bundled translations use. Strong's numbers as `<gr str="…">`, morphology as `rmac`.                   |
| CrossWire SWORD raw ZIP | `mods.d/*.conf` plus `modules/` | Bible drivers `RawText`/`zText` (including their v4 variants). The runtime uses CrossWire's `diatheke` reader. |
| OSIS                    | `<osis>`                        | Both container (`<verse>text</verse>`) and milestone (`<verse sID=…/>`) styles.                                |
| USFM                    | `\id`, `\c`, `\v` markers       | Word-level Strong's attributes are read; footnotes and cross references are dropped.                           |
| USX                     | `<usx>`                         | What eBible.org publishes.                                                                                     |
| USFX                    | `<usfx>`                        | Same content, different shape.                                                                                 |
| Verse per line          | a reference and text per row    | Tab, pipe, semicolon or comma separated; also `book`/`chapter`/`verse`/`text` columns.                         |

USFM carries Strong's numbers as word attributes, which the importer reads:

```
\v 1 Im Anfang \w schuf|strong="H1254"\w* \w Gott|strong="H430"\w* Himmel und Erde.
```

Verse ranges are preserved rather than expanded: a translation that prints 16-17 as one unit is stored as
one verse with `verse_end = 17`, and the reader spans it across both rows so the columns stay aligned.

## Reference works

| Kind                                      | Format               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strong's dictionary                       | Strong's XML         | `data/strongsgreek.xml`. Cross references inside definitions become links.                                                                                                                                                                                                                                                                                                                                                                    |
| Strong's dictionary (German)              | Strong's XML         | `data/stronggreek_de_kautz.xml`: Gerhard Kautz' German Greek lexicon, converted from his Word manuscript by `scripts/convert-kautz-lexicon.ts` (used with his permission — see the script's own doc comment). Imports as a separate resource; `lexicon_entries` has a composite key of `(resourceId, strong)`, so it coexists with the English dictionary rather than replacing it, and `resources.sortOrder` decides which one a page shows. |
| Hebrew Strong dictionary (English/German) | Hebrew lexicon XML   | `data/hebrewstrong.xml`, parsed by `hebrew-lexicon-xml`. The German review draft lives in separate `translation xml:lang="de"` blocks; the English original remains available. See [format, provenance and review status](hebrew-lexicon.md).                                                                                                                                                                                                 |
| Morphology                                | Robinson TSP         | `data/books/*.TSP`. An **overlay**: it adds lemmas to a Greek text that is already imported, so pass `--target GNTTR` or pick the target in the wizard.                                                                                                                                                                                                                                                                                       |
| Cross references                          | CSV/TSV              | Two reference columns and an optional score: `Gen 1:1<TAB>Joh 1:1<TAB>23`.                                                                                                                                                                                                                                                                                                                                                                    |
| Commentary                                | CSV/Markdown or ThML | Reference and body per row, or CCEL-style ThML. Bodies are reduced to eleven formatting tags with no attributes.                                                                                                                                                                                                                                                                                                                              |
| Commentary                                | Zefania XML          | `<dictionary type="x-commentary">` items with numeric `target`/`reflink mscope` references and one or more descriptions.                                                                                                                                                                                                                                                                                                                      |
| Commentary                                | CrossWire SWORD ZIP  | `RawCom`/`zCom`, `HREFCom` and `RawFiles` drivers (including v4 variants), read through CrossWire's `diatheke`.                                                                                                                                                                                                                                                                                                                               |

A directory is read as one resource, files in name order — which is how the 27 TSP files become a single
morphology overlay:

```sh
pnpm data:import --target GNTTR data/books
```

## Seeding a fresh database

```sh
pnpm db:migrate
pnpm data:import data/bibles/GER_ELB1905_STRONG.xml       # ~30 s
pnpm data:import data/bibles/GER_SCH1951_STRONG.xml
pnpm data:import data/bibles/GER_LUTH1912.xml
pnpm data:import data/bibles/GER_ILGRDE.xml
pnpm data:import data/bibles/GRC_GNTTR_TEXTUS_RECEPTUS_NT.xml
pnpm data:import data/strongsgreek.xml
pnpm data:import --target GNTTR data/books
```

About two minutes in total: 109,428 verses and 750,000 tagged words.

`pnpm db:seed` is something different — a small fixture for the end-to-end tests, not real data.

`data/stronggreek_de_kautz.xml` (see the table above) is deliberately left out of that sequence: Kautz
asked to see a layout preview before it goes live, so importing it into production is a separate,
manual step for whoever runs that seeding, not something to fold in automatically.

## Reading the warnings

Every import reports what it could not make sense of, and those warnings are worth reading: they are how
you find out that a downloaded file is subtly broken. From the bundled data:

- **Elberfelder 1905**: two words with a corrupt Strong's reference (`62407651` in Gen 37:2 is two
  numbers run together). Those words keep their text and lose their tag.
- **Textus Receptus**: eleven words with the same problem.
- **Interlinear**: 74 duplicated verses. The file contains two Galatians 2 blocks — the first holds
  verses 1-14, the second mislabels the tail of verse 14 as verse 1, pads 2-14 empty, then carries the
  real 15-21. The importer keeps the **first non-empty** text for a reference, which reconstructs the
  chapter correctly; the previous version kept only 14 verses of it.
- **Morphology overlay**: ~2,700 verses where the Textus Receptus and Tischendorf tokenise differently.
  Alignment falls back from word position to Strong's number rather than force-fitting, and 94% of words
  end up with a lemma.

## Adding a format

1. Write a parser in `src/lib/bible/parse/` as an async generator emitting `ParseEvent`s.
2. Register it in `src/lib/bible/parse/index.ts` and add its kind in `src/lib/server/import/index.ts`.
3. Teach `detect.ts` to recognise it.
4. Add a test in `formats.spec.ts` using a real excerpt of a real file, not an invented sample. Every bug
   found so far came from a real file behaving unlike the specification.
