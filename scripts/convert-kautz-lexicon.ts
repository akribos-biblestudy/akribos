/**
 * Converts Gerhard Kautz' German Greek-Strong lexicon into the `strongsdictionary` XML format that
 * `data/strongsgreek.xml` already uses, so it can be imported through the normal `pnpm data:import`
 * path with no parser changes.
 *
 * Kautz gave permission by email (on file) to include the converted lexicon on this site and in this
 * repository, on the condition that no factual changes are made to his text, that bold/italic
 * typesetting and the `I.) II.) 1.) 2.) 1a.)` structure survive, and that his copyright notice is
 * carried over verbatim — all of which this script does.
 *
 * The preferred source is his own Word manuscript (richer than the plain-text/HTML mirrors published
 * at sermon-online.com: it is the only one that still carries bold/italic runs, and it also contains
 * the copyright line, the abbreviation glossary, his usage-notes preface and his bibliography, so
 * nothing has to be supplied separately). Convert it to HTML first — `pandoc` preserves paragraph-per-
 * line structure and `<strong>`/`<em>` runs, which is exactly what this script expects:
 *
 *   pandoc -f docx -t html --wrap=preserve -o data/private/kautz-source.html data/private/kautz.docx
 *   node scripts/convert-kautz-lexicon.ts data/private/kautz-source.html data/stronggreek_de_kautz.xml
 *
 * A plain-text source (the sermon-online.com mirror) also still works, just without bold/italic, the
 * abbreviation glossary (pass `--abbreviations` to supply one separately), the usage notes or the
 * bibliography.
 *
 * His "2. Hinweise zur Benützung des Lexikons" section — the reading guide explaining the "I.) II.)
 * 1.) 2.)" numbering and the Gräz./LXX/Synonyme/Wortfamilie/Ggs. labels — and his "3. Die für die
 * Bearbeitung des Lexikons verwendete Fachliteratur" bibliography (the ~80 works his "(37,1)"-style
 * citations throughout definitions point at, which he asked to have credited) both become one
 * `<usage_notes>` element next to `<prologue>`, so the site can point readers at both instead of
 * leaving them to infer the conventions from the entries alone or the citations uncredited; see
 * {@link extractUsageNotesFromLines} and {@link extractBibliographyFromLines}.
 *
 * Kautz' source has no Greek unicode headwords, only German transliteration, so this borrows the
 * lemma, BETA code, SBL transliteration and pronunciation from the existing public-domain
 * `data/strongsgreek.xml` by Strong's number, and carries Kautz' German text over as the definition.
 *
 * The dictionary body (Strong's numbers 1-5624) is converted, and so is the trailing synonym-group
 * appendix (5801-6020, headed "Synonyme" instead of a transliteration) that Kautz asked not to be
 * forgotten — see {@link SYNONYM_MIN}. The two placeholder numbers in between, 5625/5626 ("word has
 * more than one number" / "not translated"), are dropped the same way the English dictionary's "Not
 * Used" gaps are.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { attribute, readXml } from '../src/lib/bible/parse/xml.ts';
import { findBookId } from '../src/lib/bible/book-names.ts';
import { referencePath } from '../src/lib/bible/reference.ts';

const MAX_GREEK_NUMBER = 5624;
/** Kautz' own supplementary numbering for the synonym-group appendix; see the module doc comment. */
const SYNONYM_MIN = 5801;
const SYNONYM_MAX = 6020;
const DEFAULT_ABBREVIATIONS_PATH = 'data/private/kautz-abbreviations.json';

/** Marks a run of bold/italic text through the pipeline; swapped for real tags only once, at the end
 *  (see {@link main}), so none of the regex-based passes in between (sense splitting, abbreviation and
 *  reference scanning) have to be taught about markup — Private Use Area code points aren't `\p{L}`,
 *  so they are invisible to every word-boundary check those passes make. */
const BOLD_OPEN = '\uE010';
const BOLD_CLOSE = '\uE011';
const ITALIC_OPEN = '\uE012';
const ITALIC_CLOSE = '\uE013';
/** Preserves the one semantic source-line boundary that must survive hard-wrap joining: the boundary
 *  between a short roman-numeral gloss and its following explanation. */
const GLOSS_EXPLANATION_BREAK = '\uE014';

type Enrichment = {
	beta?: string;
	unicode: string;
	translit?: string;
	pronunciation?: string;
};

/** Stand-in for the missing `<greek>` info on a synonym-appendix entry (see {@link SYNONYM_MIN}): it
 *  has no headword of its own, just the literal label the source prints in its place. */
const SYNONYM_ENRICHMENT: Enrichment = { unicode: 'Synonyme' };

type KautzEntry = {
	number: number;
	/** Everything after the headword line: etymology, Gräz./LXX/Synonyme notes, meaning block. */
	body: string;
};

/** Reads `data/strongsgreek.xml` and indexes it by Strong's number for the fields Kautz lacks. */
async function loadEnrichment(path: string): Promise<Map<number, Enrichment>> {
	const xml = await readFile(path, 'utf8');
	const map = new Map<number, Enrichment>();

	let number: number | undefined;
	let current: Partial<Enrichment> = {};

	for await (const event of readXml(xml)) {
		if (event.type === 'open' && event.name === 'entry') {
			number = toNumber(attribute(event.attributes, 'strongs'));
			current = {};
		} else if (event.type === 'open' && event.name === 'greek' && !current.unicode) {
			current.beta = attribute(event.attributes, 'beta');
			current.unicode = attribute(event.attributes, 'unicode');
			current.translit = attribute(event.attributes, 'translit');
		} else if (event.type === 'open' && event.name === 'pronunciation') {
			current.pronunciation ??= attribute(event.attributes, 'strongs');
		} else if (event.type === 'close' && event.name === 'entry') {
			if (number !== undefined && current.unicode) map.set(number, current as Enrichment);
			number = undefined;
		}
	}

	return map;
}

/** Splits a plain-text source (the sermon-online.com mirror) into lines, one per source line. There is
 *  no markup to carry, so this is a thin wrapper kept only so both source kinds go through the same
 *  {@link splitEntries}. */
function linesFromPlainText(text: string): string[] {
	return text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
}

