# Workshop: Dokumentation und Landingpage

Stand: 21. September 2026. Status: Umfangreicher lokaler Ausbau nach bestätigtem Workshop;
42 Live-Aufnahmen sind inventarisiert, die abschließende Prüfung läuft. Noch kein Push, PR oder Deployment.

Der Workshop findet **hier im Chat** statt. Diese Datei ist das Arbeitsprotokoll und keine Leseaufgabe
für den Nutzer. Die bestätigten Entscheidungen sind umgesetzt beziehungsweise Grundlage der laufenden
Ausarbeitung. Zugangsdaten, Sessioninformationen, Tokens und private Dokumentadressen werden hier
nicht gespeichert.

## Bestätigte Entscheidungen

| ID  | Thema                    | Entscheidung                                                                                                                            |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Gliederung der Hilfe     | Übersicht mit Suche und eigenen, direkt verlinkbaren Themenseiten.                                                                      |
| W2  | Umfang                   | Vollständige Nutzerhilfe; API und Administration in getrennten Bereichen. Administrationshilfe ausschließlich für Administratoren.      |
| W3  | Landingpage              | Das Gesamtprodukt vom Bibellesen bis zur Ausarbeitung zeigen.                                                                           |
| W4  | Tiefe der Anleitungen    | Kurze Schrittfolge zum Nachmachen, danach ausführliche Vertiefung aller Optionen.                                                       |
| W5  | Screenshotführung        | Gesamtansicht zur Orientierung und lesbare Detailausschnitte direkt beim Schritt; nummerierte Hinweise bei Bedarf außerhalb des Bildes. |
| W6  | Zielgruppen              | Persönliches Bibelstudium zuerst; Hauskreisleitung und Predigtvorbereitung anschließend gleichgewichtig.                                |
| W7  | Einstieg der Landingpage | Der folgende Wortlaut und die Aktionen wurden mit „Passt“ bestätigt.                                                                    |

> **Die Bibel lesen. Zusammenhänge verstehen.**
>
> Vergleiche Übersetzungen, entdecke die Bedeutung biblischer Wörter und halte deine Gedanken direkt
> am Text fest. Akribos begleitet dich beim persönlichen Bibelstudium – und bei der Vorbereitung
> für Hauskreis und Predigt.

Aktionen: **Bibel öffnen** und **Akribos kennenlernen**. Eine echte Studienansicht begleitet den
Einstieg. Hauskreis und Predigtvorbereitung erscheinen anschließend mit konkreten Beispielen.

Weitere feste Anforderungen: professionelle und ausführliche Dokumentation, authentische Aufnahmen
von **https://akribos.de**, Wiederverwendung der Produktbilder auf `/about` und Bereinigung der
temporären Konten nach Abschluss. Die persönliche Blogplanung zu Issue #186 bleibt außerhalb dieses
Auftrags und unverändert.

Nachträglich ausdrücklich bestätigt: **Die Administrationsdokumentation darf nur für Administratoren
sichtbar sein.** Diese Vorgabe gilt für die Übersichtsseite, alle Adminanleitungen und deren
Auffindbarkeit über Suche, Navigation und Querverweise sowie für direkte Seitenaufrufe. API-Hilfe
und Nutzerhilfe bleiben öffentlich erreichbar.

Zusätzlich meldete der Nutzer fehlerhafte Gestaltung beim Aufrufen der API-Referenz über die
SPA-Navigation. Die laufende Zusatzkorrektur führt den Referenzlink direkt zu `/api/docs` und soll
verhindern, dass die Gestaltung der Referenz die übrige Anwendung beeinflusst. Diese Korrektur
gehört zur abschließenden Integration und wird gesondert geprüft.

## Aktueller lokaler Umsetzungsstand

