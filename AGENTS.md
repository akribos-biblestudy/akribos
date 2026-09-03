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

Der Logos-artige Arbeitsbereich wird als `ReaderWorkspace` in `src/lib/reader/workspace.ts` modelliert:
Eine von acht festen Anordnungen enthält höchstens vier sichtbare Kacheln, jede Kachel beliebig viele
Ressourcen-Tabs und genau einen aktiven Tab. Leere Kacheln sind erlaubt. Beim Wechsel auf weniger
Kacheln werden alle Tabs der entfallenden Kacheln in die letzte verbleibende übernommen; beim Erweitern
werden zuerst inaktive Tabs verteilt. Kein Layoutwechsel darf einen Tab schließen. Die Layoutgrößen
werden je Anordnung separat gespeichert. `MAX_READER_TABS` ist ausschließlich eine Missbrauchsgrenze,
keine bewusst sichtbare Produktgrenze.

Das vollständige Workspace-JSON liegt für Konten in `users.reader_workspace`, für Gäste kompakt und
Base64url-kodiert im Cookie `reader-workspace`. Bei Konten ist die Datenbankkopie maßgeblich und folgt
dem Nutzer geräteübergreifend. `reader_columns` und das alte `columns`-Cookie bleiben eine auf fünf
eindeutige Ressourcen begrenzte Kompatibilitätsprojektion für Suche und ältere Clients; sie dürfen den
Workspace nach dessen erster Migration nicht wieder überschreiben. Eine bestehende Auswahl wird
verlustfrei migriert: höchstens vier Spalten werden Kacheln, eine alte fünfte Spalte wird ein weiterer
Tab in der vierten Kachel.

Jede aktive Ressource wird in einer eigenen `.flow-column` innerhalb ihrer `.reader-tile` gerendert.
Jeder aktive Tab besitzt in `columnStreams` seinen eigenen Kapitelstream; die REST-Nachladung verlangt
deshalb immer `?resource=<id>` und liefert nie wieder einen globalen Mehrspaltenstrom. DOM-Schlüssel sind
`book:chapter` beziehungsweise für Verse `book:chapter:verse`. `flowColumns` enthält nur die
Scrollcontainer der aktiven (nicht leeren) Kacheln in Serverreihenfolge. Ein Kapitel vor oder hinter dem
jeweiligen Tab wird nahe der Scrollkante nachgeladen. Auf schmalen Bildschirmen bleibt die
Desktop-Anordnung gespeichert, aber es ist über die mobile Kachelauswahl immer nur eine Kachel sichtbar;
deren Ressourcen-Tabs bleiben innerhalb der Kachel bedienbar.

Die Kopplung gehört zum einzelnen Tab, nicht zur Kachel. Erlaubt sind `A` bis `E` oder `null` für
unabhängiges Scrollen. Nur gerade aktive Tabs mit demselben Buchstaben synchronisieren einander. Beim
Aktivieren oder Verschieben behält ein Tab sein Link-Set; neue Tabs erben das Set des zuvor aktiven Tabs
(beziehungsweise `A` in einer leeren Kachel), damit die bisher standardmäßig gekoppelte Leseansicht
erhalten bleibt.

Jeder Tab besitzt außerdem eine eigene `reference`. Der zuletzt fokussierte Tab bestimmt die kanonische
Reader-URL; Aktivieren stellt die gespeicherte Stelle des Tabs wieder her. Ein Buchstaben-Link-Set gleicht
die Referenz **aller** Tabs dieser Gruppe an, auch der inaktiven. Dadurch kann ein später aktivierter Tab
keine veraltete Stelle in die sichtbare Gruppe zurücktragen. Tabs mit anderem Buchstaben oder ohne
Link-Set behalten ihre eigene Stelle. Aktionen, die aus einer konkreten Kachel kommen (insbesondere
Tab-Aktivierung und Strong-Klick), müssen den Quell-Tab und dessen sichtbare Referenz explizit mitsenden;
die kanonische URL beziehungsweise `focusedTileId` darf dafür nie ersatzweise verwendet werden, weil sie
während clientseitiger Interaktionen kurzzeitig zu einer anderen Gruppe gehören kann.