/**
 * Splits a pandoc-generated HTML source (`pandoc -f docx -t html --wrap=preserve`, see the module doc
 * comment) into lines, one per original paragraph — which, in Kautz' manuscript, means one per visual
 * line: he hard-breaks a new Word paragraph at roughly print-column width rather than letting a line
 * wrap, the same convention his plain-text export follows. `<strong>`/`<em>` become {@link BOLD_OPEN}
 * /{@link ITALIC_OPEN} markers rather than real tags so every later regex-based pass stays oblivious to
 * them; a manual `<br />` inside one paragraph (rare, but it happens) splits into two output lines, the
 * same as a paragraph break. `<u>` (used only for the Gräz./LXX/Wortfamilie labels' underline, which
 * every consumer of this text already recognises by the label wording, not the styling) and `<a>` links
 * Kautz occasionally cites (e.g. a Wikipedia source) are dropped, keeping only their text.
 */
function linesFromHtml(html: string): string[] {
	const lines: string[] = [];

	for (const raw of html.split(/\r\n|\r|\n/)) {
		const trimmed = raw.trim();
		// Transparent list wrappers: pandoc renders a Word numbered-list paragraph style this way
		// (Kautz applies it to the occasional single line, apparently by accident), but the list
		// structure carries no meaning here — only the text inside does.
		const paragraph =
			/^<p(?:\s[^>]*)?>([\s\S]*)<\/p>$/.exec(trimmed) ??
			/^<li>\s*<p(?:\s[^>]*)?>([\s\S]*)<\/p>\s*<\/li>$/.exec(trimmed);
		if (!paragraph) continue;

		const inline = paragraph[1]!
			.replace(/<a\b[^>]*>/gi, '')
			.replace(/<\/a>/gi, '')
			.replace(/<\/?u>/gi, '')
			.replace(/<strong>/gi, BOLD_OPEN)
			.replace(/<\/strong>/gi, BOLD_CLOSE)
			.replace(/<em>/gi, ITALIC_OPEN)
			.replace(/<\/em>/gi, ITALIC_CLOSE);

		for (const part of inline.split(/<br\s*\/?>/gi)) {
			lines.push(part.replaceAll('&amp;', '&').trim());
		}
	}

	return lines;
}

/** Strips the bold/italic markers, for text that ends up somewhere markup can't reach (an HTML `title`
 *  attribute, e.g. an `<abbr>` tooltip — see {@link extractAbbreviationsFromLines}). */
function stripMarkers(text: string): string {
	return text
		.replaceAll(BOLD_OPEN, '')
		.replaceAll(BOLD_CLOSE, '')
		.replaceAll(ITALIC_OPEN, '')
		.replaceAll(ITALIC_CLOSE, '');
}

/** Whether a Strong's number is one this script converts: the dictionary body, or Kautz' synonym
 *  appendix (see {@link SYNONYM_MIN}). The gap between them (5625-5800) is deliberately excluded. */
function isConvertibleNumber(number: number): boolean {
	return (
		(number >= 1 && number <= MAX_GREEK_NUMBER) || (number >= SYNONYM_MIN && number <= SYNONYM_MAX)
	);
}

/** Splits pre-extracted source lines into entries at 7-digit zero-padded number lines. */
function splitEntries(lines: string[]): KautzEntry[] {
	const entries: KautzEntry[] = [];

	let number: number | undefined;
	let buffer: string[] = [];

	const flush = () => {
		if (number !== undefined && isConvertibleNumber(number)) {
			const firstContent = buffer.findIndex((line) => line.trim().length > 0);
			// No headword line at all means this is one of Kautz' own gap placeholders.
			if (firstContent !== -1) {
				const body = buffer
					.slice(firstContent + 1)
					.join('\n')
					.trim();
				if (body) entries.push({ number, body });
			}
		}
		number = undefined;
		buffer = [];
	};

	for (const raw of lines) {
		const trimmed = raw.trim();
		if (trimmed.length === 7 && /^\d{7}$/.test(trimmed)) {
			flush();
			number = Number.parseInt(trimmed, 10);
			continue;
		}
		buffer.push(raw);
	}
	flush();

	return entries;
}

/** The `√ ...` etymology line, and everything else (Gräz./LXX/Synonyme + the meaning block). */
function splitHeader(body: string): { etymology: string; rest: string } {
	const lines = body.split('\n');
	let index = 0;
	while (index < lines.length && lines[index]!.trim() === '') index += 1;

	if (!lines[index]?.trim().startsWith('√')) return { etymology: '', rest: body };

	// Gräz./LXX/Synonyme notes and the first sense both sit right below the etymology with no blank
	// line in between, but belong in the definition, not the derivation. Without the sense markers
	// here too, an etymology that itself wraps onto a second physical line (e.g. "…aleph (d. erste
	// Buchstabe d. hebr. Alphabets);\nBuchstabe (3)") and is followed directly by "I.) …" swallows the
	// entire definition into the derivation, since nothing would ever stop the loop below.
	const followsAsNote =
		/^(Gräz\.|LXX[.:]|Synonyme siehe:|Wortfamilie:|[IVXLCDM]+\.?\)|\d{1,2}[a-z]?\))/i;
	const etymologyLines: string[] = [];
	while (
		index < lines.length &&
		lines[index]!.trim() !== '' &&
		!followsAsNote.test(lines[index]!.trim())
	) {
		etymologyLines.push(lines[index]!);
		index += 1;
	}

	return {
		etymology: etymologyLines.join(' ').trim(),
		rest: lines.slice(index).join('\n').trim()
	};
}

function escapeXml(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function strongsRefTag(language: 'GREEK' | 'HEBREW', number: number): string {
	return `<strongsref language="${language}" strongs="${number}"/>`;
}

/** Links every number in a short reference-only clause, e.g. an etymology or a "Synonyme siehe" list. */
function linkReferenceClause(text: string): string {
	let result = '';
	let lastIndex = 0;
	const pattern = /(hebr\.\s*)?0*(\d{1,4})\b/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(text))) {
		result += escapeXml(text.slice(lastIndex, match.index));
		const language = match[1] ? 'HEBREW' : 'GREEK';
		result += strongsRefTag(language, Number.parseInt(match[2]!, 10));
		lastIndex = match.index + match[0].length;
	}
	result += escapeXml(text.slice(lastIndex));
	return result;
}