Die Hilfe umfasst derzeit **42 direkt verlinkbare Inhaltsseiten**: 15 Themen-/Fachübersichten und
27 Aufgabenleitfäden. Davon gehören eine Fachübersicht und sieben Leitfäden zur geschützten
Administrationshilfe. Gäste und normale Konten erhalten die übrigen 34 Seiten. Die Einträge stammen
aus einem gemeinsamen typisierten Katalog, der für den jeweiligen Zugriff gefiltert wird. Die
vorherigen 13 Themenanker bleiben auf der Übersicht erreichbar.

| Bereich                              | Ausgearbeitete Aufgaben                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einstieg, Reader und Arbeitsbereiche | Stellen öffnen, Scrollen und Verlauf; Werke, Tabs, Layouts und Gruppen; benannte Arbeitsbereiche einschließlich Speichern und Verwaltung.                                       |
| Suche und Wortstudie                 | Wort-/Phrasen-/Strong-Suche, Filter und Ergebnisse; griechische/hebräische Lexika, Quellbibel, Grammatik und Statistik.                                                         |
| Verse, Konto und Mobil               | Kopieren und Markieren, Farbverwaltung und Fundstellen; Anmeldung und Profil; Design, Schrift und Standardübersetzung; Smartphone-/Tabletbedienung.                             |
| Notizen und Editor                   | Bibliothek, Suche und Filter, Schlagwörter, Bibelstellen, Papierkorb; Visuell/Markdown, Formatierung, Befehle, Zitate, Links, Rückverweise, Gliederung, Zen und Speicherstatus. |
| Notizen im Reader                    | Stellenbezogen anlegen, Dokumentbibliothek und Filter, vollständiger Editor, Breite und mobiles Lesen/Notiz-Umschalten.                                                         |
| Vorbereitung                         | Formate, Reihen, Termine, Board und eigene Spalten; Typwechsel; Vorlagen, Anlagen, verknüpfte Sammlungen und Durchführungshistorie.                                             |
| Stellensammlungen                    | Anlegen, Verse und Kommentare; Einladungen, Rollen, Antworten/Reaktionen, Leselink, Widerruf, Entfernen und Austritt.                                                           |
| Import und Export                    | DOCX, Markdown und ZIP; Vorschau, Konvertierung und Bestätigung; Markdown, Word und PDF einschließlich Umfangsgrenzen.                                                          |
| API                                  | Schlüssel anlegen und verwenden, öffentliche/persönliche Zugriffe und Verweis auf die technische Referenz.                                                                      |
| Administration                       | Ressourcen und Importe, Nutzer/Rollen, Umami, Backups, Restore und Freigabe eigener Notizen.                                                                                    |

Die Artikel nennen Voraussetzungen und aktuelle Oberflächenbezeichnungen. Nummerierte Schritte
stehen vor vertiefenden Erklärungen, mobilen Hinweisen und konkreter Problemhilfe. Themenübersichten
verlinken ihre Aufgaben; Artikel enthalten passende Querverweise und Abschnittsanker. Die Inhalte
wurden mit den aktuellen Produktkomponenten und Berechtigungsprüfungen im Repository abgeglichen.
Eine inhaltlich beschriebene Funktion gilt dadurch noch nicht als vollständig live getestet.

Die Landingpage verwendet den bestätigten Einstieg, zeigt persönliches Lesen und Verstehen zuerst
und führt über Suche/Wortstudie zu Notizen sowie Hauskreis- und Predigtvorbereitung. Die alten
Dekorationsbilder und nachgebauten Suchergebnisse wurden durch echte Produktaufnahmen ersetzt.

### Technische Eigenschaften der neuen Hilfe