Das kompakte Feld in `ReaderTabToolbar.svelte` ist Stellenwahl und ressourcenbezogene Suche zugleich:
Eine Bibelstelle navigiert den Tab, Wörter und Strong-Nummern öffnen dagegen keine andere Route, sondern
eine Ergebnisansicht innerhalb genau dieses Tabs. `tabSearches` in der Reader-Seite hält diesen
vorübergehenden Zustand nach Tab-ID; der zugrunde liegende Kapitelstream und sein Scrollstand bleiben
dabei im DOM erhalten. `/api/reader/search` verlangt immer eine öffentliche Reader-Ressource und liefert
für Bibeln entweder Volltexttreffer oder Strong-Vorkommen, für Kommentare Treffer aus
`commentary_entries`. Wort- und Strong-Suchen liefern zusätzlich die ungefilterte Buchverteilung;
Strong-Suchen außerdem Statistik und Übersetzungsformen des aktuellen Bibelwerks. `book` filtert nur
die Trefferliste und nicht das Diagramm. Ressourcen ohne indexierbaren Fließtext zeigen einen erklärten
Leerzustand. Ein Treffer setzt die Referenz dieses Tabs und kehrt dort zum Lesetext zurück; andere Tabs,
Layout und URL bleiben während der bloßen Suche unangetastet. Der frühere Buch-/Kapitel-Dialog ist
entfernt. Nur Eingaben mit einer Ziffer werden als mögliche Bibelstellen interpretiert; ein bloßer
Buchname wie `Judas` (ebenso eine Anführungszeichen-Suche) bleibt deshalb eine Textsuche im Werk.

Lexika sind normale Reader-Ressourcen und können mehrfach als eigenständige Tabs geöffnet werden. Ihr
tab-eigener `lookup` wird neben `reference` im Workspace gespeichert und von `findLexiconEntry()` immer
innerhalb genau der Tab-Ressource aufgelöst: Strong-Nummern exakt, Lemma/Umschrift erst exakt und dann
als Präfix. Lexikon-Tabs nehmen nicht am Kapitel-Endless-Scroll teil. Ein Klick auf ein Strong-Wort öffnet
die vollständige Wortstudie im Lexikon-Tab; eine separate Seitenleiste existiert nicht mehr. Der Tab
speichert Quellübersetzung, Klickstelle und Wort als `studyContext`. Grammatik wird unabhängig vom
gewählten Lexikon aus einem öffentlichen hebräischen beziehungsweise griechischen Ausgangstext ergänzt;
bei mehreren Quellen gewinnt ein tatsächlich vorhandener Morphologiecode und danach `sortOrder`;
Vorkommen, Buchverteilung und „Übersetzt als“ stammen dagegen exakt aus der Quellübersetzung, die auch im
Toolbar-Badge genannt wird. Existiert in demselben nicht-leeren A–E-Link-Set schon ein Lexikon-Tab, wird
der erste davon aktualisiert und aktiviert;
andernfalls wird das erste passend sortierte Lexikon bevorzugt in einer anderen sichtbaren Kachel
desselben Sets ergänzt, ersatzweise in einer leeren beziehungsweise der Quellkachel. Bei `linkSet = null`
gilt nur die Quellkachel als Gruppe. Mehrere Lexika werden nie zu einem Eintrag verschmolzen.

Wichtige Scroll-Invarianten:

- Nur echte Nutzerscrolls dürfen eine Spalte zur Quelle machen und die URL aktualisieren.
  Programmatische Ausrichtung läuft über `suppressProgrammaticFlowScroll(index)`. Die Sperre ist
  zwingend **pro Spalte**: Eine Interaktion darf nur die Sperre ihrer eigenen Spalte aufheben, weil
  verspätete Scroll-Events automatisch ausgerichteter Nebenspalten sonst die Quelle übernehmen.
- `syncFlowColumns()` richtet ausschließlich andere aktive Tabs desselben Link-Sets am ersten sichtbaren
  `[data-verse-key]` aus. Die Ankerlinie liegt an der Unterkante des oberen Text-Fades, damit URL und
  Suchfeld nach einem echten Nutzerscroll bereits beim Eintritt eines Verses in den Fade zum nächsten
  Vers wechseln; rein programmatische Ausrichtungen dürfen eine explizite Kapitelreferenz dagegen nicht
  nachträglich um Vers 1 ergänzen. Zusammengefasste
  Versbereiche werden über `data-verse-end` berücksichtigt. Die anschließend persistierte Referenz wird
  im Workspace zusätzlich auf die inaktiven Tabs dieses Link-Sets übertragen. Auch ein nur zur
  Ausrichtung aufgerufener Sync muss `visibleReferences[sourceIndex]` wieder auf den gefundenen
  Versanker setzen; `updateVisibleChapter()` allein würde die Versangabe entfernen und im Tab-Feld
  fälschlich nur das Kapitel anzeigen.