/** Matches a `chapter:verse[,verse|.verse]*[-verseEnd]?` token, e.g. "24:12" or "2:1,8,12,18" or "11:21.33". */
const VERSE_TOKEN = /^(\d{1,3}):(\d{1,3}(?:[.,]\d{1,3})*(?:-\d{1,3})?)$/;

/** Splits trailing punctuation (closing parens, sentence stops) off a word so the core can be matched. */
function stripTrailingPunctuation(word: string): { core: string; suffix: string } {
	const match = /^(.*?)([.,;:)\]]*)$/.exec(word)!;
	return { core: match[1]!, suffix: match[2]! };
}

/**
 * Wraps every verse number in a `chapter:verse[,verse…][-end]` token in its own `<verseref>` link, so
 * clicking jumps straight to that verse. The first one absorbs `bookLabel` (the book abbreviation plus
 * the space after it, or `''` for a bare continuation reference) and the chapter, so the *whole* first
 * citation — not just its trailing verse number — is one highlighted, clickable unit; the punctuation
 * between later verses in the same list stays untouched, and only their bare number becomes a link.
 */
function renderVerseToken(
	book: number,
	bookLabel: string,
	match: RegExpExecArray,
	placeholder: (tag: string) => string
): string {
	const chapter = Number.parseInt(match[1]!, 10);
	const verseList = match[2]!;
	let first = true;

	return verseList.replace(/(\d{1,3})(?:-(\d{1,3}))?/g, (whole, verse: string, end?: string) => {
		const verseNumber = Number.parseInt(verse, 10);
		const verseEnd = end ? Number.parseInt(end, 10) : undefined;
		const href = referencePath({
			book,
			chapter,
			verse: verseNumber,
			...(verseEnd ? { verseEnd } : {})
		});
		const attrs = [
			`href="${escapeXml(href)}"`,
			`book="${book}"`,
			`chapter="${chapter}"`,
			`verse="${verseNumber}"`,
			verseEnd ? `end="${verseEnd}"` : ''
		]
			.filter(Boolean)
			.join(' ');
		const label = first ? `${bookLabel}${chapter}:${whole}` : whole;
		first = false;
		return placeholder(`<verseref ${attrs}>`) + label + placeholder('</verseref>');
	});
}

/**
 * Scans free text for Bible references, e.g. "Mt 24:12 Röm 5:8" or "Offb 1:20 2:1,8,12,18 3:1,7,14"
 * (the last two chapters reuse the book named at the start of the run, as Kautz's own citation style
 * does throughout). A token only starts a reference when it matches a known book abbreviation *and* the
 * following token is verse-shaped — that double condition is what keeps ordinary prose containing a
 * word that also happens to be a book abbreviation (e.g. "Mal", "Ex") from being mistaken for one.
 */
function scanVerseReferences(text: string, placeholder: (tag: string) => string): string {
	const parts = text.match(/\S+|\s+/g) ?? [];
	let out = '';
	let currentBook: number | undefined;

	for (let i = 0; i < parts.length; i += 1) {
		const part = parts[i]!;
		if (/^\s/.test(part)) {
			out += part;
			continue;
		}

		const bookId = findBookId(part);
		const afterSpace = parts[i + 1];
		const lookaheadWord = afterSpace && /^\s/.test(afterSpace) ? parts[i + 2] : undefined;
		const lookahead = lookaheadWord ? stripTrailingPunctuation(lookaheadWord) : undefined;
		const verseMatch = bookId !== undefined && lookahead ? VERSE_TOKEN.exec(lookahead.core) : null;

		if (bookId !== undefined && verseMatch) {
			currentBook = bookId;
			const bookLabel = escapeXml(part) + afterSpace;
			out +=
				renderVerseToken(bookId, bookLabel, verseMatch, placeholder) + escapeXml(lookahead!.suffix);
			i += 2;
			continue;
		}

		const { core, suffix } = stripTrailingPunctuation(part);
		const bareMatch = VERSE_TOKEN.exec(core);
		if (bareMatch && currentBook !== undefined) {
			out += renderVerseToken(currentBook, '', bareMatch, placeholder) + escapeXml(suffix);
			continue;
		}

		currentBook = undefined;
		out += escapeXml(part);
	}

	return out;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Abbreviation glossary, e.g. `{ "Gräz.": "Gräzität; …", "Subst.Fem.": "…" }` — kept out of this
 * repository (see {@link loadAbbreviations}) because it is transcribed from Kautz' own text, unlike
 * this script. Empty until `main` loads it; every entry is optional, so an empty glossary just means
 * no `<abbr>` tooltips are added, not a broken conversion.
 */
let abbreviations: Record<string, string> = {};
/** Matches any glossary key, longest first, so e.g. "Subst.Fem." wins over the shorter "Subst.". */
let abbreviationPattern: RegExp = /(?!)/g;

function setAbbreviations(glossary: Record<string, string>): void {
	abbreviations = glossary;
	const keysByLength = Object.keys(glossary).sort((a, b) => b.length - a.length);
	abbreviationPattern =
		keysByLength.length > 0
			? new RegExp(`(?<!\\p{L})(?:${keysByLength.map(escapeRegExp).join('|')})(?!\\p{L})`, 'gu')
			: /(?!)/g; // Matches nothing: there is nothing to glossarise.
}

/** Reads the abbreviation glossary JSON, or returns an empty one if the file isn't there. */
async function loadAbbreviations(path: string): Promise<Record<string, string>> {
	try {
		return JSON.parse(await readFile(path, 'utf8'));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.log(`no abbreviation glossary at ${path}; entries will have no <abbr> tooltips`);
			return {};
		}
		throw error;
	}
}

/**
 * The heading text (stripped of markers) that opens and closes Kautz' "4. Abkürzungsverzeichnis samt
 * grammatikalischen Erklärungen" section, so its content can be sliced out of the full line list. Both
 * carry their section number: the table of contents lists the same titles without one, so matching the
 * numbered form is what tells the real heading apart from its own table-of-contents entry.
 */
