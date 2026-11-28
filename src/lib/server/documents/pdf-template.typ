// Only this versioned file is code. Document strings arrive as typed JSON data.
#let doc = json("document.json")
#let book = doc.template == "buchsatz"
#let study = doc.template == "studienausgabe"
#let author = doc.at("author", default: "")
#let first-passage = doc.at("firstPassage", default: "")

#let ink = if book { rgb("22211f") } else if study { rgb("202923") } else { rgb("18232c") }
#let accent = if book { rgb("302e2a") } else if study { rgb("204c3d") } else { rgb("29475d") }
#let muted = if book { rgb("53514c") } else if study { rgb("456356") } else { rgb("4d5f6d") }
#let hairline = if book { rgb("a8a29a") } else if study { rgb("a4b8ae") } else { rgb("aebbc3") }
#let measure-width = if book { 134mm } else { 152mm }
#let type-size = if book { 11.4pt } else if study { 11.8pt } else { 13.4pt }
#let paragraph-gap = if book { 0.75em } else if study { 0.98em } else { 0.94em }
#let metadata-gap = if book { 7.3pt } else if study { 8.3pt } else { 8.9pt }
#let heading-leading = if book { 0.72em } else if study { 0.78em } else { 0.84em }
#let item-gap = if book { 11.5pt } else if study { 12.8pt } else { 15pt }
#let folio(body) = text(size: 8.5pt, fill: muted, body)

// A running title or profile name lives beside a reference or page number on a single line.
#let fit-folio(value) = layout(size => folio(context {
  if measure(text(value)).width <= size.width { text(value) }
  else {
    let visible = ""
    for cluster in value.clusters() {
      if measure(text(visible + cluster + "…")).width > size.width { break }
      visible += cluster
    }
    text(visible.trim() + "…")
  }
}))

