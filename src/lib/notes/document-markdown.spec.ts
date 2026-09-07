import { describe, expect, it } from 'vitest';
import {
	createDocumentMarkdownExport,
	documentBodyBibleBooks,
	documentBodyBibleReferenceIndex,
	documentHtmlToMarkdown,
	documentMarkdownToHtml,
	DocumentMarkdownError,
	exportDocumentMarkdown,
	MARKDOWN_ROUND_TRIP_LIMITATIONS,
	markdownContentDisposition,
	MAX_DOCUMENT_MARKDOWN_BYTES,
	normalizeDocumentMarkdown,
	previewObsidianMarkdown,
	safeDocumentMarkdownFilename,
	type DocumentMarkdownExportInput
} from './document-markdown.ts';

describe('normalizeDocumentMarkdown', () => {
	it('normalises BOMs, line endings, trailing whitespace and terminal blank lines', () => {
		expect(normalizeDocumentMarkdown('\uFEFF# Titel  \r\n\rText\t\r\n\r\n')).toBe(
			'# Titel\n\nText\n'
		);
		expect(normalizeDocumentMarkdown('\r\n\t\r\n')).toBe('');
	});
});

describe('documentMarkdownToHtml', () => {
	it('retains all heading levels and attribute-free underline/highlight across repeated round trips', () => {
		const input =
			'# Eins\n\n## Zwei\n\n### Drei\n\n#### Vier\n\n##### Fünf\n\n###### Sechs\n\n<u>unterstrichen **fett**</u> und <mark>markiert</mark>\n';
		let markdown = input;
		for (let round = 0; round < 3; round++) {
			const rendered = documentMarkdownToHtml(markdown);
			for (let level = 1; level <= 6; level++) expect(rendered.html).toContain(`<h${level}>`);
			expect(rendered.html).toContain('<u>unterstrichen <strong>fett</strong></u>');
			expect(rendered.html).toContain('<mark>markiert</mark>');
			markdown = documentHtmlToMarkdown(rendered.html);
		}
		expect(
			documentMarkdownToHtml(documentHtmlToMarkdown('<p>&lt;u&gt;literal&lt;/u&gt;</p>')).plainText
		).toBe('<u>literal</u>');
		expect(
			documentMarkdownToHtml('<u onclick="bad()">Text</u> <mark style="color:red">Text</mark>').html
		).not.toMatch(/onclick|style=/);
	});

	it('rewrites imported Bible link labels, including reference-style links and whole ranges', () => {
		const preview = previewObsidianMarkdown(
			'alt.md',
			'[Hebräer 8,8-10](http://strongs.de/heb8,8) (Schlachter 2000).\n\n[Mt 3,12][alt]\n\n[alt]: https://example.com/old\n\n`[Joh 3,16](https://example.com)`\n'
		);
		expect(preview.markdown).toContain('[Hebräer 8,8-10](/Hebr8,8-10)');
		expect(preview.markdown).toContain('[Mt 3,12](/Mt3,12)');
		expect(preview.markdown).toContain('`[Joh 3,16](https://example.com)`');
		expect(preview.html).toContain('href="/Hebr8,8-10"');
		expect(
			documentHtmlToMarkdown('<p><a href="http://strongs.de/heb8,8">Hebräer 8,8-10</a></p>')
		).toContain('(/Hebr8,8-10)');
	});
	it('renders the bounded formatting subset without incidental attributes', () => {
		const result = documentMarkdownToHtml(`# Eins

#### Tiefer

Ein **starker**, _betonter_ und ~~alter~~ Gedanke mit [Bibel](/Joh3,16),
[Web](https://example.com/a?b=1) und [Mail](mailto:test@example.com).

- [x] erledigt
- offen

> Zitat

---

\`inline\`

\`\`\`ts
const answer = 42 < 100;
\`\`\`

| A | B |
| - | - |
| 1 | 2 |
`);

		expect(result.html).toContain('<h1>Eins</h1>');
		expect(result.html).toContain('<h4>Tiefer</h4>');
		expect(result.html).toContain('<strong>starker</strong>');
		expect(result.html).toContain('<em>betonter</em>');
		expect(result.html).toContain('<s>alter</s>');
		expect(result.html).toContain('<a href="/Joh3,16">Bibel</a>');
		expect(result.html).toContain('<a href="https://example.com/a?b=1">Web</a>');
		expect(result.html).toContain('<a href="mailto:test@example.com">Mail</a>');
		expect(result.html).toContain('<li>[x] erledigt</li>');
		expect(result.html).toContain('<blockquote>');
		expect(result.html).toContain('<hr>');
		expect(result.html).toContain('<code>inline</code>');
		expect(result.html).toContain('<pre><code>const answer = 42 &lt; 100;</code></pre>');
		expect(result.html).not.toContain('class=');
		expect(result.html).not.toContain('<table');
		expect(result.plainText).toContain('Ein starker, betonter und alter Gedanke');
	});

	it('neutralises raw HTML, event attributes and unsafe or obfuscated URL schemes', () => {
		const result = documentMarkdownToHtml(`<script>alert('raw')</script>

<style>body { display: none }</style>

<img src=x onerror=alert(1)>

[javascript](javascript:alert(1))
[entity](jav&#x61;script&#58;alert(1))
[data](data:text/html;base64,AAAA)
[protocol-relative](//evil.example/x)
[safe](https://example.com)
`);

		expect(result.html).not.toMatch(/<(?:script|style|img)\b/i);
		expect(result.html).not.toMatch(/(?:onerror|javascript:|data:|evil\.example)/i);
		expect(result.html).toContain('javascript');
		expect(result.html).toContain('<a href="https://example.com">safe</a>');
	});

	it('removes adversarial unterminated active HTML in linear time', () => {
		const result = documentMarkdownToHtml(`${'<script>'.repeat(40_000)}never active`);
		expect(result.html).toBe('');
		expect(result.plainText).toBe('');
	}, 2_000);

	it('drops Markdown images while retaining readable alternative text', () => {
		const result = documentMarkdownToHtml('Vor ![Diagramm](https://example.com/x.png) nach');
		expect(result.html).not.toContain('<img');
		expect(result.html).toContain('<em>Diagramm</em>');
	});
});