const ABBREVIATIONS_START = '4. Abkürzungsverzeichnis samt grammatikalischen Erklärungen';
const ABBREVIATIONS_END = '5. Liste der Synonyme mit deren Strong-Nummern';

/**
 * Parses Kautz' own abbreviation glossary straight out of the manuscript (section 4), now that
 * redistributing his text is licensed — so nothing has to be kept in a private JSON file just to get
 * `<abbr>` tooltips (see {@link loadAbbreviations}, still used for a plain-text source).
 *
 * Entries read `KEY = explanation`, sometimes several comma-separated keys sharing one explanation
 * (`f., ff. = folgend(e), …`), sometimes wrapping onto further lines with no `=` of their own. A few
 * keys are defined twice for genuinely different meanings (`Konj.` is both Konjunktiv and Konjunktion);
 * both explanations are kept, joined with " / ", rather than the second silently overwriting the first.
 */
function extractAbbreviationsFromLines(lines: string[]): Record<string, string> {
	const startIndex = lines.findIndex((line) => stripMarkers(line).trim() === ABBREVIATIONS_START);
	const endIndex = lines.findIndex((line) => stripMarkers(line).trim() === ABBREVIATIONS_END);
	if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return {};

	const glossary: Record<string, string> = {};
	let currentKeys: string[] = [];
	const keyLine = /^([^=]{1,40}?)\s*=\s*(.*)$/;

	for (const raw of lines.slice(startIndex + 1, endIndex)) {
		const trimmed = stripMarkers(raw).trim();
		if (!trimmed) continue;

		const match = keyLine.exec(trimmed);
		if (match) {
			currentKeys = match[1]!
				.split(',')
				.map((key) => key.trim())
				.filter(Boolean);
			for (const key of currentKeys) {
				glossary[key] = glossary[key] ? `${glossary[key]} / ${match[2]}` : match[2]!;
			}
		} else if (currentKeys.length > 0) {
			for (const key of currentKeys) glossary[key] += ` ${trimmed}`;
		}
	}

	return glossary;
}

/** Kautz' copyright line, read verbatim from the manuscript's own title block rather than retyped here,
 *  so an update to his own wording (a new "(Update N/YYYY)") is picked up automatically. */
function extractCopyrightFromLines(lines: string[]): string | undefined {
	const line = lines.find((entry) => stripMarkers(entry).trim().startsWith('Copyright'));
	return line ? stripMarkers(line).trim() : undefined;
}

/** The heading text that opens and closes Kautz' "2. Hinweise zur Benützung des Lexikons" section —
 *  his own guide to reading the dictionary (the "I.) II.) 1.) 2.)" numbering, the Gräz./LXX/Synonyme/
 *  Wortfamilie labels, etc.) — so it can be sliced out and surfaced next to the definition on the site,
 *  same as {@link ABBREVIATIONS_START}/{@link ABBREVIATIONS_END} above. */
const USAGE_NOTES_START = '2. Hinweise zur Benützung des Lexikons';
const USAGE_NOTES_END = '3. Die für die Bearbeitung des Lexikons verwendete Fachliteratur';

/** Recognises where a new paragraph starts within the usage-notes section. Kautz hard-wraps every line
 *  there like the dictionary body itself, with no blank line marking a real paragraph break, so — same
 *  workaround as {@link extractAbbreviationsFromLines} needing this project's own reading of his section
 *  headings — this project's own reading of his paragraph openings stands in for one. Unlike the
 *  abbreviation glossary or a dictionary entry, this text is fixed and read once, not per Strong's
 *  number, so a short list tied to his specific wording is proportionate rather than a general parser. */
const USAGE_NOTES_PARAGRAPH_STARTS = [
	/^Um das Lexikon/,
	/^für Strong Nr\./,
	/^Das Lexikon ist alphabetisch/,
	/^Nach einer Leerzeile folgen/,
	/^In Klammern:/,
	/^Dann folgt eine Angabe/,
	/^Hinter der Abkürzung:/,
	/^Mit Hilfe der Strong/,
	/^Nach einer weiteren Leerzeile/,
	/^Jede Hauptbedeutung/,
	/^Schließlich wird/,
	/^Korrektur- und Verbesserungsvorschläge/,
	/^Korrekturvorschläge senden/
];

/** Extracts Kautz' usage-notes section as HTML paragraphs, glossing his abbreviations the same way a
 *  definition does (see {@link wrapAbbreviations}) — `undefined` if the manuscript doesn't have the
 *  section (e.g. a plain-text source, which never reaches this far since it has no headings to find). */
function extractUsageNotesFromLines(lines: string[]): string | undefined {
	const startIndex = lines.findIndex((line) => stripMarkers(line).trim() === USAGE_NOTES_START);
	const endIndex = lines.findIndex((line) => stripMarkers(line).trim() === USAGE_NOTES_END);
	if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return undefined;

	const paragraphs: string[] = [];
	for (const raw of lines.slice(startIndex + 1, endIndex)) {
		const trimmed = stripMarkers(raw).trim();
		if (!trimmed) continue;

		const startsNewParagraph =
			paragraphs.length === 0 ||
			USAGE_NOTES_PARAGRAPH_STARTS.some((pattern) => pattern.test(trimmed));
		if (startsNewParagraph) paragraphs.push(trimmed);
		else paragraphs[paragraphs.length - 1] += ` ${trimmed}`;
	}

	return paragraphs.length > 0
		? paragraphs.map((paragraph) => wrapAbbreviations(paragraph)).join('<br/><br/>')
		: undefined;
}

/** Kautz' "3. Die für die Bearbeitung des Lexikons verwendete Fachliteratur" bibliography sits right
 *  after the usage notes and right before the abbreviation glossary — the ~80 numbered works his
 *  "(37,1)"-style citations throughout definitions point at, which he asked to have credited alongside
 *  the usage notes rather than left implicit in those citation numbers. */
const BIBLIOGRAPHY_START = USAGE_NOTES_END;
const BIBLIOGRAPHY_END = ABBREVIATIONS_START;

/** A real bibliography entry starts "(1) ", "(2) ", … — digits immediately followed by a closing paren
 *  and a space. The section's own intro illustrates its citation-number notation with two examples in
 *  that same shape ("(1,1256): …", "(10/IV/314): …") that must NOT be mistaken for entries: both have a
 *  comma or slash between the digits and the paren, so this pattern doesn't match them. */
