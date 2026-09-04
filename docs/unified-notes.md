# Unified notes, articles and sermon preparation

This document records the product and technical contract for Akribos' unified writing workspace. It
is intentionally explicit because the feature spans private user data, Bible-resource lifecycle,
public content and a compatibility migration.

## Product model

A **document** is an owner-private working copy. It has one of three kinds:

- `note` for study notes;
- `article` for a draft that an administrator may publish;
- `sermon` for a preparation document with the workflow `idea -> research -> outline -> ready ->
delivered`.

Every document uses the same Markdown/rich-text body, tags and Bible passages. The library at
`/notes` is therefore the single place to search and organise all writing; `/sermons` is a focused
workflow view over the same documents, not a second storage system.

Documents are private to their owner. Administrator status does not grant access to another user's
working copy. Publication is both owner-scoped and administrator-only. This deliberately chooses the
least-privilege interpretation of the feature: an administrator may publish their own article, but
cannot browse or publish another account's private drafts.

`body_markdown` is the portable source. The application derives allow-listed `body_html` for rendering
and markup-free `plain_text` for library search, and updates all three together. Title/body autosave
uses the internal, session-only `PATCH /api/documents/[id]`; the caller sends the current positive
`revision`, every working-copy mutation increments it, and stale writes receive `409 conflict`. This is
optimistic concurrency protection, not a retained revision history.

Tags are per-owner hierarchies. A slash separates path levels (`Study/Grace`); the database prevents a
parent/child relationship from crossing owners. Documents link explicitly to selected leaf tags, while
filtering by a parent includes its descendants.

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

Snapshots are either `public` or `unlisted`. Public snapshots appear in `/articles`, the Atom feed and
the sitemap. Unlisted snapshots are omitted from these discovery surfaces but are anonymously reachable
through their direct slug. An unlisted slug is therefore not a password or authorisation boundary and
may be forwarded by anyone who knows it. Private drafts have no snapshot and no public route. A normal
user cannot invoke publication even by constructing a request; the repository checks both role and
ownership in addition to the UI controls, and publication fails without the owner's non-empty display
name rather than exposing an email address.

Authenticated HTML and every personal JSON/download response use `private, no-store`. Anonymous
article HTML also remains `private, no-store`, because it inherits cookie-based guest preferences from
the global layout. The cookie-free Atom feed and sitemap are public but require revalidation
(`max-age=0, must-revalidate`) before reuse so a publication change cannot leave stale discovery data.

## Markdown and Obsidian interchange

Markdown is the portable representation and sanitised HTML is the rendering/editor representation.
The supported round-trip subset includes paragraphs, headings, emphasis, strong text, strike-through,
lists, block quotes, inline/fenced code, horizontal rules and safe links. Underline and other HTML-only
formatting are intentionally lossy when switching to Markdown.

Import accepts one UTF-8 `.md` file with at most 1 MiB of Markdown and 64 KiB of YAML frontmatter and
always presents a side-effect-free preview before creation. The importer uses YAML's core schema with
aliases disabled, accepts only the documented
metadata, and never trusts incoming owner ids, document ids, roles, visibility or publication fields.
Imported documents are always private. Obsidian wikilinks become ordinary readable links/text. Embeds,
attachments, images, binary/NUL input, path-traversal filenames and unsafe raw HTML are rejected or
removed with visible warnings. Importing a complete vault/ZIP, attachments and automatic conflict
merging are explicitly outside the first version. Confirmation reparses the original and atomically
creates document, tags and at most 100 passage anchors; at most 50 tags are linked, tag paths have at
most eight levels, and comma/backslash are invalid in segments.

Exports are deterministic UTF-8 Markdown with YAML frontmatter for title, kind, tags, passages,
sermon metadata and timestamps. They contain no email address, owner/internal id or publication
authority.

