# Akribos – Arbeitsnotizen für Agents

Diese Datei ist die dauerhafte Orientierung für Änderungen in diesem Repository. Sie muss bei jeder
Architekturänderung und bei neuen, nicht offensichtlichen Invarianten im selben Change aktualisiert
werden. Ausführlichere Hintergrundtexte liegen in `docs/architecture.md`, `docs/importing.md` und
`docs/operations.md`.

## Projekt und Befehle

Akribos ist eine SvelteKit-5-Anwendung (Runes) mit TypeScript, PostgreSQL/Drizzle und einem Node-Adapter.
Paketmanager ist `pnpm` (Node >= 24).

Das Produktionsimage wird nach erfolgreichen CI-Tests von GitHub Actions nach
`ghcr.io/akribos-biblestudy/akribos` veröffentlicht. `compose.yaml` darf für den App-Service kein
`build:` enthalten: Coolify zieht ausschließlich das vorgebaute Image und löst den Deploy erst über
den nachgelagerten Actions-Webhook aus.

- `pnpm check`: Svelte- und TypeScript-Prüfung
- `pnpm lint`: Prettier-Check und ESLint
- `pnpm test:unit --run`: Unit-Tests
- `pnpm test:e2e`: eigene Testdatenbank vorbereiten, Produktions-Build starten, Playwright ausführen
- Einen Reader-Test gezielt ausführen: `pnpm test:e2e:only e2e/reader.e2e.ts -g "Testname"`

Vor dem Abschluss mindestens `pnpm check` und die für den Change relevanten Tests ausführen. Vor jedem
Push beziehungsweise dem Erstellen oder Aktualisieren eines PR muss außerdem `pnpm test:e2e` vollständig
lokal erfolgreich durchlaufen. Gezielte Aufrufe mit `pnpm test:e2e:only` helfen während der Entwicklung,
ersetzen diesen vollständigen Lauf aber nicht. Keine Migration manuell erfinden, wenn eine Schemaänderung
mit Drizzle generiert werden kann. Bestehende, fremde Änderungen im Worktree nicht überschreiben.

## Verzeichnis- und Schichtenmodell

- `src/lib/bible/`: reine Domänenlogik (Bücher, Referenzen, Segmentmodell, Parser), ohne Server-I/O
- `src/lib/server/`: Datenbank, Repositories, Auth, Mail, Import und serverseitige Einstellungen
- `src/lib/components/`: wiederverwendbare Svelte-Komponenten
- `src/routes/`: SvelteKit-Seiten, Form Actions und API-Endpunkte
- `drizzle/`: Migrationen und Snapshots
- `scripts/`: Migration, Import, Seed und E2E-Datenbank
- `data/`: gebündelte Bibel-, Wörterbuch- und Importquelldaten
- `e2e/`: Playwright-Tests gegen den Seed aus `scripts/seed.ts`

Die Abhängigkeitsrichtung ist wichtig: `src/lib/bible` importiert niemals aus `src/lib/server`. Bibeltext
wird als sichere strukturierte Segmente plus flacher Suchtext gespeichert. Die UI rendert Segmente mit
`VerseText.svelte`; importiertes HTML darf nicht ungeprüft in den Bibeltext gelangen.

## Reader-Architektur

Der zentrale Reader ist `src/routes/[...reference]/+page.svelte`; sein Server-Load und seine Form Actions
liegen in der gleichnamigen `+page.server.ts`. Die REST-Nachladung für Endless Scrolling erfolgt über
`src/routes/api/reader/[book]/[chapter]/+server.ts`.

Die Root-Route `/` zeigt nicht angemeldeten Besuchern die Marketing-Landingpage. Angemeldete Leser
werden dort unmittelbar zu ihrer im `location`-Cookie gespeicherten letzten Lesestelle weitergeleitet,
mit Johannes 1 als Fallback. Das Akribos-Logo verlinkt unverändert auf `/` und darf das `location`-Cookie
nicht löschen, damit es auch von Konto- und Verwaltungsseiten zur letzten Lesestelle zurückführt.
`/about` bleibt als direkte Adresse derselben Landingpage erhalten. Weil das Root-Verhalten vom
Session-Cookie abhängt, darf die Antwort nicht öffentlich gecacht werden.

