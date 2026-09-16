# Grundformen in der Wortstudie

Die Wortstudie fasst erkannte Beugungsformen derselben Übersetzung zusammen. Bei G932 in der
Akribos-Elberfelder werden beispielsweise `Reich` (96), `Reiche` (35) und `Reiches` (19) als
`Reich` (150) angezeigt. Die 62 zusätzlich mit G932 markierten Artikel bleiben als `das` sichtbar.
Die Strong-Zuordnung der Quelldatei wird dadurch nicht korrigiert oder verborgen.

## Auswahl des Verfahrens

Für Issue #282 wurden Wörterbuch-Lookups mit mehreren Kandidaten, einfache Lemma-Listen und
Stemming verglichen. Ein Stamm wie bei der Volltextsuche ist keine verlässliche, lesbare Grundform.
Eine Liste mit nur einem Zielwort verliert außerdem Mehrdeutigkeiten bereits bei der Aufbereitung.

Die deutsche Datei verwendet deshalb den veröffentlichten **IWNLP-Stand vom 1. Oktober 2018**.
[IWNLP](https://www.iwnlp.com/) leitet Kandidaten aus dem deutschen Wiktionary ab und erhält die
Wortarten. `Reiche` kann so sowohl `Reich` als auch eine substantivierte Personenbezeichnung sein.
Die Anwendung wählt kein Ziel allein aufgrund der Reihenfolge oder seiner Häufigkeit.

Die konkret geprüfte Simplemma-Tabelle lieferte für `Reiche` den Wert `Reicher`. In der ebenfalls
geprüften Michmech-/spaCy-Lookup-Grundlage fehlte `Reiches`; einzelne Pronomen wurden ungeeignet
zusammengeführt. Diese Tabellen wurden deshalb nicht gebündelt. Ein kontextuelles NLP-Modell wäre
ein wesentlich größerer Betriebs- und Ressourcenaufwand und würde trotzdem keine fehlerfreie
Worterkennung garantieren. Die vorliegende Lösung benötigt keinen zusätzlichen Dienst und keine
Python-Laufzeit auf dem Server.

Quellen der verglichenen Ansätze: [Simplemma](https://github.com/adbar/simplemma),
[spaCy Lookups](https://github.com/explosion/spacy-lookups-data),
[Lemmatization lists](https://github.com/michmech/lemmatization-lists).

## Regeln und Grenzen

- Die Sprache kommt aus der **Quellbibel**. Das Lexikon kann griechisch oder hebräisch sein, während
  seine Statistik eine deutsche Übersetzung beschreibt.
- Eine eindeutige Wörterbuchanalyse wird direkt verwendet. Bei mehreren Kandidaten muss genau
  einer durch eine andere, eindeutige Wortform **derselben Strong-Nummer und Ressource** belegt sein.
- Unklare Formen bleiben stehen. Würde ihr Anzeigename mit einer anderen aufgelösten Grundform
  kollidieren, bleiben auch die betroffenen Formen getrennt. Unabhängige Lemmata wie `Leben` und
  `leben` werden nicht durch Kleinschreibung zusammengelegt.
- Artikel/Pronomen, unbekannte Wörter und ganze Mehrwortmarkierungen bleiben unverändert. Es
  werden keine Stopwörter entfernt, keine Wörter aus einem Tag herausgeschnitten und keine
  historischen Schreibweisen geraten. Beispielsweise können `Jesu`, `gethan` oder `Thränen` im
  älteren Wörterbuch fehlen.
- Die bestehende Rohstatistik hat Schreibweisen bereits ohne Berücksichtigung der Großschreibung
  zusammengezählt. Verlorene grammatische Unterscheidungen innerhalb einer solchen Rohgruppe
  können ohne zusätzliche Annotationen des Bibeltexts nicht rekonstruiert werden.
- Die Oberfläche zeigt bei einer Zusammenfassung die ursprünglichen Formen mit ihren Einzelzahlen
  in der zugänglichen Tabelle und bei Filterlinks zusätzlich als Tooltip.

## Datenfluss und Performance

`strong_glosses` bleibt die nach Imports aktualisierte Rohstatistik. Für eine Wortstudie werden alle
Zeilen des konkreten Ressourcen-/Strong-Paars geladen und in `src/lib/bible/glosses.ts` gruppiert.
Erst danach werden die häufigsten Gruppen ausgewählt. So fallen Varianten außerhalb der alten
Top-12-/Top-20-Grenze nicht aus der Summe heraus. Die vorhandenen Daten profitieren sofort; ein
Reimport, Backfill oder Datenbankschemawechsel ist nicht erforderlich.

`src/lib/server/lemmas.ts` lädt die Datei der normalisierten Sprache einmalig und asynchron.
Die entpackten UTF-8-Bytes und ein `Uint32Array` der Zeilenanfänge benötigen für Deutsch ungefähr
20,7 MB. Binäre Suche liest nur die Kandidaten der angefragten Formen; es entstehen keine rund
477.000 dauerhaft gehaltenen JavaScript-Objekte. Beim ersten Aufbau des Indexes gibt die Verarbeitung
regelmäßig die Ereignisschleife frei. Der Browser lädt weder das Wörterbuch noch eine NLP-Bibliothek.
Gemeinsam genutzt werden ausschließlich unveränderliche Sprachdaten, keine Ressourcenfreigaben
oder kontobezogenen Statistikantworten.

Ein lokaler Kontrolllauf mit den sieben Produktionsformen von G932 benötigte etwa 151 ms für das
einmalige Laden und Indexieren sowie im Median von 100 warmen Läufen etwa 0,06 ms für die Gruppierung.
Das sind lokale Funktionsmessungen ohne Datenbank/Netzwerk und keine Latenzgarantie für Produktion.

## Filter und API

`gloss=Reich` schränkt die Treffer auf alle enthaltenen Originalformen ein. Alte Links wie
`gloss=Reiches` bleiben gültig. Die Abfrage verwendet die ursprünglichen normalisierten SQL-Schlüssel
der Rohgruppen und zählt weiterhin verschiedene Verse, auch wenn ein Vers mehrere Formen enthält.
Buchfilter und Seitennavigation sind kombinierbar; die Gesamtstatistik bleibt ungefiltert.

Bei unterschiedlichen Lemma-Schreibweisen hat der exakte Anzeigename Vorrang: `Leben` wählt das
Substantiv, `leben` das Verb. Ohne exakten Treffer werden alle zur kleingeschriebenen Anfrage passenden
Gruppen verwendet. `LEBEN` umfasst daher beide. In der API ergänzt das optionale Feld `forms` die
vorhandenen Eigenschaften `display` und `occurrences`, wenn Formen normalisiert oder gebündelt sind.
Auf der Wortstudien-Seite bleiben ausgewählte Gruppen auch außerhalb der normalen Top-20-Auswahl
sichtbar; ihre Hervorhebung verwendet dadurch dieselbe eindeutige Schreibweise wie der Trefferfilter.

## Sprachdateien aktualisieren oder ergänzen

Die reproduzierbare Aufbereitung, das generische TSV-Importformat, Prüfsummen, Lizenz und Quellen
stehen in [data/lemmas/README.md](../data/lemmas/README.md). Eine weitere Sprachdatei wird beim nächsten
Deployment über ihren zwei- oder dreistelligen Sprachcode geladen, beispielsweise `en.tsv.gz`.
`de-CH`/`deu`/`ger` verwenden `de`, `eng` verwendet `en`. Ohne vorhandene Datei bleiben die Formen
unverändert. Für Inhaltswörter versteht die Laufzeit die IWNLP-Wortarten sowie `NOUN`, `VERB`, `ADJ`
und `ADV`; neue Formate müssen ihre Wortarten darauf abbilden.

Nach Änderung einer Datei wird der Server neu gestartet, damit sein Wörterbuchcache zum neuen
Datenstand passt. Dateinamen werden nur aus validierten Sprachcodes gebildet. Die Dateien gehören
zum Deployment; ein öffentlicher Upload-Endpunkt existiert dafür nicht.