describe('documentBodyBibleBooks', () => {
	it('collects distinct books from visible prose and cross-book ranges but skips code', () => {
		const html = '<p>Joh <strong>3,16</strong> und 1Mo 50,26-2Mo 1,2.</p><code>Mt 5,3</code>';
		expect(documentBodyBibleBooks(html)).toEqual([1, 2, 43]);
		expect(documentBodyBibleReferenceIndex(html).ranges).toEqual([
			expect.objectContaining({ startBook: 43, endBook: 43 }),
			expect.objectContaining({ startBook: 1, endBook: 2 })
		]);
	});
});

describe('documentHtmlToMarkdown', () => {
	it('creates stable Markdown and preserves the supported semantic formatting', () => {
		const html = `<h1>Titel</h1><p>Ein <strong>wichtiger</strong> <em>und</em> <s>alter</s>
		<a href="/Joh3">Text</a><br>danach.</p><pre><code>three \`\`\` ticks</code></pre><hr>`;
		const markdown = documentHtmlToMarkdown(html);
		expect(markdown).toContain('# Titel');
		expect(markdown).toContain('**wichtiger**');
		expect(markdown).toContain('_und_');
		expect(markdown).toContain('~~alter~~');
		expect(markdown).toContain('[Text](/Joh3)');
		expect(markdown).toMatch(/\\\n\n?danach\./);
		expect(markdown).toContain('```\nthree ``` ticks\n```');

		const firstHtml = documentMarkdownToHtml(markdown).html;
		const secondMarkdown = documentHtmlToMarkdown(firstHtml);
		expect(secondMarkdown).toBe(markdown);
	});

	it('allow-lists stale HTML before Turndown sees it', () => {
		const markdown = documentHtmlToMarkdown(
			'<p onclick="steal()">Gut <a href="javascript:alert(1)">Link</a></p>' +
				'<script>secret()</script><img src="x" onerror="bad()">'
		);
		expect(markdown).toBe('Gut Link\n');
		expect(markdown).not.toMatch(/javascript|secret|onerror/);
	});

	it('preserves escaped angle-bracket text while removing genuinely active markup', () => {
		const markdown = documentHtmlToMarkdown(
			'<p>Literal &lt;script&gt; &amp; Zeichen <strong>fett</strong></p><script>weg()</script>'
		);
		const rendered = documentMarkdownToHtml(markdown);

		expect(markdown).not.toContain('weg()');
		expect(rendered.html).toContain('&lt;script&gt;');
		expect(rendered.plainText).toContain('Literal <script> & Zeichen fett');
	});

	it('publishes the intentionally lossy boundary as part of the module contract', () => {
		expect(MARKDOWN_ROUND_TRIP_LIMITATIONS.join(' ')).toMatch(/Raw HTML/);
		expect(MARKDOWN_ROUND_TRIP_LIMITATIONS.join(' ')).not.toMatch(/Heading levels/);
		expect(MARKDOWN_ROUND_TRIP_LIMITATIONS.join(' ')).toMatch(/trailing whitespace/);
	});
});