- Beim Voranstellen eines Kapitels müssen sowohl `scrollHeight` als auch `scrollTop` unmittelbar
  **vor** der DOM-Mutation (nach dem Fetch) gespeichert werden. So bleibt Touch-Momentum während des
  Fetches erhalten. Browser-Scroll-Anchoring kann `scrollTop` während `tick()` selbst verändern; eine
  Berechnung aus dem nachträglichen Wert kompensiert doppelt und erzeugt Sprünge.
- Die URL wird beim Lesen mit `replaceState` nachgeführt. `visibleReferences` koppelt diese Position an
  das Feld des jeweiligen Tabs, ohne eine Servernavigation auszulösen; nur die fokussierte Kachel darf
  dabei die kanonische URL bestimmen.
- Nach dem Aktivieren, Verschieben oder Hinzufügen eines Ressourcen-Tabs navigiert der Reader explizit
  zur gespeicherten Referenz des Ziel-Tabs. Die flache `replaceState`-URL allein ändert SvelteKits intern
  geladene Route nicht; ein bloßes Invalidieren würde deshalb wieder das ursprünglich geladene Kapitel
  anzeigen. `activateTab` liefert seine Ziel-URL serverseitig zurück, damit kein veralteter Client-Prop
  eine zwischenzeitlich gespeicherte Tab-Referenz überschreiben kann. Das Aktivierungsformular sendet
  außerdem `currentReference` aus `readerLocation`: So wird auch ein noch innerhalb des 200-ms-Debounce
  liegender Scrollstand zuerst auf alle Tabs seines Link-Sets übertragen, bevor das Ziel aktiviert wird.
- Nach einer echten Reader-Navigation müssen verzögerte Scroll-/Adressleisten-Timer und noch laufende
  Kapitel-Nachladungen verworfen werden; sie dürfen niemals den neuen Kapitelstream oder dessen URL
  verändern. Eine Navigation auf ein Kapitel ohne Vers setzt zusätzlich jede wiederverwendete
  `.flow-column` vor und nach dem Austausch des Kapitelstreams programmatisch auf `scrollTop = 0`;
  nur das äußere Fenster zurückzusetzen lässt sonst den Scrollstand der alten Stelle bestehen.
- Vers 1 hat absichtlich keine sichtbare Versnummer. Die sichtbare `.flow-chapter-number` ist deshalb
  ein Link und öffnet über `onVerseNumberClick()` dasselbe `VerseMenu` für den ersten Vers. Sie darf
  nicht wieder in ein rein dekoratives `span` umgewandelt werden.

Die globalen Sucheingabe, Kapitelüberschrift und Kapitelpfeile sind im Reader bewusst entfernt; der
globale Header enthält dort nur die dezente Layoutwahl und Ansichts-/Kontofunktionen. Der Theme-Schalter
bleibt auf normalen Bildschirmen rahmenlos. Eine mittlere Viewport-Breite darf allein keine kontrastreiche
E-Ink-Darstellung aktivieren; Rahmen und deckender Hintergrund sind ausschließlich für `(update: slow)`
beziehungsweise `(monochrome)` gedacht.

Es existiert nur eine `VerseMenu`-Instanz für den ganzen Reader. Ein Klick übergibt Anker, Referenz,
Text und Highlight-Zustand an `openAt()`; so werden nicht hunderte Menüs und Formulare im Fließtext
gerendert. Highlights werden optimistisch in allen passenden Einträgen von `columnStreams`
aktualisiert, Listenmarkierungen im reaktiven `marks`-Set.

