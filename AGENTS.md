# Akribos – Arbeitsnotizen für Agents

Diese Datei ist die dauerhafte Orientierung für Änderungen in diesem Repository. Sie muss bei jeder
Architekturänderung und bei neuen, nicht offensichtlichen Invarianten im selben Change aktualisiert
werden. Ausführlichere Hintergrundtexte liegen in `docs/architecture.md`, `docs/importing.md`,
`docs/operations.md` und `docs/unified-notes.md`.

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
letzten Lesestelle zurückführt. Das `location`-Cookie enthält auch die genaue Versposition. Echte
Nutzerscrolls schreiben sie synchron vor dem URL-Debounce, damit sofortiges Verlassen des Readers
die letzte Stelle erhält; verspätete Antworten früherer Scroll-Aktionen dürfen nach einer Navigation
die URL nicht mehr verändern. Die Marketing-Landingpage wird auf `/` nicht mehr angezeigt, bleibt aber
unter `/about` unverändert erreichbar. Weil das Root-Verhalten vom Session-Cookie abhängt, darf die
Antwort nicht öffentlich gecacht werden.

Der Logos-artige Arbeitsbereich wird als `ReaderWorkspace` in `src/lib/reader/workspace.ts` modelliert:
Eine von acht festen Anordnungen enthält höchstens vier sichtbare Kacheln, jede Kachel beliebig viele
Ressourcen-Tabs und genau einen aktiven Tab. Leere Kacheln sind erlaubt. Beim Wechsel auf weniger
Kacheln werden alle Tabs der entfallenden Kacheln in die letzte verbleibende übernommen; beim Erweitern
werden zuerst inaktive Tabs verteilt. Kein Layoutwechsel darf einen Tab schließen. Die Layoutgrößen
werden je Anordnung separat gespeichert. `MAX_READER_TABS` ist ausschließlich eine Missbrauchsgrenze,
keine bewusst sichtbare Produktgrenze.

Ohne gespeicherten Workspace und ohne migrierbare alte Spaltenauswahl startet der Reader dreispaltig:
erste Bibel, erster Kommentar und erstes Lexikon gemäß `sortOrder`, alle in Tabgruppe A. Fehlt eine
dieser Ressourcenkategorien, werden nur die vorhandenen Standardressourcen geöffnet. Ein vorhandener
Workspace beziehungsweise eine alte `columns`-/`reader_columns`-Auswahl hat immer Vorrang vor diesem
Standard.

Das vollständige Workspace-JSON liegt für Konten in `users.reader_workspace`, für Gäste kompakt und
Base64url-kodiert im Cookie `reader-workspace`. Bei Konten ist die Datenbankkopie maßgeblich und folgt
dem Nutzer geräteübergreifend. `reader_columns` und das alte `columns`-Cookie bleiben eine auf fünf
eindeutige Ressourcen begrenzte Kompatibilitätsprojektion für Suche und ältere Clients; sie dürfen den
Workspace nach dessen erster Migration nicht wieder überschreiben. Eine bestehende Auswahl wird
verlustfrei migriert: höchstens vier Spalten werden Kacheln, eine alte fünfte Spalte wird ein weiterer
Tab in der vierten Kachel.

Benannte Arbeitsbereiche liegen in `saved_reader_workspaces`: kanonischer Reader-URL-Zustand
inklusive Suchen/Notizfiltern plus Trennergrößen. Genau ein Eintrag je Konto ist aktiv (`is_active`,
partieller eindeutiger Index); bei der ersten Nutzung wird der bisherige Konto-/Gerätestand unter
„Standard“ übernommen, niemals eine fremde URL-Ansicht. Das Header-Menü liefert nur eigene Namen, IDs,
Verwaltungsrevisionen und Aktivstatus und hebt den aktiven Eintrag hervor. Neue Arbeitsbereiche kopieren
die aktuelle Ansicht und werden anschließend geöffnet. Die aktuelle Ansicht wird über einen pro
Root-Layout erzeugten Svelte-Kontext aus sichtbaren Referenzen und Suchen erfasst; bei verzögertem
Scrollen gewinnt die tatsächlich fokussierte Quellkachel.

Reader-Mutationen schreiben `users.reader_workspace` und den aktiven benannten Stand atomar unter
Sperre der Nutzerzeile. Die Action trägt `workspaceId` nur in ihrer Anfrage, nicht in geteilten URLs;
Aktiv-ID und vorheriger semantischer Zustand werden vor dem Schreiben erneut geprüft. So kann eine
verspätete Anfrage den inzwischen geöffneten anderen Arbeitsbereich nicht überschreiben. Suchen und
Sidecar-Filter speichern über den gleichfalls geschützten `/api/reader/workspaces/[id]/view`-Endpunkt.
Der aktuelle flache URL-Zustand steht zusätzlich in `page.state.readerState`, damit nachfolgende
Aktionen auch vor einer Servernavigation aktuelle Suchen und Referenzen übernehmen. Vor dem Wechsel
werden ausstehende Lese-/Suchänderungen abgewartet. Fremde URL-Zweige bleiben unabhängig und dürfen den
aktiven Stand weiterhin nicht überschreiben. Autosave ändert nicht die Verwaltungsrevision; Umbenennen
und Löschen verlangen diese weiterhin. Der aktive Arbeitsbereich lässt sich erst nach dem Wechsel zu
einem anderen löschen. Namen sind pro Konto eindeutig; höchstens 100 Einträge sind erlaubt.

`/workspaces/[id]` ist ein schreibfreier Öffnungs-GET. Erst nach dieser Navigation (und damit nach dem
Flush ausstehender Dokumentänderungen) aktiviert eine Form Action den Eintrag und übernimmt dessen
Stand atomar als Konto-Arbeitsbereich. Vorladen verändert keine Präferenz. Speichern und Öffnen prüfen
Ressourcen erneut gegen die öffentlichen, fertigen Werke; weggefallene Tabs und Kontexte werden beim
Öffnen bereinigt und bei der nächsten Änderung fortgeschrieben.
Das Wiederherstellen offener Tab-Suchen lädt nur deren Ergebnisse und schreibt die bereits
kanonisierte URL nicht erneut: Vor der Initialisierung der Kapitelstreams wären Fokus und sichtbare
Referenzen sonst noch unvollständig und könnten die gerade geöffnete Momentaufnahme verändern.

