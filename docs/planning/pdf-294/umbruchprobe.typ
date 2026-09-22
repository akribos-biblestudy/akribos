// Deliberate edge-case specimen with a reference near the bottom of a page.
#set document(title: "Akribos PDF — Fußnoten-Umbruchprobe", author: "Akribos", date: datetime(year: 2026, month: 9, day: 22))
#set page(paper: "a4", margin: 24mm,
 header: [#text(size: 8pt, fill: rgb("2f7d32"))[AKRIBOS · TECHNISCHE GESTALTUNGSPROBE · ISSUE \#294]],
 footer: [#text(size: 8pt)[Beispieldaten · bewusster Umbruch-Stresstest] #h(1fr) #text(size: 8pt, context counter(page).display("1 / 1", both: true))])
#set text(font: ("Akribos Text", "Noto Sans Hebrew"), size: 11.2pt, lang: "de")
#set par(leading: 0.48em)
#set footnote.entry(separator: line(length: 25%, stroke: 0.45pt + rgb("2f7d32")), clearance: 0.9em)
#show footnote.entry: set text(size: 9pt)
#show footnote.entry: set par(leading: 0.35em, spacing: 0.7em)
= Eine Fußnote an der Seitengrenze
Diese technische Probe setzt absichtlich einen großen freien Bereich vor den Verweis. Sie gehört zur Rendererbewertung und ist keine vorgeschlagene Gestaltung einer Ausarbeitung.
#v(161mm)
Der folgende Verweis steht bewusst nahe am Seitenende. Seine lange Fußnote muss auf dieser Seite beginnen und sich ohne Textverlust auf der nächsten fortsetzen.#footnote[
  *Anfang der langen Fußnote.* Dieser Satz muss auf derselben Seite wie der erste Verweis stehen.

  #for n in range(1, 11) [
    *Prüfabsatz #n.* Eine Fußnote gehört in den Seitenfuß. Reicht dessen Fläche nicht aus, wird die Anmerkung fortgesetzt. Der fortlaufende Text darf den Notenbereich nicht überdecken. _Hervorhebungen_ bleiben erhalten, ebenso die griechische Schriftprobe Ἐν ἀρχῇ und die Lesereihenfolge des gesamten Belegs.
    #parbreak()
  ]
  *Ende der langen Fußnote.* Auch dieser letzte Satz muss vollständig im PDF vorhanden sein.
] <lang>

Dieser Folgesatz bleibt im normalen Textbereich. Ein weiterer Verweis benutzt dieselbe Nummer.#footnote(<lang>)
