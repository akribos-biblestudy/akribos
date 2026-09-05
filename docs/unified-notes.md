# Unified notes, Bible blogging and sermon preparation

This document records the product and technical contract for Akribos' unified writing workspace. It
is intentionally explicit because the feature spans private user data, Bible-resource lifecycle,
public content and a compatibility migration.

## Product model

A **document** is an owner-private working copy. The product has two writing areas:

- `note` for study notes, which an administrator may publish;
- `sermon` for a preparation document with the workflow `idea -> research -> outline -> ready ->
delivered`.

There is no separate publication working-copy type: publishing is a state transition for a `note`, not a
third writing area. This keeps import, filtering, APIs and the editor on the same two document kinds.

Every document uses the same Markdown/rich-text body, tags and Bible passages. The library at `/notes`
searches and organises notes; `/sermons` is a focused workflow view over sermon documents in the same
storage model.

Documents are private to their owner. Administrator status does not grant access to another user's
working copy. Publication is both owner-scoped and administrator-only. This deliberately chooses the
least-privilege interpretation of the feature: an administrator may publish their own note, but
cannot browse or publish another account's private drafts.

`body_markdown` is the portable source. The application derives allow-listed `body_html` for rendering
and markup-free `plain_text` for library search, and updates all three together. Title/body autosave
uses the internal, session-only `PATCH /api/documents/[id]`; the caller sends the current positive
`revision`, every working-copy mutation increments it, and stale writes receive `409 conflict`. This is
optimistic concurrency protection, not a retained revision history.

Tags are per-owner hierarchies. A slash separates path levels (`Study/Grace`); the database prevents a
parent/child relationship from crossing owners. Documents link explicitly to selected leaf tags, while
filtering by a parent includes its descendants.

The library gives the tag tree most of the available viewport height, displays the descendant-inclusive
document count beside every tag and lets every parent branch collapse independently. The global account
menu exposes one “Dokumente” entry. Within it, the only area navigation is “Notizen” and “Predigten”;
import and public notes remain contextual note actions, while templates are contextual to sermons.

## Passage anchors

Document passages are inclusive ordered ranges and may cross chapter or book boundaries. They are
separate from the reader's `VerseRef`, whose same-chapter range semantics remain unchanged.

An anchor with no resource is canonical and appears beside every Bible translation. An anchor with a
Bible resource id describes wording that belongs to that translation only. Reader lookup and library
search use interval overlap, not exact endpoint equality:

```text
stored.start <= query.end AND stored.end >= query.start
```

The sortable keys come from `verseKey()`. Human-readable endpoint columns remain alongside them so
the database is inspectable and exported Markdown does not expose implementation keys.

Deleting a Bible still requires a replacement Bible. In the same transaction that transfers legacy
verse comments, every translation-specific document passage is moved to that public, ready replacement.
Identical target anchors are deduplicated and each affected working-copy revision is incremented once.
Canonical passages remain resource-independent.

## Working copy and publication snapshot

Public rendering never reads a document's live title, body, tags or passages. Publishing locks the
working copy and atomically changes its visibility while creating or replacing one complete snapshot
containing all public fields and a non-email author label. Editing or
autosaving the working copy cannot change the public page. A later explicit publish replaces the
snapshot; unpublish removes it.

Snapshots are either `public` or `unlisted`. Public snapshots appear in `/notes/published`, its Atom
feed and the sitemap. Unlisted snapshots are omitted from these discovery surfaces but are anonymously reachable
through their direct slug. An unlisted slug is therefore not a password or authorisation boundary and
may be forwarded by anyone who knows it. Private drafts have no snapshot and no public route. A normal
user cannot invoke publication even by constructing a request; the repository checks both role and
ownership in addition to the UI controls, and publication fails without the owner's non-empty display
name rather than exposing an email address.

Authenticated HTML and every personal JSON/download response use `private, no-store`. Anonymous
published-note HTML also remains `private, no-store`, because it inherits cookie-based guest preferences from
the global layout. The cookie-free Atom feed and sitemap are public but require revalidation
(`max-age=0, must-revalidate`) before reuse so a publication change cannot leave stale discovery data.

## Markdown and Obsidian interchange

