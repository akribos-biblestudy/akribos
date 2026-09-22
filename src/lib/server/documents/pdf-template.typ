// Akribos Studienblatt (approved variant B, issue #294).
// Only this versioned file is code. All document strings arrive as JSON and are displayed as text.
#let doc = json("document.json")
#let green = rgb("2f7d32")
#let muted = rgb("66706a")
#set document(title: doc.title, author: "", date: none)
#set page(
  paper: "a4", margin: (x: 24mm, top: 24mm, bottom: 24mm),
  header: [#text(size: 8pt, weight: "bold", fill: green)[AKRIBOS]],
  footer: [#text(size: 8pt, fill: muted)[akribos.de] #h(1fr) #text(size: 8pt, fill: muted)[Seite #context counter(page).display("1 / 1", both: true)]],
)
#set text(font: ("Akribos Text", "Noto Sans Hebrew"), size: 11.2pt, lang: "de", region: "DE", fill: rgb("222823"), hyphenate: false)
#set par(justify: false, leading: 0.5em, spacing: 0.7em)
#set heading(numbering: none)
#show heading: set text(fill: green, weight: "semibold")
#show heading.where(level: 1): set text(size: 15pt)
#show heading.where(level: 2): set text(size: 13pt)
#show heading.where(level: 3): set text(size: 11.8pt)
#show heading.where(level: 4): set text(size: 11.2pt)
#show heading.where(level: 5): set text(size: 11.2pt)
#show heading.where(level: 6): set text(size: 11.2pt)
#show link: set text(fill: green)
#set footnote.entry(separator: line(length: 25%, stroke: 0.45pt + green), clearance: 0.9em, gap: 0.55em, indent: 1.1em)
#show footnote.entry: set text(size: 8.8pt)
#show footnote.entry: set par(justify: false, leading: 0.35em)
#set list(indent: 1em, body-indent: 0.5em, spacing: 0.45em)
#set enum(indent: 1em, body-indent: 0.5em, spacing: 0.45em)
#set raw(theme: none)
#show raw: set text(font: ("DejaVu Sans Mono", "Akribos Text", "Noto Sans Hebrew"), size: 0.85em)
// Native raw lines keep literal whitespace while permitting ordinary line wrapping at spaces.
#show raw.where(block: true): set block(breakable: true)

// Only overwide tokens are broken into grapheme clusters. Weak zero-width spaces are
// layout opportunities, not Unicode characters in the PDF's selectable text.
// One context per run avoids Typst's grouping limit on long paragraphs/footnotes.
#let fit-text(value, width, literal: false, preserve-bidi: false, join-left: false, join-right: false) = context {
  for token in value.matches(regex("\\s+|\\S+")) {
    let piece = if literal { raw(token.text) } else { text(token.text) }
    if measure(piece).width > width {
      if preserve-bidi or token.text.match(regex("\\p{Hebrew}")) != none {
        // Preserve right-to-left order and shaping within each full-width fragment.
        let fragment = ""
        for cluster in token.text.clusters() {
          if fragment != "" and measure(if literal { raw(fragment + cluster) } else { text(fragment + cluster) }).width > width {
            box(if literal { raw(fragment) } else { text(fragment) })
            h(0pt, weak: true)
            fragment = ""
          }
          fragment += cluster
        }
        if fragment != "" { box(if literal { raw(fragment) } else { text(fragment) }); h(0pt, weak: true) }
      } else {
        for cluster in token.text.clusters() {
          box(if literal { raw(cluster) } else { text(cluster) })
          h(0pt, weak: true)
        }
      }
    } else if not preserve-bidi and token.text.trim() != "" and ((join-left and token.start == 0) or (join-right and token.end == value.len())) {
      // Box only joined style fragments. Ordinary text must stay bidi-strong: boxing every
      // word would reverse German words that follow a Hebrew phrase.
      box(piece)
    } else { piece }
  }
}

#let joined(left, right) = {
  (left != none and right != none and not ("footnoteNumber" in left) and not ("footnoteNumber" in right)
    and left.at("language", default: none) == right.at("language", default: none)
    and left.text.match(regex("\\S$")) != none and right.text.match(regex("^\\S")) != none)
}

#let style-run(run, body) = {
  if run.at("language", default: none) == "he" {
    body = text(font: "Noto Sans Hebrew", lang: "he", dir: rtl, body)
  }
  if run.at("bold", default: false) { body = strong(body) }
  if run.at("italic", default: false) { body = emph(body) }
  if run.at("strike", default: false) { body = strike(body) }
  if run.at("underline", default: false) { body = underline(body) }
  if run.at("highlight", default: false) { body = highlight(fill: rgb("fff0a8"), body) }
  if "href" in run { body = link(run.href, body) }
  body
}