The accepted/exported frontmatter uses `title`, `type` (`kind` is accepted on import), `tags`,
`passages` (`references` is accepted on import), and nested `sermon` metadata. Each passage has a
human-readable `reference` and optional `resource`; omitting it creates a canonical anchor. Imported
timestamps are informational and do not replace database audit timestamps. See
[importing.md](importing.md#obsidian-and-markdown-documents) for the complete safe subset and example.

## Inline Bible references

References typed directly into prose, such as `Mt 3,12`, `Johannes3:16`, `1. Mose 1,1-3` or
`Hohes Lied 2,1`, become internal Reader links at presentation time. Existing links and code are left
untouched. The rich editor uses non-persisted ProseMirror decorations, so automatic links never alter
the author's Markdown or its export. Published articles use the same matcher over the already safe
snapshot HTML.

Hovering a same-chapter verse reference, or focusing it with the keyboard, shows the actual verse text.
The standalone editor and public articles use the first configured public, ready Bible; the Reader
sidecar intentionally uses the first Bible currently visible beside it, so the preview matches the
reading context. The popup uses the existing public chapter API, caches per chapter, exposes a tooltip
relationship with `aria-describedby`, and closes with Escape. A chapter reference or a range crossing
a chapter/book boundary remains clickable but deliberately has no large multi-chapter preview.

## Legacy compatibility

Existing `verse_comments` remain available to the old reader UI and `GET /api/v1/notes`. The feature
migration `drizzle/0025_neat_warpath.sql` creates one private `note` document and one
translation-specific single-verse passage for each existing row. The source row and its already
sanitised HTML are not deleted or rewritten. The legacy comment UUID is a unique provenance key, so
the data backfill can be run repeatedly without creating duplicate documents. `pnpm db:backfill-notes`
applies the same rule to later or restored legacy rows; the compatibility editor does not otherwise
dual-write its changes into a migrated document.

New unified-document APIs live alongside the existing endpoint. `GET /api/v1/documents` lists owned
working copies, and `GET /api/v1/documents/[id]` returns one owned body with tags and passages. Both are
read-only, require a signed-in session or `personal`-scope API key, and return `private, no-store`.
`GET /api/v1/notes` retains its existing `{ notes: [...] }` shape, including verse-list thread comments.
Verse-list comments are collaborative conversations and are not copied into private documents.

## Routes and workflows

- `/notes` searches the current owner's titles/plain text and filters by kind, nested tag and
  overlapping passage; its trash view restores soft-deleted working copies.
- `/notes/[id]` edits one working copy, tags and passage anchors; `/notes/[id]/export.md` downloads its
  portable Markdown and `/notes/import` provides preview then explicit import.
- `/sermons` groups the owner's sermon documents by `idea`, `research`, `outline`, `ready` and
  `delivered`; the editor additionally carries an optional date and series.
- The Bible reader loads only compact matching document metadata. Inclusive canonical anchors appear
  in every active Bible translation, translation-specific anchors only in their resource. Its one
  contextual notes panel opens a match or creates a note while retaining the reader return URL. A
  layout-menu switch additionally exposes the same compact editor as a right-hand desktop sidecar or a
  separate mobile „Notiz“ view. Only its open/closed preference is stored locally; private document ids
  never enter Reader URLs, history or local storage, and closing waits for autosave to finish.
- `/articles` and `/articles/feed.xml` expose public snapshots; `/articles/[slug]` renders a public or
  unlisted snapshot and never hydrates fields from the working copy.

## Recovery and rollback

Document deletion is soft deletion and the owner can restore it from the library trash view. A
publication is an independently stored snapshot, so draft recovery cannot silently mutate public
content. Normal database backups include both working copies and snapshots.

The schema migration is additive and keeps `verse_comments`, which makes application rollback safe:
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
- media uploads, image proxying and Obsidian vault/ZIP import;
- backlinks/transclusion and automatic wikilink resolution across imported files;
- real-time co-editing and offline conflict merging;
- comments or reactions on public articles;
- custom publication domains;
- audio/video delivery and calendar scheduling for sermons.