Der Reader zeigt jede Ressource in einer eigenen `.flow-column`. Alle geladenen Kapitel stehen in
`streamChapters`; DOM-Schlüssel sind `book:chapter` beziehungsweise für Verse `book:chapter:verse`.
`flowColumns` enthält die Scrollcontainer in Spaltenreihenfolge. Ein Kapitel vor oder hinter dem
aktuellen wird nahe der Scrollkante nachgeladen.

Die Bibelstellenauswahl im Suchfeld ist auf größeren Bildschirmen zweistufig: Eine Buchwahl zeigt
zunächst nur die kanonischen Kapitel dieses Buchs und darf noch nicht navigieren. Erst die anschließende
Kapitelwahl lädt die Stelle; eine Versauswahl gehört bewusst nicht zu diesem Dialog.

Wichtige Scroll-Invarianten:

- Nur echte Nutzerscrolls dürfen eine Spalte zur Quelle machen und die URL aktualisieren.
  Programmatische Ausrichtung läuft über `suppressProgrammaticFlowScroll(index)`. Die Sperre ist
  zwingend **pro Spalte**: Eine Interaktion darf nur die Sperre ihrer eigenen Spalte aufheben, weil
  verspätete Scroll-Events automatisch ausgerichteter Nebenspalten sonst die Quelle übernehmen.
- `syncFlowColumns()` richtet andere, verknüpfte Spalten am ersten sichtbaren
  `[data-verse-key]` aus. Die Ankerlinie liegt an der Unterkante des oberen Text-Fades, damit URL und
  Suchfeld bereits beim Eintritt eines Verses in den Fade zum nächsten Vers wechseln. Zusammengefasste
  Versbereiche werden über `data-verse-end` berücksichtigt.
- Beim Voranstellen eines Kapitels müssen sowohl `scrollHeight` als auch `scrollTop` unmittelbar
  **vor** der DOM-Mutation (nach dem Fetch) gespeichert werden. So bleibt Touch-Momentum während des
  Fetches erhalten. Browser-Scroll-Anchoring kann `scrollTop` während `tick()` selbst verändern; eine
  Berechnung aus dem nachträglichen Wert kompensiert doppelt und erzeugt Sprünge.
- Die URL wird beim Lesen mit `replaceState` nachgeführt. `reader-location.svelte.ts` koppelt diese
  Position an das Suchfeld, ohne eine Servernavigation auszulösen.
- Nach dem Wechsel oder Hinzufügen einer Ressource navigiert der Reader explizit zu der in
  `readerLocation` sichtbaren Referenz. Die flache `replaceState`-URL allein ändert SvelteKits intern
  geladene Route nicht; ein bloßes Invalidieren würde deshalb wieder das ursprünglich geladene Kapitel
  anzeigen.
- Nach einer echten Reader-Navigation müssen verzögerte Scroll-/Adressleisten-Timer und noch laufende
  Kapitel-Nachladungen verworfen werden; sie dürfen niemals den neuen Kapitelstream oder dessen URL
  verändern. Die Strong-Seitenleiste wird nach History-Navigationen aus `window.location.hash`
  restauriert, weil flache `replaceState`-Änderungen nicht zuverlässig in `page.url` reaktiv werden.
- Jeder Klick auf ein Strong-Wort und jedes explizite Schließen der Strong-Seitenleiste legt mit
  `pushState` einen eigenen History-Eintrag an. Dadurch kann Zurück/Vorwärts jeden einzelnen
  Sidebar-Zustand wiederherstellen; Scroll-Aktionen aktualisieren die URL dagegen weiterhin nur mit
  `replaceState`. Da Zurück/Vorwärts zwischen flachen History-Einträgen keine SvelteKit-Navigation
  auslöst, synchronisiert zusätzlich ein `popstate`-Handler die Seitenleiste mit dem aktuellen Hash.
- Vers 1 hat absichtlich keine sichtbare Versnummer. Die sichtbare `.flow-chapter-number` ist deshalb
  ein Link und öffnet über `onVerseNumberClick()` dasselbe `VerseMenu` für den ersten Vers. Sie darf
  nicht wieder in ein rein dekoratives `span` umgewandelt werden.