const BIBLIOGRAPHY_ENTRY = /^\(\d{1,3}\)\s/;

/** Paragraph starts within the bibliography section's short intro, reflowed the same way as
 *  {@link USAGE_NOTES_PARAGRAPH_STARTS} — the intro's own two citation-number examples are complete
 *  lines in the source already, so each also opens its own paragraph rather than running on. */
const BIBLIOGRAPHY_INTRO_PARAGRAPH_STARTS = [/^z\.B\. bedeutet:/, /^oder:/, /^\(\d{1,3}[,/]/];

/** Extracts Kautz' bibliography as an intro paragraph (explaining his "(37,1)"-style citation numbers)
 *  followed by the numbered works themselves, each its own line in the source already so — unlike the
 *  intro or the usage notes — no reflow is needed, just one `<indent>` block per entry. `undefined` if
 *  the manuscript doesn't have the section, same as {@link extractUsageNotesFromLines}. */
function extractBibliographyFromLines(lines: string[]): string | undefined {
	const startIndex = lines.findIndex((line) => stripMarkers(line).trim() === BIBLIOGRAPHY_START);
	const endIndex = lines.findIndex((line) => stripMarkers(line).trim() === BIBLIOGRAPHY_END);
	if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return undefined;

	const introParagraphs: string[] = [];
	const entries: string[] = [];

	for (const raw of lines.slice(startIndex + 1, endIndex)) {
		const trimmed = stripMarkers(raw).trim();
		if (!trimmed) continue;

		if (BIBLIOGRAPHY_ENTRY.test(trimmed)) {
			entries.push(trimmed);
			continue;
		}

		const startsNewParagraph =
			introParagraphs.length === 0 ||
			BIBLIOGRAPHY_INTRO_PARAGRAPH_STARTS.some((pattern) => pattern.test(trimmed));
		if (startsNewParagraph) introParagraphs.push(trimmed);
		else introParagraphs[introParagraphs.length - 1] += ` ${trimmed}`;
	}

	if (entries.length === 0) return undefined;

	const intro = introParagraphs.map((paragraph) => wrapAbbreviations(paragraph)).join('<br/><br/>');
	const list = entries.map((entry) => `<indent>${wrapAbbreviations(entry)}</indent>`).join('<br/>');
	return intro ? `${intro}<br/><br/>${list}` : list;
}

/** Wraps every recurring Kautz abbreviation ("Gräz.", "Subst.Fem.", "ua." …) in a native tooltip. */
function wrapAbbreviationTokens(text: string, placeholder: (tag: string) => string): string {
	let out = '';
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	abbreviationPattern.lastIndex = 0;

	while ((match = abbreviationPattern.exec(text))) {
		out += text.slice(lastIndex, match.index);
		const title = abbreviations[match[0]]!;
		out +=
			placeholder(`<abbr title="${escapeXml(title).replaceAll('"', '&quot;')}">`) +
			match[0] +
			placeholder('</abbr>');
		lastIndex = match.index + match[0].length;
	}
	out += text.slice(lastIndex);
	return out;
}

/**
 * Renders a run of descriptive prose: Bible references become hoverable `<verseref>`s, explicit
 * "Strong Nr. N" mentions become links, recurring abbreviations get a tooltip, and everything else is
 * escaped. Each pass hands the next one a string that may already contain `\uE000<index>\uE000`
 * placeholders standing in for raw tags \u2014 `\uE000` is a Private Use Area code point, so it is pure
 * placeholder-and-digits as far as any of these patterns (all letters, or `Strong Nr. `, or book-name
 * lookups) are concerned; none of them can match through one, so the passes are safe to run in sequence
 * without stepping on each other's tags. The placeholders are swapped back for the real tags only after
 * the whole thing has been escaped, once and uniformly.
 */
function renderProse(text: string): string {
	const tags: string[] = [];
	const placeholder = (tag: string): string => {
		tags.push(tag);
		return `\uE000${tags.length - 1}\uE000`;
	};

	const withVerseRefs = scanVerseReferences(text, placeholder);

	let withStrongMentions = '';
	{
		let lastIndex = 0;
		const pattern = /Strong\s*Nr\.?\s*0*(\d{1,4})/g;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(withVerseRefs))) {
			withStrongMentions += withVerseRefs.slice(lastIndex, match.index);
			withStrongMentions += `Strong Nr. ${placeholder(strongsRefTag('GREEK', Number.parseInt(match[1]!, 10)))}`;
			lastIndex = match.index + match[0].length;
		}
		withStrongMentions += withVerseRefs.slice(lastIndex);
	}

	const withAbbreviations = wrapAbbreviationTokens(withStrongMentions, placeholder);

	return withAbbreviations.replace(
		/\uE000(\d+)\uE000/g,
		(_, index: string) => tags[Number(index)]!
	);
}

/** Escapes text and glosses any Kautz abbreviations in it, without the reference- or verse-scanning
 *  {@link renderProse} also does — for spots such as a part-of-speech clause that only ever has
 *  abbreviations in it, never a Strong's or Bible reference. */
function wrapAbbreviations(text: string): string {
	const tags: string[] = [];
	const placeholder = (tag: string): string => {
		tags.push(tag);
		return `\uE000${tags.length - 1}\uE000`;
	};
	const withAbbreviations = wrapAbbreviationTokens(escapeXml(text), placeholder);
	return withAbbreviations.replace(
		/\uE000(\d+)\uE000/g,
		(_, index: string) => tags[Number(index)]!
	);
}

/**
 * Renders the etymology line: the reference clause up to the last `;` is linkified, the part-of-speech
 * and frequency count that follows is not (its `(116)` is an occurrence count, not a Strong's number).
 * The last `;` is the right split point rather than the first: a derivation can itself contain a `;`
 * (e.g. "wahrscheinlich verwandt mit 29; Subst.Mask. (176)" has two), but the trailing POS/frequency
 * clause never does.
 */
function renderEtymology(etymology: string): string {
	if (!etymology) return '';
	const semicolon = etymology.lastIndexOf(';');
	if (semicolon === -1) return linkReferenceClause(etymology);
	return (
		linkReferenceClause(etymology.slice(0, semicolon + 1)) +
		wrapAbbreviations(etymology.slice(semicolon + 1))
	);
}

