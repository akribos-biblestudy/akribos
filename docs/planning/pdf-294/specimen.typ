// Standalone visual proposal. Not connected to the Akribos exporter.
#let variant = sys.inputs.at("style", default: "A")
#let variants = (
  A: (name: "Klassischer Buchsatz", size: 11.2pt, leading: 0.48em, margin: (x: 27mm, top: 24mm, bottom: 24mm), justify: true),
  B: (name: "Akribos Studienblatt", size: 11.2pt, leading: 0.5em, margin: (x: 24mm, top: 24mm, bottom: 24mm), justify: false),
  C: (name: "Lesemanuskript", size: 12.6pt, leading: 0.58em, margin: (left: 25mm, right: 31mm, top: 24mm, bottom: 24mm), justify: false),
)
#let style = variants.at(variant)
#let green = rgb("2f7d32")
#let muted = rgb("66706a")
#set document(title: "Akribos PDF-Entwurf " + variant + " — " + style.name, author: "Akribos", date: datetime(year: 2026, month: 9, day: 22))
#set page(
  paper: "a4",
  margin: style.margin,
  header: [#text(size: 8pt, weight: "bold", fill: green)[AKRIBOS] #h(1fr) #text(size: 8pt, fill: muted)[ENTWURF #variant · #style.name]],
  footer: [#text(size: 8pt, fill: muted)[Gestaltungsprobe · Issue \#294 · Beispieldaten] #h(1fr) #text(size: 8pt, fill: muted, context counter(page).display("1 / 1", both: true))],
)
#set text(font: ("Akribos Text", "Noto Sans Hebrew"), size: style.size, lang: "de", region: "DE", fill: rgb("222823"), hyphenate: style.justify)
#set par(justify: style.justify, leading: style.leading, spacing: 0.7em)
#set heading(numbering: none)
#show heading.where(level: 1): it => block(above: 1.1em, below: 0.45em)[#text(size: 1.23em, weight: "semibold", fill: if variant == "B" { green } else { rgb("222823") })[#it.body]]
#show heading.where(level: 2): it => block(above: 0.8em, below: 0.3em)[#text(size: 1.05em, weight: "bold")[#it.body]]
#show link: it => text(fill: green, it)
#set footnote.entry(separator: line(length: 25%, stroke: 0.45pt + green), clearance: 0.9em, gap: 0.55em, indent: 1.1em)
#show footnote.entry: set text(size: 8.8pt)
#show footnote.entry: set par(justify: false, leading: 0.35em)
#let quote-block(body, source) = {
  if variant == "A" {
    block(inset: (left: 6mm, right: 6mm), above: 0.85em, below: 0.85em)[
      #text(style: "italic", body)
      #align(right, text(size: 0.86em, fill: muted, source))
    ]
  } else if variant == "B" {
    block(width: 100%, inset: (left: 4mm, right: 4mm, top: 3mm, bottom: 3mm), fill: rgb("f0f5ef"), stroke: (left: 1.8pt + green), above: 0.9em, below: 0.9em)[
      #body
      #v(0.2em)
      #text(size: 0.86em, fill: green, source)
    ]
  } else {
    block(inset: (left: 5mm), stroke: (left: 0.8pt + green), above: 0.8em, below: 0.8em)[
      #text(weight: "semibold", body)
      #v(0.2em)
      #text(size: 0.82em, fill: muted, source)
    ]
  }
}
#text(size: 9pt, tracking: 0.5pt, fill: green)[BIBELSTUDIUM · JOHANNES 1,1–5]
#v(0.45em)
#text(size: if variant == "C" { 26pt } else { 29pt }, weight: "semibold")[Wort, Licht und Leben]
#v(0.35em)
#text(size: 10pt, fill: muted)[Drei Gestaltungen, derselbe Inhalt · keine Produktionsausgabe]
#v(0.9em)

= Den Anfang aufmerksam lesen

Johannes setzt mit dem *Wort* ein. Der Abschnitt lädt dazu ein, _genau hinzusehen_: Wie hängen Anfang, Leben und Licht zusammen? Die Beobachtung des Textes steht vor der Anwendung. Dieses Studienblatt zeigt beispielhaft, wie Schriftbild, Hervorhebungen und Fußnoten zusammenwirken können.#footnote[Alle Erläuterungen dieser Probe sind eigens verfasste Beispieldaten. Sie sind kein theologischer Kommentar und enthalten keine privaten Notizen.] <beispiel>

#quote-block([„Im Anfang war das Wort, und das Wort war bei Gott, und das Wort war Gott.“], [Johannes 1,1 · Luther 1912])

Die eingerückte Passage bleibt als *Zitat* erkennbar. Der folgende Absatz gehört wieder zur Ausarbeitung. _Kursive Gedanken_, *wichtige Begriffe* und *_betonte Schlüsselwörter_* behalten ihren eigenen Schriftschnitt. Auch #strike[verworfene Formulierungen] und `wörtlicher Code` lassen sich eindeutig unterscheiden.

= Vom Wort zur Beobachtung