Die Kapitelpfeile und der Theme-Schalter im Header bleiben auf normalen Bildschirmen rahmenlos. Eine
mittlere Viewport-Breite darf allein keine kontrastreiche E-Ink-Darstellung aktivieren; Rahmen und
deckender Hintergrund sind ausschließlich für `(update: slow)` beziehungsweise `(monochrome)` gedacht.

Es existiert nur eine `VerseMenu`-Instanz für den ganzen Reader. Ein Klick übergibt Anker, Referenz,
Text und Highlight-Zustand an `openAt()`; so werden nicht hunderte Menüs und Formulare im Fließtext
gerendert. Highlights werden optimistisch in `streamChapters` aktualisiert, Listenmarkierungen im
reaktiven `marks`-Set.

Private Kommentare hängen eindeutig an Benutzer, Vers und Bibelressource (`verse_comments`); pro
Kombination existiert höchstens einer. Sie werden mit den endlos nachgeladenen Kapiteln geladen und
erscheinen innerhalb ihrer `.verse-comment-row` unterhalb des Verses. `CommentToggle.svelte` steht am
Versende, wird nur für einen gespeicherten Kommentar gerendert und blendet diesen ein oder aus. Neue
Reader-Kommentare werden ausschließlich über das `VerseMenu` begonnen. Ein leer gespeicherter
Kommentar wird gelöscht; gespeicherte Kommentare sind nach dem Laden zunächst zugeklappt. Beide
Oberflächen verwenden `CommentBubble.svelte`/`NoteEditor.svelte` und wechseln erst nach einem Klick von
der Lese- in die Editoransicht.
Der gemeinsame `NoteEditor.svelte` speichert mit Strg/Cmd+Enter und meldet Escape über `onCancel` an
die Bubble; bei einem noch leeren Reader-Entwurf entfernt diese Rückmeldung auch die temporäre Ansicht.
Der Editor basiert auf Tiptap/ProseMirror; seine erlaubten Formatierungen müssen mit der Allowlist in
`src/lib/notes/sanitize.ts` synchron bleiben. Gespeicherte Kommentare werden erst bei der Darstellung
über `linkBibleReferences()` mit internen Bibelstellen-Links angereichert, damit ausschließlich das
serverseitig bereinigte Original gespeichert wird. Kommentaranzeige und -editor übernehmen dieselbe
`--reader-font-scale`-Skalierung wie der Bibeltext.

### Zusammenarbeit an Verslisten (issue #129)

Eine Versliste hat genau einen Eigentümer (`verse_lists.user_id`), der sie umbenennen, löschen, den
öffentlichen Teilen-Link umschalten und Mitglieder verwalten darf. Der öffentliche Link (`slug`) bleibt
unverändert bestehen und ist unabhängig von der neuen, E-Mail-basierten Mitgliedschaft: eine Liste kann
beides, nur eines oder keins von beidem haben. Mitgliedschaft läuft über zwei Tabellen, nach demselben
Muster wie `email_verifications`/`password_resets` — nur der Hash des Einladungstokens wird
gespeichert:

- `verse_list_invites`: eine ausstehende Einladung an eine E-Mail-Adresse, 7 Tage gültig, einmal
  verwendbar. `createVerseListInvite()` (`src/lib/server/repositories/verse-list-members.ts`) ersetzt
  eine bereits ausstehende Einladung an dieselbe Adresse durch eine neue, statt eine zweite
  nebenherlaufen zu lassen — wie das erneute Einschalten des Teilen-Links einen neuen `slug` erzeugt.
  Die Landing-Page `/invites/[token]` liest den Token nur lesend (`peekVerseListInvite`), damit
  E-Mail-Client-Prefetching ihn nicht verbraucht; erst ein expliziter Klick löst `acceptVerseListInvite()`
  aus. Diese Funktion verlangt zusätzlich, dass die normalisierte E-Mail-Adresse des angemeldeten Kontos
  mit der eingeladenen Adresse übereinstimmt — der Token allein genügt nicht, falls die Mail
  weitergeleitet wurde oder in einem geteilten Postfach landet.
- `verse_list_members`: eine akzeptierte Mitgliedschaft (Liste, Nutzer, wer eingeladen hat). Der
  Eigentümer selbst steht hier nicht drin; Besitz wird immer direkt über `verse_lists.user_id` geprüft.
  `findListAccess()` ist die einzige Stelle, die "Eigentümer oder Mitglied" gemeinsam prüft, und liefert
  `{ list, isOwner }` oder `undefined` — eine fremde oder nie eingeladene Liste ist damit ebenso
  "nicht gefunden" wie bei einer reinen Eigentümerprüfung.

