# Wörterbücher für Übersetzungsgrundformen

Diese Dateien enthalten sprachabhängige Kandidaten für die Grundform eines übersetzten Wortes.
Sie verändern weder den Bibeltext noch die griechischen/hebräischen Lemmata im Wortindex.
Der Server liest die gebündelten Dateien lokal; zur Laufzeit sind weder Python noch ein externer
Sprachdienst nötig. Die Aufbereitung verwendet ausschließlich die Python-Standardbibliothek
(Python 3.11 oder neuer).

## Deutsche Daten: Herkunft und Lizenz

`de.tsv.gz` ist eine bearbeitete Fassung von **IWNLP: Inverse Wiktionary for Natural Language
Processing**, erstellt von Matthias Liebeck und Stefan Conrad auf Grundlage der Beiträge des
deutschen Wiktionary. Der verwendete Wörterbuchstand ist **1. Oktober 2018**. Dies ist ein
festgeschriebener älterer Datenstand; unbekannte Wörter und historische Schreibungen können fehlen.

- [IWNLP-Projekt und Lizenzangabe](https://www.iwnlp.com/)
- [Originalarchiv IWNLP.Lemmatizer_20181001.zip](https://dbs.cs.uni-duesseldorf.de/datasets/iwnlp/IWNLP.Lemmatizer_20181001.zip)
- [Deutsches Wiktionary und seine Mitwirkenden](https://de.wiktionary.org/)
- [Publikation von Liebeck und Conrad, ACL 2015](https://aclanthology.org/P15-2068/)
- [Upstream-Lizenztext](https://github.com/Liebeck/IWNLP/blob/master/LICENSE.md)

Die Quelldaten und die hier bereitgestellte bearbeitete deutsche Tabelle werden unter
**Creative Commons Namensnennung – Weitergabe unter gleichen Bedingungen 3.0 Unported
(CC BY-SA 3.0)** weitergegeben. Der vollständige Lizenztext liegt in
[LICENSE-CC-BY-SA-3.0.txt](LICENSE-CC-BY-SA-3.0.txt). Diese Lizenzangabe gilt für die Sprachdaten.

Änderungen durch Akribos: Der einzige leere Quellschlüssel mit sechs unbrauchbaren Kandidaten
wurde entfernt. Die übrigen Formen, Lemmata und Wortarten wurden in Unicode-NFC normalisiert,
nach der tatsächlichen Groß-/Kleinschreibung der inneren `Form` zusammengeführt, dedupliziert,
sortiert und in das nachstehende komprimierte TSV-Format umgewandelt. Alle Wortarten und alle
verbleibenden Kandidaten bleiben erhalten. Es wurden keine neuen Lemmata geraten.

## Dateiformat

Formatkennung: `lemma-candidates-tsv-v1`. Die Kennung steht in der Build-Ausgabe, nicht als Kopfzeile
in der Datendatei. Nach dem Entpacken folgt je Form genau eine UTF-8-Zeile:

```text
Reich	[["Reich","Noun"]]
Reiche	[["Reich","Noun"],["Reiche","AdjectivalDeclension"],["Reicher","AdjectivalDeclension"]]
Reiches	[["Reich","Noun"]]
```

Zwischen Form und JSON steht ein echtes Tabulatorzeichen. Das JSON enthält Paare in der Reihenfolge
`[lemma, pos]`. Die Formen sind anhand ihrer UTF-8-Bytes sortiert; Kandidaten sind zuerst nach den
UTF-8-Bytes des Lemmas und dann der Wortart sortiert. Jede Zeile endet mit LF, auch die letzte.
Form, Lemma und Wortart sind nicht leer und enthalten keine Steuerzeichen. Es gibt keine Kopfzeile
und keinen BOM. Die gzip-Datei enthält weder einen Dateinamen noch eine Änderungszeit (`mtime = 0`).

IWNLP verwendet `Noun`, `Verb`, `Adjective`, `AdjectivalDeclension`, `Pronoun` und `X` als Wortarten.
`Reiche` zeigt, warum Kandidaten und Groß-/Kleinschreibung nicht vorzeitig verloren gehen dürfen:
Das Wort kann eine Form von `Reich` oder eine substantivierte Personenbezeichnung sein. Die
Laufzeit darf mehrdeutige Treffer nicht allein anhand der Wörterbuchreihenfolge auflösen.

## Prüfsummen des gebündelten Stands

Erzeugt mit Python 3.12.13. SHA-256-Werte beziehen sich jeweils auf die exakten Datei-Bytes.

| Datei/Zustand | Bytes | SHA-256 |
| --- | ---: | --- |
| Originalarchiv | 4.467.738 | `830caaaec1bcc9aa709524494fca2d1c86de700260e35ee3f56e67f55f60c20c` |
| Original-JSON | 83.134.068 | `e548018c691afeb5de07b07f951c205de008379939efd0af1620849ae85590ca` |
| Bereinigtes JSON, wie unten erzeugt | 45.800.568 | `df66628feef6b656c9bcd02404246a2815334d563b42b256fdbf3c78c180852c` |
| Entpacktes `de.tsv` | 18.835.508 | `6982f322647c2ef9ccf713b677118ba1bb5d593c4ae8ae54a8b11ea81809f029` |
| Gebündeltes `de.tsv.gz` | 1.895.870 | `a92ccfc177eb7839af99af0b0c90e5c7b39ce830e48a0c58127bb24beb0c3eac` |

Die Tabelle enthält **477.403 Formen/Zeilen** und **493.013 eindeutige `[lemma, pos]`-Paare**.

## Offline reproduzieren

Das Originalarchiv einmalig über den obigen Link beziehen und als
`/tmp/IWNLP.Lemmatizer_20181001.zip` ablegen. Die folgenden Schritte benötigen kein Netzwerk.
Der erste Schritt prüft das Original und entfernt genau den bekannten defekten leeren Schlüssel.
Die sonstige Verarbeitung lehnt leere Werte und Steuerzeichen strikt ab.

```bash
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
import hashlib
import json

archive = Path('/tmp/IWNLP.Lemmatizer_20181001.zip').read_bytes()
assert hashlib.sha256(archive).hexdigest() == '830caaaec1bcc9aa709524494fca2d1c86de700260e35ee3f56e67f55f60c20c'
with ZipFile(BytesIO(archive)) as source:
    original = source.read('IWNLP.Lemmatizer_20181001.json')
assert hashlib.sha256(original).hexdigest() == 'e548018c691afeb5de07b07f951c205de008379939efd0af1620849ae85590ca'
rows = json.loads(original)
removed = [row for row in rows if row['Form'] == '']
assert len(removed) == 1 and len(removed[0]['Lemmas']) == 6
cleaned = json.dumps(
    [row for row in rows if row['Form'] != ''],
    ensure_ascii=False, separators=(',', ':')
).encode('utf-8')
Path('/tmp/iwnlp-clean.json').write_bytes(cleaned)
PY

python3 scripts/build-lemma-dictionary.py \
  --format iwnlp-json \
  --input /tmp/iwnlp-clean.json \
  --sha256 df66628feef6b656c9bcd02404246a2815334d563b42b256fdbf3c78c180852c \
  --output data/lemmas/de.tsv.gz
```

Der Builder schreibt die Anzahl der Formen/Kandidaten, beide Ausgabegrößen und die SHA-256-Werte
als JSON nach stdout. Er validiert den vollständigen Eingang vor dem atomaren Austausch der
Zieldatei. Wiederholte Läufe mit demselben Eingang und derselben Kompressionsbibliothek erzeugen
identische Dateien; bei einer anderen zlib-Version ist zusätzlich die entpackte Prüfsumme maßgeblich.

## Weitere Sprachen

Der Builder akzeptiert alternativ generisches UTF-8-TSV ohne Kopfzeile mit genau drei Feldern
je Zeile: `Form<TAB>Lemma<TAB>POS`. Mehrere Zeilen für dieselbe Form erhalten alle Kandidaten.
Die gleiche Form mit unterschiedlich geschriebenen Unicode-Zeichen wird durch NFC zusammengeführt.

```bash
python3 scripts/build-lemma-dictionary.py \
  --format tsv \
  --input /tmp/language-lemmas.tsv \
  --output data/lemmas/xx.tsv.gz
```

Für jede weitere Sprachdatei sind Quelle, Datenstand, Lizenz, Bearbeitung und Prüfsummen separat
zu dokumentieren. Die Laufzeit verwendet nach einem Deployment die Datei zum validierten zwei- oder dreistelligen
Sprachcode (z. B. `en.tsv.gz`); ohne Datei bleiben Formen unverändert. Erlaubte Wortarten und
Sprachaliasregeln stehen in [docs/translation-lemmas.md](../../docs/translation-lemmas.md).
Dateinamen dürfen nicht aus ungeprüften Ressourcenwerten zusammengesetzt werden.
