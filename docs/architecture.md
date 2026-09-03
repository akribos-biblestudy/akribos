# Architecture

## Shape of the thing

A SvelteKit app talking to PostgreSQL, served by Node behind Coolify's proxy. Reading and search pages
are server-rendered; embedded lexicon studies and the admin import wizard fetch their supplementary
data on their own.

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
every word-study open, over every verse containing the word.

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

## Reader workspace

The reader uses a small, pure workspace domain model in `src/lib/reader/workspace.ts`. It supports the
same eight tile arrangements as Logos Web: one tile, two/three/four columns, two rows, a 2×2 grid, and
both three-tile arrangements with one full-height side. At most four tiles are visible, while each tile
owns an open-ended tab strip and one active resource. Changing arrangements redistributes or merges
tabs without closing them. Horizontal and vertical track fractions are stored separately for every
arrangement.

A reader without a stored workspace or legacy column selection starts in three columns with the first
Bible, first commentary and first lexicon in resource order, all in tab group A. Existing workspace and
legacy column state always wins over this onboarding default.

Each resource tab owns both an optional tab group (`linkSet`, `A`–`E`) and its own passage reference. Visible tabs
with the same letter follow a genuine user scroll, and the resulting reference is persisted to every
tab in that set, including inactive ones; `null` and other letters remain independent. The existing
per-column suppression of programmatic scroll events still applies after this filter, so a delayed
follower event cannot become the source. The most recently focused tile owns the canonical passage
path. If an inactive tab's group is already visible in another tile, activation explicitly takes that
peer's live reference (including a position newer than the debounced URL state); the target tab's old
reference can therefore never move the visible group. Without a visible peer, activation restores the
tab's own reference.

The complete reconstructable state of one browser tab is represented by `src/lib/reader/url-state.ts`
as readable, repeatable query parameters: `layout`, `tab`, `active`, `focus`, `lookup`, `source`,
`sourceRef`, `word` and `search`. Tab coordinates use `tile.tab`, for example
`tab=1.2:SEEDDE:A:Joh3,16`. Together they carry ordered tabs per tile, active/focused positions,
per-tab references, tab groups, lexicon context and the active in-tab search. Internal UUIDs and
personal divider ratios are excluded. Reloading, duplicating a browser tab and copying the address
therefore recreate the same view. A valid URL snapshot that differs from the signed-in or guest
workspace is treated as an ephemeral branch: loading and editing it do not overwrite the persisted
default. Mutations are persisted only while the incoming snapshot still semantically equals that
default; this also makes two duplicated tabs diverge safely after the first one changes. Reader form
actions and imported-content links retain the state parameters and return the freshly serialized
state.

Every active tab has a separate chapter stream and uses the endless-scroll API with an explicit
resource id. Loaded streams, visible references and scroll positions are cached by tab id across
activations. Changing one tile therefore reuses already loaded target content and leaves every unchanged
Bible/commentary tile and its REST-prefetch state untouched. Its compact toolbar combines direct
reference entry with resource-scoped search. Search
never leaves the reader: `/api/reader/search` returns Bible word hits, Strong occurrences for one Bible,
or terms from one commentary, and `tabSearches` displays them as a temporary layer in that tab while
keeping its chapter stream and scroll position mounted underneath. Word and Strong results include an
unfiltered book distribution and an optional in-tab book filter; Strong results also retain the active
Bible's occurrence and rendering statistics. Opening a hit updates only that tab's reference and returns
to its text. There is no separate book/chapter chooser: only input containing a number is considered a
possible reference, so a bare book name remains a text search. Tab labels use the resource's dedicated
`tabTitle`; `selectionTitle` is reserved for the resource chooser and work information. Rights and
usage notes live behind the adjacent info button instead of taking permanent vertical space below the
text.

Lexicons are first-class reader tabs and keep a separate `lookup` locator in the workspace. Their field
resolves an exact Strong id or a lemma/transliteration prefix inside that one resource, so any number of
lexicons can remain independently open. Clicking a Strong-tagged Bible word reuses the lexicon tab in
the source tab's A–E tab group, creating one in another linked tile (or the source tile as fallback) only
when that group has none. The lexicon tab stores that exact source translation, clicked verse and word:
grammar is merged in from a public original-language resource, while occurrences, book distribution and
rendering forms are always calculated for the source translation shown in the toolbar badge. When
several original-language resources cover a word, a row with morphology wins and `sortOrder` breaks
remaining ties. Lexicon
tabs are deliberately excluded from chapter streaming and scroll alignment; different lexicon
resources are never merged.

Signed-in workspaces are JSON in `users.reader_workspace`; guests use a compact cookie. The legacy
`reader_columns` field remains a five-resource projection for search and older clients and seeds the
workspace exactly once. Duplicate resources are valid both within one tile and across tiles, so Bible
cell indices are assigned by active occurrence rather than through a resource-id map.

### Why this stays Svelte

The workspace did not justify a React migration. Svelte 5 already provides component composition,
typed state and keyed rendering; `ReaderLayoutPicker`, `ReaderResourceTabs` and the pure workspace model
give the complex UI explicit boundaries without replacing SvelteKit routing, SSR, form actions, auth,
the existing reader interaction suite and every shared component. A React rewrite would duplicate that
infrastructure while providing no capability the current stack lacks.

## Caching

Public pages send `s-maxage` so a CDN can hold them; pages for a signed-in reader send `private,
no-store`, because they contain that person's verse lists. The list of resources is cached in-process
for 30 seconds and invalidated on admin writes.

## What is deliberately absent

- **No queue service, no Redis.** Sessions, throttling and jobs are PostgreSQL rows.
- **No second client-side router for the reader.** SvelteKit still owns real navigation; shallow URL
  updates only mirror the focused tab's scrolling position between navigations.
- **No verse-level HTML in the database.** Structure in, structure out.