Die aktuelle Reader-Adresse trägt zusätzlich eine lesbare Momentaufnahme aus wiederholbaren Parametern
von `src/lib/reader/url-state.ts`: `layout`, `tab`, `active`, `focus`, `lookup`, `source`, `sourceRef`,
`word`, `search`, `notesQuery`, `notesTag` und `notesFilter`. Tab-Koordinaten verwenden die Form `Kachel.Tab`, beispielsweise
`tab=1.2:SEEDDE:A:Joh3,16`. Die Parameter enthalten Layout, Kachel-/Tabreihenfolge, aktiven und
fokussierten Tab, die Stelle jedes Tabs, Tabgruppen, Lexikon-Kontext und die gerade sichtbare Tab-Suche.
Nur persönliche Trennergrößen und interne UUIDs bleiben außen vor. Damit stellen Reload,
Browser-Tab-Duplizieren und Linkkopie dieselbe Ansicht wieder her. Eine gültige fremde oder veraltete
URL-Momentaufnahme ist ein unabhängiger Zweig: Schon ihr GET
schreibt nie in Cookie oder Konto; nachfolgende Reader-Aktionen werden nur dauerhaft gespeichert, wenn
der URL-Workspace vor der Aktion noch semantisch dem gespeicherten Workspace entsprach. So kann ein
geteilter Link das persönliche Standardlayout nicht ersetzen. Ein Reader-Aufruf ohne gültige
Workspace-Parameter
startet dagegen bewusst aus dem gespeicherten Workspace, wird kanonisiert und darf ihn fortschreiben.
Alle Reader-Form-Actions und kontextuellen Links müssen diese Parameter mitführen und ihren neuen `readerState`
zurückgeben; Trennergrößen dürfen unabhängig davon als persönliche Präferenz gespeichert werden.

Jede aktive Ressource wird in einer eigenen `.flow-column` innerhalb ihrer `.reader-tile` gerendert.
Jeder aktive Tab besitzt in `columnStreams` seinen eigenen Kapitelstream; die REST-Nachladung verlangt
deshalb immer `?resource=<id>` und liefert nie wieder einen globalen Mehrspaltenstrom. DOM-Schlüssel sind
`book:chapter` beziehungsweise für Verse `book:chapter:verse`. `flowColumns` enthält nur die
Scrollcontainer der aktiven (nicht leeren) Kacheln in Serverreihenfolge. Ein Kapitel vor oder hinter dem
jeweiligen Tab wird nahe der Scrollkante nachgeladen. Bereits geladene Streams, sichtbare Referenzen und
Scrollstände werden clientseitig nach Tab-ID zwischengespeichert: Ein Wechsel in nur einer Kachel darf
unveränderte Bibel-/Kommentarkacheln weder zurücksetzen noch deren Nachlade-API erneut aufrufen; ein
schon zuvor geöffneter Ziel-Tab verwendet ebenfalls seinen Cache, sofern das Zielkapitel darin liegt.
Auf schmalen Bildschirmen bleibt die Desktop-Anordnung gespeichert, wird aber nicht als zusätzliche
Oberflächenhierarchie gezeigt: Alle Ressourcen-Tabs sämtlicher Kacheln erscheinen in einer einzigen
flachen mobilen Tab-Leiste, und die Kachel des gewählten Tabs ist allein sichtbar.

Die Kopplung gehört zum einzelnen Tab, nicht zur Kachel. Erlaubt sind `A` bis `E` oder `null` für
unabhängiges Scrollen. Nur gerade aktive Tabs mit demselben Buchstaben synchronisieren einander. Beim
Aktivieren oder Verschieben behält ein Tab seine Tabgruppe (`linkSet`); neue Tabs erben die Gruppe des
zuvor aktiven Tabs
(beziehungsweise `A` in einer leeren Kachel), damit die bisher standardmäßig gekoppelte Leseansicht
erhalten bleibt.

