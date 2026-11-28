// Isolated design specimen. build.py inserts the pinned production inline renderer.
#let doc = json("document.json")
#let design = sys.inputs.at("design")
#let book = design == "buchsatz"
#let study = design == "studienausgabe"

#let ink = if book { rgb("22211f") } else if study { rgb("202923") } else { rgb("18232c") }
#let accent = if book { rgb("302e2a") } else if study { rgb("204c3d") } else { rgb("29475d") }
#let muted = if book { rgb("53514c") } else if study { rgb("456356") } else { rgb("4d5f6d") }
#let hairline = if book { rgb("a8a29a") } else if study { rgb("a4b8ae") } else { rgb("aebbc3") }
#let measure-width = if book { 134mm } else { 152mm }
#let type-size = if book { 11.4pt } else if study { 11.8pt } else { 13.4pt }
#let folio(body) = text(size: 8.5pt, fill: muted, body)

#set document(title: doc.title, author: "", date: none)
#set page(
  paper: "a4",
  margin: (
    x: (210mm - measure-width) / 2,
    top: if book { 29mm } else if study { 25mm } else { 22mm },
    bottom: if book or study { 24mm } else { 22mm },
  ),
  header: context {
    if counter(page).get().first() > 1 {
      folio(if book { emph(doc.title) } else { text(weight: "semibold", doc.title) })
      if not book {
        h(1fr)
        folio[Jakobus 1,22–25]
      }
      v(3pt)
      line(length: 100%, stroke: 0.4pt + hairline)
    } else if study {
      folio(text(weight: "bold", tracking: 1.25pt)[AKRIBOS])
    }
  },
  footer: context {
    let number = counter(page).display()
    if book {
      align(center, folio(number))
    } else {
      folio[akribos.de]
      h(1fr)
      folio(number)
    }
  },
)
#set text(
  font: ("Akribos Text", "Noto Sans Hebrew"),
  size: type-size,
  lang: "de",
  region: "DE",
  fill: ink,
  hyphenate: book,
)
#set par(justify: book, leading: if book { 0.54em } else if study { 0.65em } else { 0.69em })
#set heading(numbering: none)
#show heading: set text(fill: accent, weight: "semibold")
#show heading.where(level: 1): set text(size: if book { 16pt } else if study { 18pt } else { 20pt })
#show heading.where(level: 2): set text(size: if book { 13pt } else if study { 13.8pt } else { 15.3pt }, style: if book { "italic" } else { "normal" })
#show link: set text(fill: accent)
#show link: underline.with(stroke: 0.38pt + hairline, offset: 1.3pt)
#set footnote.entry(
  separator: line(length: if book { 20mm } else { 26mm }, stroke: 0.48pt + hairline),
  clearance: 1.0em,
  gap: 0.48em,
  indent: 1.1em,
)
#show footnote.entry: set text(size: if book { 9.1pt } else if study { 9.4pt } else { 10.2pt })
#show footnote.entry: set par(justify: false, leading: 0.46em)
#set list(indent: 1em, body-indent: 0.5em, spacing: 0.45em)
#set enum(indent: 0.65em, body-indent: 0.65em, spacing: 0.5em)
#set raw(theme: none)
#show raw: set text(font: ("DejaVu Sans Mono", "Akribos Text", "Noto Sans Hebrew"), size: 0.85em)

// INLINE_RENDERER
#let render-blocks(items) = {
  for item in items {
    if item.kind == "paragraph" {
      let gap = if book { 0.75em } else if study { 0.98em } else { 0.94em }
      block(above: gap, below: gap,
        layout(size => par(render-inline(item.runs, render-blocks, width: size.width))))
    } else if item.kind == "heading" {
      block(sticky: true, above: if item.level == 1 { 1.38em } else { 1.02em }, below: 0.49em,
        layout(size => heading(level: item.level, render-inline(item.runs, render-blocks, width: size.width))))
    } else if item.kind == "quote" {
      block(
        width: 100%,
        breakable: true,
        inset: if book { (left: 9mm, right: 5mm) } else { (x: 5mm, y: 3.8mm) },
        fill: if study { rgb("eef4ef") } else { none },
        stroke: if book { none } else if study { (left: 1.4pt + accent) } else { (left: 0.8pt + hairline) },
        above: 0.9em, below: 0.95em,
        {
          set par(justify: false, leading: 0.58em)
          set text(style: "italic", size: if book { 11.8pt } else if study { 12.7pt } else { 14.8pt })
          render-blocks(item.blocks)
        },
      )
    } else if item.kind == "list" {
      if item.ordered { enum(start: item.start, ..item.items.map(entry => render-blocks(entry.blocks))) }
      else { list(..item.items.map(entry => list.item(render-blocks(entry.blocks)))) }
    } else if item.kind == "table" {
      block(above: 0.9em, below: 0.95em, {
        set text(size: if book { 10.45pt } else if study { 11.0pt } else { 11.8pt })
        set par(justify: false, leading: 0.46em)
        table(
          columns: (auto, ..range(item.headers.len() - 1).map(_ => 1fr)),
          inset: (x: 5.5pt, y: if book { 4.5pt } else { 6pt }),
          stroke: none,
          align: (x, y) => if item.align.at(x, default: none) == "right" { right } else { left },
          fill: (x, y) => if study and y == 0 { rgb("eef4ef") },
          table.header(
            table.hline(stroke: 0.78pt + accent),
            ..item.headers.map(cell => layout(size => text(weight: "semibold", render-inline(cell, render-blocks, width: size.width)))),
            table.hline(stroke: 0.48pt + hairline),
          ),
          ..item.rows.map(row => row.map(cell => layout(size => render-inline(cell, render-blocks, width: size.width)))).flatten(),
          table.hline(stroke: 0.68pt + accent),
        )
      })
    } else if item.kind == "code" {
      block(inset: 6pt, fill: rgb("f5f5f5"), breakable: true,
        layout(size => fit-text(item.text, size.width, literal: true)))
    } else if item.kind == "rule" {
      block(above: 0.8em, below: 0.8em, line(length: 100%, stroke: 0.5pt + hairline))
    }
  }
}

#block(above: if book { 7mm } else { 1mm }, below: if book { 9mm } else { 8mm }, sticky: true, {
  set align(if book { center } else { left })
  if study {
    line(length: 13mm, stroke: 1.8pt + accent)
    v(4.2mm)
  }
  let title-size = if book { 33pt } else if study { 38pt } else { 35pt }
  let title-text(body) = text(size: title-size, fill: accent, weight: "semibold", body)
  if book {
    block(spacing: 0pt, grid(columns: (1fr, auto, 1fr), [], title-text(doc.title), []))
  } else {
    layout(size => title-text(fit-text(doc.title, size.width)))
  }
  v(if book { 3mm } else { 4mm })
  for line-content in doc.metadata {
    block(above: 3.2pt, below: 3.2pt,
      layout(size => text(size: if book { 10.4pt } else { 10.9pt }, fill: muted,
        render-inline(line-content, render-blocks, width: size.width))))
  }
  if book {
    v(4.5mm)
    line(length: 14mm, stroke: 0.48pt + hairline)
  }
})
#render-blocks(doc.blocks)