describe('previewObsidianMarkdown metadata', () => {
	it('reads safe note, nested-tag, passage and sermon metadata', () => {
		const preview = previewObsidianMarkdown(
			'predigt.md',
			`---\r
title: Die Liebe Gottes\r
type: sermon\r
tags: [Ausarbeitung/Johannes, Liebe, liebe]\r
passages:\r
  - Joh 3,16-17\r
  - reference: Gen 1,1-2,2\r
    resource: SEEDDE\r
references:\r
  reference: Rö 8,1\r
  resourceId: SEEDPLAIN\r
sermon:\r
  format: bible-study\r
  status: outline\r
  date: 2026-09-06\r
  series: Johannesevangelium\r
---\r
# Einstieg  \r
\r
Text\r
`
		);

		expect(preview).toMatchObject({
			title: 'Die Liebe Gottes',
			kind: 'sermon',
			tags: ['Ausarbeitung/Johannes', 'Liebe'],
			passages: [
				{ reference: 'Joh 3,16-17' },
				{ reference: 'Gen 1,1-2,2', resourceId: 'SEEDDE' },
				{ reference: 'Rö 8,1', resourceId: 'SEEDPLAIN' }
			],
			sermon: {
				status: 'outline',
				format: 'bible-study',
				date: '2026-09-06',
				series: 'Johannesevangelium'
			},
			markdown: '# Einstieg\n\nText\n',
			sourceFilename: 'predigt.md'
		});
		expect(preview.html).toContain('<h1>Einstieg</h1>');
		expect(preview.plainText).toBe('Einstieg Text');
		expect(preview.warnings).toEqual([]);
	});

	it('uses type over kind and safely defaults invalid sermon workflow data', () => {
		const preview = previewObsidianMarkdown(
			'fallback.md',
			`---
type: sermon
kind: note
status: needs-admin
date: 2026-02-30
series: 42
sermon_format: unsupported
---
Body`
		);
		expect(preview.kind).toBe('sermon');
		expect(preview.sermon).toEqual({ status: 'idea' });
		expect(preview.warnings.join(' ')).toMatch(/type took precedence/);
		expect(preview.warnings.join(' ')).toMatch(/defaulted to idea/);
		expect(preview.warnings.join(' ')).toMatch(/date was ignored/);
		expect(preview.warnings.join(' ')).toMatch(/series was ignored/);
		expect(preview.warnings.join(' ')).toMatch(/format was ignored/);
	});

	it('ignores privilege, identity and publication metadata instead of importing it', () => {
		const preview = previewObsidianMarkdown(
			'private.md',
			`---
title: Sicher
id: stolen-id
ownerEmail: victim@example.com
user_id: admin-id
role: admin
visibility: public
published: true
publishedAt: 2020-01-01
publication: injected
admin: true
slug: chosen-slug
pluginData: hello
---
Privat`
		);

		expect(preview).not.toHaveProperty('visibility');
		expect(preview).not.toHaveProperty('owner');
		expect(JSON.stringify(preview)).not.toContain('victim@example.com');
		expect(preview.warnings.join(' ')).toContain('cannot set ownership or publication state');
		expect(preview.warnings.join(' ')).toContain('pluginData');
	});
});

