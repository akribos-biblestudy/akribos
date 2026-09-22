import { Marked, type Renderer, type Token, type TokensList } from 'marked';
import { readDocumentInlineCode } from './document-inline-code.ts';

export type DocumentFootnote = { id: string; number: number; markdown: string };
export type ParsedDocumentFootnotes = {
	bodyMarkdown: string;
	footnotes: DocumentFootnote[];
	warnings: string[];
};
export type DocumentFootnoteReferenceToken = {
	type: 'documentFootnoteReference';
	raw: string;
	id: string;
	number: number;
};

export function isDocumentFootnoteId(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

/** Each caller owns its extension state; simultaneous documents cannot exchange note identities. */
export function createDocumentFootnoteMarked(
	footnotes: readonly DocumentFootnote[],
	renderer?: Renderer
): Marked {
	const byId = new Map(footnotes.map((note) => [note.id, note]));
	const instance = new Marked({
		gfm: true,
		breaks: false,
		pedantic: false,
		async: false,
		extensions: [
			{
				name: 'codespan',
				level: 'inline',
				start: (source) => source.indexOf('<code>'),
				tokenizer(source) {
					const code = readDocumentInlineCode(source);
					return code ? { type: 'codespan', ...code } : undefined;
				}
			},
			{
				name: 'documentFootnoteReference',
				level: 'inline',
				start(source) {
					return source.indexOf('[^');
				},
				tokenizer(source) {
					if (this.lexer.state.inLink || this.lexer.state.inRawBlock) return;
					const match = /^\[\^([A-Za-z0-9][A-Za-z0-9_-]{0,63})\]/.exec(source);
					if (!match) return;
					// Only an actual Markdown link owns the label. Adjacent notes and a separated
					// parenthetical phrase must not suppress the preceding footnote.
					const suffix = source.slice(match[0].length);
					const tokenizer = this.lexer.options.tokenizer;
					if (tokenizer) {
						const link = suffix.startsWith('(')
							? tokenizer.link(source)
							: suffix.startsWith('[')
								? tokenizer.reflink(source, this.lexer.tokens.links)
								: undefined;
						if (link?.type === 'link') return link;
					}
					const note = byId.get(match[1]!);
					if (!note || !isDocumentFootnoteId(note.id)) return;
					return {
						type: 'documentFootnoteReference',
						raw: match[0],
						id: note.id,
						number: note.number
					} satisfies DocumentFootnoteReferenceToken;
				},
				renderer(token) {
					const note = token as DocumentFootnoteReferenceToken;
					return `<sup data-footnote-ref="${note.id}">${note.number}</sup>`;
				}
			}
		]
	});
	if (renderer) instance.setOptions({ renderer });
	return instance;
}

/** Both entry points use the local extensions, including when an exporter parses inline runs. */
export function createDocumentFootnoteLexer(footnotes: readonly DocumentFootnote[]): {
	lex: (markdown: string) => TokensList;
	lexInline: (markdown: string) => Token[];
} {
	const instance = createDocumentFootnoteMarked(footnotes);
	return {
		lex: (markdown) => instance.lexer(markdown),
		lexInline: (markdown) => new instance.Lexer(instance.defaults).inlineTokens(markdown)
	};
}

type Range = { start: number; end: number };
type Definition = Range & { id: string; markdown: string; markerEnd: number };
type Replacement = Range & { text: string };

class FootnoteWarnings extends Set<string> {
	override add(message: string): this {
		if (this.size < 32) return super.add(message);
		if (this.size === 32)
			super.add('Weitere Fußnotenhinweise wurden zusammengefasst; der Inhalt bleibt erhalten.');
		return this;
	}
}

function normalise(markdown: string): string {
	const source = markdown.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
	return source.trim() ? `${source.replace(/^\n+|\n+$/g, '')}\n` : '';
}

/** Find source spans that Markdown treats as code, links or raw HTML without rewriting the source. */
function protectedRanges(source: string, protectContainers = false): Range[] {
	const ranges: Range[] = [];
	const visit = (tokens: Token[], from: number, to: number) => {
		let cursor = from;
		for (const token of tokens) {
			if (!token.raw) continue;
			const start = source.indexOf(token.raw, cursor);
			if (start < cursor || start + token.raw.length > to) continue;
			const end = start + token.raw.length;
			cursor = end;
			const legacyNoteLink =
				token.type === 'link' && /^#(?:footnote|endnote)(?:-ref)?-\d+$/.test(token.href);
			const shortcutFootnote = token.type === 'link' && /^\[\^[^\]]+\]$/.test(token.raw);
			if (
				['code', 'codespan', 'html', 'image'].includes(token.type) ||
				(token.type === 'link' && !legacyNoteLink && !shortcutFootnote) ||
				(protectContainers && ['list', 'blockquote'].includes(token.type))
			) {
				ranges.push({ start, end });
			} else if (token.type === 'list') {
				for (const item of token.items) visit(item.tokens, start, end);
			} else if ('tokens' in token && Array.isArray(token.tokens)) {
				visit(token.tokens, start, end);
			}
		}
	};
	visit(new Marked().lexer(source), 0, source.length);
	return ranges.sort((a, b) => a.start - b.start);
}