- Serverseitige GET-Suche über `q`, direkt verlinkbare Ergebnisse und Abschnitte; auch ohne JavaScript.
- Themen unter `/help/[topic]`, Aufgaben unter `/help/[topic]/[article]`; unbekannte Ziele liefern 404.
- Gemeinsamer Katalog für Navigation, Suchinhalte und Sitemap; die 13 bisherigen `/help#…`-Anker bleiben.
- Administrationshilfe nur mit angemeldetem Administratorkonto: serverseitige Prüfung auch bei
  direktem Aufruf, rollenabhängig gefilterte Übersichten, Suche, Navigation und ausgelieferte
  Hilfedaten. Keine Adminhilfelinks in öffentlicher Sitemap, Landingpage oder Nutzeranleitungen.
  Rollenabhängige Hilfeantworten dürfen nicht öffentlich gecacht werden.
- Auch die sieben Adminbilder sind geschützt: Dateien unter `src/lib/server/help/images/`,
  Auslieferung ausschließlich über `/help/media/[image]` nach Administratorprüfung. Für andere
  Rollen liefert der Endpunkt 404; seine Antworten sind privat, nicht cachebar und nicht
  indexierbar. Die übrigen 35 Aufnahmen liegen öffentlich unter `static/help/live/`.
- Gemeinsame Bildkomponente für Hilfe und Landingpage mit Alttext, Bildunterschrift, Vergrößerung,
  Escape und Fokusrückgabe. Ohne JavaScript führt der Bildlink zur Datei.
- Lesbare Detailbilder werden nicht auf volle Artikelbreite hochskaliert. Die Hilfesuche ist auch auf
  schmalen Bildschirmen erreichbar.
- Redaktionelle HTML-Inhalte stammen ausschließlich aus dem Repository. Neue Invarianten wurden
  in `AGENTS.md` dokumentiert.

## Live-Aufnahmen und nachvollziehbare Testdaten

Der aktuelle Dateibestand mit tatsächlichen Bildmaßen und Aufnahmezuständen steht in
[help-screenshots.md](../help-screenshots.md). Die fiktiven Importquellen liegen in
[help-demo](../help-demo/). Zugangsdaten werden ausschließlich im vorgesehenen Anmeldeablauf benutzt.

**Anna Beispiel** dient als normales Demokonto. Das Ausgangsszenario besteht aus drei Notizen und
vier Ausarbeitungen zu Johannes, einem benannten Arbeitsbereich und einer privaten Stellensammlung.
Zusätzlich wurden eine Beispielanlage hochgeladen, eine Stellensammlung an einer Ausarbeitung
verknüpft und eine Hauskreisvorlage gespeichert. Weitere private Beispielinhalte werden nur für
konkrete Aufnahmen angelegt. Joh 3,16 ist mit der
Farbe „Beobachtung“ markiert.

**Jonas Beispiel** ist die zweite kontrollierte Identität mit bestätigter Administratorrolle. Für
Zusammenarbeit wurde Jonas von Anna zur Sammlung eingeladen. Die Einladung wurde angenommen; eine
Reaktion und eine Antwort auf Annas Kommentar wurden gespeichert. Die Mitgliedsansicht bestätigt:
Verse ergänzen ist möglich, das Entfernen fremder Verse und die Eigentümerverwaltung sind nicht
verfügbar. Eigene Kommentare können gelöscht werden.

Bis zu diesem Protokollstand wurde kein öffentlicher Leselink aktiviert. Private Zusammenarbeit und
öffentliche Freigabe werden getrennt betrachtet. Die zweite Identität hat außerdem eine echte
Dokumentimportvorschau geöffnet und danach eine neue private Notiz über die Bestätigung angelegt.

Verwaltungsaufnahmen zeigen die tatsächlichen Formulare. Analyse und S3-Backup enthalten fiktive
Eingaben **vor dem Speichern**; anschließend wurde ohne Speichern navigiert. Die bestehende
Verwaltungskonfiguration, Ressourcen und fremde Konten wurden dafür nicht geändert. Kein Backup und
kein Restore wurde ausgeführt. Das API-Bild enthält keinen erzeugten Schlüssel, das Restore-Bild
keine hochgeladene Datei.

