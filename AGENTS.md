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

Die Root-Route `/` leitet jeden Besucher unmittelbar zum Bibeltext weiter, nicht mehr nur angemeldete.
Angemeldete Leser landen an ihrer im `location`-Cookie gespeicherten letzten Lesestelle, alle anderen
(auch nicht angemeldete Besucher) an Johannes 1 als Fallback. Das Akribos-Logo verlinkt unverändert auf
`/` und darf das `location`-Cookie nicht löschen, damit es auch von Konto- und Verwaltungsseiten zur
letzten Lesestelle zurückführt. Die Marketing-Landingpage wird auf `/` nicht mehr angezeigt, bleibt aber
unter `/about` unverändert erreichbar. Weil das Root-Verhalten vom Session-Cookie abhängt, darf die
Antwort nicht öffentlich gecacht werden.

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

Eine Markierung (`verse_highlights`) gilt entweder für den ganzen Vers und damit für alle
Übersetzungen (`resource_id`, `start_word`, `end_word` alle `NULL` — das ist auch die Form, in der
jede Markierung aus der Zeit vor dieser Unterscheidung existiert und weiterhin funktioniert), oder für
einen Wortbereich innerhalb genau einer Übersetzung (`resource_id` gesetzt, `start_word`/`end_word`
inklusiv und 0-basiert). Zwei sich überlappende, aber nicht exakt gleiche Bereiche sind unabhängige
Zeilen und malen sich beim Rendern einfach übereinander; es findet keine Zusammenführung statt. Ein
Wort ist dabei kein eigenes Segment, sondern ein Lauf ohne Leerzeichen in der von `segmentsToText()`
erzeugten Reihenfolge — `countVerseWords()`/`highlightSegment()` in `src/lib/bible/segments.ts` zählen
und färben danach, damit ein direkt angehängtes Satzzeichen zum selben Wort wie das Tag-Wort davor
zählt. `VerseMenu.openForSelection()` öffnet dieselbe Menü-Instanz für eine Wortauswahl statt für einen
Versnummer-Klick; sie zeigt dann nur die Farbfelder, skaliert auf genau diesen Bereich. Deckt die
Auswahl den kompletten Vers ab, behandelt der Reader sie wie den bisherigen Versnummer-Klick
(`resource_id` bleibt `NULL`) — das entscheidet sowohl der Client (`+page.svelte`) als auch, erneut,
der Server in `setVerseHighlight()`, der eine Auswahl nie ungeprüft persistiert. `VerseText.svelte`
erhält dafür optional `highlights` (Bereiche mit Farbe) und `wordOffset`; letzteres hält den
Wortindex über `splitVerseLead()`s Aufteilung in Vers-Anfang und -Rest hinweg konsistent.

Private Kommentare hängen eindeutig an Benutzer, Vers und Bibelressource (`verse_comments`); pro
Kombination existiert höchstens einer. Sie werden mit den endlos nachgeladenen Kapiteln geladen und
erscheinen innerhalb ihrer `.verse-comment-row` unterhalb des Verses. `CommentToggle.svelte` steht am
Versende, wird nur für einen gespeicherten Kommentar gerendert und blendet diesen ein oder aus. Neue
Reader-Kommentare werden ausschließlich über das `VerseMenu` begonnen. Ein leer gespeicherter
Kommentar wird gelöscht; gespeicherte Kommentare sind nach dem Laden zunächst zugeklappt. Kommentare
an Verslisteneinträgen bleiben dagegen im Kontext
ihrer Liste in `verse_list_items.note_html`; beide Oberflächen verwenden `CommentBubble.svelte` und
wechseln erst nach einem Klick von der Lese- in die Editoransicht.
Der gemeinsame `NoteEditor.svelte` speichert mit Strg/Cmd+Enter und meldet Escape über `onCancel` an
die Bubble; bei einem noch leeren Reader-Entwurf entfernt diese Rückmeldung auch die temporäre Ansicht.
Der Editor basiert auf Tiptap/ProseMirror; seine erlaubten Formatierungen müssen mit der Allowlist in
`src/lib/notes/sanitize.ts` synchron bleiben. Gespeicherte Kommentare werden erst bei der Darstellung
über `linkBibleReferences()` mit internen Bibelstellen-Links angereichert, damit ausschließlich das
serverseitig bereinigte Original gespeichert wird. Kommentaranzeige und -editor übernehmen dieselbe
`--reader-font-scale`-Skalierung wie der Bibeltext.

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

Die Produkt-Tour (`ProductTour.svelte`, Schritte in `src/lib/tour/steps.ts`, Laufzustand in
`tour-state.svelte.ts`) ist eine schlanke Eigenimplementierung (Spotlight per CSS-`box-shadow`, kein
Tour-Framework) und wird von `SiteHeader` ausschließlich gemountet, solange `readerPreferences` gesetzt
ist — die erklärten Ziele (Chooser, Wortstudie, Spaltenkopf, Verknüpfung, `.flow-chapter-number`) gibt es
nur im Reader. Der neue Menüpunkt „Produkt-Tour" erscheint deshalb ebenfalls nur dort. Ein Schritt, dessen
Zielelement fehlt oder unsichtbar ist, wird übersprungen statt auf nichts zu zeigen. Fortschritt wird als
"erledigt" verstanden, sobald die Tour beendet oder aktiv geschlossen wurde: nicht angemeldet über das
Cookie `tour-guest-done` (wie `theme`/`reader-font-scale`, nicht `httpOnly`), angemeldet über
`users.tour_completed_at` (per `POST /api/tour`, analog zu `/api/theme`) — geräteübergreifend. Meldet sich
jemand an, der die Tour bereits als Gast beendet hat, zeigt die erste Ausführung im Reader nur noch die
zusätzlichen, angemeldeten Schritte (`MEMBER_TOUR_STEPS`); sonst die vollständige Sequenz. Da Login und
Registrierung standardmäßig auf `/account` weiterleiten, nicht in den Reader, erscheint die Tour für
diese Fälle beim nächsten Reader-Besuch automatisch, nicht zwingend unmittelbar nach dem Einloggen.

Das Benutzer-Menü (`/account`) zeigt seine Abschnitte (Profil & Sicherheit, Verslisten & Kommentare,
Darstellung) ebenfalls ohne eigene Server-Navigation, hält den aktiven Abschnitt aber im
`tab`-Queryparameter statt in reinem lokalem State: `activeSection` ist von `page.url.searchParams`
abgeleitet, ein Klick ruft `goto()` mit `replaceState: false` auf. Dadurch bekommt jeder Tabwechsel
einen echten Browser-History-Eintrag (Vor/Zurück wechselt zwischen Abschnitten) und ein Neuladen zeigt
denselben Abschnitt wieder, ohne dass das Server-Load der Seite den `tab`-Parameter lesen muss. Der
Standardabschnitt (`profileSecurity`) führt keinen `tab`-Parameter in der URL; Links auf einen
bestimmten Abschnitt nennen ihn deshalb explizit, z. B. `/account?tab=lists`.

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
