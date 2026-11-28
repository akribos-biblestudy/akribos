# Schriftbild für den PDF-Export

Vergleich für [Issue #354](https://github.com/akribos-biblestudy/akribos/issues/354). Alle vier PDFs enthalten dieselbe Beispielnotiz zu Jakobus 1,22–25. Die Notiz zeigt Bibelstellen und Schlagwörter, eine zweizeilige Überschrift, ein Bibelzitat mit Seitenfußnoten, griechische Wörter, eine Tabelle und eine nummerierte Liste mit umbrochenen Einträgen. Die Schriftfamilie Akribos Text bleibt die gemeinsame Grundlage.

![Erste Seiten und nummerierte Liste des bisherigen Exports und der drei Entwürfe](vergleich.png)

| PDF                                         | Schriftbild                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Bisheriger Export](00-heutiger-export.pdf) | Akribos Studienblatt aus #294 mit 11,2 pt, grünen Überschriften und linksbündigem Text.  |
| [A · Buchsatz](01-buchsatz.pdf)             | 134 mm Satzspiegel, 11,4 pt, Blocksatz mit deutscher Silbentrennung, zentrierter Titel.  |
| [B · Studienausgabe](02-studienausgabe.pdf) | 152 mm Satzspiegel, 11,8 pt, dunkelgrüne Hierarchie und feine Tabellenlinien.            |
| [C · Lesemanuskript](03-lesemanuskript.pdf) | 152 mm Satzspiegel, 13,4 pt, weiterer Zeilenabstand und deutliche Zwischenüberschriften. |

## Zeilenabstände im Vergleich mit LaTeX