**Löschregel für Vers-Einträge:** Jedes Mitglied darf Verse hinzufügen (`addVerseToList()`, mit
`addedByUserId`). Beim Entfernen (`removeVerseFromList()`) darf ein Mitglied nur einen selbst
hinzugefügten Vers löschen; der Eigentümer darf jeden Eintrag löschen. Die reine Regel steht als
`canDeleteItem()` in `verse-lists.ts` und wird sowohl serverseitig in der Form Action als auch beim
Laden der Seite (Anzeige des Lösch-Buttons) verwendet — eine einzige Quelle für beide Stellen.
Kommentare kennen dieselbe Ausnahme zugunsten des Eigentümers: `deleteComment()` erlaubt Autor _oder_
Eigentümer, nicht nur den Autor (leichte Moderation, konsistent mit der Vers-Löschregel).

**Kommentare** ersetzen das frühere einzelne `verse_list_items.note_html`-Feld durch echte Threads in
`verse_list_item_comments` (`item_id`, `parent_comment_id` nullable für Antworten, `author_user_id`,
`body_html`). Eine Antwort muss zum selben `item_id` gehören wie ihr `parent_comment_id` —
`addComment()` prüft beides gegen die übergebene `listId`, bevor irgendetwas eingefügt wird, damit
weder eine fremde Liste noch ein anderer Vers-Eintrag über erratene UUIDs adressiert werden kann. Das
Löschen eines Kommentars löscht über den selbstreferenzierenden Fremdschlüssel (`ON DELETE CASCADE`)
auch alle Antworten darunter. Migration `drizzle/0019_fast_venus.sql` fügt die neuen Tabellen sowie
`verse_list_items.added_by_user_id` (zunächst nullable) hinzu und enthält direkt im Anschluss an die
generierte DDL zwei handgeschriebene Backfills (nach demselben Muster wie
`drizzle/0016_normalize_note_divs.sql`): jeder bestehende Eintrag bekommt als `added_by_user_id` den
Listeneigentümer, und jedes nicht-leere `note_html` wird ein Root-Kommentar (`parent_comment_id = null`),
ebenfalls vom Eigentümer verfasst. Migration `drizzle/0020_windy_sasquatch.sql` macht die Spalte danach
`NOT NULL` und löscht `note_html`. Wer an diesem Bereich weiterarbeitet: eine Schema-Änderung, die eine
Spalte gleichzeitig hinzufügt und eine andere entfernt, lässt `drizzle-kit generate` interaktiv nach
Umbenennen-oder-nicht fragen (nicht scriptbar) — deshalb der Zwischenschritt mit einer vorübergehend
nullable Spalte.

**Reaktionen** (`verse_list_item_comment_reactions`) sind auf die 8 GitHub-Issue-Emojis festgelegt
(👍 👎 😄 🎉 😕 ❤️ 🚀 👀, `src/lib/notes/reactions.ts` — bewusst außerhalb von `src/lib/server/`, damit
sowohl das Schema als auch die client-seitige Reaktionsleiste dieselbe Konstante importieren, ohne
Server-Code ins Client-Bundle zu ziehen). Zusammengesetzter Primärschlüssel
(`comment_id`, `user_id`, `emoji`) macht "erneut mit demselben Emoji reagieren" zu einem Toggle:
`toggleCommentReaction()` löscht die Zeile, falls sie existiert, sonst fügt sie sie ein.

**Sichtbarkeit personenbezogener Daten:** Wer wen eingeladen hat und wer welchen Vers/Kommentar verfasst
hat, wird Eigentümer und Mitgliedern gegenseitig mit Namen (Fallback: E-Mail-Adresse) angezeigt — sie
kennen sich bereits über die Einladung. Der anonyme, öffentliche `/l/{slug}`-Link bekommt dagegen nie
eine rohe E-Mail-Adresse zu sehen: `loadVerseListItems()`/`loadCommentsForList()` ersetzen einen
fehlenden Anzeigenamen dort durch einen generischen Platzhalter (`redactEmail`-Option bzw.
`currentUserId === null`). Ausstehende Einladungen (mit E-Mail-Adresse) werden im `load()` von
`/lists/[id]` nur an den Eigentümer ausgeliefert, nicht an andere Mitglieder — SvelteKit schickt die
komplette `load()`-Rückgabe zum Browser, unabhängig davon, was die Vorlage tatsächlich rendert.

