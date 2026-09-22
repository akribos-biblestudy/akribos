# PDF-Gestaltungsproben für Issue #294

Drei eigenständige Entwürfe mit demselben Beispielinhalt; keine Implementierung des Akribos-Exports. Es wurden keine privaten Dokumente oder Produktionsdaten verwendet. Die zwei kurzen Bibelzitate sind Luther 1912. Alle übrigen Erläuterungen sind eigens verfasste Beispieldaten.

| Variante | Gestaltung                                                                         | Dokument                                                    |
| -------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A        | Klassischer Buchsatz, Blocksatz, eingerückte kursive Zitate, Akribos Text 11,2 pt  | [PDF](variante-A.pdf) · [Vorschau](variante-A-vorschau.png) |
| B        | Akribos Studienblatt, linksbündig, grüne Überschriften, helle Zitatfläche, 11,2 pt | [PDF](variante-B.pdf) · [Vorschau](variante-B-vorschau.png) |
| C        | Lesemanuskript, linksbündig, größere Schrift 12,6 pt, weiterer Zeilenabstand       | [PDF](variante-C.pdf) · [Vorschau](variante-C-vorschau.png) |

Jedes Dokument hat zwei A4-Seiten. Beide Seiten wurden visuell geprüft. Die Hauptproben verwenden zur Vergleichbarkeit einen bewussten Seitenwechsel zwischen den beiden Abschnitten; sie prüfen noch nicht beliebig lange Dokumente.

Die zusätzliche [Umbruchprobe](umbruchprobe.pdf) ist ein absichtlicher Grenzfall: Ein Verweis nahe dem Seitenende löst eine lange Fußnote aus, die auf Seite 1 beginnt und mit Prüfabsätzen 6–10 auf Seite 2 fortgesetzt wird. Beide Seiten wurden visuell geprüft; Anfang, zehn nummerierte Absätze und Schluss sind in der Textausgabe vorhanden. Ein wiederholter Verweis verwendet dieselbe Fußnotennummer.

Die PDFs enthalten eingebettete Akribos-Text-Schnitte (Regular, Italic, SemiBold, Bold und Bold Italic), Noto Sans Hebrew und für Code die von Typst mitgelieferte DejaVu Sans Mono. `pdffonts` bestätigt Einbettung und Unicode-Zuordnung aller verwendeten Schriften. Die vorhandenen WOFF2-Dateien werden für Typst verlustfrei als TTF gespeichert; Konturen, Abstände und Namen werden nicht verändert. Die Schriftlizenzen bleiben maßgeblich: [Akribos Text OFL](../../../data/fonts/akribos-text/OFL.txt), Noto Sans Hebrew unter OFL und DejaVu unter seiner eigenen offenen Schriftlizenz.

## Reproduktion

Benutzt: Typst 0.15.1 (9dfd3a08), Python 3.12, fonttools 4.59.0 und Brotli gemäß `requirements.txt`. Poppler liefert `pdftoppm`, `pdfinfo`, `pdffonts` und `pdftotext`. Im Akribos-Checkout müssen die vorhandenen Node-Abhängigkeiten installiert sein, damit die Noto-Schriftdateien verfügbar sind.

```sh
python3 -m venv /tmp/akribos-pdf-proposal-env
/tmp/akribos-pdf-proposal-env/bin/pip install -r requirements.txt
PYTHON_BIN=/tmp/akribos-pdf-proposal-env/bin/python bash build.sh /path/to/akribos
sha256sum -c SHA256SUMS
```

Die Typst-Quellen laden keine externen Pakete. Schriften kommen aus dem Checkout und den installierten Abhängigkeiten; Systemschriften sind deaktiviert. Für bytegleiche PDFs müssen die genannten Werkzeug- und Schriftversionen unverändert bleiben. Die PNG-Vorschau kann je nach Poppler-Version abweichen.

Die Proben validieren die gestalterische Machbarkeit mit Typst. Der Markdown-Adapter, Betriebsgrenzen, vollständige Dokumenttypen, Link- und Berechtigungsregressionen sowie automatische Exporttests sind noch umzusetzen und zu prüfen. Aus `Tagged: yes` folgt keine geprüfte PDF/UA-Konformität. Hebräisch und griechische Akzente wurden in den Proben visuell betrachtet; eine umfassende sprachwissenschaftliche Prüfung ist damit nicht verbunden.
