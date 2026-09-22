# Operations

## Reproducible local demo

After `pnpm install` and `cp .env.example .env`, run:

```sh
pnpm dev:demo
```

This starts the existing PostgreSQL service from `compose.dev.yaml`, applies every migration, runs the
small development/E2E seed and starts the SvelteKit development server at <http://localhost:5173>
(`0.0.0.0:5173` for an integrated or LAN preview). It never truncates or drops a developer database.
The ordinary full-data import remains available separately through `pnpm data:import`.

The fixture accounts are development-only and use reserved addresses:

| Role  | E-mail               | Password               | Display name       |
| ----- | -------------------- | ---------------------- | ------------------ |
| User  | `reader@example.com` | `seed-reader-password` | Demo-Leser         |
| Admin | `admin@example.com`  | `seed-admin-password`  | Seed-Administrator |

`pnpm db:seed` is idempotent: it reimports only the compact `SEED*` resources, creates missing fixture
rows using stable IDs, and does not overwrite edited fixture documents or publication snapshots. It
refreshes the credentials, roles and display names of the two reserved accounts so the table above
remains reliable. The fixture includes canonical, cross-chapter and translation-specific notes, a
nested tag, a sermon in progress, and a published note whose revision-1 snapshot deliberately differs
from its newer revision-2 working copy. It also inserts a legacy `verse_comments` row and invokes the
same unique-provenance backfill as `pnpm db:backfill-notes`; rerunning either command cannot create a
second migrated document.

No transactional-mail configuration is needed for notes, Markdown interchange, publication or sermons.
When `BREVO_API_KEY` is absent, the existing authentication mail fallback logs messages as before; the
two seeded accounts are already verified.

## Imported Bible edition revisions

Migration `0045_resource_source_revision` adds nullable source provenance without changing Bible
content or administrator-edited labels. Startup and backup restoration run `backfillResourceRevisions`
for ready Zefania Bibles whose revision is still unknown. Each candidate uses only its own archived
`resources.source_file` inside `UPLOAD_DIR`; symlinks escaping that directory, non-files, missing
uploads, malformed/unfinished headers and document types are skipped. Reads stop at the end of
`INFORMATION` and are capped at 256 KiB per archive. Only the root `revision` attribute is authoritative;
filenames, labels, licence text, another edition and XML format `version` never establish provenance.

The backfill reads bounded batches and updates only the revision. It compares the resource row version,
source path, ready state and unknown revision again on write, so an intervening import or admin edit
cannot receive stale provenance. Files modified during reading are skipped. Existing known revisions,
verse text, word indexes, labels and resource timestamps remain unchanged. Repeated execution is
idempotent. Upload archives must be retained unchanged: a database backup alone does not include them,
so restored databases without their corresponding archives legitimately keep unknown revisions.

If a legacy revision remains unknown, check that its original archived upload still exists under the
configured `UPLOAD_DIR` and contains a valid `revision` in its Zefania header. Do not relabel it from
another resource or reimport Bible text merely to guess a version; restoring the actual archive allows
the next startup to recover the metadata. New imports record source revisions atomically themselves.

## Local PDF compiler and print fonts

PDF export uses the local **Typst 0.15.1** CLI. There is no rendering service, browser runtime,
network font request or document upload to a third party. The application's reviewed template receives
document data as JSON in a separate temporary directory. The export runner restricts its project root
to that directory, disables system fonts, bounds execution time and output size, and removes temporary
files afterwards. User content is data, not Typst source. The built-in DejaVu Sans Mono supplies code
blocks; ordinary text uses the bundled Akribos Text and Noto Sans Hebrew faces.

For local development and tests, install the compiler once from the repository root:

```sh
pnpm pdf:setup
export PDF_TYPST_BIN="$PWD/var/tools/typst/bin/typst"
"$PDF_TYPST_BIN" --version
```

