import { describe, expect, it } from 'vitest';
import { Marked } from 'marked';
import {
	createDocumentFootnoteLexer,
	isDocumentFootnoteId,
	parseDocumentFootnotes,
	repairLegacyDocumentFootnotes,
	serializeDocumentFootnotes,
	type DocumentFootnote
} from './document-footnotes.ts';

function references(markdown: string, notes: DocumentFootnote[], inline = false) {
	const lexer = createDocumentFootnoteLexer(notes);
	const found: Array<{ id: string; number: number }> = [];
	new Marked().walkTokens(inline ? lexer.lexInline(markdown) : lexer.lex(markdown), (token) => {
		if (token.type === 'documentFootnoteReference')
			found.push({ id: token.id, number: token.number });
	});
	return found;
}

describe('document footnote parsing', () => {
	it('numbers first references, shares repeated references and retains unused definitions', () => {
		const parsed = parseDocumentFootnotes(
			'Zuerst[^b], dann[^a] und wieder[^b].\n\n[^a]: Erste Erklärung.\n\n[^b]: Zweite Erklärung.\n\n[^unused]: Unbenutzt, aber behalten.'
		);
		expect(parsed.footnotes).toEqual([
			{ id: 'b', number: 1, markdown: 'Zweite Erklärung.\n' },
			{ id: 'a', number: 2, markdown: 'Erste Erklärung.\n' },
			{ id: 'unused', number: 3, markdown: 'Unbenutzt, aber behalten.\n' }
		]);
		expect(parsed.warnings).toHaveLength(1);
		expect(references(parsed.bodyMarkdown, parsed.footnotes)).toEqual([
			{ id: 'b', number: 1 },
			{ id: 'a', number: 2 },
			{ id: 'b', number: 1 }
		]);
		expect(
			parseDocumentFootnotes(serializeDocumentFootnotes(parsed.bodyMarkdown, parsed.footnotes))
		).toEqual(parsed);
	});

	it('uses the same local footnote tokens in block and inline export lexers without leaking IDs', () => {
		const first = [{ id: 'same', number: 3, markdown: 'Erste\n' }];
		const second = [{ id: 'same', number: 7, markdown: 'Zweite\n' }];
		for (const inline of [false, true]) {
			expect(references('**Wort[^same]**', first, inline)).toEqual([{ id: 'same', number: 3 }]);
			expect(references('**Wort[^same]**', second, inline)).toEqual([{ id: 'same', number: 7 }]);
			expect(references('**Wort[^same]**', [], inline)).toEqual([]);
		}
	});

	it('keeps adjacent references and separated parentheses while respecting real inline and reference links', () => {
		const parsed = parseDocumentFootnotes(
			'[^a][^b] [^a] [^b] [^a] (Einschub) [^a](https://example.com) [^a][quelle].\n\n[quelle]: https://example.com/source\n\n[^a]: A.\n\n[^b]: B.\n'
		);
		expect(references(parsed.bodyMarkdown, parsed.footnotes)).toEqual([
			{ id: 'a', number: 1 },
			{ id: 'b', number: 2 },
			{ id: 'a', number: 1 },
			{ id: 'b', number: 2 },
			{ id: 'a', number: 1 }
		]);
		// Without whitespace, CommonMark treats the parentheses as a relative link destination.
		expect(references('[^a](Einschub)', parsed.footnotes, true)).toEqual([]);
		expect(references('[^a][^b]', parsed.footnotes, true)).toHaveLength(2);
	});

	it.each([
		'\\[^n]',
		'`[^n]`',
		'[Verweis[^n]](https://example.com)',
		'[^n](https://example.com)',
		'[Quelle](https://example.com/[^n])',
		'```md\n[^n]\n[^code]: Beispiel\n```',
		'`mehrzeilig\n[^code]: Literal\n[^n]`'
	])('respects intentionally literal markers and code/link scopes: %s', (body) => {
		const parsed = parseDocumentFootnotes(`${body}\n\n[^n]: Erhaltene Definition.\n`);
		expect(parsed.footnotes.map((note) => note.id)).toEqual(['n']);
		expect(references(parsed.bodyMarkdown, parsed.footnotes)).toEqual([]);
		expect(parsed.bodyMarkdown.trim()).toBe(body);
	});

	it('retains rich definition blocks, nested references as literals and their unused targets', () => {
		const parsed = parseDocumentFootnotes(
			'Text[^a].\n\n[^a]: **Erster Absatz** mit [Link](https://example.com).\n\n    Zweiter Absatz mit [^b].\n\n        code [^b]\n\n    - Liste\n\n[^b]: Behalte mich.\n'
		);
		expect(parsed.footnotes[0]!.markdown).toContain('Zweiter Absatz mit \\[^b].');
		expect(parsed.footnotes[0]!.markdown).toContain('- Liste');
		expect(parsed.footnotes[0]!.markdown).toContain('    code [^b]');
		expect(parsed.footnotes[1]!.markdown).toBe('Behalte mich.\n');
		expect(parsed.warnings).toHaveLength(2);
	});

	it('keeps duplicate, unsupported and missing definitions visible instead of accepting Marked link definitions', () => {
		const parsed = parseDocumentFootnotes(
			'Text[^duplicate] [^missing] [^unsupported.id].\n\n[^duplicate]: one\n\n[^duplicate]: two\n\n[^unsupported.id]: three\n'
		);
		expect(parsed.footnotes).toEqual([]);
		expect(parsed.bodyMarkdown).toContain('\\[^duplicate]: one');
		expect(parsed.bodyMarkdown).toContain('\\[^duplicate]: two');
		expect(parsed.bodyMarkdown).toContain('\\[^unsupported.id]: three');
		expect(parsed.warnings.length).toBeGreaterThan(0);
	});

	it('accepts stable IDs without permitting HTML attributes or unbounded labels', () => {
		for (const id of [
			'aufgaben_aelteste',
			'fn_1594bb3c-791c-44b9-a77e-e477d402a004',
			'a'.repeat(64)
		])
			expect(isDocumentFootnoteId(id)).toBe(true);
		for (const id of ['', 'a'.repeat(65), 'x" onclick="bad', 'a b', null, 1])
			expect(isDocumentFootnoteId(id)).toBe(false);
	});

	it('keeps thousands of notes complete through parsing, legacy repair and serialization', () => {
		const count = 2500;
		const refs = Array.from({ length: count }, (_, index) => `Text\\[^note_${index}\\]`).join(' ');
		const defs = Array.from(
			{ length: count },
			(_, index) => `\\[^note_${index}\\]: Erklärung ${index}.`
		).join('\n\n');
		const repaired = repairLegacyDocumentFootnotes(`${refs}\n\n${defs}`);
		expect(repaired.changed).toBe(true);
		const parsed = parseDocumentFootnotes(repaired.markdown);
		expect(parsed.footnotes).toHaveLength(count);
		expect(parsed.warnings).toEqual([]);
		for (const [index, note] of parsed.footnotes.entries())
			expect(note).toEqual({
				id: `note_${index}`,
				number: index + 1,
				markdown: `Erklärung ${index}.\n`
			});
		expect(serializeDocumentFootnotes(parsed.bodyMarkdown, parsed.footnotes)).toBe(
			repaired.markdown
		);
	});

	it('bounds diagnostic output while keeping every unresolved reference in the body', () => {
		const source = Array.from({ length: 100 }, (_, index) => `[^missing_${index}]`).join(' ');
		const parsed = parseDocumentFootnotes(source);
		expect(parsed.bodyMarkdown.trim()).toBe(source);
		expect(parsed.warnings.length).toBeLessThanOrEqual(33);
	});
});