function covered(position: number, ranges: readonly Range[]): boolean {
	let low = 0;
	let high = ranges.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (ranges[middle]!.start <= position) low = middle + 1;
		else high = middle;
	}
	return low > 0 && position < ranges[low - 1]!.end;
}

function replaceRanges(source: string, changes: readonly Replacement[]): string {
	let result = '';
	let cursor = 0;
	for (const change of [...changes].sort((a, b) => a.start - b.start)) {
		if (change.start < cursor) continue;
		result += source.slice(cursor, change.start) + change.text;
		cursor = change.end;
	}
	return result + source.slice(cursor);
}

/** Continuation paragraphs, lists and code belong to a definition only when indented. */
function definitionAt(source: string, start: number, markerEnd: number, id: string): Definition {
	let end = source.indexOf('\n', markerEnd);
	if (end < 0) end = source.length;
	const lines = [source.slice(markerEnd, end).replace(/^[\t ]+/, '')];
	let cursor = end < source.length ? end + 1 : end;
	while (cursor < source.length) {
		const lineEnd = source.indexOf('\n', cursor);
		const next = lineEnd < 0 ? source.length : lineEnd;
		const line = source.slice(cursor, next);
		if (/^(?: {4}|\t)/.test(line)) {
			lines.push(line.replace(/^(?: {4}|\t)/, ''));
			end = next;
			cursor = next < source.length ? next + 1 : next;
			continue;
		}
		if (!line.trim()) {
			const continuation = /^(?:[\t ]*\n)*(?: {4}|\t)[\t ]*\S/.test(source.slice(cursor));
			if (continuation) {
				lines.push('');
				end = next;
				cursor = next + 1;
				continue;
			}
		}
		break;
	}
	return { start, end, markerEnd, id, markdown: normalise(lines.join('\n')) };
}

function referenceOrder(body: string, notes: readonly DocumentFootnote[]): string[] {
	const order = new Set<string>();
	const instance = createDocumentFootnoteMarked(notes);
	instance.walkTokens(instance.lexer(body), (token) => {
		if (token.type === 'documentFootnoteReference') order.add(token.id as string);
	});
	return [...order];
}

/** Strict parsing never unescapes authored markers or searches inside links and code. */
export function parseDocumentFootnotes(markdown: string): ParsedDocumentFootnotes {
	const source = normalise(markdown);
	const protectedSpans = protectedRanges(source, true);
	const definitions: Definition[] = [];
	const warnings = new FootnoteWarnings();
	for (const match of source.matchAll(/^ {0,3}\[\^([^\]\r\n]+)\]:[\t ]*/gm)) {
		if (covered(match.index, protectedSpans) || covered(match.index, definitions)) continue;
		definitions.push(definitionAt(source, match.index, match.index + match[0].length, match[1]!));
	}
	const counts = new Map<string, number>();
	for (const definition of definitions)
		counts.set(definition.id, (counts.get(definition.id) ?? 0) + 1);
	const notes: DocumentFootnote[] = [];
	const changes: Replacement[] = [];
	for (const definition of definitions) {
		if (!isDocumentFootnoteId(definition.id) || counts.get(definition.id) !== 1) {
			warnings.add(
				`Die Fußnotendefinition „${definition.id}“ ist nicht eindeutig oder nicht unterstützt und bleibt als Text erhalten.`
			);
			const raw = source.slice(definition.start, definition.end);
			changes.push({ ...definition, text: raw.replace('[^', '\\[^') });
			continue;
		}
		let body = definition.markdown;
		const spans = protectedRanges(body);
		const nested: Replacement[] = [];
		for (const match of body.matchAll(/\[\^([^\]\r\n]+)\]/g)) {
			if (covered(match.index, spans) || escapedAt(body, match.index)) continue;
			warnings.add(`Eine verschachtelte Fußnote in „${definition.id}“ bleibt als Text erhalten.`);
			nested.push({ start: match.index, end: match.index, text: '\\' });
		}
		body = replaceRanges(body, nested);
		notes.push({ id: definition.id, number: 0, markdown: body });
		changes.push({ ...definition, text: '' });
	}
	const bodyMarkdown = normalise(replaceRanges(source, changes));
	const order = referenceOrder(bodyMarkdown, notes);
	const knownIds = new Set(notes.map((note) => note.id));
	const referencedIds = new Set(order);
	const bodySpans = protectedRanges(bodyMarkdown);
	for (const match of bodyMarkdown.matchAll(/\[\^([^\]\r\n]+)\]/g)) {
		if (covered(match.index, bodySpans) || escapedAt(bodyMarkdown, match.index)) continue;
		if (!knownIds.has(match[1]!))
			warnings.add(
				`Für den Fußnotenverweis „${match[1]}“ fehlt eine eindeutige Definition; er bleibt als Text erhalten.`
			);
	}
	for (const note of notes) {
		if (!referencedIds.has(note.id)) {
			order.push(note.id);
			warnings.add(`Die Fußnote „${note.id}“ hat keinen Textverweis und bleibt erhalten.`);
		}
	}
	const byId = new Map(notes.map((note) => [note.id, note]));
	return {
		bodyMarkdown,
		footnotes: order.map((id, index) => ({ ...byId.get(id)!, number: index + 1 })),
		warnings: [...warnings]
	};
}

