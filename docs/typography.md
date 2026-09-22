# Akribos Text

Akribos Text 1.000 ist eine eigene, zurückhaltende Weiterentwicklung von
[Gentium Book 7.000](https://github.com/silnrsi/font-gentium/releases/tag/v7.000).
Die Schrift übernimmt die von Victor Gaultney und SIL entwickelte humanistische
Serifenkonstruktion. Sie ist keine vollständig neu gezeichnete Schrift und ihre
Lesbarkeit wurde nicht durch eine wissenschaftliche Vergleichsstudie nachgewiesen.
Ziel sind ruhige längere Leseabschnitte und ein zusammenpassendes Schriftbild für
deutschen Text, griechischen Urtext und wissenschaftliche Umschrift.

## Zeichnung und Schnitte

Es gibt sechs eigene WOFF2-Dateien: Regular und Italic (400), SemiBold und SemiBold
Italic (600), Bold und Bold Italic (700). Jede entsteht aus dem entsprechenden
echten Ausgangsschnitt. Keine künstliche Schrägstellung, algorithmische Fettung,
globale Streckung oder veränderte x-Höhe ersetzt eine gezeichnete Form.

Die Änderungen werden in `scripts/fonts/build.py` als einzelne Konturpunkte und
Abstände angegeben. Die Zahlen beziehen sich auf 2048 Einheiten je Geviert:

| Bereich                                 | Akribos-Änderung                                                                                     | Zweck                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `e`, aufrecht und kursiv                | Unterer Ausgang 12 Einheiten nach links und 32 nach unten, benachbarte Kurvenkontrollen zur Hälfte   | Etwas mehr offene Fläche zwischen Querstrich und Ausgang                                |
| `c`, aufrecht und kursiv                | Unterer Ausgang 10 nach links und 24 nach unten; oberer Abschluss 18 nach oben; Übergänge zur Hälfte | Die offene rechte Seite bleibt auch in kräftigeren Schnitten deutlicher                 |
| `l`, aufrecht                           | Linke Fußserife 14 nach innen; rechte 28 nach außen, abgestufte Übergänge und 20 mehr Laufweite      | Ein deutlicher nach rechts gerichteter Abschluss unterscheidet die Form von `I` und `1` |
| `ľ`, `ł`, aufrecht                      | Dieselbe Fußgestaltung in den separat gezeichneten Glyphen                                           | Konsistenz auch außerhalb zusammengesetzter Akzentformen                                |
| `r` und zusammengesetzte Akzentformen   | 12 Einheiten zusätzliche Laufweite                                                                   | Etwas mehr Abstand vor dem nächsten Buchstaben, insbesondere bei `rn`                   |
| Leerzeichen und geschütztes Leerzeichen | 32 Einheiten zusätzliche Breite, rund 0,016 em                                                       | Leicht erkennbarere Wortabstände bei unveränderter Buchstabenbreite                     |

Zusammengesetzte Akzentformen übernehmen ihre geänderten Grundkonturen automatisch.
Die eigens gezeichnete Kursive behält ihre Bewegung; insbesondere ihr bereits
eigenständiges `l` wird nicht an den aufrechten Schnitt angeglichen. Alle übrigen
Grundkonturen, die Kerninglogik und die griechische Akzentpositionierung bleiben
erhalten. Unpassende ursprüngliche TrueType-Punktanweisungen werden ausschließlich
aus veränderten Glyphen und deren zusammengesetzten Abkömmlingen entfernt. Andere
Glyphen behalten das Hinting der Ausgangsschrift.

## Zeichen und Darstellung

Der Websatz enthält Latin, Latin Extended A/B und Additional, IPA/Umschrift,
Griechisch einschließlich polytonischer Formen, kombinierende Akzente, Satzzeichen,
Währungszeichen und übliche wissenschaftliche Symbole. Die genauen Unicodebereiche
stehen als `RANGES` im Buildscript. Er enthält absichtlich keinen unvollständigen
hebräischen Zeichensatz; Hebräisch mit Vokal- und Kantillationszeichen verwendet
die separat lokal ausgelieferte Schrift Noto Sans Hebrew. Andere Schriftsysteme
fallen auf die vorhandene Systemschrift zurück.

OpenType-Kerning, Standardligaturen, Zeichenkomposition, lokale Formen und
Akzentpositionierung bleiben erhalten. Kapitälchen, Zahlenvarianten, Brüche und
hoch-/tiefgestellte Ziffern werden mit ausgeliefert; seltene, in Akribos nicht
angebotene sprachwissenschaftliche Stilalternativen der Ausgangsschrift entfallen.
Die Metadaten enthalten vollständige Lizenz- und Urheberangaben. Die tatsächlich
ausgelieferten Dateien werden über Vite importiert und erhalten gehashte URLs.

Die x-Höhe beträgt 930/2048 em (45,41 %), die Grundkonturen wurden dafür nicht
skaliert. Ausgangspunkt der Anwendung ist 18 px für Bibeltext und 17 px für Kommentar-
und Lexikontext mit 1,7-facher Zeilenhöhe. Die persönliche Leseschrift-Skalierung
wirkt einmal auf diese Größen; Bedienelemente verwenden weiterhin die Sans-Schrift.
Urtext und Bibelzitate folgen der Bibelgröße. Freigabeentscheidend bleibt die
Anwendungsprüfung, nicht allein die isolierte Schriftprobe.

Für einen optionalen lokalen Liberation-Serif-Fallback wurden dessen installierte
x-Höhe (940/2048 em) und die Akribos-Metriken gemessen: `size-adjust: 98.93617%`,
`ascent-override: 95.74513%`, `descent-override: 27.14424%`, `line-gap-override: 0%`.
Dies gleicht x-Höhe und Zeilenmetriken an, verspricht aber keine identischen
Zeilenumbrüche. Georgia war in der Buildumgebung nicht vorhanden; dafür werden
keine angeblich gemessenen Ersatzmetriken angegeben.

## Lizenz und Herkunft

Die Schriftdateien, ihre Modifikationen, die zugehörigen Font-Buildskripte und diese
Schriftdokumentation stehen unter der **SIL Open Font License 1.1**, unabhängig von
der AGPL-Lizenz der Anwendung. Der vollständige Text und das erhaltene
Originalcopyright stehen in [OFL.txt](../data/fonts/akribos-text/OFL.txt).

Die Originalschrift nennt „Gentium“ und „SIL“ als Reserved Font Names. Die
abgeleiteten Schriftfamilien-, Voll-, PostScript- und eindeutigen Namen tragen
deshalb ausschließlich Akribos Text. Die Originalnamen erscheinen nur bei Herkunft,
Urheberangabe und Lizenz. Es wird keine Unterstützung oder Empfehlung der
Akribos-Modifikationen durch die Originalautoren behauptet. Die OFL erlaubt
Änderung, Einbettung und Weitergabe unter ihren Bedingungen; Akribos erhebt keine
Lizenzgebühren für diese Schrift.

Primärquellen:

- [SIL: Gentium für Entwickler](https://software.sil.org/gentium/developer/)
- [SIL: Version 7 und Familienstruktur](https://software.sil.org/gentium/release-7-000/)
- [SIL Open Font License](https://openfontlicense.org/)

## Reproduzierbarer Build und Prüfungen

Die sechs Ausgangs-TTFs stammen unverändert aus `GentiumBook-7.000.zip`. Das
Buildscript prüft **vor** der Verarbeitung den vollständigen SHA-256 des Archivs:

```text
fa4e35bcea62dd68befabf4bb7c2765aacd2691f51ec8ae008f5f913ef49f419
```

Downloadadresse und Ausgabedateien sind mit ihren Hashes in
[manifest.json](../data/fonts/akribos-text/manifest.json) festgehalten. Für die
Neuübersetzung wird Python 3.12 mit den exakt gebundenen Werkzeugversionen verwendet.
Sie gehört nicht zum normalen Node-/Website-Build:

```sh
python3 -m venv /tmp/akribos-font-env
/tmp/akribos-font-env/bin/pip install -r scripts/fonts/requirements.txt
/tmp/akribos-font-env/bin/python scripts/fonts/build.py
/tmp/akribos-font-env/bin/python scripts/fonts/build.py --check
```

Der erste Aufruf lädt das versionsgebundene Archiv, erstellt die Fonts und das
Manifest. `--check` baut in einem temporären Verzeichnis und verlangt byteidentische
Ergebnisse zu **allen sechs** eingecheckten Dateien und zum Manifest. Beide Aufrufe
akzeptieren `--source /pfad/GentiumBook-7.000.zip` für einen Build ohne Netzwerk.
OpenType-Zeitstempel und Versionsangaben sind fest; die aktuelle Uhrzeit geht nicht
in die Ausgaben ein. Eine Aktualisierung der Quelle benötigt eine bewusste Prüfung
der Konturpunkte und neue Freigabe.

Jede neu eingelesene WOFF2-Ausgabe wird auf echte Gewichte/Kursiven, Namen und
Lizenz, vollständige geplante Zeichenabdeckung, tatsächlich veränderte Konturen
einschließlich Akzentformen und unveränderte griechische Grundformen geprüft.
HarfBuzz formt deutsche und polytonisch-griechische Passagen sowie Umschrift in
NFC und NFD. Die Glyphenpositionen müssen übereinstimmen, kein Zeichen darf als
`.notdef` erscheinen; Kerning und Positionierung gestapelter Akzente werden eigens
geprüft. Das ersetzt nicht die visuelle Prüfung auf verschiedenen Betriebssystemen.

Eine offline verwendbare Vorher-/Nachher-Schriftprobe lässt sich zusätzlich erzeugen:

```sh
/tmp/akribos-font-env/bin/python scripts/fonts/specimen.py \
  --source /tmp/GentiumBook-7.000.zip --output /tmp/akribos-font-proof.html
```

Sie zeigt Original und Akribos bei identischer Größe, vergrößerte Konturen, alle
sechs Schnitte, griechische Akzente, Umschrift und helle/dunkle Leseflächen. Die Datei
enthält die Fonts direkt und sendet keine Daten an externe Dienste.

Die [redaktionelle Vorher-/Nachher-Schriftprobe](screenshots/issue-288-font-proof.png)
wurde aus dieser Datei in Chromium bei 1440 CSS-Pixeln Breite aufgenommen. Sie ist
eine eigens zusammengestellte Schriftprobe und keine Aufnahme der Produktionsseite.

## PDF fonts

The approved PDF Studienblatt uses the same six Akribos Text faces as the reader. The files under
`data/fonts/pdf/` are losslessly decompressed TrueType versions of the versioned WOFF2 sources;
this is a container conversion, not a second font design. Noto Sans Hebrew supplies regular, semibold
and bold Hebrew. Typst embeds font subsets into every PDF, so recipients need no installed fonts.
Code uses the pinned Typst release's embedded DejaVu Sans Mono. System font discovery is disabled.

`pnpm fonts:pdf` regenerates the print files; `pnpm fonts:pdf:check` checks the manifest, original
OpenType tables and representative NFC/NFD shaping. Tool versions, source hashes and OFL licenses
are versioned with the assets. See [operations.md](operations.md) for the build environment and
[pdf-export.md](pdf-export.md) for layout and failure behavior.
