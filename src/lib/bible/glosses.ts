/** A word form already counted by the database for one resource and Strong number. */
export type RawStrongGloss = { gloss: string; display: string; occurrences: number };
export type LemmaCandidate = readonly [lemma: string, partOfSpeech: string];
export type LemmaLookup = (form: string) => readonly LemmaCandidate[];
export type StrongGlossGroup = {
	display: string;
	occurrences: number;
	forms: RawStrongGloss[];
};

const CONTENT_PARTS = new Set([
	'Noun',
	'Verb',
	'Adjective',
	'Adverb',
	'AdjectivalDeclension',
	'NOUN',
	'VERB',
	'ADJ',
	'ADV'
]);
const NOUN_PARTS = new Set(['Noun', 'AdjectivalDeclension', 'NOUN']);

function candidates(form: string, lookup: LemmaLookup): string[] {
	// A Strong tag may span a phrase. It still represents one counted rendering, not several words.
	if (!/^[\p{L}\p{M}][\p{L}\p{M}'’-]*$/u.test(form)) return [];
	let entries = lookup(form.normalize('NFC'));
	if (!entries.length && form !== form.toLowerCase()) {
		// Sentence-initial verbs/adjectives may be capitalized. Never invent a noun analysis by casing.
		entries = lookup(form.toLowerCase().normalize('NFC')).filter(
			([, part]) => !NOUN_PARTS.has(part)
		);
	}
	return [
		...new Set(entries.filter(([, part]) => CONTENT_PARTS.has(part)).map(([lemma]) => lemma))
	];
}

/**
 * Group ALL precomputed forms before any display limit. An ambiguous form is resolved only when
 * exactly one candidate is independently supported by an unambiguous form of this same Strong.
 * No frequency heuristic, stemming, stop-word removal or change to the source annotations occurs.
 */
export function groupStrongGlosses(
	rows: readonly RawStrongGloss[],
	lookup: LemmaLookup = () => []
): StrongGlossGroup[] {
	const analyses = rows.map((row) => candidates(row.display, lookup));
	const supported = new Set(analyses.flatMap((values) => (values.length === 1 ? values : [])));
	const resolved = analyses.map((values) => {
		const supportedCandidates = values.filter((lemma) => supported.has(lemma));
		return values.length === 1
			? values[0]
			: supportedCandidates.length === 1
				? supportedCandidates[0]
				: undefined;
	});
	// A raw unresolved "Aas" and a resolved Aase→Aas must not silently merge via their label. If
	// an unresolved form would collide, preserve every affected spelling and its existing filter.
	const protectedDisplays = new Set(
		rows.filter((_, index) => !resolved[index]).map((row) => row.display.normalize('NFC'))
	);
	let changed: boolean;
	do {
		changed = false;
		for (const [index, lemma] of resolved.entries()) {
			if (lemma && protectedDisplays.has(lemma)) {
				resolved[index] = undefined;
				protectedDisplays.add(rows[index]!.display.normalize('NFC'));
				changed = true;
			}
		}
	} while (changed);
	const groups = new Map<string, StrongGlossGroup>();
	for (const [index, row] of rows.entries()) {
		const lemma = resolved[index];
		const display = lemma ?? row.display;
		// Keep SQL's normalized raw keys for unknown languages/forms and for subsequent IN filters.
		// Recognized noun "Leben" and verb "leben" are separate lexical entries.
		const key = lemma ? `lemma:${lemma.normalize('NFC')}` : `form:${row.gloss}`;
		const group = groups.get(key);
		if (group) {
			group.occurrences += row.occurrences;
			group.forms.push(row);
		} else groups.set(key, { display, occurrences: row.occurrences, forms: [row] });
	}
	const compare = (
		a: { display: string; occurrences: number },
		b: { display: string; occurrences: number }
	) => b.occurrences - a.occurrences || a.display.localeCompare(b.display, 'de');
	for (const group of groups.values()) group.forms.sort(compare);
	return [...groups.values()].sort(compare);
}