/** Lines that open a new logical unit in the meaning block, as opposed to merely wrapping the previous one. */
const SENSE_MARKER =
	/^(Gräz\.|LXX[.:]|Synonyme siehe:|Wortfamilie:|[IVXLCDM]+\.?\)|\d{1,2}[a-z]?\))/;
const ROMAN_SENSE_MARKER = /^([IVXLCDM]+\.?\))\s*/;

/**
 * Kautz puts a short roman-numeral gloss on its own physical line before a longer explanation. His
 * manuscript otherwise uses physical lines as hard wraps, so only a short gloss (at most three words)
 * makes that boundary semantic. This is also the source author's suggested way to find missed breaks.
 */
function isShortRomanGloss(line: string): boolean {
	const marker = ROMAN_SENSE_MARKER.exec(line);
	if (!marker) return false;
	const wordCount = line.slice(marker[0].length).match(/\S+/g)?.length ?? 0;
	return wordCount > 0 && wordCount <= 3;
}

/**
 * Re-joins hard-wrapped continuation lines into one logical line per sense, so a `<br/>` can be placed
 * between senses without also breaking mid-sentence where the source merely wrapped at ~70 columns.
 *
 * Inside a "Wortfamilie:" block the rule is different from the rest of the entry: each related word
 * restarts its own "I.)"/"II.)" sense numbering from scratch (it is a condensed copy of *that word's*
 * own entry, not a continuation of the numbering above), so those lines must stay attached to the
 * `number transliteration` line that introduces the word rather than starting fresh top-level groups.
 * Only a new `number transliteration` line starts a new group there.
 *
 * A synonym-appendix entry (see {@link SYNONYM_MIN}) uses that same "one `number word` per member"
 * shape for its *entire* body, with no "Wortfamilie:" label of its own — `forceWordFamilyMode` puts it
 * in that mode from the start instead.
 */
function groupIntoSenses(rest: string, forceWordFamilyMode = false): string[] {
	const groups: string[] = [];
	let inWortfamilieBlock = forceWordFamilyMode;
	let preserveNextLineBreak = false;

	for (const raw of rest.split('\n')) {
		const trimmed = raw.trim();
		if (!trimmed) continue;

		if (!forceWordFamilyMode && /^Wortfamilie:$/i.test(trimmed)) {
			groups.push(trimmed);
			inWortfamilieBlock = true;
			continue;
		}

		if (inWortfamilieBlock) {
			const startsNewWord = /^0*\d{1,4}\s+\S/.test(trimmed);
			if (groups.length === 0 || startsNewWord) groups.push(trimmed);
			else groups[groups.length - 1] += ` ${trimmed}`;
			continue;
		}

		if (groups.length === 0 || SENSE_MARKER.test(trimmed)) {
			groups.push(trimmed);
			preserveNextLineBreak = isShortRomanGloss(trimmed);
		} else {
			groups[groups.length - 1] += preserveNextLineBreak
				? `${GLOSS_EXPLANATION_BREAK}${trimmed}`
				: ` ${trimmed}`;
			preserveNextLineBreak = false;
		}
	}

	return groups;
}

/**
 * Renders a `number transliteration [√ etymology;] [I.) gloss [II.) gloss …]]` group from inside a
 * "Wortfamilie:" block. The word's own senses are kept, but rendered as light `<br/>`-separated lines
 * under its own etymology rather than as major sections, since they belong to that word, not this entry.
 */
function renderWortfamilieWord(sense: string): string {
	const head = /^0*(\d{1,4})\s+(\S+)\s*(.*)$/.exec(sense);
	if (!head) return renderProse(sense);

	const [, number, word, remainder] = head;
	const linkedNumber = strongsRefTag('GREEK', Number.parseInt(number!, 10));
	if (!remainder) return `${linkedNumber} ${escapeXml(word!)}`;

	const senseMarker = /[IVXLCDM]+\.?\)/g;
	const firstSense = senseMarker.exec(remainder!);
	const etymology = (firstSense ? remainder!.slice(0, firstSense.index) : remainder!).trim();
	const head1 = etymology
		? `${linkedNumber} ${escapeXml(word!)} ${renderEtymology(etymology)}`
		: `${linkedNumber} ${escapeXml(word!)}`;
	if (!firstSense) return head1;

	const senseText = remainder!.slice(firstSense.index);
	const starts: number[] = [];
	senseMarker.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = senseMarker.exec(senseText))) starts.push(match.index);

	const senses = starts.map((start, index) => {
		const end = index + 1 < starts.length ? starts[index + 1]! : senseText.length;
		return renderProse(senseText.slice(start, end).trim());
	});

	return [head1, ...senses].join('<br/>');
}

/**
 * Closed-class German function words, plus Kautz' own recurring definition-verbs ("bezieht sich",
 * "bezeichnet", "betont", …): German capitalizes nouns regardless of where they sit in a sentence, so a
 * capitalized noun tells you nothing about position — but it only ever capitalizes an article, pronoun,
 * preposition, conjunction or finite verb when that word starts a sentence. Seeing one of these,
 * capitalized, signals a sentence just began. Used by {@link findGlossBreak}.
 */
const SENTENCE_STARTERS = new Set(
	`der die das den dem des ein eine einen einem einer eines er sie es wir ihr ich du
	dieses diese dieser diesem diesen jener jene jenes jenen
	nicht und oder aber sondern doch obwohl obgleich trotzdem jedoch dennoch
	im in an auf unter über von vom bei beim mit nach aus zu zum zur für gegen ohne um durch während
	zwischen wegen trotz statt vor
	wenn weil dass ob als wie so nur auch schon noch ganz sehr meist meistens oft manchmal immer nie
	kann können muss müssen soll sollen will wollen wird werden wurde wurden war waren ist sind hat haben hatte
	was wer wen wem wessen etwas jemand jemanden jemandem sich mich dich ihn ihm uns euch
	bezieht bezeichnet betont beschreibt drückt kennzeichnet legt meint kontrolliert schließt
	bedeutet beinhaltet gebraucht hebt reicht steht zeigt weist deutet betrifft enthält umfasst
	kommt geht gilt gibt liegt entspricht unterscheidet ergänzt ergibt verwendet bezogen
	charakterisiert bringt führt folgt dient wechselt spricht handelt beschränkt`
		.split(/\s+/)
		.filter(Boolean)
);