export function serializeDocumentFootnotes(
	body: string,
	notes: readonly Pick<DocumentFootnote, 'id' | 'markdown'>[]
): string {
	const provisional = notes.map((note, index) => ({ ...note, number: index + 1 }));
	const order = referenceOrder(body, provisional);
	const ranks = new Map(order.map((id, index) => [id, index]));
	const ordered = [...notes].sort((a, b) => {
		return (ranks.get(a.id) ?? order.length) - (ranks.get(b.id) ?? order.length);
	});
	const definitions = ordered.map((note) => {
		const lines = normalise(note.markdown).trimEnd().split('\n');
		return `[^${note.id}]: ${lines[0] ?? ''}${lines
			.slice(1)
			.map((line) => `\n${line ? `    ${line}` : ''}`)
			.join('')}`;
	});
	return normalise([normalise(body).trimEnd(), ...definitions].filter(Boolean).join('\n\n'));
}

function escapedAt(source: string, position: number): boolean {
	let slashes = 0;
	for (let index = position - 1; index >= 0 && source[index] === '\\'; index--) slashes++;
	return slashes % 2 === 1;
}

/** Deliberately separate from normal rendering: repair only source-proven reference/definition pairs. */
export function repairLegacyDocumentFootnotes(markdown: string): {
	markdown: string;
	changed: boolean;
	warnings: string[];
} {
	const source = markdown.replace(/\r\n?/g, '\n');
	const spans = protectedRanges(source);
	type Marker = Range & { id: string; escaped: boolean; definition: boolean };
	const markers: Marker[] = [];
	for (const match of source.matchAll(/\\?\[\^([^\]\r\n]{1,256})\]/g)) {
		if (covered(match.index, spans)) continue;
		const rawId = match[1]!.replace(/\\$/, '');
		const id = rawId.replace(/\\([_-])/g, '$1');
		if (!isDocumentFootnoteId(id)) continue;
		markers.push({
			start: match.index,
			end: match.index + match[0].length,
			id,
			escaped: match[0].includes('\\'),
			definition: source[match.index + match[0].length] === ':'
		});
	}
	const definitionMarkers = markers.filter((marker) => {
		if (!marker.definition) return false;
		const lineStart = source.lastIndexOf('\n', marker.start - 1) + 1;
		// An indented label belongs to a previous definition or a code/container block.
		return !/^(?: {4}|\t)/.test(source.slice(lineStart, marker.start));
	});
	const definitions = definitionMarkers.map((marker, index) => {
		const definition = definitionAt(source, marker.start, marker.end + 1, marker.id);
		const next = definitionMarkers[index + 1];
		if (next && next.start < definition.end) {
			definition.end = next.start;
			definition.markdown = normalise(source.slice(marker.end + 1, next.start).trim());
		}
		return { ...definition, escaped: marker.escaped };
	});
	const warnings = new FootnoteWarnings();
	const definitionsById = new Map<string, Definition[]>();
	for (const definition of definitions) {
		const group = definitionsById.get(definition.id) ?? [];
		group.push(definition);
		definitionsById.set(definition.id, group);
	}
	const referencesById = new Map<string, Marker[]>();
	for (const marker of markers) {
		if (marker.definition || covered(marker.start, definitions)) continue;
		const group = referencesById.get(marker.id) ?? [];
		group.push(marker);
		referencesById.set(marker.id, group);
	}
	const changes: Replacement[] = [];
	const notes: Array<Pick<DocumentFootnote, 'id' | 'markdown'>> = [];
	let needsRepair = false;
	for (const definition of definitions) {
		const refs = referencesById.get(definition.id) ?? [];
		if (definitionsById.get(definition.id)!.length !== 1 || refs.length === 0) {
			warnings.add(
				`Die Fußnote „${definition.id}“ konnte nicht eindeutig zugeordnet werden und wurde nicht repariert.`
			);
			continue;
		}
		const lineStart = source.lastIndexOf('\n', definition.start - 1) + 1;
		const inline = !/^ {0,3}$/.test(source.slice(lineStart, definition.start));
		needsRepair ||= definition.escaped || inline || refs.some((ref) => ref.escaped);
		notes.push({ id: definition.id, markdown: definition.markdown });
		changes.push({ ...definition, text: '' });
		for (const ref of refs) changes.push({ ...ref, text: `[^${ref.id}]` });
	}
	let repaired = needsRepair
		? serializeDocumentFootnotes(replaceRanges(source, changes), notes)
		: source;
	const mammoth = repairMammothMarkdown(repaired);
	if (mammoth.changed) repaired = mammoth.markdown;
	for (const warning of mammoth.warnings) warnings.add(warning);
	return {
		markdown: repaired === source ? markdown : repaired,
		changed: repaired !== source,
		warnings: [...warnings]
	};
}