describe('explicit legacy footnote repair', () => {
	it('does not promote a nested definition out of an outer definition during repair', () => {
		const source =
			'Text[^outer], [^nested].\n\n[^outer]: Ganze Erklärung.\n\n    [^nested]: Dieses Beispiel gehört zur äußeren Fußnote.\n';
		expect(repairLegacyDocumentFootnotes(source)).toMatchObject({
			markdown: source,
			changed: false
		});
		const parsed = parseDocumentFootnotes(source);
		expect(parsed.footnotes).toHaveLength(1);
		expect(parsed.footnotes[0]!.markdown).toContain(
			'\\[^nested]: Dieses Beispiel gehört zur äußeren Fußnote.'
		);
	});
	it('separates both definitions glued onto one line in the issue example without losing the second Bible link', () => {
		const source =
			'Die Aufgaben[^aufgaben_aelteste] und die Jünger[^juenger]. [^aufgaben_aelteste]: Entnommen aus William MacDonald. Weitere wichtige Dinge. [^juenger]: Siehe [Johannes 8,31](https://github.com/Joh8,31).';
		const repaired = repairLegacyDocumentFootnotes(source);
		const parsed = parseDocumentFootnotes(repaired.markdown);
		expect(repaired.changed).toBe(true);
		expect(parsed.bodyMarkdown.trim()).toBe(
			'Die Aufgaben[^aufgaben_aelteste] und die Jünger[^juenger].'
		);
		expect(parsed.footnotes.map((note) => note.markdown)).toEqual([
			'Entnommen aus William MacDonald. Weitere wichtige Dinge.\n',
			'Siehe [Johannes 8,31](https://github.com/Joh8,31).\n'
		]);
		expect(repairLegacyDocumentFootnotes(repaired.markdown).changed).toBe(false);
	});

	it.each([
		'Text\\[^aufgaben\\_aelteste\\].\n\n\\[^aufgaben\\_aelteste\\]: Ganze Erklärung.',
		'Text[^aufgaben_aelteste].\n\n\\[^aufgaben\\_aelteste\\]: Ganze Erklärung.',
		'Text\\[^aufgaben\\_aelteste\\].\n\n[^aufgaben_aelteste]: Ganze Erklärung.'
	])('repairs paired escaped or mixed legacy markers: %s', (source) => {
		const repaired = repairLegacyDocumentFootnotes(source);
		expect(repaired.markdown).toBe(
			'Text[^aufgaben_aelteste].\n\n[^aufgaben_aelteste]: Ganze Erklärung.\n'
		);
		expect(repaired.changed).toBe(true);
	});

	it.each([
		'Text\\[^n].',
		'\\[^n]: Ohne Verweis.',
		'Text\\[^n].\n\n\\[^n]: Eins.\n\n\\[^n]: Zwei.',
		'`Text\\[^n]`\n\n\\[^n]: Nur Code.',
		'[Text\\[^n\\]](https://example.com)\n\n\\[^n]: Nur Link.'
	])('leaves ambiguous, unpaired, code and link sources untouched: %s', (source) => {
		expect(repairLegacyDocumentFootnotes(source)).toMatchObject({
			markdown: source,
			changed: false
		});
	});

	it('repairs repeated Mammoth references and endnotes while preserving rich definition content', () => {
		const source =
			'Text[\\[1\\]](#footnote-1), erneut[\\[2\\]](#footnote-1), Ende[\\[3\\]](#endnote-4).\n\n1. **Erklärung** mit [Quelle](https://example.com). [↑](#footnote-ref-1)\n2. Zweite Erklärung. [↑](#endnote-ref-4)';
		const repaired = repairLegacyDocumentFootnotes(source);
		const parsed = parseDocumentFootnotes(repaired.markdown);
		expect(references(parsed.bodyMarkdown, parsed.footnotes)).toEqual([
			{ id: 'footnote-1', number: 1 },
			{ id: 'footnote-1', number: 1 },
			{ id: 'endnote-4', number: 2 }
		]);
		expect(parsed.footnotes.map((note) => note.markdown)).toEqual([
			'**Erklärung** mit [Quelle](https://example.com).\n',
			'Zweite Erklärung.\n'
		]);
		expect(repaired.markdown).not.toContain('[↑]');
	});
});