### Wichtige fachliche Abgrenzungen

- Eigene Notizen und Ausarbeitungen sind private Arbeitskopien. Ein Dokumentlink erteilt keinen Zugriff.
- Die Freigabe eines Notiz-Schnappschusses steht derzeit nur Administratoren für eigene Notizen zur Verfügung.
- Einladungen zur Sammlung erlauben Zusammenarbeit; ein öffentlicher Sammlungslink bietet nur Lesen.
- Der Sammlungslink zeigt den aktuellen Inhalt, ein freigegebener Notiz-Schnappschuss dagegen eine
  bewusst veröffentlichte Fassung. Diese Begriffe werden in den Anleitungen getrennt erläutert.
- „Bereits gehalten“ dokumentiert Durchführungen mit Datum und Ort. Es gibt keinen dauerhaften
  Textversionsverlauf im Editor.
- Eine gesetzte Standardübersetzung hat für Zitate Vorrang. Das bloße Öffnen einer anderen Bibel
  ändert diese persönliche Einstellung nicht.
- Der Editor unterstützt Überschriften der Ebenen 1–6, das Slash-Menü bietet die Ebenen 1–3 direkt an.
- Titel und Text speichern automatisch. Kommentare in Sammlungen und viele Metadatenfelder benötigen
  die jeweils sichtbare Speichern-Schaltfläche.

## Lokale Vorschau nach dem gemeldeten HTTP-500-Fehler

Der Nutzer erhielt bei den Links auf `localhost:5173` Fehler. Die ursprüngliche lokale Datenbank
passte nicht zum aktuellen Code: unter anderem fehlten `users.default_bible_id` und
`saved_reader_workspaces`. Mit vorhandenem Sitzungscookie schlug deshalb die Sitzungsabfrage fehl.
Eine normale Migration scheiterte an der bereits vorhandenen Tabelle `document_passages` und wurde
zurückgerollt.

Die Vorschau wurde auf eine eigene, regulär migrierte und mit Demo-Daten befüllte lokale Datenbank
umgestellt. Anschließend wurden `/help`, die Musteranleitung und `/about` jeweils ohne Cookie und mit
einem ungültigen Sitzungscookie geprüft: sechs HTTP-200-Antworten; ungültige Cookies werden entfernt.
Die Reparatur betraf keine Live-Datenbank. Produktbilder stammen weiterhin aus der Live-Anwendung.

## Validierung und noch laufende Abnahme

### Bereits abgeschlossene Prüfung des ersten Entwurfs

Diese Ergebnisse gehören zur früheren Musterphase und werden nicht als Abnahme des späteren
umfangreichen Inhaltsausbaus ausgegeben:

- `pnpm check`: 0 Fehler, 14 bereits bestehende Warnungen in der Admin-Backup-Seite.
- 17 relevante Unit-Tests sowie acht gezielte E2E-Prüfungen bestanden.
- Suche, Abschnittslinks, alte Themenanker, 404/Leerzustand, Bildvergrößerung, Tastatur/Fokusrückgabe,
  mobile Suche, Bedienung ohne JavaScript sowie Hilfe-/Landing-Navigation geprüft.
- Desktop und Smartphone visuell geprüft; verwendete Bilder geladen, kein horizontaler Überlauf.

### Prüfung des aktuellen Inhaltsausbaus

Abschließender Integrationslauf am 21. September 2026:

- `pnpm check`: 0 Fehler, 14 bestehende Warnungen in der Admin-Backup-Seite.
- 34 Unit-Tests bestanden: Hilfesuche, Katalog, Links, Bilddateien, Rollenprüfung und öffentliche Routen.
- 15 relevante E2E-Tests gegen den Produktionsbuild bestanden. Geprüft sind sämtliche öffentlichen
  Hilferouten, Bildmaße, Suche, Navigation, alte Anker, Fehlerseiten, Bedienung ohne JavaScript,
  Bilddialog mit Tastatur/Fokusrückgabe sowie Landingpage und Smartphonebreiten bis 320 Pixel.