Die Vers-Menü-Schnellwahl im Reader (`VerseMenu.svelte`, `markedVersesByList()`, `addToList`/
`removeFromList` in `[...reference]/+page.server.ts`) funktioniert bewusst sowohl für eigene als auch
für geteilte Listen (`findListAccess()` statt reiner Eigentümerprüfung); ein Vers dort abzuhaken legt
ihn mit `addedByUserId` des angemeldeten Kontos an.

Der Fremdschlüssel von `verse_comments.resource_id` ist absichtlich `ON DELETE RESTRICT`. Bibeln
werden ausschließlich über `deleteResource()` mit einer anderen Bibel als Pflichtziel entfernt; die
Kommentare werden in derselben Transaktion verschoben. Existiert am Ziel bereits ein Kommentar für
dieselbe Person und Bibelstelle, bleiben beide Texte mit einem Herkunftshinweis zusammen erhalten.

Ressourcen besitzen getrennte optionale Darstellungstitel: `coverTitle`, `tabTitle`,
`selectionTitle` und `selectionSubtitle`. Bei älteren/importierten Datensätzen fallen diese in
`listResources()` auf `abbrev` beziehungsweise `name` zurück. `sortOrder` bestimmt die Reihenfolge
innerhalb der Kategorien und damit auch in der Werkauswahl; die Administration normalisiert sie beim
Verschieben in Zehnerschritten.

Die Ressourcenadministration ist bewusst eine Master-Detail-Ansicht: Die linke, höhenbegrenzte Liste
filtert clientseitig nach Kategorie und Suchtext, rechts wird immer nur eine Ressource bearbeitet. Die
Auswahl steht als `resource`-Queryparameter in der URL, damit sie nach Speichern oder Sortieren erhalten
bleibt. Auf schmalen Bildschirmen scrollt die Auswahl zum einzelnen Editor statt alle Formulare
untereinander zu rendern.

## Daten, Suche und Sicherheit

Die kanonischen 66 Bücher und Referenzregeln liegen in Code unter `src/lib/bible/`. `verses.segments`
enthält die Darstellung, `verses.text` die Suche. Strong-Wörter sind zusätzlich normalisiert in
`verse_words`; Statistiken und Suchbegriffe werden materialisiert und nach Imports aktualisiert.

Mehrere Lexika können dieselbe Strong-Nummer abdecken (`lexicon_entries` hat einen zusammengesetzten
Schlüssel aus `resourceId` und `strong`); `loadStrongEntry()` zeigt davon nur das mit der niedrigsten
`resources.sortOrder`, ohne die anderen zu verschmelzen. Griechische Strong-Nummern reichen bis 6020,
nicht bis zum eigentlichen Ende des Wörterbuchs (5624): Gerhard Kautz' deutsches Lexikon
(`data/stronggreek_de_kautz.xml`, siehe `docs/importing.md`) nummeriert seinen Anhang mit
Synonymgruppen 5801-6020 durch.

Öffentliche Seiten dürfen CDN-Caching verwenden; personalisierte Reader-Seiten sind `private,
no-store`. Form Actions und APIs müssen Authentifizierung und Besitz serverseitig prüfen. Bestehende
Parser-/Sanitizer-Grenzen nicht durch `{@html}` umgehen; die wenigen erlaubten HTML-Stellen sind für
bereits bereinigte Importformate dokumentiert.

## Teststrategie

Domänenlogik wird nahe dem Modul mit Vitest getestet (`*.spec.ts`). Browserinteraktion, Scrollen,
Navigation, Formulare und responsive Zustände gehören in Playwright. Die E2E-Fixture ist bewusst klein;
bei neuen Reader-Fällen zuerst prüfen, welche Bücher/Verse `scripts/seed.ts` tatsächlich enthält.
Regressionstests sollen das beobachtbare Verhalten prüfen (sichtbarer Anker, Menürolle, URL), nicht nur
interne Variablennamen.