// Style/language boundaries can split one RTL-containing word into individually fitting
// fragments that overflow together. Reject that case instead of clipping or reversing letters.
#let validate-rtl-words(runs, width) = context {
  let groups = ()
  let pieces = ()
  for run in runs {
    if "footnoteNumber" in run {
      if pieces.len() > 1 { groups.push(pieces) }
      pieces = ()
    } else {
      for token in run.text.matches(regex("\\s+|\\S+")) {
        if token.text.trim() == "" {
          if pieces.len() > 1 { groups.push(pieces) }
          pieces = ()
        } else { pieces.push((run: run, value: token.text)) }
      }
    }
  }
  if pieces.len() > 1 { groups.push(pieces) }
  for group in groups {
    if group.any(piece => piece.run.at("language", default: none) == "he") {
      let content = group.map(piece => {
        let body = if piece.run.at("code", default: false) { raw(piece.value) } else { text(piece.value) }
        style-run(piece.run, body)
      }).join()
      if measure(content).width > width {
        panic("Ein untrennbares Wort mit hebräischem Text ist zu breit für diese PDF-Zeile.")
      }
    }
  }
}

#let render-inline(runs, render-blocks, width: 162mm) = {
  validate-rtl-words(runs, width)
  for (index, run) in runs.enumerate() {
    if "footnoteNumber" in run {
      let id = label("fn-" + str(run.footnoteNumber))
      if run.at("repeat", default: false) { footnote(id) }
      else {
        let definition = doc.footnotes.find(note => note.number == run.footnoteNumber)
        // Keep the first paragraph inline beside the native footnote number. A block-level
        // layout as the first item would move the note text onto an unnecessary separate line.
        let first = definition.blocks.at(0, default: none)
        let note-content = if first != none and first.kind == "paragraph" {
          render-inline(first.runs, render-blocks, width: 158mm)
          if definition.blocks.len() > 1 {
            parbreak()
            render-blocks(definition.blocks.slice(1))
          }
        } else { render-blocks(definition.blocks) }
        [#footnote(note-content)#id]
      }
    } else {
      let previous = if index > 0 { runs.at(index - 1) } else { none }
      let following = runs.at(index + 1, default: none)
      let content = fit-text(run.text, width, literal: run.at("code", default: false),
        preserve-bidi: run.at("language", default: none) == "he",
        join-left: joined(previous, run), join-right: joined(run, following))
      style-run(run, content)
      // A single unbroken word can cross multiple independently styled runs.
      h(0pt, weak: true)
    }
  }
}


#let render-blocks(items) = {
  for item in items {
    if item.kind == "paragraph" {
      block(above: 0.7em, below: 0.7em,
        layout(size => par(render-inline(item.runs, render-blocks, width: size.width))))
    } else if item.kind == "heading" {
      block(sticky: true, above: 1.0em, below: 0.45em,
        layout(size => heading(level: item.level, render-inline(item.runs, render-blocks, width: size.width))))
    } else if item.kind == "quote" {
      block(width: 100%, breakable: true,
        inset: (left: 4mm, right: 4mm, top: 3mm, bottom: 3mm),
        fill: rgb("f0f5ef"), stroke: (left: 1.8pt + green),
        above: 0.9em, below: 0.9em,
        render-blocks(item.blocks))
    } else if item.kind == "list" {
      if item.ordered {
        enum(start: item.start, ..item.items.map(entry => render-blocks(entry.blocks)))
      } else {
        list(..item.items.map(entry => list.item(render-blocks(entry.blocks))))
      }
    } else if item.kind == "table" {
      table(
        columns: item.headers.len(), inset: 5pt, stroke: 0.4pt + rgb("cbd7cb"),
        align: (x, y) => { let a = item.align.at(x, default: none); if a == "right" { right } else if a == "center" { center } else { left } },
        fill: (x, y) => if y == 0 { rgb("f0f5ef") },
        // A repeated header would duplicate a native footnote's definition/label.
        table.header(repeat: not item.headers.any(cell => cell.any(run => "footnoteNumber" in run)),
          ..item.headers.map(cell => layout(size => strong(render-inline(cell, render-blocks, width: size.width))))),
        ..item.rows.map(row => row.map(cell => layout(size => render-inline(cell, render-blocks, width: size.width)))).flatten(),
      )
    } else if item.kind == "code" {
      block(inset: 6pt, fill: rgb("f5f6f4"), breakable: true,
        layout(size => fit-text(item.text, size.width, literal: true)))
    } else if item.kind == "rule" {
      block(above: 0.8em, below: 0.8em, line(length: 100%, stroke: 0.6pt + green))
    }
  }
}

#layout(size => text(size: 27pt, weight: "semibold", fit-text(doc.title, size.width)))
#v(0.45em)
#for line in doc.metadata { block(above: 0.2em, below: 0.2em, layout(size => text(size: 9pt, fill: muted, render-inline(line, render-blocks, width: size.width)))) }
#v(0.65em)
#render-blocks(doc.blocks)
#if doc.orphans.len() > 0 {
  heading(level: 1, [Fußnoten ohne Verweis])
  for note in doc.orphans {
    heading(level: 2, [Fußnote #note.number])
    render-blocks(note.blocks)
  }
}