- Adminzugriff mit Gast, normalem Konto und Administratorkonto geprüft: keine Admininhalte in
  öffentlicher Übersicht, Suche, Navigation oder Sitemap; direkte Artikel- und Bildaufrufe ohne
  Rolle liefern 404. Administratoren können alle acht geschützten Seiten und sieben Bilder laden.
- Der erzeugte öffentliche Build enthält weder Kopien der Adminbilder noch Adminhilferouten im
  Browser-JavaScript. Rollenabhängige Antworten verwenden `private, no-store`.
- Direkter Link zur interaktiven API-Referenz und wiederholte SPA-Navigation hin und zurück mit
  hellem/dunklem Design und geöffnetem Scalar-Suchdialog erfolgreich geprüft. Styles und Klassen
  der Anwendung sind danach ohne Neuladen identisch zum Ausgangszustand.
- Gezielte Prettier-/ESLint-Prüfung aller geänderten Quelldateien und `git diff --check` bestanden.
- Die lokale Vorschau liefert nach dem Build für `/help`, `/help/api`, `/about` und `/api/docs`
  erneut HTTP 200. Die Seitenleistensuche misst 44 CSS-Pixel Höhe und verursacht keinen Überlauf.

Dieser Lauf ist auf die Änderungen begrenzt. Vor einem Push oder PR ist wie in `AGENTS.md`
festgelegt zusätzlich der vollständige lokale E2E-Lauf erforderlich; es wurde nichts veröffentlicht.

### Verbleibende Arbeit und Grenzen

1. Der Bildbestand ist mit 35 öffentlichen und sieben geschützten Dateien sowie ihren tatsächlichen
   Maßen vollständig eingebunden und inventarisiert. Die lokale Fassung steht zur inhaltlichen
   Abnahme bereit; Veröffentlichung bleibt ein gesonderter, noch nicht ausgeführter Schritt.
2. Nicht durch Aufnahme oder Bedienprüfung belegte Abläufe sind von überprüften Abläufen getrennt.
   Die Aufnahme eines Backup-/Restoreformulars ersetzt insbesondere keine Ausführung.
3. Öffentliche Leselinks und deren Widerruf sowie Mitgliederentfernung/Austritt bei Bedarf mit den
   kontrollierten Beispieldaten gesondert überprüfen. Die bisherigen Annahme-/Diskussionsbilder
   allein belegen diese Schritte nicht.
4. Nach der Abnahme Testfreigaben, Demo-Inhalte und temporäre Konten wie vereinbart bereinigen. Die
   Konten bleiben bis dahin für Nachaufnahmen verfügbar.

## Historischer Ausgangsstand vor der Überarbeitung