`scripts/install-typst.sh` selects the official Linux or macOS archive for x86_64 or arm64. It verifies
the hardcoded SHA256 before extraction and checks the binary's version before installing it. The
digests come from the asset metadata of the
[official 0.15.1 release](https://github.com/typst/typst/releases/tag/v0.15.1), not from a checksum served
alongside an unpinned latest download. Downloads use HTTPS. `--prefix DIRECTORY` selects another
installation directory; `--archive FILE` uses an already downloaded archive with the same mandatory
checksum. Unsupported platforms fail explicitly. Without `PDF_TYPST_BIN`, the runner uses
`var/tools/typst/bin/typst` under the application directory, matching `pnpm pdf:setup`; a different
version is rejected. The binary and its license/third-party notices live under
`var/tools/typst/{bin,share/typst}` by default; that directory is ignored by Git.

The Dockerfile installs the same pinned binary in a separate stage and copies it to
`/usr/local/bin/typst`, its notices to `/usr/local/share/typst`, and the committed fonts to
`/app/data/fonts/pdf`. Download utilities from this stage do not enter the final image. The installer
supports native amd64 and arm64 stages, so the Dockerfile also works with a configured cross-platform
builder. The existing image workflow still builds its native runner architecture; this change does
not introduce a new publishing matrix. No Python interpreter, Poppler tools, font conversion or
network installation is required when the production application starts.

`data/fonts/pdf/` contains nine real TTF faces: Akribos Text regular/italic in weights 400, 600 and 700,
plus Noto Sans Hebrew upright in weights 400, 600 and 700. They are lossless decompressions of the
existing WOFF2 assets, not newly drawn or synthesized fonts. The Akribos source manifest and the pinned
`@fontsource/noto-sans-hebrew` 5.3.0 package identify the sources. The PDF manifest records source and
output hashes, versions, weights, styles and verification coverage; both OFL licenses accompany the
fonts. The full provenance of Akribos Text remains in [typography.md](typography.md).

Rebuild or verify the committed fonts without downloading any new font source:

```sh
python3 -m venv /tmp/akribos-pdf-fonts
/tmp/akribos-pdf-fonts/bin/pip install -r scripts/fonts/requirements.txt
PATH="/tmp/akribos-pdf-fonts/bin:$PATH" pnpm fonts:pdf:check
# Only after reviewing an intentional source change:
PATH="/tmp/akribos-pdf-fonts/bin:$PATH" pnpm fonts:pdf
```

The converter pins FontTools, Brotli and HarfBuzz versions, keeps original font timestamps, and verifies
every OpenType table before and after decompression. Only the container's master checksum may differ.
It also checks real style metadata and equivalent NFC/NFD shaping for Latin/transliteration, polytonic
Greek and Hebrew with vowel/cantillation marks. `--check` regenerates everything in memory and requires
byte-identical committed outputs and license files. A font or converter update must include a reviewed
manifest change and the verification run; do not bypass a source hash mismatch.

Both CI test jobs install the pinned compiler and `poppler-utils`; real export tests inspect PDF text,
page metadata and embedded fonts with `pdftotext`, `pdfinfo` and `pdffonts`. The unit-test job also
rebuilds and verifies every print font. Normal `pnpm build` uses the committed artifacts directly.
To inspect the exact fonts available to the isolated compiler:

```sh
"$PDF_TYPST_BIN" fonts --ignore-system-fonts --font-path data/fonts/pdf --variants
```

If PDF export fails, check the configured executable's version and that `data/fonts/pdf` is present and
readable relative to the application's working directory. Run the real PDF tests with the same binary
before changing layout or time limits. Do not log private document JSON or retain temporary exports for
diagnostics. Compiler/template updates and any font update belong in a tested application release.

## Email-first sign-in

`/login` first asks for an email address; `/register` redirects to the same entry point. Existing
password accounts then enter their password. New addresses and passwordless accounts receive a Brevo
transactional email containing a one-time link and a six-digit code. Accounts are created and verified
only when the recipient confirms the link or enters the code. A password can subsequently be set in
the account settings. Existing password-account activation links remain supported.

Migration `0040_email_login.sql` makes `users.password_hash` nullable and adds `email_logins`; existing
hashes and sessions remain unchanged. The container applies this migration before serving traffic.
`BREVO_API_KEY`, `MAIL_FROM` and `MAIL_FROM_NAME` use the existing mail configuration. Production needs
working transactional delivery; without the key, production rejects email sign-in with a visible
delivery error. The development fallback only logs messages. Keep
`SESSION_SECRET` stable: it protects stored code hashes, and rotating it invalidates pending codes.

Link and code expire together after 15 minutes, share a five-guess limit and are invalidated together
on use or resend. Sending is limited to three emails per destination and 50 per client address per
15 minutes. Opening a link is read-only; the confirmation button submits a same-origin POST. Login
destinations are restricted to local paths. Auth pages are private and not indexed, and slow-request
logs redact the link token. Never log or forward live login links/codes during troubleshooting.

The token generation, expiry, single-use and rate-limit design follows the applicable guidance in
the [OWASP token and PIN recommendations](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html#general-security-practices).
The requested password/code step intentionally reveals which sign-in method an address uses.

## Device-specific workspace selection

Migration `0043_outstanding_robbie_robertson.sql` adds the active workspace and selection version to
sessions, plus a separate content version to named snapshots. It is additive: existing names, contents,
management revisions and sessions remain present. The container applies it before serving traffic.
The first access initializes an existing session from its valid device hint or the previous global
selection. Historical per-device choices cannot be reconstructed from the old global flag. After the
upgrade, open the desired workspace once on each device; subsequent selections remain independent.

Devices still share the contents of a named workspace. A conflicting edit reports an error and leaves
the newer saved snapshot intact. Reopening a workspace resolves its latest state. Deleting a workspace
removes it from the account; another device that still selected it receives an existing fallback on
its next access. No separate service or periodic job is required.

## Repairing existing document footnotes

The application runs `backfillDocumentFootnotes` at startup and after a restored backup. To repeat it
manually, run `pnpm db:backfill-footnotes`. No schema migration, new service or external provider is
required. The native Node CLI uses the configured database and reports counts only.

The backfill scans bounded batches of notes and sermons, including trashed documents and their own
publication snapshots. It repairs unambiguous legacy Markdown/Word reference pairs, splits merged
footnote definitions, and refreshes derived HTML/text even when canonical Markdown was already present.
Each document is locked and re-read before updating content, links and reference indexes in one
transaction. A real draft change increments its revision so a stale editor cannot overwrite the repair;
creation and update timestamps remain unchanged. Repeating the operation produces no further changes.

Published content is regenerated exclusively from the publication's own Markdown. Newer private drafts
are never published by this operation. Only a previously current snapshot follows the technical revision
increment; an already stale snapshot remains stale. Ambiguous HTML-only sources without matching Markdown
remain intact and contribute to the warning count. Logs expose counts, never footnote text.

## Restoring existing document tables

The application runs `backfillDocumentTables` after the footnote repair at startup and after backup
restoration. Repeat it manually with `pnpm db:backfill-tables`; it uses the configured database and
requires no schema migration or external service.

Only actual GFM table tokens in each stored Markdown source qualify, including nested tables in
lists, quotations and footnotes. Flat text joined with `·`, code examples and HTML-only remnants
are never guessed back into tables. HTML-only tables without a matching Markdown table remain
untouched and contribute to the warning count. Notes, sermons, trash and existing publication
snapshots are processed in bounded candidate batches.

The operation preserves Markdown byte for byte, including deliberate whitespace. Each document and
its publication are locked and re-read before changing derived HTML/search text, document links and
Bible-reference indexes in one transaction. A changed working copy gains one technical revision to
reject stale editor saves; timestamps, title, owner, visibility and publication metadata remain intact.
Only an already current publication follows that revision. Every publication's HTML comes exclusively
from its own stored Markdown, never from the newer private draft; absent publications are not created.
Repeating the command makes no further changes. Console and application logs expose counts and a safe
SQLSTATE on failure, never document text or database query parameters.

## Re-scanning document Bible references

Migration `0038_document_reference_parser_version.sql` marks existing derived indexes with the legacy
parser version. On the next application start, the versioned backfill rebuilds every missing or outdated
index with the corrected parser, including all owners' notes, sermons and trashed working copies.
The same backfill runs after backup restoration. Subsequent starts skip current indexes.

To force a full rescan against the configured `DATABASE_URL` after applying migrations:

```sh
pnpm db:reindex-documents
```

The command reports the number of scanned working copies. It processes 100 documents per transaction
and locks their rows against simultaneous edits/deletions. It changes only the derived book/range
index: Markdown, HTML, manual anchors, revisions, timestamps and publication snapshots remain intact.
Automatic links in the editor and rendered documents use the corrected parser when displayed.

## Unified-document migration and recovery

The feature has one generated schema migration and its matching snapshot:

- `drizzle/0025_clever_agent_brand.sql` creates `documents`, `document_passages`, `document_tags`,
  `document_tag_links`, `document_publications`, `sermon_templates` and `sermon_deliveries`. It then
  contains a reviewed hand-written data section, following the repository's existing backfill
  convention. This copies every extant
  `verse_comments` row into one private `note`, preserves the already sanitised `comment_html`,
  attaches one translation-specific single-verse passage, and leaves the source row untouched. A
  unique `legacy_verse_comment_id` provenance key plus conflict-safe inserts make the data step
  idempotent.

For a normal deploy, the container entrypoint applies this automatically. To exercise the same path
against an existing checkout/database explicitly:

```sh
pnpm db:migrate
pnpm db:backfill-notes
```

The second command is safe to run repeatedly. It is principally for legacy comments created after
migration 0025 (the compatibility editor remains available), comments restored from an unusual partial
backup, and operational verification. It scans bounded batches and creates only rows without an
existing provenance match. For fidelity it accepts the exact existing Bible row even if that old
resource is currently hidden or not ready; it fails only when the resource is missing or is not a Bible.
Restore/import the original Bible or transfer it through the resource administration, then retry.
Once copied, the legacy comment and unified document are independent: the compatibility editor does not
dual-write later changes, so run the backfill for missing rows rather than expecting it to overwrite an
existing document.

Useful post-migration checks are:

```sql
select count(*) from verse_comments;
select count(*) from documents where source = 'legacy-verse-comment';
select legacy_verse_comment_id, count(*)
from documents
where legacy_verse_comment_id is not null
group by legacy_verse_comment_id
having count(*) > 1;
```

The first two counts need not be equal: later compatibility comments can exist before the next backfill,
and a resource-transfer collision deliberately consolidates two compatibility rows only after preserving
both original texts as two provenance documents. On a database with no such prior collisions they match
immediately after a clean backfill. The duplicate query must always return no rows. Publication
snapshots are separate rows: restoring or editing a working copy never changes what visitors see until
an admin explicitly republishes it.

Take the usual logical backup before deployment. Application rollback does **not** require a schema
rollback: migration 0025 is additive, the old `verse_comments` table and `GET /api/v1/notes` contract
remain intact, and an older binary simply cannot see unified-only documents. One operational caveat is
resource deletion: the new `document_passages` foreign key intentionally prevents an old binary from
deleting an anchored Bible because it cannot perform the new transfer. Treat that refusal as safe; use
the new release to transfer/delete the resource, or perform a reviewed manual transfer before retrying
on the old binary. Do not drop the new tables
after users have written documents; that would destroy data that has no legacy representation. If a
database backup predates 0025, restore it through the normal restore flow so pending migrations run,
then run `pnpm db:backfill-notes` once. A restore already containing 0025 can also use the command to
reconcile any later legacy rows. Database backups must include both working copies and
`document_publications`, because a publication is an independent snapshot, not a view that can be
recreated from the current draft.

To capture the ten review screenshots from a running local server, use:

```sh
AKRIBOS_PREVIEW_URL=http://localhost:5173 pnpm screenshots:notes
```

The command signs in only with the documented demo accounts and writes actual browser screenshots to
`docs/screenshots/unified-notes/`; it does not generate mockups.

## Deploying

`compose.yaml` is the whole stack: the app and PostgreSQL 17. The application image is built on
GitHub's runners and published as `ghcr.io/akribos-biblestudy/akribos:latest`; the production server
never builds it itself.

Add the repository in Coolify as a **Docker Compose** resource with branch `main`, base directory `/`
and compose location `/compose.yaml`, then assign a domain to the `app` service and set:

| Variable                    | Where it comes from                                                     |
| --------------------------- | ----------------------------------------------------------------------- |
| `SERVICE_PASSWORD_POSTGRES` | Coolify generates it; shared by app and database                        |
| `SERVICE_BASE64_64_SESSION` | Coolify generates it; signs session cookies                             |
| `SERVICE_BASE64_64_BACKUP`  | Coolify generates it; encrypts the S3 secret key set in `/admin/backup` |
| `BREVO_API_KEY`             | Brevo; without it, mails are written to the log instead of sent         |
| `MAIL_FROM`                 | must be a sender Brevo has verified                                     |
| `BOOTSTRAP_ADMIN_EMAIL`     | the first account registered with this address becomes an admin         |

Migrations run in the container's entrypoint before the server starts, so a deploy that changes the
schema needs nothing extra. A failed migration stops the boot, and the healthcheck keeps the old
container serving.

### Container registry and automatic deployment

The `image` job in `.github/workflows/ci.yml` runs after lint, type, unit and end-to-end tests. On a
push to `main` it publishes two GHCR tags: `latest` for Coolify and the full Git commit SHA for an
immutable rollback reference. Only after that push succeeds does the `deploy` job call Coolify. Set
these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret            | Value                                                         |
| ----------------- | ------------------------------------------------------------- |
| `COOLIFY_WEBHOOK` | the deploy webhook URL shown by this Coolify resource         |
| `COOLIFY_TOKEN`   | a Coolify API token; API access must be enabled on the server |

The workflow calls the deploy webhook with `POST`, as specified by the current
[deployment API](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid).
Keep the resource UUID and other query parameters from Coolify's generated URL. The production
instance rejects `GET` requests to this endpoint with HTTP 405.

Do not add a `build:` section for `app` back to `compose.yaml`: that makes Coolify compile the app on
the production server. `pull_policy: always` makes every deployment refresh the moving `latest` tag.
Disable Coolify's direct auto-deploy-on-push integration if it is enabled; otherwise it can deploy
once before GitHub Actions has published the new image. The Actions webhook is the intended trigger.

GHCR packages are private when first created. Before the first deployment, authenticate Docker on
the Coolify server with a GitHub personal access token (classic) that has only `read:packages`:

```sh
read -rsp "GHCR token: " GHCR_READ_TOKEN; echo
printf '%s' "$GHCR_READ_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
unset GHCR_READ_TOKEN
```

Alternatively, after the first successful publish, change the `akribos` package visibility to
**Public** on GitHub; public GHCR images can be pulled anonymously. If the first automatic deployment
ran before registry access was configured, use Coolify's **Redeploy** button once afterward.

### First deployment

1. Deploy. The site comes up with no translations and says so.
2. Register with the address in `BOOTSTRAP_ADMIN_EMAIL`; that account gets the admin role.
3. Import through `/admin/import`, or from a checkout with `pnpm data:import` against the production
   `DATABASE_URL`.

## Backups

Backup and restore live in the admin UI at `/admin/backup` (admins only) — there is no separate
sidecar container. The app shells out to `pg_dump`/`pg_restore` itself, so the runtime image includes
a matching `postgresql-client-17` (see the `Dockerfile`).

**Manual download**: "Backup herunterladen" dumps the database (`pg_dump --format=custom`) and streams
it straight to the browser — nothing is retained on the server afterwards.

**Scheduled S3 backup**: configurable per instance — endpoint, region, bucket, path prefix, access
key/secret (the secret is encrypted at rest with `BACKUP_ENCRYPTION_KEY`, never stored in plain text),
a schedule preset (hourly/daily/weekly + time of day) and retention (how many dumps to keep in the
bucket, and how many to additionally keep in the local `backups` volume as a safety net if S3 is
unreachable). A minute-granularity in-process scheduler checks whether a run is due; every run — manual
or scheduled — becomes a row in the "Verlauf" history, so "did last night's backup work" is answerable
without a shell.

**Restore**: uploads a `.dump` file and requires typing a confirmation phrase — both checked
server-side, not just by the disabled button. Before anything is touched, an automatic safety dump of
the current state is taken (locally, and to S3 if configured); if that safety dump fails, the restore
does not proceed. After a successful `pg_restore`, pending migrations are re-applied (a dump taken
before a schema change restores the old schema), the Strong's statistics materialized views are
refreshed (their data is not part of a dump), and caches are invalidated. The admin's own session may
no longer exist in the restored data — a fresh login can be necessary afterwards.

Restored job rows marked queued or running describe the old snapshot, not current work. Restore marks
these rows interrupted and reinserts its own current safety-backup and restore records before the
remaining repairs run. If the initiating account is absent from the older dump, these records retain
their history with an empty creator. A successful restore therefore releases the job gate immediately;
another backup or restore does not require a server restart.

Only logical dumps are covered here (no point-in-time recovery). If the acceptable data-loss window
ever needs to be tighter than "since the last scheduled dump", the upgrade path is continuous WAL
archiving (`pgBackRest`/`wal-g`) — a bigger change, out of scope for now.

Verifying the S3 path works — worth doing once now rather than for the first time in an emergency: fill
in the S3 fields in `/admin/backup` and click "Verbindung testen", which writes and deletes a marker
object (proving write access, not just reachability), then "Jetzt sichern" and confirm the run appears
as "fertig" in the history and the object shows up under "Im Bucket vorhanden".

Only user data is irreplaceable. Translations can be re-imported from their source files, which is why
uploads are archived in the `uploads` volume — back that up too, or keep the sources elsewhere.

## Upgrading

**Application**: merge to `main`. GitHub Actions tests the commit, builds and publishes the image, and
then asks Coolify to redeploy it. Coolify pulls the image; migrations run on boot.

**PostgreSQL major version**: the data directory is not compatible across major versions, so dump,
recreate and restore:

```sh
docker compose exec db pg_dump -U strongs -Fc strongs > strongs.dump
docker compose down
docker volume rm strongs_pgdata     # only after checking the dump is complete
# raise the image version in compose.yaml, then
docker compose up -d db
docker compose exec -T db pg_restore -U strongs -d strongs --clean --if-exists < strongs.dump
docker compose up -d
```

## When something is wrong

**The site returns 503 and the healthcheck fails.** `/healthz` executes a query, so this means the
database is unreachable: `docker compose logs db`, `docker compose ps`.

**An import sits at "running".** It was interrupted by a restart. Jobs in that state are marked failed at
the next boot; restart the app container and retry the import.

**A translation reads oddly after an import.** Look at the warnings on the job in `/admin/import` first —
duplicated verses and unusable Strong's references are reported there. Then reimport: the original upload
is kept, so the same file can be run again from `/admin`.

**Search returns nothing for a word that is definitely there.** The vocabulary and statistics views are
refreshed after an import; if one was interrupted they can be stale. "Statistiken neu berechnen" on
`/admin/resources` rebuilds them and runs `ANALYZE`.

**A Bible should be removed.** Open `/admin/resources`, expand its delete panel and choose another
Bible as the comment destination. The delete action is unavailable for the last remaining Bible.
Existing destination comments are combined with transferred comments; direct database deletion is
blocked while comments still reference the resource.

**Logins are refused with "Zu viele Versuche".** The throttle allows 8 failures per account and 30 per
address in 15 minutes, and rows age out on their own. To clear it immediately:
`delete from login_attempts;`.

**Someone cannot receive the reset mail.** `/admin/users` issues a one-time link and shows it on screen.

**A backup or restore sits at "läuft".** Same story as an import: it was interrupted by a restart, and
is marked failed at the next boot. Retry from `/admin/backup`.

**A scheduled backup fails with "`pg_dump` ist ... nicht installiert".** The runtime image is missing
`postgresql-client-17` — check the `Dockerfile`'s PGDG install step survived a recent change.

**A scheduled backup fails to reach S3.** "Verbindung testen" in `/admin/backup` reports the
underlying error (wrong endpoint, expired credentials, a bucket policy that allows read but not
write).

## Log lines worth alerting on

Logs are JSON on stdout, collected by Coolify.

- `"slow request"` — a request over 500 ms, with its path. A handful during an import is expected;
  a steady stream means a query has lost its index.
- `"import failed"` — with the reason.
- `"backup failed"` / `"restore failed"` — with the reason; check `/admin/backup` for the full error.
- `"mail not sent: BREVO_API_KEY is not configured"` — password resets are silently not arriving.

## Umami konfigurieren

Unter **Verwaltung → Umami** lassen sich eine vorhandene Umami-Instanz (ab Version 2.18), die HTTPS-
Skriptadresse und die Website-ID eintragen. Betreiber, Link zu dessen Datenschutzhinweisen und eine
Beschreibung von Hosting-Ort, Speicherfristen und gegebenenfalls Drittlandübermittlungen erscheinen
in der Akribos-Datenschutzerklärung. Die Angaben konfigurieren keine Löschregeln im Umami-Server;
diese müssen dort zu den angegebenen Fristen passen. Ohne vollständige Angaben bleibt die Aktivierung
abgewiesen. Neue Installationen starten deaktiviert; die Einstellung ist Teil der Datenbankbackups.

Besucher erlauben oder verweigern das Laden des Skripts. Die Entscheidung kann auf `/datenschutz`
widerrufen werden. Es werden ausschließlich allgemeine Seitenkategorien gezählt. Private Seiten,
konkrete Bibelstellen, Suchbegriffe, Referrer und Nutzer-/Dokumentkennungen werden nicht übermittelt.
DNT/GPC werden respektiert; Änderungen an Empfänger oder Datenschutzhinweisen erfordern eine neue
Entscheidung. Nach Abschalten laden neue Seitenaufrufe keinen Tracker mehr.

Bei aktivierter Analyse setzt das Root-Layout `Referrer-Policy: same-origin` per Meta-Tag, damit
externe Analyseanfragen keine Referrer erhalten und native Formulare ihre eigene Herkunft weiterhin
mitsenden. Kein globales `no-referrer` setzen: Dadurch senden Login-, Registrierungs- und andere
native POST-Formulare `Origin: null` und werden vom CSRF-Schutz abgewiesen. Der Skript-Download
verwendet zusätzlich sein eigenes `no-referrer`; SvelteKits CSRF-Schutz bleibt aktiviert.

Die Einbindung verwendet die offiziellen [Tracker-Einstellungen](https://docs.umami.is/docs/tracker-configuration)
(`data-auto-track=false`, `data-before-send`) und [manuelle Seitenaufrufe](https://docs.umami.is/docs/tracker-functions).
Die Einwilligungsinformationen berücksichtigen [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html).