Markdown is the portable representation and sanitised HTML is the rendering/editor representation.
The supported round-trip subset includes paragraphs, headings H1–H6, emphasis, strong text, strike-through,
lists, block quotes, inline/fenced code, horizontal rules and safe links. Underline and highlighting
round-trip as attribute-free `<u>` and `<mark>` tags; other raw HTML remains unsupported.
The editor toolbar can add, edit and remove links. All editor links open with Ctrl-click (Cmd-click on
Mac); an ordinary click positions the caret. Links are underlined and expose their destination on hover.

Import accepts one or more UTF-8 `.md` files, or exactly one ZIP containing Markdown files, and always
presents one shared side-effect-free preview before creation. Each document has at most 1 MiB of
Markdown and 64 KiB of YAML frontmatter. A batch has at most 100 Markdown files; the upload and relevant
decompressed Markdown are each bounded to 16 MiB. ZIP metadata is checked before inflation: encrypted
entries, unsupported compression, ZIP64 sizes, absolute/traversing/backslash paths, symbolic links,
invalid UTF-8 names and oversized entry sets are rejected. Nothing is extracted to the filesystem, and
mixing a ZIP with loose files is rejected. The importer uses YAML's core schema with aliases disabled, accepts only the documented
metadata, and never trusts incoming owner ids, document ids, roles, visibility or publication fields.
Imported documents are always private. Obsidian wikilinks become ordinary readable links/text. Embeds,
attachments, images, binary/NUL input, path-traversal filenames and unsafe raw HTML are rejected or
removed with visible warnings. Attachment copying and automatic conflict merging remain unsupported.
Confirmation reparses every original and atomically creates the entire batch, its tags and at most 100
passage anchors per document; one failure rolls the whole batch back. At most 50 tags are linked, tag
paths have at most eight levels, and comma/backslash are invalid in segments. Tags resembling Bible
books or chapters deliberately remain tags and do not implicitly create passage anchors.
Preview reports each invalid Markdown source with its filename (or ZIP entry path). Exceeding the
loose-file count reports the actual count and limit, rather than suggesting that one file is corrupt.

Exports are owner-only and available as deterministic UTF-8 Markdown, editable Word `.docx` and A4 PDF.
Markdown carries YAML frontmatter for title, kind, tags, passages, sermon metadata, delivery history and
timestamps. Word/PDF contain readable metadata and body structure but may simplify Markdown-only layout.
No export contains an email address, owner/internal id or publication authority; download responses are
`private, no-store` and use portable filenames.