const LEADING_ARTICLE_ABBR = new Set(['d.', '(d.)']);

/**
 * Kautz sometimes opens a roman-numeral sense with a short gloss (the plain translation), directly
 * followed — with no punctuation of its own, just a space — by a full explanatory sentence, e.g. entry
 * 1656's "I.) d. Erbarmen Bezieht sich auf das Elend…". His own manuscript puts a paragraph break there;
 * {@link splitGlossFromExplanation} restores it. Returns the word index in `words` where that sentence
 * starts, or `null` if this sense doesn't have that shape — either it really is just one short gloss
 * with nothing else, or the split point can't be found with confidence, in which case leaving the prose
 * untouched beats guessing wrong.
 */
function findGlossBreak(words: string[]): number | null {
	if (words.length === 0) return null;
	const start = LEADING_ARTICLE_ABBR.has(words[0]!.toLowerCase()) ? 1 : 0;
	for (let i = start + 1; i < words.length; i += 1) {
		const bare = words[i]!.replace(/^[.,;:()]+|[.,;:()]+$/g, '').toLowerCase();
		if (/^[A-ZÄÖÜ]/.test(words[i]!) && SENTENCE_STARTERS.has(bare)) {
			// Folding more than ~10 words into the "gloss" means we likely walked past a sentence starter
			// this list doesn't know, not that the gloss is genuinely that long.
			return i > 10 ? null : i;
		}
	}
	return null;
}

/** Splits a roman-numeral sense's text (with the "I.) " marker already removed) into its opening gloss
 *  and the explanatory sentence that follows, if {@link findGlossBreak} finds one; otherwise returns the
 *  whole thing as the gloss with no explanation. */
function splitGlossFromExplanation(afterMarker: string): { gloss: string; explanation: string } {
	const tokens = [...afterMarker.matchAll(/\S+/g)];
	const words = tokens.map((token) => token[0]!);
	const breakIndex = findGlossBreak(words);
	if (breakIndex === null) return { gloss: afterMarker, explanation: '' };

	const splitAt = tokens[breakIndex]!.index!;
	return {
		gloss: afterMarker.slice(0, splitAt).trim(),
		explanation: afterMarker.slice(splitAt).trim()
	};
}

/**
 * Renders one already-merged sense. Beyond generic inline "Strong Nr. N" mentions, two labelled forms get
 * their number list linkified: "Synonyme siehe: …" and the inline form of "Wortfamilie: …" (a plain
 * comma-separated list of numbers, as opposed to the block form with one `number transliteration` line
 * per related word, which is delegated to {@link renderWortfamilieWord}). A roman-numeral sense also gets
 * its gloss split from a directly-attached explanatory sentence, if any (see
 * {@link splitGlossFromExplanation}).
 */
function renderSense(sense: string): string {
	const labelledList = /^(Synonyme siehe|Wortfamilie):\s*([\d,\s]+)$/i.exec(sense);
	if (labelledList) return `${labelledList[1]}: ${linkReferenceClause(labelledList[2]!)}`;

	if (/^Wortfamilie:$/i.test(sense)) return escapeXml(sense);
	if (/^0*\d{1,4}\s+\S/.test(sense)) return `<indent>${renderWortfamilieWord(sense)}</indent>`;

	const roman = ROMAN_SENSE_MARKER.exec(sense);
	if (roman) {
		const afterMarker = sense.slice(roman[0].length);
		const sourceBreak = afterMarker.indexOf(GLOSS_EXPLANATION_BREAK);
		const { gloss, explanation } =
			sourceBreak === -1
				? splitGlossFromExplanation(afterMarker)
				: {
						gloss: afterMarker.slice(0, sourceBreak).trim(),
						explanation: afterMarker.slice(sourceBreak + GLOSS_EXPLANATION_BREAK.length).trim()
					};
		if (explanation)
			return `${renderProse(`${roman[1]} ${gloss}`)}<br/>${renderProse(explanation)}`;
	}

	return renderProse(sense);
}

/** Roman-numeral senses and the "Wortfamilie:" label read as new sections; everything else as one line. */
function isMajorBreak(sense: string): boolean {
	return /^([IVXLCDM]+\.?\)|Wortfamilie:)/i.test(sense);
}

/** Matches a synonym-appendix member's own line, e.g. "126 αιδιος: immerwährend; …" — a number
 *  followed by the actual Greek word, as opposed to a connecting sentence comparing two members, which
 *  also starts with a bare number but continues in German, e.g. "154 und 2065 werden zwar …". */
const SYNONYM_MEMBER = /^0*(\d{1,4})\s+([Ͱ-Ͽἀ-῿][^\s]*)\s*(.*)$/;

/**
 * Renders one line of a synonym-appendix entry (see {@link SYNONYM_MIN}): either a member definition,
 * matched by {@link SYNONYM_MEMBER} and lightly indented like a Wortfamilie member, or a connecting
 * sentence comparing members. Unlike an etymology line, that connecting sentence is ordinary German
 * prose that may itself cite a Bible verse (e.g. "In Joh 16:19.23 werden beide Wörter …"), so it goes
 * through {@link renderProse} — which recognises verse references — rather than
 * {@link renderWortfamilieWord}'s bare-number-as-Strong's-reference linking, which would otherwise turn
 * that verse's own chapter and verse numbers into wrong cross-references.
 */
function renderSynonymSense(sense: string): string {
	const member = SYNONYM_MEMBER.exec(sense);
	if (!member) return renderProse(sense);

	const [, number, word, remainder] = member;
	const linkedNumber = strongsRefTag('GREEK', Number.parseInt(number!, 10));
	const gloss = remainder ? ` ${renderProse(remainder)}` : '';
	return `<indent>${linkedNumber} ${escapeXml(word!)}${gloss}</indent>`;
}