function repairMammothMarkdown(source: string) {
	const spans = protectedRanges(source);
	const refs: Array<Range & { id: string }> = [];
	for (const match of source.matchAll(
		/\[(?:\\?\[)?\d+(?:\\?\])?\]\(#((?:footnote|endnote)-\d+)\)/g
	)) {
		if (!covered(match.index, spans))
			refs.push({ start: match.index, end: match.index + match[0].length, id: match[1]! });
	}
	const definitions: Array<Definition> = [];
	for (const token of new Marked().lexer(source)) {
		if (token.type !== 'list' || !token.ordered) continue;
		let cursor = source.indexOf(token.raw);
		for (const item of token.items) {
			const start = source.indexOf(item.raw, cursor);
			if (start < 0) continue;
			cursor = start + item.raw.length;
			const backlinks = [...item.raw.matchAll(/\[↑\]\(#((?:footnote|endnote))-ref-(\d+)\)/g)];
			if (backlinks.length !== 1) continue;
			const backlink = backlinks[0]!;
			if (item.raw.slice(backlink.index + backlink[0].length).trim()) continue;
			const rawBody = item.raw.slice(0, backlink.index).replace(/^\s*\d+\.[\t ]+/, '');
			definitions.push({
				start,
				end: cursor,
				markerEnd: start,
				id: `${backlink[1]}-${backlink[2]}`,
				markdown: normalise(rawBody.replace(/^ {4}/gm, '').trimEnd())
			});
		}
	}
	const changes: Replacement[] = [];
	const notes: Array<Pick<DocumentFootnote, 'id' | 'markdown'>> = [];
	const warnings = new FootnoteWarnings();
	const referencesById = new Map<string, Array<Range & { id: string }>>();
	for (const ref of refs) {
		const group = referencesById.get(ref.id) ?? [];
		group.push(ref);
		referencesById.set(ref.id, group);
	}
	const definitionCounts = new Map<string, number>();
	for (const definition of definitions)
		definitionCounts.set(definition.id, (definitionCounts.get(definition.id) ?? 0) + 1);
	for (const definition of definitions) {
		const matches = referencesById.get(definition.id) ?? [];
		if (!matches.length || definitionCounts.get(definition.id) !== 1) {
			warnings.add(
				`Die Word-Fußnote „${definition.id}“ bleibt unverändert, weil die Zuordnung nicht eindeutig ist.`
			);
			continue;
		}
		notes.push({ id: definition.id, markdown: definition.markdown });
		changes.push({ ...definition, text: '' });
		for (const ref of matches) changes.push({ ...ref, text: `[^${definition.id}]` });
	}
	return {
		markdown: notes.length
			? serializeDocumentFootnotes(replaceRanges(source, changes), notes)
			: source,
		changed: notes.length > 0,
		warnings: [...warnings]
	};
}