describe('previewObsidianMarkdown content safety', () => {
	it('converts safe wikilinks and reduces unsafe links, embeds and attachments to text', () => {
		const preview = previewObsidianMarkdown(
			'links.md',
			`Siehe [[Studium/Johannes 3|Johannesnotiz]] und [[#Anwendung|unten]].

Unsicher: [[javascript:alert(1)|nicht öffnen]] und [[../privat|privat]].

![[geheim.png]]
![Diagramm](https://example.com/diagram.png)
[Handout](attachments/handout.pdf)

<script>alert('x')</script>
<p onclick="bad()">Lesbarer HTML-Text</p>
`
		);

		expect(preview.markdown).toContain('[Johannesnotiz](<Studium/Johannes%203>)');
		expect(preview.markdown).toContain('[unten](<#Anwendung>)');
		expect(preview.html).toContain('<a href="Studium/Johannes%203">Johannesnotiz</a>');
		expect(preview.html).toContain('nicht öffnen');
		expect(preview.html).not.toMatch(/javascript:|geheim\.png|<img|<script|onclick/);
		expect(preview.html).toContain('<em>Diagramm</em>');
		expect(preview.html).toContain('Handout');
		expect(preview.html).toContain('Lesbarer HTML-Text');
		expect(preview.warnings.join(' ')).toMatch(/wikilinks were converted/i);
		expect(preview.warnings.join(' ')).toMatch(/embed was removed/i);
		expect(preview.warnings.join(' ')).toMatch(/image or attachment/i);
		expect(preview.warnings.join(' ')).toMatch(/attachment link/i);
		expect(preview.warnings.join(' ')).toMatch(/Raw HTML/i);
	});

	it('rejects aliases, alias bombs, custom tags and duplicate YAML keys', () => {
		for (const yaml of [
			'a: &value [one, two]\nb: *value',
			'a: &a [x, x, x]\nb: &b [*a, *a, *a]\nc: [*b, *b, *b]',
			'title: !danger payload',
			'title: !!binary SGVsbG8=',
			'title: one\ntitle: two'
		]) {
			expectMarkdownError(
				() => previewObsidianMarkdown('unsafe.md', `---\n${yaml}\n---\nBody`),
				'invalid_frontmatter'
			);
		}
	});

	it('rejects unclosed and excessively complex frontmatter', () => {
		expectMarkdownError(
			() => previewObsidianMarkdown('broken.md', '---\ntitle: Broken\nBody'),
			'invalid_frontmatter'
		);
		const nested = `${'value: { child: '.repeat(22)}end${'}'.repeat(22)}`;
		expectMarkdownError(
			() => previewObsidianMarkdown('deep.md', `---\n${nested}\n---\nBody`),
			'invalid_frontmatter'
		);
	});
});

describe('previewObsidianMarkdown file boundary', () => {
	it('rejects non-Markdown and traversal filenames', () => {
		for (const filename of ['note.txt', '../note.md', '..\\note.md', '..%2Fnote.md', '.md']) {
			expectMarkdownError(() => previewObsidianMarkdown(filename, 'Body'), 'invalid_filename');
		}
	});

	it('rejects oversized, NUL-containing, binary and invalid UTF-8 content', () => {
		expectMarkdownError(
			() => previewObsidianMarkdown('large.md', 'x'.repeat(MAX_DOCUMENT_MARKDOWN_BYTES + 1)),
			'file_too_large'
		);
		expectMarkdownError(
			() => previewObsidianMarkdown('nul.md', 'before\u0000after'),
			'binary_file'
		);
		expectMarkdownError(
			() => previewObsidianMarkdown('binary.md', 'before\u0001after'),
			'binary_file'
		);
		expectMarkdownError(
			() => previewObsidianMarkdown('encoding.md', new Uint8Array([0xc3, 0x28])),
			'invalid_encoding'
		);
	});
});