The accepted/exported frontmatter uses `title`, `type` (`kind` is accepted on import), `tags`,
`passages` (`references` is accepted on import), and nested `sermon` metadata. Each passage has a
human-readable `reference` and optional `resource`; omitting it creates a canonical anchor. Imported
timestamps are informational and do not replace database audit timestamps. See
[importing.md](importing.md#obsidian-and-markdown-documents) for the complete safe subset and example.

## Inline Bible references

The library passage filter and the Reader's “Nur Dokumente zur aktuellen Stelle” filter match either
explicit anchors or Bible references in the visible document body. Body references count canonically
across translations, including old imported links, formatted labels and chapter/verse ranges. Code
and URL destinations do not count. Matching happens only within owner-scoped query results and does
not write anchors or require a backfill; deleting a body reference removes its derived match immediately.
The Reader library includes both notes and sermons. Explicit translation-specific anchors and the
Reader's per-verse document indicators retain their existing behavior.

References typed directly into prose, such as `Mt 3,12`, `Johannes3:16`, `1. Mose 1,1-3` or
`Hohes Lied 2,1`, become internal Reader links at presentation time. Code is left untouched. Authored
links whose complete label is a Bible reference are rewritten to the corresponding Reader destination,
using the entire label's range rather than a potentially truncated old URL. Imports persist the rewritten
links. Existing documents receive the same behavior on display and editor load, without a database
migration or a writing GET; the next visual save persists their rewritten links in place.
The rich editor uses non-persisted ProseMirror decorations, so automatically linked plain text never alters
the author's Markdown or its export. Published notes use the same matcher over the already safe
snapshot HTML.

Hovering or focusing a verse reference shows its actual text, including a bounded cross-chapter range.
Inside the visual editor the popup includes “Bibeltext einfügen”; `/bibel Mt 3,12` followed by Enter is
the keyboard-first equivalent. Both insert an ordinary blockquote plus a bold reference/translation
line, so the content survives the Markdown round trip without a proprietary editor node.
The standalone editor and public notes use the first configured public, ready Bible; the Reader
sidecar intentionally uses the first Bible currently visible beside it, so the preview matches the
reading context. The popup uses the public chapter API, caches per chapter, bounds a request to 50
chapters, exposes a tooltip relationship with `aria-describedby`, and closes with Escape.
Whole-chapter references remain links but do not open a chapter-sized popup.

## Legacy compatibility

Existing `verse_comments` remain available through `GET /api/v1/notes`, but their former inline green
Reader bubble and per-verse creation action are retired in favour of unified documents. The feature
migration `drizzle/0025_clever_agent_brand.sql` creates one private `note` document and one
translation-specific single-verse passage for each existing row. The source row and its already
sanitised HTML are not deleted or rewritten. The legacy comment UUID is a unique provenance key, so
the data backfill can be run repeatedly without creating duplicate documents. `pnpm db:backfill-notes`
applies the same rule to later or restored legacy rows. The compatibility table stays for rollback/API
consumers, but the Reader no longer loads it and there is no dual-write.

New unified-document APIs live alongside the existing endpoint. `GET /api/v1/documents` lists owned
read-only, require a signed-in session or `personal`-scope API key, and return `private, no-store`.
`GET /api/v1/notes` retains its existing `{ notes: [...] }` shape, including verse-list thread comments.
Verse-list comments are collaborative conversations and are not copied into private documents.

## Routes and workflows

- `/notes` searches the current owner's note titles and plain text, then filters by
  nested tag and overlapping passage; its trash view restores soft-deleted working copies.
- `/notes/[id]` edits one working copy, tags and passage anchors; `export.md`, `export.docx` and
  `export.pdf` provide the three owner-only formats. `/notes/import` previews one/many Markdown files or
  one ZIP before explicit atomic import.
- `/sermons` groups the owner's sermon documents by `idea`, `research`, `outline`, `ready` and
  `delivered`. Cards move by drag-and-drop; `Alt` + left/right arrow moves the focused card without a
  pointer. New sermons may use the
  built-in outline, be empty or start from an owner-created template under `/sermons/templates`. The
  editor additionally carries a planned date, series and any number of actual delivery entries (date
  plus location); delivery mutations share the document's optimistic revision.
- The Bible reader loads only compact matching document metadata. Inclusive canonical anchors appear
  in every active Bible translation, translation-specific anchors only in their resource. Its one
  contextual notes panel opens a match or creates a note while retaining the reader return URL. A
  layout-menu switch additionally exposes a filterable library/current-verse creator and the same
  compact editor as a right-hand desktop sidecar or a separate mobile „Notiz“ view. Without an open
  document, its context follows the currently visible verse while reading. Desktop width is horizontally
  resizable; only harmless width and open/closed preferences are stored locally. Private document ids
  never enter Reader URLs, history or local storage. Covered verse text is dotted-underlined, while
  indicator icons render only at an anchor's start/end boundary. Closing waits for autosave to finish.
- `/notes/published` and `/notes/published/feed.xml` expose published-note snapshots;
  `/notes/published/[slug]` renders a public or unlisted snapshot and never hydrates fields from the
  working copy. There are intentionally no parallel legacy publication routes.

## Recovery and rollback

Document deletion is soft deletion and the owner can restore it from the library trash view. A
publication is an independently stored snapshot, so draft recovery cannot silently mutate public
content. Normal database backups include both working copies and snapshots.

Migration `0025_clever_agent_brand.sql` is additive. It creates the complete document/publication
schema, owner-private sermon templates and delivery history, and the composite document owner key that
prevents cross-owner delivery rows. It keeps `verse_comments`, which makes application rollback safe:
an earlier release can continue using the legacy rows. If the release is rolled back after users have
created unified-only documents, those rows remain intact but are invisible to the old application.
Operators should take the normal pre-deploy database backup before a schema rollback; dropping the new
tables is not part of an automatic down migration.

An older binary cannot perform the new passage transfer during Bible deletion, so the foreign key may
reject such a deletion after rollback. This preserves data. Use the new release for that resource
operation or manually transfer anchors under a reviewed recovery procedure; do not remove the
constraint merely to make the old deletion succeed.

## Deliberately deferred

- multi-user document collaboration;
- administrator access to somebody else's draft;
- revision history beyond optimistic locking, publication history and scheduled publication;
- media uploads, attachment copying and a server-side Obsidian vault filesystem;
- backlinks/transclusion and automatic wikilink resolution across imported files;
- real-time co-editing and offline conflict merging;
- comments or reactions on public notes;
- custom publication domains;
- audio/video hosting, calendar synchronisation and reminders for sermons.
