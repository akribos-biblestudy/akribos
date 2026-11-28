# PDF export

The [issue #354 designs](planning/pdf-354/README.md) build on the Akribos Studienblatt from
[issue #294](https://github.com/akribos-biblestudy/akribos/issues/294). The three A4 templates are
selected in the account settings. Studienausgabe is the default.

## Layout and content

| Template       | Body text | Layout                                                                                                                      |
| -------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Studienausgabe | 11.8 pt   | 152 mm text width, dark-green headings, tinted quotation boxes and horizontal table rules                                   |
| Buchsatz       | 11.4 pt   | 134 mm text width, German hyphenation and justification, italic quotations with a fine left rule and additional white space |
| Lesemanuskript | 13.4 pt   | 152 mm text width, dark-blue headings, wider line spacing and a fine left rule for quotations                               |

All three use the reader's Akribos Text font family including genuine bold and italic faces.
Noto Sans Hebrew handles Hebrew runs with explicit right-to-left direction; polytonic Greek stays
in Akribos Text. Code uses Typst's bundled DejaVu Sans Mono. The PDF embeds the needed font subsets.

Continuations show a running title, with the first passage reference in Studienausgabe and
Lesemanuskript. Each footer displays the page number and the optional profile display name. The
export normalizes whitespace in that name and renders it as plain text. A long name can end with
an ellipsis in the footer and retains its full normalized value in the PDF author metadata. Empty
names omit the author. Owner export uses the current authenticated profile without fallback to the
account email or a publication snapshot.

The Markdown adapter preserves headings, nested bold/italic, strike-through, the editor’s underline/highlight, inline and block code,
quotations, nested lists, ordered-list starting numbers, task status, horizontal rules and tables
with their column alignment. Code preserves literal whitespace and does not acquire Bible-reference
links. Safe authored links remain annotations; relative destinations resolve against the export
request's origin. Free Bible references use the shared parser and remain clickable. Neither links
nor image descriptions cause an external request. The PDF embeds validated PNG and JPEG images
with their selected alignment and maximum width. Attachments remain outside document export.
Visible metadata includes passage anchors, tags and applicable sermon dates,
series, format and delivery history. No owner ID, account email or publication authority is added.

Native Typst footnotes reserve space at the bottom of the page of their first reference. Their
numbers follow first-use order; repeat references link to the original definition. A long note can
continue on subsequent pages. Empty notes remain valid. Definitions without any remaining body
reference are retained in the visible “Fußnoten ohne Verweis” appendix. Normally, table headers repeat
across page breaks; a header containing a footnote appears only once to keep its definition and
navigation target unique.

Unbroken words, URLs and code tokens that exceed the available line or cell width wrap at grapheme
boundaries. The wrapping introduces no invisible Unicode characters into selectable PDF text and
retains combining marks. Ordinary words keep their normal shaping. A break opportunity at formatting
boundaries also prevents a word split across multiple styles from overflowing. Line wrapping may
still appear as ordinary newlines when text is copied from a PDF viewer. An unbroken Hebrew word
spanning multiple text styles or directly joined to another writing direction is measured as one word: if it exceeds the available width, the export
returns a typesetting error instead of clipping letters or reversing their reading order. Short
formatted Hebrew words, normal phrases and long Hebrew words within one style remain supported.

## Trust boundary and operating limits

The existing owner-only document lookup and metadata queries run before rendering. Downloads remain
`private, no-store`, attachments with safe filenames and `X-Content-Type-Options: nosniff`. Authored
links do not grant access to their destination. An aborted HTTP download cancels its compiler process.

`pdf-model.ts` transforms Markdown into a bounded, typed JSON model. `pdf-template.typ` is the only
executable typesetting source and is bundled as a Vite raw import. Authored strings only reach
`text`, `raw` and safe `link` data arguments; they never become code, an import, a path or an image.
The template contains no package or network dependencies. The runner pins Typst 0.15.1 and rejects a
different executable version. Installation verifies official archive SHA256 values; print-font
sources, licenses and reproducibility checks are versioned. See [operations.md](operations.md) and
[typography.md](typography.md).

Each job has its own mode-0700 temporary directory and mode-0600 JSON/template files. The compiler
root and package/cache paths point only there. Fonts come from the fixed `data/fonts/pdf` directory;
system font discovery is disabled. The subprocess has no shell and inherits only `PATH` and `LANG`,
never database, session or mail secrets. Private compiler diagnostics are consumed without being
retained, logged or sent to the browser. Any compiler warning fails the export instead of delivering
a PDF with silently missing glyphs. The response is a generic, actionable error.

The per-process limits are:

| Resource                       | Limit                                   |
| ------------------------------ | --------------------------------------- |
| Source Markdown                | 1 MiB, matching document storage        |
| Block nesting / inline nesting | 32 / 64                                 |
| Markdown blocks / inline runs  | 20,000 / 50,000 per inline conversion   |
| Serialized JSON input          | 8 MiB                                   |
| Produced PDF                   | 16 MiB                                  |
| Compiler runtime               | 15 seconds; hard process kill on expiry |
| Active compilers               | 2, each with one worker                 |
| Waiting jobs                   | 8, at most 10 seconds each              |

Input/output complexity failures return 413, typesetting failures 422, unavailable/busy/canceled
exports 503 and compilation timeouts 504. The runner removes temporary files and releases its slot
on success, failure and cancellation. The fixed creation timestamp and absent document date avoid
introducing export-time variability. These bounds apply to each application process; deployment
capacity must account for the number of replicas.

## Verification

`pdf-export.spec.ts` runs the actual pinned compiler and checks the resulting PDF with Poppler. It
checks the three templates' geometry and author footers, embedded faces, metadata and annotations,
literal executable-looking text, genuine page footnotes, repeated/orphan notes, long-note
continuation, all-page headers/footers and complete extraction of long words/code/URLs/table cells. `pdf-renderer.spec.ts` checks the isolated subprocess
boundary, secret stripping, timeout, output bounds, cancellation and private-diagnostic handling.
Existing Word tests continue to check native editable footnotes and import round trips. The shared
owner-only routes remain covered by the document-export E2E tests.

Install the compiler once with `pnpm pdf:setup` and Poppler (`poppler-utils` on Debian/Ubuntu), then run:

```sh
pnpm test:unit --run src/lib/server/documents/pdf-export.spec.ts src/lib/server/documents/pdf-renderer.spec.ts src/lib/server/documents/export.spec.ts
pnpm check
```

The complete repository E2E suite is still required before a push or PR update.