`Menu.svelte` nutzt die Popover-API nur dort, wo der Browser sie hat, und fällt sonst auf ein
einfaches `position: fixed`-Element mit eigener Dismiss-Behandlung zurück: Die eingebauten Browser
von E-Ink-Readern sind älter als das Chrome 114, das `popover` gebracht hat. Deshalb darf JavaScript
dort nicht `matches(':popover-open')` fragen — ein unbekanntes Pseudo wirft einen `SyntaxError`, und
das Menü öffnet gar nicht — und die Sichtbarkeit darf nicht an `:popover-open` hängen, weil eine
Regel mit unparsbarem Selektor komplett entfällt und damit jedes Menü dauerhaft offen im Layout
stünde. Sichtbar macht die Klasse `open`, die `show()` synchron setzt, weil `place()` und `items()`
ein Menü mit `display: none` weder messen noch darin einen Fokus finden können.

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
Auf Touch-Geräten darf das Auswahlmenü weder den Fokus übernehmen noch die native Browserauswahl
löschen: Die Auswahlgriffe bleiben dadurch verstellbar, und jedes weitere `selectionchange`
aktualisiert denselben Menüzustand auf den verlängerten oder verkürzten Wortbereich. Bei einer
Mausauswahl darf `selectionchange` das Menü dagegen nie öffnen; erst `mouseup` signalisiert, dass die
Auswahl abgeschlossen ist. Die Unterscheidung folgt dem tatsächlichen `PointerEvent.pointerType`,
nicht allein einem Media Query, damit auch Touchscreen-Desktops mit Maus korrekt funktionieren.

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
auch alle Antworten darunter. Migration `drizzle/0021_warm_slayback.sql` fügt die neuen
Tabellen sowie `verse_list_items.added_by_user_id` (zunächst nullable) hinzu und enthält direkt im
Anschluss an die generierte DDL zwei handgeschriebene Backfills (nach demselben Muster wie
`drizzle/0016_normalize_note_divs.sql`): jeder bestehende Eintrag bekommt als `added_by_user_id` den
Listeneigentümer, und jedes nicht-leere `note_html` wird ein Root-Kommentar (`parent_comment_id = null`),
ebenfalls vom Eigentümer verfasst. Migration `drizzle/0022_demonic_photon.sql` macht die Spalte danach
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
Verschieben in Zehnerschritten. Im Reader-Tab selbst steht bewusst ausschließlich `abbrev`; die
ausführliche Werkbezeichnung gehört in Auswahl und Info-Menü. `licenseHtml`/`usageNotesHtml` belegen
keinen dauerhaften Footer mehr, sondern sind über das Info-Symbol der jeweiligen Tab-Werkzeugleiste
erreichbar.

Die Ressourcenadministration ist bewusst eine Master-Detail-Ansicht: Die linke, höhenbegrenzte Liste
filtert clientseitig nach Kategorie und Suchtext, rechts wird immer nur eine Ressource bearbeitet. Die
Auswahl steht als `resource`-Queryparameter in der URL, damit sie nach Speichern oder Sortieren erhalten
bleibt. Auf schmalen Bildschirmen scrollt die Auswahl zum einzelnen Editor statt alle Formulare
untereinander zu rendern.

Die Produkt-Tour (`ProductTour.svelte`, Schritte in `src/lib/tour/steps.ts`, Laufzustand in
`tour-state.svelte.ts`) ist eine schlanke Eigenimplementierung (Spotlight per CSS-`box-shadow`, kein
Tour-Framework) und wird von `SiteHeader` ausschließlich gemountet, solange `readerPreferences` gesetzt
ist — die erklärten Ziele (Chooser, Wortstudie, Ressourcen-Tab, Link-Set, `.flow-chapter-number`) gibt es
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

SWORD-Module werden über `diatheke` **buchweise** gelesen (`-k <osisId>`). Das angefragte Buch ist
damit die maßgebliche Zuordnung, nicht der Buchname in der Ausgabe: den schreibt SWORD in der Locale,
die es gerade auflöst, standardmäßig mit römischen Zahlen (`II Thessalonians`, `Revelation of John`).
`parseDiathekeOutput()` bekommt das erwartete Buch deshalb übergeben. Wo ein Name doch aufgelöst
werden muss, gewinnt die **längste** passende Wortfolge — die einwortige Endung eines nummerierten
Buchs ist eine historische Kurzform eines anderen (`Samuel` bedeutet 1.Samuel), sodass die kürzeste
Übereinstimmung `II Samuel` unter 1.Samuel ablegen würde.

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