Die öffentlichen Seiten [Hilfe](https://akribos.de/help) und
[Landingpage](https://akribos.de/about) wurden im echten Browser ohne Anmeldung angesehen, jeweils
bei 1440 × 1000 und 390 × 844 CSS-Pixeln. Texte und eingebundene Bilder wurden zusätzlich aus dem
Live-DOM erfasst. Lokaler Vergleichsstand: Commit `427358d`.

Die Aussagen über angemeldete Kontofunktionen stammten zu diesem Zeitpunkt zunächst aus dem
Repository. Die späteren Live-Prüfungen sind oben getrennt aufgeführt. Der lokale Commit
wurde nicht als Produktionsversion nachgewiesen.

Lokale Belege dieser Sichtung liegen vorläufig in `/tmp/akribos-help-desktop-before.png`,
`/tmp/akribos-help-mobile-before.png`, `/tmp/akribos-about-desktop-before.png` und
`/tmp/akribos-about-mobile-before.png`. Das sind Bestandsaufnahmen, keine fertigen Produktbilder.

### Damaliger Bestand

#### Hilfe

Eine lange Seite mit Einleitung, Themenkarten, seitlichem Inhaltsverzeichnis auf dem Desktop,
13 Themenkapiteln und sieben aufklappbaren FAQ-Antworten. Eine Hilfesuche und eigene Themenseiten
waren in diesem Ausgangsstand nicht vorhanden.

| Kapitel               | Bestehender Schwerpunkt                          | Bild vorhanden            |
| --------------------- | ------------------------------------------------ | ------------------------- |
| Erste Schritte        | Stelle eingeben, Werk ergänzen, Wort untersuchen | Nein                      |
| Bibelstellen finden   | Schreibweisen, Buchnamen, Kapitelwechsel         | Nein                      |
| Lesen & vergleichen   | Kacheln, Tabs, Gruppen, Layout und Darstellung   | Alter Reader-Screenshot   |
| Strong & Urtext       | Bedeutung der Angaben und Strong-Suche           | Nein                      |
| Im Bibeltext suchen   | Suchsyntax, Buchfilter, Ergebnisseiten           | Nein                      |
| Mit Versen arbeiten   | Versmenü, Farben und Notizbereich                | Alter Versmenü-Screenshot |
| Stellensammlungen     | Anlegen, Stellen sammeln, öffentlicher Link      | Nein                      |
| Konto & Einstellungen | Anmeldung, Passwort, Darstellung, API-Schlüssel  | Nein                      |
| Mobil & Tastatur      | Mobile Bedienung und einzelne Tastenkürzel       | Nein                      |
| Dokumente & Editor    | Bibliothek, Tags, Schreiben und Freigabe         | Nein                      |
| Vorbereitung          | Vorlagen, Board und Durchführung                 | Nein                      |
| Import & Export       | Markdown/ZIP-Import, drei Exportformate          | Nein                      |
| Häufige Fragen        | Allgemeine Problemhilfe                          | Nein                      |

Quelle: [`src/routes/help/+page.svelte`](../../src/routes/help/+page.svelte).
Nur `reader-overview.webp` und `verse-menu.webp` werden eingebunden; `strong-study.webp` liegt
zusätzlich ungenutzt in `static/help`. Alle drei Dateien zeigen frühere Oberflächenstände. In den
alten Versmenü-/Strong-Aufnahmen sind Seed-Daten sichtbar.

Mobil wird das seitliche Inhaltsverzeichnis ausgeblendet. Die vollständigen Desktopaufnahmen werden
bei 390 Pixel Viewportbreite auf 356 × 223 Pixel verkleinert; kleine Bedienelemente sind darin schwer
zu erkennen. Die Hilfe war in dieser Ansicht rund 19.500 CSS-Pixel lang. Diese Messung beschreibt den
geprüften Zustand und ist kein Performance-Benchmark.

#### Landingpage

Vorhanden sind Hero mit Bibelmotiv, Reader-Vorstellung, Wortstudie, Suchdemo, persönliche Funktionen,
API-Abschnitt und Abschluss mit Handlungsaufforderungen.

Quellen: [`MarketingLanding.svelte`](../../src/lib/components/MarketingLanding.svelte) und
[`marketing-landing.css`](../../src/lib/components/marketing-landing.css).

Das Hero verwendet `static/about-hero.webp`. Die künstliche Wirkung ist der ausdrücklich genannte
Kritikpunkt des Nutzers; allein aus dem Bild wird keine technische Aussage über seine Herkunft
abgeleitet. Die drei Produktaufnahmen unter `static/landing` zeigen alte UI-Zustände. Die Suchdemo
ist nachgebautes HTML.

### Befunde der ursprünglichen Bestandsaufnahme

| Befund                                                                                      | Konsequenz für die Überarbeitung                                                                      | Beleg                                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Hilfe beschreibt mobile Kachelpillen plus separate Tab-Leiste.                              | Tatsächliche flache mobile Ressourcenleiste erklären und aufnehmen.                                   | Hilfe Zeilen 676–679; Reader `+page.svelte` ab 2300     |
| Hilfe verspricht Notizsymbole und gepunktete Unterstreichungen im Bibeltext.                | Aktuelle Zugänge über Versmenü und Notizbereich zeigen.                                               | Hilfe 539–540; `AGENTS.md` 684–685                      |
| Menü „Dokumente“ und nur zwei Bereichsreiter werden genannt.                                | Aktuelle Bezeichnungen und Stellensammlungen als dritten Bereich verwenden.                           | Hilfe 707–710; `DocumentAreaNav.svelte` ab 12           |
| Benannte Arbeitsbereiche und die eigene Vor-/Zurück-Historie der Tabs fehlen als Anleitung. | Eigene Bedienabläufe mit Bildern ergänzen.                                                            | `ReaderWorkspaceMenu.svelte`; `ReaderTabToolbar.svelte` |
| Word-Import fehlt in der Importanleitung.                                                   | DOCX-Auswahl, Vorschau, Bestätigung und Grenzen erklären.                                             | Hilfe ab 782; `notes/import/+page.svelte` 70            |
| Vorbereitung wirkt auf fünf feste Spalten beschränkt.                                       | Standardspalten als Beispiele kennzeichnen; eigene Spalten und Formate erklären.                      | Hilfe ab 750; `AGENTS.md` ab 713                        |
| Zusammenarbeit an Sammlungen fehlt weitgehend.                                              | Einladungen, Mitgliederrechte, Antworten und Reaktionen getrennt vom öffentlichen Leselink erklären.  | Hilfe ab 549; `AGENTS.md` ab 775                        |
| Bibliothek und Editor sind sehr knapp beschrieben.                                          | Filter, Ansichten, Papierkorb, Befehle, Dokumentlinks, Gliederung, Zen-Modus und Typwechsel ergänzen. | `notes/+page.svelte`; `DocumentEditor.svelte`           |
| „Empfänger braucht kein Konto“ ist bei privaten Werken zu pauschal.                         | Geteilte Ansicht und Ressourcenberechtigung unterscheiden.                                            | Hilfe 495; `AGENTS.md` 63–67                            |
| Technische Begriffe wie „owner-only“ und ZIP-Traversal ersetzen teilweise Bedienhinweise.   | Nutzerziel, Schritte, Ergebnis und verständliche Grenzen in den Vordergrund stellen.                  | Hilfe ab 782                                            |
| Landing-Readerbild zeigt vier Spalten; Bildtext behauptet zwei.                             | Bild und konkrete Aussage gemeinsam prüfen.                                                           | `MarketingLanding.svelte` 74–85                         |
| Landing-Wortstudie zeigt die alte Seitenleiste.                                             | Aktuellen Lexikon-Tab und den Zusammenhang mit der Quellbibel zeigen.                                 | `MarketingLanding.svelte` ab 143                        |
| Landing-Versmenü zeigt einen Gastzustand; Bildtext verspricht persönliche Werkzeuge.        | Angemeldeten Zustand passend zur Aussage aufnehmen.                                                   | `MarketingLanding.svelte` 188–199                       |
| Nachgebaute Suche zeigt „am Anfang“ als exakte Phrase und „Im Anfang“ als Treffer.          | Echte, konsistente Suchergebnisse abbilden.                                                           | `MarketingLanding.svelte` 5–9 und 156–168               |
| Ausarbeitungen und heutige Notizverwaltung kommen auf der Landingpage kaum vor.             | Den Nutzen des aktuellen Gesamtprodukts sichtbar machen.                                              | `MarketingLanding.svelte`                               |

Zeilennummern gelten für den oben genannten lokalen Stand. Befunde an angemeldeten Funktionen wurden anschließend gezielt live abgeglichen; verbleibende Prüfgrenzen stehen oben.