export function renderBody(rest: string, forceWordFamilyMode = false): string {
	const senses = groupIntoSenses(rest, forceWordFamilyMode);
	const render = forceWordFamilyMode ? renderSynonymSense : renderSense;
	return senses
		.map((sense, index) => {
			if (index === 0) return render(sense);
			return `${isMajorBreak(sense) ? '<br/><br/>' : '<br/>'}${render(sense)}`;
		})
		.join('');
}

function toNumber(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value.replace(/^0+/, '') || '0', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function main() {
	const [inputPath, outputPath] = process.argv.slice(2);
	if (!inputPath || !outputPath) {
		console.error(
			'usage: node scripts/convert-kautz-lexicon.ts <kautz-source.html|.txt> <output.xml> ' +
				'[--enrichment path] [--abbreviations path]'
		);
		process.exit(1);
	}

	const enrichmentIndex = process.argv.indexOf('--enrichment');
	const enrichmentPath =
		enrichmentIndex !== -1 ? process.argv[enrichmentIndex + 1]! : 'data/strongsgreek.xml';

	const abbreviationsIndex = process.argv.indexOf('--abbreviations');
	const abbreviationsPath =
		abbreviationsIndex !== -1 ? process.argv[abbreviationsIndex + 1]! : DEFAULT_ABBREVIATIONS_PATH;

	const enrichment = await loadEnrichment(enrichmentPath);
	console.log(`loaded ${enrichment.size} enrichment entries from ${enrichmentPath}`);

	const source = await readFile(inputPath, 'utf8');
	const isHtml = /^\s*</.test(source);
	const lines = isHtml ? linesFromHtml(source) : linesFromPlainText(source);
	console.log(`read ${lines.length} lines from ${inputPath} (${isHtml ? 'HTML' : 'plain text'})`);

	if (isHtml && abbreviationsIndex === -1) {
		setAbbreviations(extractAbbreviationsFromLines(lines));
	} else {
		setAbbreviations(await loadAbbreviations(abbreviationsPath));
	}
	console.log(`loaded ${Object.keys(abbreviations).length} abbreviation glossary entries`);

	const entries = splitEntries(lines);
	console.log(
		`found ${entries.length} entries in the range 1-${MAX_GREEK_NUMBER} and ${SYNONYM_MIN}-${SYNONYM_MAX}`
	);

	const xmlEntries: string[] = [];
	let missingEnrichment = 0;

	for (const { number, body } of entries) {
		const isSynonym = number >= SYNONYM_MIN && number <= SYNONYM_MAX;
		const info = isSynonym ? SYNONYM_ENRICHMENT : enrichment.get(number);
		if (!info) {
			missingEnrichment += 1;
			continue;
		}

		const { etymology, rest } = splitHeader(body);
		const padded = String(number).padStart(5, '0');
		const greekAttrs = [
			info.beta ? `BETA="${escapeXml(info.beta)}"` : '',
			`unicode="${escapeXml(info.unicode)}"`,
			info.translit ? `translit="${escapeXml(info.translit)}"` : ''
		]
			.filter(Boolean)
			.join(' ');

		xmlEntries.push(
			[
				`<entry strongs="${padded}">`,
				`<strongs>${number}</strongs>`,
				`<greek ${greekAttrs}/>`,
				info.pronunciation ? `<pronunciation strongs="${escapeXml(info.pronunciation)}"/>` : '',
				etymology ? `<strongs_derivation>${renderEtymology(etymology)}</strongs_derivation>` : '',
				`<strongs_def>${renderBody(rest, isSynonym)}</strongs_def>`,
				`</entry>`
			]
				.filter(Boolean)
				.join('\n ')
		);
	}

	if (missingEnrichment > 0) {
		console.log(
			`skipped ${missingEnrichment} entries with no matching number in ${enrichmentPath} (no Greek unicode available)`
		);
	}

	// Kautz' own manuscript prints this as "Copyright © Gerhard Kautz (Update 5/2026)" (extracted by
	// extractCopyrightFromLines below, in case a future update changes the date), but his permission
	// email quotes it abbreviated — "Mache es genauso wie im Original 2026: Copyright © G. Kautz
	// (Update 5/2026)" — and that is the exact wording he asked to see displayed, so his own manuscript
	// spelling is normalised to match it here.
	const manuscriptCopyright = isHtml ? extractCopyrightFromLines(lines) : undefined;
	const prologue = (manuscriptCopyright ?? 'Copyright © Gerhard Kautz (Update 5/2026)').replace(
		'Gerhard Kautz',
		'G. Kautz'
	);
	const usageNotes = isHtml ? extractUsageNotesFromLines(lines) : undefined;
	if (usageNotes)
		console.log('extracted the usage-notes section ("Hinweise zur Benützung des Lexikons")');
	const bibliography = isHtml ? extractBibliographyFromLines(lines) : undefined;
	if (bibliography)
		console.log(
			'extracted the bibliography ("Die für die Bearbeitung des Lexikons verwendete Fachliteratur")'
		);
	// Both sit under one disclosure on the site (see strong.usageNotes in de.ts), so they are combined
	// into the same `<usage_notes>` element here rather than each getting their own — Kautz asked for
	// the bibliography to be credited "alongside" the usage notes, not as a separate section.
	const usageNotesAndBibliography = [
		usageNotes,
		bibliography ? `<b>Literaturverzeichnis</b><br/><br/>${bibliography}` : ''
	]
		.filter(Boolean)
		.join('<br/><br/>');

	const xml = [
		`<?xml version='1.0' encoding='utf-8' standalone='yes'?>`,
		`<strongsdictionary><prologue>${escapeXml(prologue)}</prologue>`,
		usageNotesAndBibliography ? `<usage_notes>${usageNotesAndBibliography}</usage_notes>` : '',
		`<entries>`,
		` ${xmlEntries.join('\n ')}`,
		`</entries></strongsdictionary>`
	]
		.filter(Boolean)
		.join('\n')
		.replaceAll(BOLD_OPEN, '<b>')
		.replaceAll(BOLD_CLOSE, '</b>')
		.replaceAll(ITALIC_OPEN, '<i>')
		.replaceAll(ITALIC_CLOSE, '</i>');

	await writeFile(outputPath, xml, 'utf8');
	console.log(`wrote ${xmlEntries.length} entries to ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
