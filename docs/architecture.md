# Architecture

## Shape of the thing

A SvelteKit app talking to PostgreSQL, served by Node behind Coolify's proxy. Reading and search pages
are server-rendered; the study sidebar and the admin import wizard are the only parts that fetch on
their own.

```
src/lib/bible/      domain logic, no I/O: books, references, Strong's ids, morphology, parsers
src/lib/server/     database, repositories, importers, auth, mail
src/lib/components/ Svelte components
src/routes/         pages and endpoints
scripts/            CLI: migrate, seed, import, prepare the e2e database
drizzle/            generated migrations plus three hand-written ones
data/               source files for the bundled translations and dictionaries
```

`src/lib/bible/` never imports from `src/lib/server/`. That is what lets the parsers and the reference
grammar be unit-tested without a database, and it keeps the rule "domain logic does not know where
data comes from" enforceable by looking at the imports.

## Data model

The interesting decisions:

**The canonical book list is code, not data.** `src/lib/bible/books.ts` holds all 66 books; `book_id`
is a plain integer with a check constraint. One source of truth, and no join on a chapter read. Book
names and their aliases live in `book-names.ts` for the same reason — the reference parser needs them
on every URL.

**Verse text is stored twice, on purpose.** `verses.segments` is structured JSON — plain runs, words
carrying Strong's numbers, footnotes, emphasis — and `verses.text` is the flattened form. The reader
renders segments directly, so there is no HTML parsing at request time and no way for imported text to
inject markup. Search uses `text`.

**`verse_words` has one row per Strong-tagged word.** About 750,000 rows for the bundled translations.
It is what turns "every place this word occurs" and "how does this translation render it" into ordinary
SQL. A word carrying several numbers — German writes "sechshundert" as `str="8337-H3967"` — produces one
row per number, sharing a position.

**Derived data is materialised.** `strong_stats`, `strong_glosses` and `search_terms` are materialised
views refreshed after an import. The previous version recomputed the gloss frequencies in Python on
every sidebar open, over every verse containing the word.

## Search

`verses.search_vector` is a generated `tsvector` over a `german_unaccent` configuration: German
snowball stemming plus accent folding.

Two details are worth knowing before changing anything here:

- A generated column may only call immutable functions, and `unaccent()` is merely stable. Hence the
  named configuration: `to_tsvector('german_unaccent', text)` with the configuration spelled out _is_
  immutable. `to_tsvector('german', unaccent(text))` is rejected.
- `phraseto_tsquery` discards stopwords, so `"am Anfang"` reduces to `'anfang'`. Quoted searches
  therefore use the tsquery to narrow candidates through the index and confirm the literal sequence
  with a word-boundary regex over `text`.

The stemmer does not strip participle prefixes, so a search for `lieb` does not reach `geliebt`. This is
covered by a test that documents it rather than asserts around it. Installing a German hunspell
dictionary would fix that and add compound splitting (`Menschensohn` → `Mensch` + `Sohn`), at the cost of
a custom PostgreSQL image.

## Importing

Parsers are async generators emitting a flat event stream (`metadata`, `verse`, `warning`, …), so memory
stays flat whether the upload is 1 MB or 100 MB, and progress can be reported while reading. Ingesters
consume the stream in batches. See [importing.md](importing.md) for the formats and their quirks.

The admin UI and `pnpm data:import` share the same dispatcher (`src/lib/server/import/index.ts`), so the
two cannot drift apart.

Resources keep imported `name` and `abbrev` metadata, but may override four presentation contexts:
cover, reader tab, selection title and selection subtitle. Missing overrides fall back to the imported
metadata in the resource repository. The admin groups works by kind and controls their selection order
through `sortOrder`.

The resource admin uses a client-side searchable master list and renders one editor at a time. Its
selected resource is mirrored in the URL query so ordinary form submissions return to the same work;
the list itself has a viewport-bound scroll area and never determines the page height.

Private verse comments are protected from resource cascades by a restrictive foreign key. Deleting a
Bible therefore requires a different Bible as its destination; `deleteResource()` transfers comments
and deletes the source atomically. Where source and destination both have a comment for the same user
and verse, their HTML is combined with a source label instead of choosing one.

Imports run in the background because a full translation takes half a minute. The runner is in-process
and serial — imports happen a few times a year, and a queue service would be more moving parts than the
problem deserves. A job interrupted by a restart is marked failed at boot, not resumed.

## Caching

Public pages send `s-maxage` so a CDN can hold them; pages for a signed-in reader send `private,
no-store`, because they contain that person's verse lists. The list of resources is cached in-process
for 30 seconds and invalidated on admin writes.

## What is deliberately absent

- **No queue service, no Redis.** Sessions, throttling and jobs are PostgreSQL rows.
- **No client-side router state for the reader.** Chapter navigation is ordinary links; the browser and
  the server agree on the URL.
- **No verse-level HTML in the database.** Structure in, structure out.