Der griechische Ausdruck #text(lang: "el")[λόγος] steht hier neben der Wortfolge #text(lang: "el")[Ἐν ἀρχῇ ἦν ὁ λόγος]. Polytonische Akzente werden in Akribos Text gesetzt. Als hebräische Schriftprobe dient #text(font: "Noto Sans Hebrew", lang: "he", dir: rtl)[בְּרֵאשִׁית]. Die Leserichtung und Vokalzeichen müssen auch in einem deutschen Absatz erhalten bleiben.#footnote[Schriftprobe: Griechisch verwendet die vorhandene Akribos-Text-Familie, Hebräisch die vorhandene Noto-Sans-Hebrew-Familie. Die Zeichen dienen hier der visuellen Prüfung, nicht einer vollständigen Sprachanalyse.]

+ *Beobachten:* Wiederkehrende Wörter markieren und den Satz im Zusammenhang lesen.
+ *Vergleichen:* Die gewählten Stellen #link("https://akribos.de/Joh1,1")[Johannes 1,1] und #link("https://akribos.de/1Mo1,1")[1\. Mose 1,1] mit ihrem Kontext verbinden.
+ *Festhalten:* Den eigenen Gedanken knapp formulieren und seine Begründung als Fußnote ergänzen.

Ein ruhiger Satz hilft, zwischen Text, eigener Beobachtung und Quellenbeleg zu unterscheiden. Die Farbe bleibt auf wenige Orientierungspunkte beschränkt. Fußnoten stehen am Seitenfuß; die laufende Seitenzahl erhält darunter einen eigenen Bereich.

#pagebreak()
= Lesen, prüfen, weiterdenken

Die zweite Seite zeigt einen längeren Lesefluss. Gleiche Quellenhinweise werden nicht erneut nummeriert: Dieser Verweis führt zur ersten Fußnote zurück.#footnote(<beispiel>) Eine neue Anmerkung erhält die nächste Nummer und bleibt mit ihrer Textstelle verbunden.#footnote[Dies ist die dritte Fußnote. Ihr Inhalt steht auf der Seite ihres ersten Verweises; der wiederholte Verweis auf Fußnote 1 führt zur ursprünglichen Definition. *Fett*, _kursiv_ und #link("https://akribos.de/help")[ein Quellenlink] sind auch innerhalb der Anmerkung möglich.]

== 1. Den Zusammenhang bewahren

Eine einzelne Aussage gewinnt Klarheit, wenn ihre Nachbarsätze mitgelesen werden. Dazu gehören die Frage nach dem Gegenstand, die Abfolge der Gedanken und die Wörter, die den Abschnitt verbinden. Die Ausarbeitung darf diese Arbeit sichtbar machen: durch kurze Absätze, klare Überschriften und sparsam gesetzte Hervorhebungen. Die Gestaltung soll die Argumentation unterstützen und ausreichend Raum für die Belege lassen.

#quote-block([„Und das Licht scheint in der Finsternis, und die Finsternis hat’s nicht begriffen.“], [Johannes 1,5 · Luther 1912])

== 2. Beobachtung und Anwendung unterscheiden

*Beobachtung:* Der Text nennt Leben und Licht gemeinsam. _Frage an den Abschnitt:_ Wie entwickelt sich diese Verbindung in den folgenden Versen? Für das Gespräch kann daraus eine offene Frage entstehen. Eine Anwendung wird anschließend als eigener Gedankenschritt formuliert und nicht mit dem Zitat vermischt. So bleibt nachvollziehbar, was aus der Quelle stammt und was zur persönlichen Reflexion gehört.

== 3. Eine Anmerkung am Umbruch

Eine lange Fußnote braucht einen eigenen Platz im Satz. Reicht die Seite nicht aus, muss der Umbruch mit dem Verweis abgestimmt werden; Text und Anmerkungsbereich dürfen sich niemals überlagern. Die folgende Ergänzung macht den verfügbaren Platz bewusst knapp.#footnote[
  Diese längere Anmerkung ist Teil der Gestaltungsprobe. Sie erläutert zunächst den Zweck: Der Satz muss den Platzbedarf einer Fußnote berücksichtigen, bevor die Seite abgeschlossen wird. Für die spätere Umsetzung gehören deshalb mehrzeilige Anmerkungen, mehrere Verweise in einem Absatz und besonders lange Belege in die Abnahme.

  Ein weiterer Absatz prüft die Trennung innerhalb einer Fußnote. Dabei bleiben _Hervorhebungen_, *Schlüsselbegriffe* und das griechische Wort #text(lang: "el")[ἀγάπη] lesbar. Eine Anmerkung, die länger als der freie Bereich einer Seite ist, darf auf der Folgeseite fortgesetzt werden; der Text darf dabei nicht verloren gehen.
]

Als Ergebnis bleibt ein Dokument, das man lesen, ausdrucken und weitergeben kann. Die Gestaltung der drei Varianten verändert den Ton: vom kompakten Buchsatz über das markennähere Studienblatt bis zum großzügigeren Lesemanuskript. Die zugrunde liegenden Inhalte sind identisch.