Jeder Tab besitzt außerdem eine eigene `reference`. Der zuletzt fokussierte Tab bestimmt die kanonische
Reader-Pfadstelle; Aktivieren stellt die gespeicherte Stelle des Tabs wieder her. Eine Buchstaben-Tabgruppe gleicht
die Referenz **aller** Tabs dieser Gruppe an, auch der inaktiven. Dadurch kann ein später aktivierter Tab
keine veraltete Stelle in die sichtbare Gruppe zurücktragen. Tabs mit anderem Buchstaben oder ohne
Tabgruppe behalten ihre eigene Stelle. Wird ein inaktiver Tab aktiviert, dessen Tabgruppe bereits in
einer anderen Kachel sichtbar ist, übernimmt er deren aktuelle sichtbare Stelle; seine eigene zuvor
gespeicherte Stelle darf die sichtbare Gruppe nicht verschieben. Der Client sendet diese Zielstelle
explizit mit, damit das auch vor der verzögerten URL-Persistierung gilt. Aktionen, die aus einer
konkreten Kachel kommen (insbesondere
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
Layout und Pfadstelle bleiben während der bloßen Suche unangetastet, der Suchbegriff wird aber im
`search`-Parameter der URL mitgeführt. Der frühere Buch-/Kapitel-Dialog ist
entfernt. Nur Eingaben mit einer Ziffer werden als mögliche Bibelstellen interpretiert; ein bloßer
Buchname wie `Judas` (ebenso eine Anführungszeichen-Suche) bleibt deshalb eine Textsuche im Werk.

Lexika sind normale Reader-Ressourcen und können mehrfach als eigenständige Tabs geöffnet werden, auch
mehrfach innerhalb derselben Kachel. Dasselbe gilt für Bibeln, Kommentare und Parallelstellen; die
Werkauswahl darf bereits in der Zielkachel geöffnete Ressourcen deshalb nicht ausblenden. Ihr
tab-eigener `lookup` wird neben `reference` im Workspace gespeichert und von `findLexiconEntry()` immer
innerhalb genau der Tab-Ressource aufgelöst: Strong-Nummern exakt, Lemma/Umschrift erst exakt und dann
als Präfix. Lexikon-Tabs nehmen nicht am Kapitel-Endless-Scroll teil. Ein Klick auf ein Strong-Wort öffnet
die vollständige Wortstudie im Lexikon-Tab; eine separate Seitenleiste existiert nicht mehr. Der Tab
speichert Quellübersetzung, Klickstelle und Wort als `studyContext`. Grammatik wird unabhängig vom
gewählten Lexikon aus einem öffentlichen hebräischen beziehungsweise griechischen Ausgangstext ergänzt;
bei mehreren Quellen gewinnt ein tatsächlich vorhandener Morphologiecode und danach `sortOrder`;
Vorkommen, Buchverteilung und „Übersetzt als“ stammen dagegen exakt aus der Quellübersetzung, die auch im
Toolbar-Badge genannt wird. Existiert in derselben nicht-leeren A–E-Tabgruppe schon ein zur
Strong-Sprache passender Lexikon-Tab, wird der erste davon aktualisiert und aktiviert (`H…` verwendet
nur `hbo`, `G…` nur `grc`); ein Lexikon der anderen Sprache wird nie für die Suche wiederverwendet.
Andernfalls wird das erste passend sortierte Lexikon bevorzugt in einer anderen sichtbaren Kachel
desselben Sets ergänzt, ersatzweise in einer leeren beziehungsweise der Quellkachel. Bei `linkSet = null`
gilt nur die Quellkachel als Gruppe. Mehrere Lexika werden nie zu einem Eintrag verschmolzen.

Wichtige Scroll-Invarianten:

- Nur echte Nutzerscrolls dürfen eine Spalte zur Quelle machen und die URL aktualisieren.
  Programmatische Ausrichtung läuft über `suppressProgrammaticFlowScroll(index)`. Die Sperre ist
  zwingend **pro Spalte**: Eine Interaktion darf nur die Sperre ihrer eigenen Spalte aufheben, weil
  verspätete Scroll-Events automatisch ausgerichteter Nebenspalten sonst die Quelle übernehmen.
- `syncFlowColumns()` richtet ausschließlich andere aktive Tabs derselben Tabgruppe am ersten sichtbaren
  `[data-verse-key]` aus. Die Ankerlinie liegt an der Unterkante des oberen Text-Fades, damit URL und
  Suchfeld nach einem echten Nutzerscroll bereits beim Eintritt eines Verses in den Fade zum nächsten
  Vers wechseln; rein programmatische Ausrichtungen dürfen eine explizite Kapitelreferenz dagegen nicht
  nachträglich um Vers 1 ergänzen. Zusammengefasste
  Versbereiche werden über `data-verse-end` berücksichtigt. Die anschließend persistierte Referenz wird
  im Workspace zusätzlich auf die inaktiven Tabs dieser Tabgruppe übertragen. Auch ein nur zur
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
  liegender Scrollstand zuerst auf alle Tabs seiner Tabgruppe übertragen, bevor das Ziel aktiviert wird.
- Nach einer echten Reader-Navigation müssen verzögerte Scroll-/Adressleisten-Timer und noch laufende
  Kapitel-Nachladungen verworfen werden; sie dürfen niemals den neuen Kapitelstream oder dessen URL
  verändern. Eine Navigation auf ein Kapitel ohne Vers setzt zusätzlich jede wiederverwendete
  `.flow-column` vor und nach dem Austausch des Kapitelstreams programmatisch auf `scrollTop = 0`;
  nur das äußere Fenster zurückzusetzen lässt sonst den Scrollstand der alten Stelle bestehen.
- Vers 1 hat absichtlich keine sichtbare Versnummer. Die sichtbare `.flow-chapter-number` ist deshalb
  ein Link und öffnet über `onVerseNumberClick()` dasselbe `VerseMenu` für den ersten Vers. Sie darf
  nicht wieder in ein rein dekoratives `span` umgewandelt werden.

Die globale Sucheingabe ist auf allen Seiten aus der Top Bar entfernt, einschließlich Buch-/Kapitelwahl
und globaler Tastatur-Fokussierung. Im Reader bleiben außerdem die globale Kapitelüberschrift und
Kapitelpfeile entfernt; sein Header enthält nur die dezente Layoutwahl und Ansichts-/Kontofunktionen.
Das Konto-Menü ist mindestens 16 rem breit (am Viewport begrenzt), damit „Notizen & Ausarbeitungen“
einzeilig bleibt. Die Darstellung-Einstellungen zeigen keine Übersicht der offenen Reader-Ressourcen. Der Theme-Schalter
bleibt auf normalen Bildschirmen rahmenlos. Eine mittlere Viewport-Breite darf allein keine kontrastreiche
E-Ink-Darstellung aktivieren; Rahmen und deckender Hintergrund sind ausschließlich für `(update: slow)`
beziehungsweise `(monochrome)` gedacht.

Lexikon-Fließtext verwendet eine kompaktere Grundgröße von `0.95rem` und folgt der persönlichen
Leseschrift-Skalierung. Bibelzitate im Lexikon behalten dieselbe `--reader-text-size` wie der Reader.
Lexikon-Labels, Statistik und Bedienelemente verwenden dagegen feste `rem`-Größen wie die übrige
Oberfläche; sie dürfen die Leseschrift-Skalierung nicht erben oder verschachtelt vervielfachen.

Interaktive Oberflächen-Icons kommen aus `src/lib/components/Icon.svelte`: ein 24er-Raster, runde
Linienenden und einheitlich 1,8 Strichstärke. Auch `ResourceKindIcon.svelte` delegiert dorthin; neue
Bedienelemente dürfen nicht wieder eigene gefüllte SVGs oder Unicode-Ersatzzeichen einführen. Der
Dokumenttitel ist global in `src/routes/+layout.svelte` fest auf
`Akribos - Die Bibel präzise studieren` gesetzt; Unterseiten überschreiben ihn nicht.

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
ein Menü mit `display: none` weder messen noch darin einen Fokus finden können. Unterstützte Popover
laufen bewusst als `manual`: Die gemeinsame Dismiss-Behandlung kann den aktuellen Anker vom
Außenklick ausnehmen, sodass ein zweiter Klick auf denselben Trigger zuverlässig schließt, statt das
Popover beim `pointerdown` zu schließen und mit dem nachfolgenden `click` sofort wieder zu öffnen.

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

`verse_comments` bleibt als Kompatibilitätstabelle und für `GET /api/v1/notes` erhalten, wird im Reader
aber nicht mehr geladen oder als grüne Inline-Bubble dargestellt. Auch die alte Kommentar-Erstellung im
`VerseMenu` ist entfernt; neue persönliche Gedanken sind ausschließlich einheitliche Dokumente. Der
idempotente Legacy-Backfill bleibt zwingend, damit bestehende Kommentare als private Dokumente
auffindbar sind und ein Rollback/API-Client die Quellzeilen weiterhin lesen kann. Stellensammlungen-Kommentare
sind davon unberührt und verwenden weiterhin `NoteEditor.svelte`.

## Einheitliche Notizen und Ausarbeitungen

Der frühere Oberflächenbegriff „Predigten“ heißt „Ausarbeitungen“. Die bestehenden Routen `/sermons`,
API-Werte `kind=sermon` und Tabellenbezeichnungen bleiben kompatibel. `documents.sermon_format` ist
zusätzlich genau eines von `sermon`, `home-group`, `bible-study`, `youth`, `children`, `other`; das Feld
„Format“ zeigt Predigt, Hauskreis, Bibelstunde, Jugendstunde, Kinderstunde oder Sonstiges. Alte und neue
Dokumente starten mit `sermon`. Formatänderungen sind eigentümergeprüft und revisioniert; beim Wechsel
in eine Notiz bleibt das Format als ruhende Metadaten erhalten. Markdown/YAML führt es als
`sermon.format` mit; alte Importe ohne dieses Feld bleiben gültig. Das Kanban-Board filtert mit
`format` zusätzlich nach diesen sechs Formaten. Der URL-Filter kombiniert sich mit Suche, Arbeitsstand,
Reihe und Jahr und bleibt beim Wechsel des Arbeitsstands erhalten; unbekannte Formate werden ignoriert.

Der explizite Typwechsel im Dokumenteditor (`changeKind`) speichert zuerst ausstehende Textänderungen,
prüft Eigentümer und Revision und sperrt dieselbe Dokumentzeile wie die Veröffentlichung. Veröffentlichte
Notizen müssen vor dem Wechsel explizit zurückgezogen werden. ID, Inhalt, Tags und Stellen bleiben
unverändert; Arbeitsstand, Datum, Serie und Durchführungshistorie bleiben bei Notizen als ruhende
Metadaten erhalten und werden beim Rückwechsel wiederverwendet. Autosave darf den Typ weiterhin nicht
ändern. Die Datenbank verlangt nur bei aktiven Ausarbeitungen einen Status, nicht mehr leere Metadaten der Ausarbeitung
bei Notizen. Das globale Menü heißt „Notizen & Ausarbeitungen“.

Die Notizbibliothek kann über `year` nach Erstellungsjahr gefiltert werden. Jahresgrenzen und
Datumsanzeige verwenden einheitlich `Europe/Berlin`; spätere Bearbeitungen ändern die Zuordnung nicht.
Der Jahresfilter wird vor Buchverteilung und Pagination angewendet und bleibt in Filter-, Ansichts-,
Seiten- und Rückkehrlinks erhalten. Die angebotenen Jahre folgen den übrigen Filtern außer dem
Buchfilter; ein ausdrücklich gewähltes Jahr bleibt auch bei leerem Ergebnis auswählbar.
Die Notizbibliothek liefert höchstens 24 Notizkarten je URL-Seite (`page`), nach allen Filtern
einschließlich der abgeleiteten Fließtextstellen. Die Reihenfolge folgt `created_at` absteigend, bei
gleichem Zeitpunkt der stabilen ID absteigend, bereits vor der Seitenauswahl. Bearbeiten ändert die
Position nicht. Karten, Listenansicht und Dokumentdetails zeigen das Erstellungsdatum zusätzlich zum
Änderungsdatum. Ungültige Seitennummern werden begrenzt; Filterlinks
setzen die Seite zurück, Seitenlinks erhalten alle Filter. Nur gekürzte Vorschautexte werden an den
Browser geliefert. Die aus gespeicherten Ankern und sichtbaren Fließtextstellen abgeleitete
Buchverteilung zählt jedes Dokument je Buch höchstens einmal; ihr `book`-Filter lässt die ungefilterte
Verteilung stehen. Sichtbare Fließtextstellen werden beim Schreiben kompakt in
`document_body_reference_indexes` fortgeschrieben; ein idempotenter Startup-Backfill erfasst ältere
Dokumente und läuft ebenso nach der Migration eines wiederhergestellten älteren Backups. Bibliotheks-GETs schreiben weiterhin nicht und laden zunächst nur sortierte IDs und diesen
Index, anschließend vollständige Vorschaufelder ausschließlich für die höchstens 24 Einträge der
aktuellen Seite. `view=cards|list` schaltet URL-stabil zwischen Kachel- und Listenansicht. Die
Schlagworthierarchie startet eingeklappt. Die clientseitige Suche nach Tagpfaden
steht als `tagSearch` in der URL und zeigt Treffer samt Vorfahren automatisch; Leeren stellt den manuellen
Aufklappzustand wieder her. Editorlinks übernehmen die vollständige Bibliotheks-URL als `returnTo`.

Die Oberfläche kennt zwei Schreibbereiche: veröffentlichbare Notizen und Ausarbeitungen. Beide sind private
Arbeitskopien in `documents`; `kind` ist genau `note` oder `sermon`. Eine Veröffentlichung ist ein
Schnappschuss einer Notiz und kein eigener Dokumenttyp.
Jeder Zugriff auf Arbeitskopie, Tags und Stellenanker wird serverseitig mit `user_id` eingegrenzt; eine
erratene UUID ist niemals eine Berechtigung, und auch Administratoren dürfen fremde Entwürfe nicht lesen
oder veröffentlichen. `body_markdown` ist die portable Quelle. `body_html` und `plain_text` werden daraus
gemeinsam über `prepareDocumentBody()` abgeleitet und dürfen nicht einzeln fortgeschrieben werden. Das
interne Autosave-`PATCH /api/documents/[id]` verlangt die aktuelle positive `revision`; jede Mutation
(auch Tags und Stellen) erhöht sie, und veraltete Schreibversuche antworten mit `409 conflict`. Die
Revision ist nur optimistisches Locking, keine abrufbare Versionshistorie.

`document_passages` speichert inklusive, kanonisch sortierte Bereiche, die Kapitel- und Buchgrenzen
überschreiten dürfen. `resource_id IS NULL` bedeutet einen translationsunabhängigen kanonischen Anker;
eine gesetzte ID bindet die Beobachtung an genau diese öffentliche, fertige Bibel. Reader und Bibliothek
suchen per Intervallüberschneidung (`start <= queryEnd AND end >= queryStart`), nicht nur nach gleichen
Endpunkten. Beim Löschen einer Bibel verschiebt `deleteResource()` im selben Transaktionsblock sowohl
`verse_comments` als auch alle translationsspezifischen Dokumentanker auf die Pflicht-Ersatzbibel und
erhöht die betroffenen Dokumentrevisionen genau einmal. Das Ziel muss selbst eine öffentliche, fertige
Bibel sein; bereits dort vorhandene identische Anker werden zusammengeführt. Kanonische Anker und
bereits veröffentlichte Stellen-Momentaufnahmen bleiben unverändert. Kollidieren Quell- und
Zielkommentar derselben Person und Stelle, werden vor dem Zusammenführen der alten Kompatibilitätszeilen
beide Originale als getrennte Provenienz-Dokumente materialisiert. So verliert auch eine noch nicht
gelaufene Legacy-Nachmigration keinen der beiden Texte.

Stellenfilter in der Bibliothek und in `/api/documents` berücksichtigen zusätzlich zu gespeicherten
Ankern die sichtbaren Bibelreferenzen im Dokument-Fließtext. `documentBodyOverlapsPassage()` wertet
bereinigtes `body_html` aus, einschließlich alter Linkbeschriftungen, inline formatierter Stellen und
Kapitel-/Versbereiche; Code und Linkziele zählen nicht. Diese abgeleiteten Treffer sind kanonisch und
werden nur innerhalb bereits eigentümergeprüfter Dokumente ermittelt. Es gibt weder schreibende GETs
noch einen Backfill: Bestehende Importe funktionieren sofort, und entfernte Textreferenzen erzeugen
keine bleibenden Anker. Manuelle Anker bleiben ausdrücklich gespeicherte Bezüge. Die Reader-Sidecar-Bibliothek zeigt sowohl Notizen als auch Ausarbeitungen; die eigenständigen
Bereiche `/notes` und `/sermons` behalten ihre bisherige Trennung.

Tags sind pro Nutzer getrennte Hierarchien in `document_tags`; `/` trennt Pfadsegmente. Der
zusammengesetzte Eltern-Fremdschlüssel erzwingt denselben Eigentümer, `document_tag_links` enthält nur die
explizit gewählten Blatt-Tags, und ein Filter auf einen Pfad schließt seine Nachfahren ein.

Besucherseiten lesen ausschließlich `document_publications`, nie die veränderliche Arbeitskopie. Ein
explizites Veröffentlichen sperrt die Arbeitskopie und ersetzt atomar die vollständige aktuelle
Momentaufnahme (Titel, Exzerpt, bereinigtes HTML/Markdown, Autorname, Tags und Stellen); weitere
Autosaves werden erst durch erneutes Veröffentlichen sichtbar. Nur ein Admin darf eine **eigene** aktive
Notiz (`note`) mit nicht leerem Anzeigenamen veröffentlichen; eine
E-Mail-Adresse ist nie Autor-Fallback. Freigaben sind ausschließlich `unlisted` und über ihren
bestehenden Slug ohne Anmeldung abrufbar; das ist keine Zugriffskontrolle oder geheime Freigabe.
Öffentliche Notizübersicht und Atom-Feed sind entfernt und liefern `410 Gone`; die Sitemap enthält
keine Notizen. Alle Freigaben erhalten `noindex, nofollow` als HTTP-Header und HTML-Metadatum.
`robots.txt` lässt die bisherigen Freigabe-URLs weiterhin crawlen, damit Suchmaschinen die
410-/noindex-Antworten sehen und früher indexierte Seiten entfernen können.
Migration `0037_unlisted_note_sharing.sql` stellt bestehende `public`-Arbeitskopien und Schnappschüsse
auf `unlisted` um, ohne Link, Inhalt oder Autor zu ändern. Sie erhöht betroffene Dokumentrevisionen;
bisher aktuelle Schnappschüsse bleiben revisionsgleich, bereits veraltete bleiben veraltet.
Datenbank-Constraints und Form-/Repository-Validierung verbieten neue `public`-Werte. Persönliche Blogs
(#186) bleiben zurückgestellt; die bestehende Beschränkung auf eigene Admin-Notizen bleibt bestehen.
Freigabe-HTML bleibt `private, no-store`, weil das globale Layout auch für Gäste Cookie-Präferenzen
enthält. Die cookie-freie Sitemap bleibt öffentlich mit `max-age=0, must-revalidate`.
Sobald eine Session aufgelöst wurde, erzwingt `hooks.server.ts` abschließend für
jede Antwort `private, no-store`. Dasselbe gilt ausdrücklich für private HTML-, JSON- und
Download-Antworten.

Migration `drizzle/0025_clever_agent_brand.sql` legt die Dokument-, Publikations-, Ausarbeitungsvorlagen- und
Durchführungshistorien-Tabellen an und enthält danach den
absichtlich handgeschriebenen Daten-Backfill: Jede bestehende Zeile aus `verse_comments` wird zu genau
einem privaten Dokument mit einem translationsspezifischen Einzelvers-Anker. Das bereits bereinigte
`comment_html` und die Quellzeile bleiben erhalten; `legacy_verse_comment_id` ist die eindeutige
Provenienz und macht Migration sowie `pnpm db:backfill-notes` wiederholbar. Letzterer Befehl erfasst
Legacy-Kommentare, die nach Migration 0025 entstanden oder aus einem Backup wiederhergestellt wurden.
Der Reader lädt oder bearbeitet `verse_comments` nicht mehr; `GET /api/v1/notes` behält exakt seine
vorherige `{ notes: [...] }`-Antwort inklusive Stellensammlungen-Threads; diese kollaborativen Threads werden
nicht in private Dokumente kopiert. Nach dem einmaligen Kopieren sind Legacy-Kommentar und Dokument
bewusst zwei unabhängige Arbeitskopien; spätere Änderungen werden nicht in beide Richtungen gespiegelt.

`GET /api/v1/documents` und `GET /api/v1/documents/[id]` sind bewusst nur lesend, benötigen eine Session
oder einen API-Key mit `personal`-Scope und geben ausschließlich eigene Arbeitskopien mit
`private, no-store` zurück. Schreibzugriffe bleiben vorerst bei der internen, sessiongebundenen
Autosave-Route und SvelteKit Form Actions.

Bibelstellen im Dokument-Fließtext werden bei der Darstellung automatisch verlinkt:
`findBibleReferences()`/`linkBibleReferences()` akzeptieren die gemeinsamen Buchnamen und Schreibweisen,
überspringen Code und erzeugen interne `.verse-ref`-Links. Gepunktete Kalenderdaten wie
`am 03.05.2026` dürfen dabei nicht als Amos-Stelle erkannt werden. Dokumente ergänzen
`rewriteBibleReferenceLinks()`: Ist der vollständige Text eines vorhandenen Links eine Bibelstelle,
wird dessen Ziel aus diesem Text abgeleitet, einschließlich des ganzen Versbereichs. Neue Importe
speichern diese Ziele im bereinigten Markdown; bestehende Dokumente werden beim Anzeigen und im Editor
sofort entsprechend dargestellt und beim nächsten visuellen Speichern normalisiert, ohne Neuimport
oder schreibenden GET. Andere Links behalten ihre Ziele. Im Tiptap-Editor sind
dieselben Treffer nicht persistierte ProseMirror-Dekorationen; sie dürfen `body_markdown` und damit einen
Markdown-Roundtrip nicht verändern. Im Editor positioniert ein Linkklick die Schreibmarke;
Strg-/Cmd-Klick öffnet kein Ziel mehr. Die Bibelvorschau bietet „Bibelstelle öffnen“, der am Text
verankerte Linkeditor „Link öffnen“. Die Toolbar unterstützt Links und H1–H6.
Unterstreichen und Hervorheben verwenden ausschließlich attributfreie `<u>`-/`<mark>`-Tags als
Markdown-Erweiterung; alle sonstigen Roh-HTML-Regeln bleiben erhalten. Explizite Verse und kapitelübergreifende Bereiche zeigen über
`verseHoverPopover` bei Maus-Hover und Tastaturfokus echten Bibeltext; dafür werden die bestehenden
öffentlichen Resource-/Kapitel-APIs und ihr kapitelweiser Client-Cache wiederverwendet. Im eigenständigen
Dokumenteditor und auf öffentlichen Notizseiten stammt der Text ohne persönliche Standardübersetzung
aus der ersten sortierten öffentlichen, fertigen Bibel. Ohne persönliche Standardübersetzung verwendet der Reader-Sidecar die erste gerade sichtbare Bibelressource, damit
die Vorschau mit dem unmittelbar daneben gelesenen Text übereinstimmt. Escape schließt die zugängliche
Vorschau. Mehrkapitelabrufe sind auf 50 Kapitel begrenzt; reine Kapitelangaben bleiben navigierbare
Links ohne Textvorschau; im Editor erhalten sie nur das explizite Öffnen-Angebot.
Im visuellen Dokumenteditor besitzt die Versvorschau zusätzlich „Bibeltext einfügen“;
`/bibel <Stelle>` plus Enter ist der Tastaturweg. Beide fügen ein gewöhnliches Blockzitat mit fetter
Quellenzeile ein, kein proprietäres ProseMirror-Element.

Der Dokumenteditor begrenzt seine Höhe auch eigenständig auf den Viewport; nur der Schreibbereich
scrollt, Werkzeugleiste und Footer bleiben erreichbar. Die Zähler im Footer zählen den sichtbaren
Dokumenttext ohne Titel und Markdown-Syntax: Wörter als Läufe ohne Leerraum, Zeichen als Unicode-Codepoints
inklusive innerem Leerraum. Die Inhaltsübersicht wird aus H1–H6 im Editor abgeleitet, ohne IDs oder
andere Metadaten in Markdown zu schreiben. Am rechten Rand zeigt sie im Ruhezustand nur schmale Striche
für die Überschriften; Hover über diese Leiste beziehungsweise Tastaturfokus oder Antippen öffnet die
vollständige Gliederung als überlagernde Karte. Dieselbe Karte enthält die aus- und eingehenden
Dokumentverknüpfungen. Eine Textauswahl öffnet die Formatierung am Text; Linkbearbeitung verwendet
dasselbe am Viewport begrenzte Popup.
„Zen-Modus“ beziehungsweise Strg-/Cmd+Shift+F im Editor maximiert auch den Sidecar-Editor.
Dabei wird dieselbe Editor-DOM-Instanz in einen modalen Dialog verschoben und danach zurückgesetzt:
Undo-Historie, Auswahl und Autosave bleiben erhalten. Escape verlässt den Modus. Die Bibelvorschau
muss innerhalb dieses Dialogs liegen, damit sie in der modalen Browser-Ebene bedienbar bleibt.

Ein `/` an einer Wortgrenze öffnet im visuellen Editor ein an der Schreibmarke platziertes Befehlsmenü
für Absatz, H1–H3, Listen, Zitat, Codeblock, Trennlinie und Bibeltext; `/bibel <Stelle>` plus Enter bleibt
der direkte Tastaturweg. `@` öffnet dort die Suche nach ausschließlich eigenen, nicht gelöschten Notizen
und Ausarbeitungen anhand von Titel, Fließtext oder Schlagwort. Eine Auswahl fügt einen gewöhnlichen
Markdown-Link der Form `[Titel](/notes/<uuid>)` ein. `document_links` ist nur der daraus abgeleitete,
gerichtete Suchindex für Rückverknüpfungen: `syncDocumentLinks()` ersetzt ihn innerhalb derselben
revisionierten Speichertransaktion. Beide Fremdschlüssel enthalten `user_id`, unbekannte oder fremde IDs
werden verworfen, Selbstverknüpfungen sind verboten. Gelöschte Ziele bleiben als nicht aufrufbare
Verknüpfung indexiert, eingehende Links gelöschter Quelldokumente werden ausgeblendet. Beim Reader-Sidecar
öffnet die Seitenleiste ein verknüpftes Dokument erst nach erfolgreichem `flush()` im selben Sidecar;
private Dokument-IDs gelangen dabei weiterhin nicht in Reader-URL oder lokalen Speicher.
Die eigenständige `/notes/[id]`-Seite schlüsselt `DocumentEditor` nach Dokument-ID und setzt ihre lokale
Arbeitskopie auch dann zurück, wenn zwei nacheinander geladene Dokumente dieselbe Revision besitzen.

Der kompakte Reader-Editor ist kein neunter Workspace-Tab: Der Schalter „Notizbereich“ im
`ReaderLayoutPicker` blendet ihn am Desktop als eigene rechte Sidecar-Spalte neben der unveränderten
Kachelanordnung ein. Mobil sind „Lesen“ und „Notiz“ zwei tastaturbedienbare Ansichten, damit der
Bibeltext nicht zusammengedrückt wird. Ohne geöffnetes Dokument folgt die Sidecar-Erstellung der
sichtbaren Stelle des fokussierten Bibel-Tabs; daneben stehen owner-geprüfte Suche sowie Typ-, Tag- und
Stellenfilter zur Verfügung. Am Desktop ist die Sidecar-Breite über einen horizontal bewegten Trenner
änderbar. Der Sidecar-Filter „Nur Notizen zum aktuellen Kapitel“ findet eigene Notizen und Ausarbeitungen
über das gesamte sichtbare Kapitel, unabhängig vom Übersetzungsbezug. Sein stabiler Lade-Schlüssel
besteht aus Kapitel und Tabgruppe sowie den Such-/Tagfiltern: Scrollen innerhalb desselben Kapitels
löst keinen erneuten Bibliotheksabruf aus. `/api/documents` akzeptiert dafür auch reine Kapitelangaben
und prüft sie als vollständiges kanonisches Versintervall. Die Erstellung einer Notiz behält den konkreten sichtbaren
Vers und die gewählte Übersetzung als Kontext. Suchbegriff, Schlagwort und Stellenfilter des Sidecars stehen als `notesQuery`, `notesTag` und
`notesFilter=current` in der Reader-URL und werden bei jeder Reader-Aktion mitgeführt. Flache
URL-Änderungen halten diese Filter zusätzlich in `page.state.readerNotesFilters`, weil SvelteKits
`replaceState` die geladene `page.url` nicht aktualisiert. Diese Filter gehören nicht zum gespeicherten
Konto-Workspace und enthalten keine private Dokument-ID. Der Schalter speichert ausschließlich Sichtbarkeit und harmlose Breite
(`reader-notes-sidecar-open`, `reader-notes-sidecar-width`); eine private Dokument-ID gelangt weder in Reader-URL/History noch in
`localStorage`. Beim Öffnen wird der aktuelle Vers der zuletzt aktiven Bibelspalte als Kontext verwendet;
Die Sidecar-Bibliothek öffnet Dokumente im `compact`-Modus von `DocumentEditor.svelte`. Laden und Autosave verwenden unverändert das eigentümergeprüfte interne
`GET`/`PATCH /api/documents/[id]`. Wechsel, Ausblenden und Schließen warten auf `flush()`; ein
Speicherfehler oder Revisionskonflikt lässt den Editor sichtbar. `ReaderNotesPanel` bleibt der eine
kontextuelle Dialog aus dem Versmenü und übergibt neu angelegte oder ausgewählte Dokumente an das
Sidecar, wenn JavaScript aktiv ist; der normale Form-Redirect bleibt der funktionsfähige No-JS-Pfad.
Notizen erzeugen keine Icons oder Unterstreichungen im Bibeltext; der Sidecar und das Versmenü
bleiben die Zugänge zu persönlichen Dokumenten.

Der Obsidian-Austausch unter `/notes/import` akzeptiert eine oder mehrere UTF-8-`.md`-Dateien oder genau
ein ZIP mit Markdown. Pro Datei gelten 1 MiB Markdown plus 64 KiB YAML; pro Stapel höchstens 100 Dateien
und je 16 MiB Upload sowie relevante entpackte Daten. Die Vorschau meldet Inhaltsfehler gesammelt mit
Dateiname beziehungsweise ZIP-Eintragspfad; eine zu große lose Dateiauswahl nennt Anzahl und Grenze
als Stapelfehler. Das ZIP-Zentralverzeichnis wird vor dem Entpacken
auf Traversal/absolute Pfade, Backslashes, Symlinks, Verschlüsselung, ZIP64-Größen und unbekannte
Kompression geprüft; nichts wird auf das Server-Dateisystem geschrieben. ZIP und lose Dateien dürfen
nicht gemischt werden. Vorschau ist schreibfrei; Bestätigen parst und validiert alle Originaltexte erneut,
statt versteckten Preview-Feldern zu vertrauen, und erzeugt immer ein privates Dokument. YAML-Aliase
sind vollständig deaktiviert, damit auch innerhalb der Größenlimits keine Alias-Expansion stattfinden
kann. Rohes HTML,
unsichere Links/YAML-Felder, Embeds, Bilder und Anhänge werden abgewiesen oder mit sichtbarer Warnung
entfernt. Pro Dokument gelten höchstens 100 Stellenanker und 50 ausgewählte Tags; Komma und Backslash
sind in Tagsegmenten nicht zulässig. Tags werden nie implizit als Bibelstellen interpretiert. Exporte
stehen owner-only als Markdown/YAML, Word `.docx` und PDF bereit, enthalten aber keine E-Mail,
Eigentümer-ID oder Veröffentlichungsberechtigung. Import/Export von Anlagen und automatisches
Zusammenführen sind nicht implementiert. Der PDF-Export löst relative Linkziele gegen den Request-Ursprung auf, bewahrt Links als
klickbare grüne Annotationen und färbt auch freie, vom gemeinsamen Parser erkannte Bibelstellen grün;
Inline-Code bleibt davon ausgenommen. Auf jeder gepufferten A4-Seite setzt er eine Akribos-Kopfzeile
sowie eine Fußzeile mit Seitenzahl. Die Bereichsnavigation besteht aus „Notizen“, „Ausarbeitungen“ und „Stellensammlungen“; Import und
veröffentlichte Notizen sind kontextuelle Aktionen, Vorlagen gehören in den Ausarbeitungsbereich. Ausarbeitungen
bleiben normale Dokumente (`kind = sermon`); `/sermons` zeigt sie in kontoeigenen Spalten.
`users.sermon_columns` speichert eine geordnete JSON-Liste aus stabiler ID und frei wählbarem Namen;
`sermon_board_revision` verhindert das Überschreiben gleichzeitiger Konfigurationsänderungen.
Migration `0032_needy_spot.sql` liefert bestehenden und neuen Konten die bisherigen fünf Spalten
`idea`, `research`, `outline`, `ready`, `delivered` als Default. Neue Spalten erhalten UUIDs;
`documents.sermon_status` referenziert immer eine Spalte des Eigentümers. Board-GETs schreiben nie.
Spaltenänderungen, Dokumenterstellung, Statuswechsel und Typwechsel sperren zuerst dieselbe Nutzerzeile,
erst danach Dokumentzeilen. Löschen verlangt eine andere eigene Zielspalte, verschiebt im selben
Transaktionsblock auch ruhende Notizmetadaten und Papierkorb-Dokumente und erhöht deren Revisionen.
Mindestens eine Spalte bleibt erhalten; neue Ausarbeitungen starten in der ersten Spalte. Namen sind
auf 80 Zeichen und die Konfiguration auf 30 Spalten begrenzt; doppelte Namen werden ignorierend auf
Groß-/Kleinschreibung abgewiesen. Editor und URL-Statusfilter verwenden dieselben eigenen Spalten.
Markdown exportiert neben `sermon.status` auch `sermon.statusName`; Import verwendet eine vorhandene
eigene ID beziehungsweise denselben Namen oder legt atomar eine eigene Spalte an.
Karten sind auf ihrer gesamten Fläche über `svelte-dnd-action` ziehbar; ein normaler Titelklick öffnet
weiterhin das Dokument. Die Spalten verwenden eine äußere `dndzone` mit eigenem Typ. Karten-Events
stoppen die Weitergabe, damit sie nie die Spaltenreihenfolge überschreiben. Sortieren überträgt eine
vollständige ID-Permutation samt Boardrevision; der Server weist fehlende, doppelte und fremde IDs ab.
Ein Plus-Button nach der letzten Spalte (außerhalb der `dndzone`) legt Spalten an. Ein Titelklick öffnet
die Inline-Bearbeitung (Enter/Blur speichert, Escape verwirft); der Spaltenkopf lässt sich ziehen.
Das Drei-Punkte-Menü bietet Löschen mit Zielspalten-Dialog und Links-/Rechts-Aktionen als Tastaturalternative.
Leertaste/Tab und `Alt` + Pfeil links/rechts am Dokumentlink bleiben erhalten. Eine separate
Spalten-Verwaltungsansicht existiert nicht.
Die Bibliotheksauswahl ist in `docs/sermon-board.md` begründet. Ein redundantes Status-Select wird auf
der Karte nicht gerendert. Auch nach Drag-and-drop bleiben Karten nach geplantem Termin absteigend
sortiert; Ausarbeitungen ohne Termin folgen zuletzt. URL-Filter für Arbeitsstand, Volltext, Reihe und
Jahr sind kombinierbar. `sermon_templates`
enthält frei editierbare private
Markdown-Vorlagen. `sermon_deliveries` speichert mehrere tatsächliche Durchführungen aus Kalenderdatum
und Ort über einen zusammengesetzten Dokument-/Owner-FK; jede Mutation erhöht die Dokumentrevision.
Migration `0025_clever_agent_brand.sql` legt beide Tabellen zusammen mit dem übrigen Dokumentmodell
und dem nötigen eindeutigen Dokument-/Owner-Index an.
Migration `0027_thankful_vin_gonzales.sql` ergänzt `document_links` und baut den abgeleiteten Index für
bestehende echte HTML-Links owner-sicher auf; Codebeispiele und bloßer URL-Text werden nicht erfasst.

Ausarbeitungen verwalten private Anlagen über `document_attachments` und
`/api/documents/[id]/attachments[/attachmentId]`. Die Binärdaten liegen als PostgreSQL-`bytea` in
derselben Datenbank und sind dadurch Teil bestehender Backups/Wiederherstellungen; Metadatenabfragen
laden niemals den Dateiinhalt. Pro Datei gelten 50 MiB, pro Dokument insgesamt 200 MiB und 50 Dateien.
Uploads werden vor `formData()` begrenzt gestreamt; die gemeinsame Dokumentzeilensperre schützt
Eigentümer, aktiven Ausarbeitungstyp, Revision und Quotenprüfung atomar. Der zusammengesetzte
Owner-Fremdschlüssel und Download-Join verhindern fremden Zugriff auch für Administratoren.
Downloads erzwingen `attachment`, `nosniff`, CSP-Sandbox und `private, no-store`.
Papierkorb und Wechsel zu Notizen lassen Anlagen ruhen; Wiederherstellung beziehungsweise Rückwechsel
machen sie erneut zugänglich. Physisches Dokument-/Kontolöschen löscht die Dateien per Cascade.
Anlagen sind weder Bestandteil öffentlicher Notizen noch der Markdown-/Word-/PDF-Exporte.
`DocumentEditor.withRevision()` hält für Upload/Löschen dieselbe serielle Queue wie Autosave:
ausstehender Text wird vorher gespeichert, während des Uploads eingegebener Text danach mit der neuen
Revision. Weitere Uploads, Metadatenformulare und Navigations-Flushes warten auf diese Queue.

### Zusammenarbeit an Stellensammlungen (issue #129)

Eine Stellensammlung hat genau einen Eigentümer (`verse_lists.user_id`), der sie umbenennen, löschen, den
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
Verschieben in Zehnerschritten. Im Reader-Tab wird `tabTitle` als sichtbare Bezeichnung und zugänglicher
Name verwendet; `selectionTitle` gehört ausschließlich in Werkauswahl und Werk-Informationen.
`licenseHtml`/`usageNotesHtml` belegen keinen dauerhaften Footer mehr, sondern sind über das Info-Symbol
der jeweiligen Tab-Werkzeugleiste erreichbar. Die Werkauswahl ist ein schlankes, am Auslöser
verankertes und durchsuchbares Dropdown; Werkdetails werden nach verzögertem Maus-Hover beziehungsweise
Tastaturfokus in einer separaten Infokarte gezeigt und sind auf Touch über das Info-Symbol jeder Zeile
erreichbar.

Die Ressourcenadministration ist bewusst eine Master-Detail-Ansicht: Die linke, höhenbegrenzte Liste
filtert clientseitig nach Kategorie und Suchtext, rechts wird immer nur eine Ressource bearbeitet. Die
Auswahl steht als `resource`-Queryparameter in der URL, damit sie nach Speichern oder Sortieren erhalten
bleibt. Auf schmalen Bildschirmen scrollt die Auswahl zum einzelnen Editor statt alle Formulare
untereinander zu rendern.

Die Produkt-Tour (`ProductTour.svelte`, Schritte in `src/lib/tour/steps.ts`, Laufzustand in
`tour-state.svelte.ts`) ist eine schlanke Eigenimplementierung (Spotlight per CSS-`box-shadow`, kein
Tour-Framework) und wird von `SiteHeader` ausschließlich gemountet, solange `readerPreferences` gesetzt
ist — die erklärten Ziele (Chooser, Wortstudie, Ressourcen-Tab, Tabgruppe, `.flow-chapter-number`) gibt es
nur im Reader. Der neue Menüpunkt „Produkt-Tour" erscheint deshalb ebenfalls nur dort. Ein Schritt, dessen
Zielelement fehlt oder unsichtbar ist, wird übersprungen statt auf nichts zu zeigen. Fortschritt wird als
"erledigt" verstanden, sobald die Tour beendet oder aktiv geschlossen wurde: nicht angemeldet über das
Cookie `tour-guest-done` (wie `theme`/`reader-font-scale`, nicht `httpOnly`), angemeldet über
`users.tour_completed_at` (per `POST /api/tour`, analog zu `/api/theme`) — geräteübergreifend. Meldet sich
jemand an, der die Tour bereits als Gast beendet hat, zeigt die erste Ausführung im Reader nur noch die
zusätzlichen, angemeldeten Schritte (`MEMBER_TOUR_STEPS`); sonst die vollständige Sequenz. Da Login und
Registrierung standardmäßig auf `/account` weiterleiten, nicht in den Reader, erscheint die Tour für
diese Fälle beim nächsten Reader-Besuch automatisch, nicht zwingend unmittelbar nach dem Einloggen.

Das Benutzer-Menü (`/account`) enthält nur Profil & Sicherheit sowie Darstellung. Der aktive
Abschnitt steht im `tab`-Queryparameter und bleibt über Reload und Browser-History erhalten.
Stellensammlungen sind der dritte Reiter im Dokumentbereich und liegen unter `/lists`; dort können
eigene und geteilte Sammlungen geöffnet und neue angelegt werden. Alte `/account?tab=lists`-Links
leiten zur neuen Übersicht weiter. Konto-GETs laden weder Sammlungen noch die Legacy-Kommentarliste.
Die bestehenden `/lists/[id]`-, `/l/[slug]`- und API-Adressen sowie Zusammenarbeit bleiben erhalten.
Die drei Übersichten `/notes`, `/sermons` und `/lists` verwenden dieselbe Seitenbreite und denselben
`DocumentAreaHeader`. Titel, Beschreibung, Aktionszeile und Bereichsreiter behalten dadurch beim
Wechsel ihre Position; auch ohne Seitenaktionen bleibt deren Platz auf schmalen Bildschirmen reserviert.

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

Das hebräische Open-Scriptures-Lexikon speichert die deutsche Fassung getrennt in
`lexicon_entries.german_translation`; die drei bisherigen HTML-Felder bleiben das englische Original.
`data/hebrewstrong.xml` ergänzt je Eintrag einen `translation`-Block mit `xml:lang="de"` und
`method="machine"|"human"`. Unvollständige Übersetzungen werden mit Warnung verworfen. Deutsch wird
standardmäßig gezeigt, das englische Original bleibt über ein natives Details-Element zugänglich.
Die gebündelte deutsche Fassung ist eine gekennzeichnete Vorübersetzung und fachlich noch zu prüfen.
Die Ressourcensprache bleibt `hbo`. Startup und Backup-Wiederherstellung ergänzen vorhandene fertige
`hebrew-lexicon-xml`-Ressourcen nur bei exakt übereinstimmenden Originalfeldern; bestehende Übersetzungen
und andere Lexika bleiben erhalten. GETs schreiben nicht. Schema, Herkunft, Reproduktion und
Prüfbedarf stehen in `docs/hebrew-lexicon.md`.

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

Ausarbeitungen können mehrere Stellensammlungen über `document_verse_lists` verknüpfen. Der
zusammengesetzte Dokument-Fremdschlüssel erzwingt denselben Eigentümer; beim Lesen werden zusätzlich
die aktuelle Eigentümerschaft beziehungsweise akzeptierte Mitgliedschaft der Sammlung geprüft.
Verlorene Mitgliedschaft darf weder Sammlungstitel noch Stellen offenlegen. Verknüpfen, Lösen und
Anlegen mit Verknüpfung sperren die eigene aktive Ausarbeitung und verlangen die aktuelle Revision.
Die Sammlung bleibt ein lebender Bezug; ihre Stellen werden nicht als Dokumentanker kopiert.
Typwechsel zu Notizen lassen die Verknüpfungen ruhen, gelöschte Sammlungen entfernen sie per Cascade.
Die Vorbereitung zeigt alle verknüpften Sammlungen samt Stellen direkt neben dem Editor.

`users.default_bible_id` speichert die persönliche Standardübersetzung für alle Bibelvorschauen und
„Bibeltext einfügen“ (auch im Reader-Sidecar). Nur öffentliche, fertige Bibeln sind auswählbar; der
globale Server-Load validiert die gespeicherte Auswahl erneut gegen die verfügbaren Bibeln. Ohne
explizite gültige Auswahl gilt im Reader dessen erste sichtbare Bibel und außerhalb die erste
sortierte Bibel. Eine Ressourcenlöschung setzt die Präferenz per Fremdschlüssel auf NULL. Die
Einstellung ist unabhängig von den offenen Reader-Ressourcen und wird über die Session auf allen
Geräten angewendet.