#set document(title: doc.title, author: if author != "" { (author,) } else { () }, date: none)
#set text(
  font: ("Akribos Text", "Noto Sans Hebrew"),
  size: type-size, lang: "de", region: "DE", fill: ink, hyphenate: book,
)
#set page(
  paper: "a4",
  margin: (
    x: (210mm - measure-width) / 2,
    top: if book { 29mm } else if study { 25mm } else { 22mm },
    bottom: if book or study { 24mm } else { 22mm },
  ),
  header: context {
    if counter(page).get().first() > 1 {
      let running-title = if book { emph(fit-folio(doc.title)) } else { text(weight: "semibold", fit-folio(doc.title)) }
      grid(columns: (1fr, auto), column-gutter: 8pt,
        running-title, if book or first-passage == "" { [] } else { folio(first-passage) })
      v(3pt)
      line(length: 100%, stroke: 0.4pt + hairline)
    } else if study {
      folio(text(weight: "bold", tracking: 1.25pt)[AKRIBOS])
    }
  },
  footer: context {
    let number = folio(counter(page).display())
    if book {
      if author == "" { align(center, number) }
      else { grid(columns: (1fr, auto, 1fr), column-gutter: 8pt, fit-folio(author), number, []) }
    } else {
      let identity = if author == "" { "akribos.de" } else { author + " · akribos.de" }
      grid(columns: (1fr, auto), column-gutter: 8pt, fit-folio(identity), number)
    }
  },
)
#set par(justify: book, leading: if book { 0.70em } else if study { 0.79em } else { 0.88em })
#set heading(numbering: none)
#show heading: set text(fill: accent, weight: "semibold", hyphenate: false)
#show heading: set par(justify: false, leading: heading-leading)
#show heading.where(level: 1): set text(size: if book { 16pt } else if study { 18pt } else { 20pt })
#show heading.where(level: 2): set text(size: if book { 13pt } else if study { 13.8pt } else { 15.3pt }, style: if book { "italic" } else { "normal" })
#show heading.where(level: 3): set text(size: type-size * 1.06)
#show heading.where(level: 4): set text(size: type-size)
#show heading.where(level: 5): set text(size: type-size)
#show heading.where(level: 6): set text(size: type-size)
#show link: set text(fill: accent)
#show link: underline.with(stroke: 0.38pt + hairline, offset: 1.3pt)
#set footnote.entry(
  separator: line(length: if book { 20mm } else { 26mm }, stroke: 0.48pt + hairline),
  clearance: 1.0em, gap: 0.48em, indent: 1.1em,
)
#show footnote.entry: set text(size: if book { 9.1pt } else if study { 9.4pt } else { 10.2pt })
#show footnote.entry: set par(justify: false, leading: 0.46em)
#set list(indent: 1em, body-indent: 0.5em, spacing: item-gap)
#set enum(indent: 0.65em, body-indent: 0.65em, spacing: item-gap)
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
    and not ("image" in left) and not ("image" in right)
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
    if "footnoteNumber" in run or "image" in run {
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
    if "image" in run {
      let raster = run.image
      let width-limit = width * (if raster.layout.width == none { 100 } else { raster.layout.width }) / 100
      let image-width = calc.min(width-limit, raster.width * 0.75pt, 180mm * raster.width / raster.height)
      let picture = box(image(bytes(raster.bytes), format: raster.format, width: image-width, alt: run.text))
      if raster.layout.align != none or raster.layout.width != none {
        let alignment = if raster.layout.align == "center" { center } else if raster.layout.align == "right" { right } else { left }
        align(alignment, picture)
      } else { picture }
    } else if "footnoteNumber" in run {
      let id = label("fn-" + str(run.footnoteNumber))
      if run.at("repeat", default: false) { footnote(id) }
      else {
        let definition = doc.footnotes.find(note => note.number == run.footnoteNumber)
        // Keep the first paragraph inline beside the native footnote number. A block-level
        // layout as the first item would move the note text onto an unnecessary separate line.
        let first = definition.blocks.at(0, default: none)
        let note-content = if first != none and first.kind == "paragraph" {
          render-inline(first.runs, render-blocks, width: measure-width - 4mm)
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
      block(spacing: paragraph-gap,
        layout(size => par(render-inline(item.runs, render-blocks, width: size.width))))
    } else if item.kind == "heading" {
      block(sticky: true, above: if item.level == 1 { 1.65em } else { 1.35em }, below: 0.67em,
        layout(size => heading(level: item.level, render-inline(item.runs, render-blocks, width: size.width))))
    } else if item.kind == "quote" {
      block(
        width: 100%, breakable: true,
        inset: if book { (left: 9mm, right: 5mm, y: 1.3mm) } else { (x: 5mm, y: 3.8mm) },
        fill: if study { rgb("eef4ef") } else { none },
        stroke: (left: if study { 1.4pt + accent } else { 0.8pt + hairline }),
        above: if book { 1.45em } else { 0.9em },
        below: if book { 1.48em } else { 0.95em },
        {
          set par(justify: false, leading: if book { 0.69em } else { 0.74em })
          set text(style: "italic", size: if book { 11.8pt } else if study { 12.7pt } else { 14.8pt })
          render-blocks(item.blocks)
        },
      )
    } else if item.kind == "list" {
      if item.ordered {
        enum(start: item.start, ..item.items.map(entry => render-blocks(entry.blocks)))
      } else {
        list(..item.items.map(entry => list.item(render-blocks(entry.blocks))))
      }
    } else if item.kind == "table" {
      block(above: 0.9em, below: 0.95em, {
        set text(size: if book { 10.45pt } else if study { 11pt } else { 11.8pt })
        set par(justify: false, leading: 0.46em)
        table(
          columns: item.headers.len(),
          inset: (x: 5.5pt, y: if book { 4.5pt } else { 6pt }),
          stroke: none,
          align: (x, y) => {
            let alignment = item.align.at(x, default: none)
            if alignment == "right" { right } else if alignment == "center" { center } else { left }
          },
          fill: (x, y) => if study and y == 0 { rgb("eef4ef") },
          // A repeated header would duplicate a native footnote's definition/label.
          table.header(
            repeat: not item.headers.any(cell => cell.any(run => "footnoteNumber" in run)),
            table.hline(stroke: 0.78pt + accent),
            ..item.headers.map(cell => layout(size => strong(render-inline(cell, render-blocks, width: size.width)))),
            table.hline(stroke: 0.48pt + hairline),
          ),
          ..item.rows.map(row => row.map(cell => layout(size => render-inline(cell, render-blocks, width: size.width)))).flatten(),
          table.hline(stroke: 0.68pt + accent),
        )
      })
    } else if item.kind == "code" {
      block(inset: 6pt, fill: rgb("f5f6f4"), breakable: true, {
        set par(justify: false)
        layout(size => fit-text(item.text, size.width, literal: true))
      })
    } else if item.kind == "rule" {
      block(above: 0.8em, below: 0.8em, line(length: 100%, stroke: 0.5pt + hairline))
    }
  }
}

#block(above: if book { 7mm } else { 1mm }, below: if book { 9mm } else { 8mm }, sticky: true, {
  set align(if book { center } else { left })
  set par(justify: false)
  if study {
    line(length: 13mm, stroke: 1.8pt + accent)
    v(4.2mm)
  }
  let title-text = text.with(size: if book { 33pt } else if study { 38pt } else { 35pt },
    fill: accent, weight: "semibold")
  layout(size => {
    if book {
      let title-width = calc.min(size.width, measure(title-text(doc.title)).width)
      block(spacing: 0pt,
        grid(columns: (1fr, title-width, 1fr), [], title-text(fit-text(doc.title, title-width)), []))
    } else { title-text(fit-text(doc.title, size.width)) }
  })
  if doc.metadata.len() > 0 {
    v(if book { 4.5mm } else { 4mm })
    set text(size: if book { 10.4pt } else { 10.9pt }, fill: muted)
    set par(leading: 0.78em)
    for row in doc.metadata {
      block(spacing: metadata-gap,
        layout(size => par(render-inline(row, render-blocks, width: size.width))))
    }
  }
  if book {
    v(4.5mm)
    line(length: 14mm, stroke: 0.48pt + hairline)
  }
})
#render-blocks(doc.blocks)
#if doc.orphans.len() > 0 {
  heading(level: 1, [Fußnoten ohne Verweis])
  for note in doc.orphans {
    heading(level: 2, [Fußnote #note.number])
    render-blocks(note.blocks)
  }
}