describe('Markdown export', () => {
	const input: DocumentMarkdownExportInput = {
		title: 'Liebe & Hoffnung',
		kind: 'sermon',
		tags: ['Ausarbeitung/Johannes', 'Gnade'],
		passages: [{ reference: 'Joh 3,16-17' }, { reference: 'Gen 1,1', resourceId: 'SEEDDE' }],
		sermon: {
			status: 'ready',
			format: 'youth',
			date: '2026-09-06',
			series: 'Johannes',
			deliveries: [
				{ date: '2026-09-13', location: 'Gemeinde Nord' },
				{ date: '2026-10-04', location: 'Hauskreis Süd' }
			]
		},
		markdown: '# Anfang\r\n\r\nEin **Text**.  \r\n',
		createdAt: '2026-09-01T10:20:30.000Z',
		updatedAt: new Date('2026-09-04T12:00:00.000Z')
	};

	it('writes deterministic safe YAML and round-trips through its own importer', () => {
		const first = exportDocumentMarkdown(input);
		const second = exportDocumentMarkdown(input);
		expect(second).toBe(first);
		expect(first).toContain('title: Liebe & Hoffnung\n');
		expect(first).toContain('type: sermon\n');
		expect(first).toContain('resource: SEEDDE\n');
		expect(first).toContain('status: ready\n');
		expect(first).toContain('format: youth\n');
		expect(first).toContain('created: 2026-09-01T10:20:30.000Z\n');
		expect(first).toContain('updated: 2026-09-04T12:00:00.000Z\n');
		expect(first).toContain('# Anfang\n\nEin **Text**.\n');

		const preview = previewObsidianMarkdown('export.md', first);
		expect(preview).toMatchObject({
			title: input.title,
			kind: input.kind,
			tags: input.tags,
			passages: input.passages,
			sermon: input.sermon,
			markdown: '# Anfang\n\nEin **Text**.\n'
		});
		expect(preview.warnings.join(' ')).toMatch(/timestamps are informational/i);
	});

	it('does not export extra identity, id or publication properties at runtime', () => {
		const polluted = {
			...input,
			id: 'internal-id',
			ownerEmail: 'owner@example.com',
			visibility: 'public',
			publishedAt: '2026-01-01'
		} as DocumentMarkdownExportInput & Record<string, unknown>;
		const markdown = exportDocumentMarkdown(polluted);
		expect(markdown).not.toMatch(/internal-id|owner@example\.com|visibility|publishedAt/);
	});

	it('exports sanitised HTML when no Markdown working copy is available', () => {
		const markdown = exportDocumentMarkdown({
			...input,
			kind: 'note',
			sermon: undefined,
			markdown: undefined,
			html: '<p>Ein <strong>alter</strong> <s>Entwurf</s>.</p>'
		});
		expect(markdown).toContain('Ein **alter** ~~Entwurf~~.');
		expect(markdown).not.toContain('sermon:');
	});

	it('creates safe filenames and injection-proof Content-Disposition values', () => {
		expect(safeDocumentMarkdownFilename('../../A: B?\r\n.md')).toBe('A B.md');
		expect(safeDocumentMarkdownFilename('CON')).toBe('document.md');
		const disposition = markdownContentDisposition('Grüße aus Johannes.md');
		expect(disposition).toContain('filename="Grusse aus Johannes.md"');
		expect(disposition).toContain("filename*=UTF-8''Gr%C3%BC%C3%9Fe%20aus%20Johannes.md");
		expect(disposition).not.toMatch(/[\r\n]/);

		const download = createDocumentMarkdownExport(input);
		expect(download).toMatchObject({
			filename: 'Liebe & Hoffnung.md',
			contentType: 'text/markdown; charset=utf-8'
		});
		expect(download.content).toBe(exportDocumentMarkdown(input));
	});

	it('never truncates a Unicode export filename inside a surrogate pair', () => {
		const boundaryTitle = `${'a'.repeat(119)}😀rest`;
		expect(safeDocumentMarkdownFilename(boundaryTitle)).toBe(`${'a'.repeat(119)}😀.md`);
		expect(() => markdownContentDisposition(boundaryTitle)).not.toThrow();
		expect(markdownContentDisposition(boundaryTitle)).toContain('%F0%9F%98%80.md');
	});

	it('rejects invalid export dates, timestamps and metadata instead of guessing', () => {
		expectMarkdownError(
			() => exportDocumentMarkdown({ ...input, sermon: { status: 'ready', date: '2026-02-30' } }),
			'invalid_export'
		);
		expectMarkdownError(
			() => exportDocumentMarkdown({ ...input, updatedAt: 'not-a-date' }),
			'invalid_export'
		);
		expectMarkdownError(
			() => exportDocumentMarkdown({ ...input, tags: ['../unsafe'] }),
			'invalid_export'
		);
	});
});

function expectMarkdownError(action: () => unknown, code: DocumentMarkdownError['code']): void {
	try {
		action();
		expect.fail(`Expected DocumentMarkdownError(${code})`);
	} catch (error) {
		expect(error).toBeInstanceOf(DocumentMarkdownError);
		expect((error as DocumentMarkdownError).code).toBe(code);
	}
}