- **A · Buchsatz** verwendet 11,4 pt Schrift bei 15,0 pt Grundlinienabstand. Der Satzspiegel folgt der Idee von KOMA-Script `typearea`. Die 11-pt-Klasse `scrartcl` setzt den Fließtext mit 10,95 pt bei 13,6 pt Grundlinienabstand. A gewährt der Akribos-Leseschrift etwas mehr Abstand. [KOMA-Script-Quellen](https://ctan.org/tex-archive/macros/latex2e/contrib/koma-script)
- **B · Studienausgabe** setzt 11,8 pt Fließtext mit 16,6 pt Grundlinienabstand. Tufte-LaTeX verwendet 10/14 pt im Fließtext und 12/16 pt in Überschriften erster Ebene. B übernimmt den Abstandsfaktor von rund 1,4 für den Lesetext und bemisst Überschriften und Metadaten separat. [Tufte-LaTeX-Satzbeispiel](https://github.com/Tufte-LaTeX/tufte-latex/blob/master/sample-book.tex#L365-L385)
- **C · Lesemanuskript** verwendet 13,4/20,0 pt für das Lesen am Pult. Als Referenz dient `article` mit 12 pt und `setspace`. Der Eineinhalbzeilensatz ergibt rund 18 pt Grundlinienabstand bei 12 pt Schrift, also einen Faktor von 1,5. [LaTeX-Standardklassen](https://www.latex-project.org/help/documentation/classes.pdf), [setspace](https://github.com/latex-package-repositories/setspace/blob/main/setspace.sty)

KOMA-Script setzt bei der 11-pt-Klasse für Listen einen zusätzlichen `itemsep` von 4,5 TeX-Punkten vor Streckung und Stauchung an. In den Entwürfen liegen die Grundlinien benachbarter Listenpunkte rund 3,2 bis 3,5 PDF-Punkte weiter auseinander als zwei Zeilen desselben Punkts. [KOMA-Script-Quellen](https://ctan.org/tex-archive/macros/latex2e/contrib/koma-script)

Im Tufte-Musterhandout liegen die Grundlinien von Autor und Datum knapp 20 PDF-Punkte auseinander. Die kleineren Akribos-Metadaten erhalten 13,7 bis 15,6 PDF-Punkte. [Tufte-LaTeX-Musterhandout, Seite 1](https://tug.ctan.org/macros/latex/contrib/tufte-latex/sample-handout.pdf#page=1)

Die Tabelle zeigt Abstände in PDF-Punkten. Gemessen wurde mit `pdftotext -bbox-layout` an aufeinanderfolgenden Zeilen gleichen Schriftgrads. Für „zuvor“ wurde das erweiterte Beispiel auch mit den bisherigen Entwurfsvorlagen aus Commit `c608079` gesetzt. So geht derselbe Text in jede Messung ein.

| Grundlinienabstand                   | Bisheriger Export | A · zuvor → neu | B · zuvor → neu | C · zuvor → neu |
| ------------------------------------ | ----------------- | --------------- | --------------- | --------------- |
| Fließtext                            | 12,5              | 13,2 → 15,0     | 14,9 → 16,6     | 17,5 → 20,0     |
| Mehrzeilige Überschrift              | 16,7              | 18,5 → 21,4     | 22,8 → 25,1     | 26,1 → 29,1     |
| Bibelstellen und Schlagwörter        | 7,8               | 9,6 → 13,7      | 9,9 → 15,0      | 9,9 → 15,6      |
| Zeilen innerhalb eines Listenpunkts  | 12,5              | 13,2 → 15,0     | 14,9 → 16,6     | 17,5 → 20,0     |
| Letzte Zeile bis zur nächsten Nummer | 11,9              | 12,7 → 18,5     | 13,2 → 20,1     | 14,9 → 23,2     |

Der bisherige Export, A und B benötigen je zwei A4-Seiten. In C beginnt der letzte Abschnitt „Das Gespräch vorbereiten“ durch den weiteren Satz auf Seite drei. Alle Umbrüche entstehen beim Satz.

## Zitate und Autor in der Fußzeile

A setzt Zitate kursiv und eingerückt. Eine feine linke Linie von 0,8 pt markiert den Zitatblock im neutralen Farbton des Buchsatzes. Gemessen zwischen den Textfeldern im PDF ist der Weißraum im Beispiel vor dem Zitat von 2,1 auf 12,0 pt und danach von 3,9 auf 13,6 pt gestiegen.

A, B und C setzen den Autorennamen links in die Fußzeile jeder Seite. „Mara Beispiel“ ist eine fiktive Angabe im gemeinsamen Beispielmodell. Bei einem fehlenden oder leeren Wert entfällt die Namensangabe in Fußzeile und PDF-Metadaten. Der produktive PDF-Export bezieht den Namen aus dem aktuell gepflegten Profil-Anzeigenamen. [Beispielmodell](document.json), [Produktiver PDF-Export](../../pdf-export.md)

## Vorlagenauswahl

Die PDF-Vorlage lässt sich in den Benutzereinstellungen auswählen. Studienausgabe ist die Standardeinstellung.

## Reproduktion

Vom Repository-Root aus mit Python 3, Git, Typst 0.15.1, Poppler und ImageMagick 7 ausführen.

```sh
python3 docs/planning/pdf-354/build.py
```

Das Skript setzt [ein gemeinsames Exportmodell](document.json) mit der Produktionsvorlage vom Commit `f1c068c`. Für die drei Entwürfe kombiniert es denselben Inline-Renderer mit [eigenen Typst-Stilen](entwuerfe.typ). Die Schriften kommen aus `data/fonts/pdf`, die Systemschriftensuche ist abgeschaltet. Für die PNG-Vorschau können Poppler- und ImageMagick-Versionen sichtbare Unterschiede verursachen.

Das kurze Bibelzitat stammt aus Luther 1912. Der übrige Beispieltext wurde für diesen Vergleich geschrieben. Die Proben decken normale Textumbrüche ab. Der produktive Export verwendet dieselbe Seitentypografie mit eigenem Umbruch für unter anderem lange Fußnoten, Bilder und schmale Tabellen. Die Abnahme steht in der [Dokumentation des produktiven Exports](../../pdf-export.md).
