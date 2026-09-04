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
verse comments, every translation-specific document passage is moved to that replacement. Canonical
passages remain resource-independent.

## Working copy and publication snapshot

Public rendering never reads a document's live title, body, tags or passages. Publishing creates or
replaces one complete snapshot containing all public fields and a non-email author label. Editing or
autosaving the working copy cannot change the public page. A later explicit publish replaces the
snapshot; unpublish removes it.

Snapshots are either `public` or `unlisted`. Public snapshots appear in `/articles`, the Atom feed and
the sitemap. Unlisted snapshots are reachable only through their direct slug. Private drafts have no
snapshot and no public route. A normal user cannot invoke publication even by constructing a request;
the repository checks both role and ownership in addition to the UI controls.

Authenticated HTML and every personal JSON/download response use `private, no-store`. Anonymous
article snapshots, the public index, feed and sitemap may use shared caching.

## Markdown and Obsidian interchange

Markdown is the portable representation and sanitised HTML is the rendering/editor representation.
The supported round-trip subset includes paragraphs, headings, emphasis, strong text, strike-through,
lists, block quotes, inline/fenced code, horizontal rules and safe links. Underline and other HTML-only
formatting are intentionally lossy when switching to Markdown.

Import accepts one UTF-8 `.md` file up to 1 MiB and always presents a side-effect-free preview before
creation. The importer uses YAML's core schema with bounded aliases, accepts only the documented
metadata, and never trusts incoming owner ids, document ids, roles, visibility or publication fields.
Imported documents are always private. Obsidian wikilinks become ordinary readable links/text. Embeds,
attachments, images, binary/NUL input, path-traversal filenames and unsafe raw HTML are rejected or
removed with visible warnings. Importing a complete vault/ZIP, attachments and automatic conflict
merging are explicitly outside the first version.

Exports are deterministic UTF-8 Markdown with YAML frontmatter for title, kind, tags, passages,
sermon metadata and timestamps. They contain no email address, owner/internal id or publication
authority.

## Legacy compatibility

Existing `verse_comments` remain available to the old reader UI and `GET /api/v1/notes`. The feature
migration creates one private `note` document and one translation-specific single-verse passage for
each existing row. The source row is not deleted. The legacy comment UUID is a unique provenance key,
so the data backfill can be run repeatedly without creating duplicate documents.

New unified-document APIs live alongside the existing endpoint. `GET /api/v1/notes` retains its
existing `{ notes: [...] }` shape, including verse-list thread comments. Verse-list comments are
collaborative conversations and are not copied into private documents.

## Recovery and rollback

Document deletion is soft deletion and the owner can restore it from the library trash view. A
publication is an independently stored snapshot, so draft recovery cannot silently mutate public
content. Normal database backups include both working copies and snapshots.

The schema migration is additive and keeps `verse_comments`, which makes application rollback safe:
an earlier release can continue using the legacy rows. If the release is rolled back after users have
created unified-only documents, those rows remain intact but are invisible to the old application.
Operators should take the normal pre-deploy database backup before a schema rollback; dropping the new
tables is not part of an automatic down migration.

## Deliberately deferred

- multi-user document collaboration;
- administrator access to somebody else's draft;
- publication history and scheduled publication;
- media uploads, image proxying and Obsidian vault/ZIP import;
- backlinks/transclusion and automatic wikilink resolution across imported files;
- real-time co-editing and offline conflict merging;
- comments or reactions on public articles;
- audio/video delivery and calendar scheduling for sermons.
