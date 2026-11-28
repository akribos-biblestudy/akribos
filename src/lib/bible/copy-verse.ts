import { formatPassage, parsePassage, type Passage, type PassagePoint } from './passage';
import { nextChapter } from './reference';

export type VerseCopyOptions = {
	copyReferencePosition: 'before' | 'after';
	copyIncludeSource: boolean;
};

export type CopiedVerse = {
	reference: string;
	text: string;
	source: string;
	/** Whether this row ends its chapter in the selected translation. */
	endsChapter?: boolean;
};

type VerseGroup = {
	first: CopiedVerse;
	passage: Passage | null;
	lines: string[];
	endsChapter?: boolean;
};

function areConsecutive(
	end: PassagePoint,
	start: PassagePoint,
	endsChapter: boolean | undefined
): boolean {
	if (end.book === start.book && end.chapter === start.chapter)
		return start.verse === end.verse + 1;
	if (!endsChapter || start.verse !== 1) return false;
	const next = nextChapter(end.book, end.chapter);
	return next?.book === start.book && next.chapter === start.chapter;
}

/** Use a single citation per consecutive run of verses from the same translation. */
export function formatCopiedVerses(verses: CopiedVerse[], options: VerseCopyOptions): string {
	const groups: VerseGroup[] = [];
	for (const verse of verses) {
		const passage = parsePassage(verse.reference);
		const group = groups.at(-1);
		if (
			group?.passage &&
			passage &&
			group.first.source === verse.source &&
			areConsecutive(group.passage.end, passage.start, group.endsChapter)
		) {
			group.passage.end = passage.end;
			group.lines.push(verse.text);
			group.endsChapter = verse.endsChapter;
		} else {
			groups.push({ first: verse, passage, lines: [verse.text], endsChapter: verse.endsChapter });
		}
	}
	return groups
		.map(({ first, passage, lines }) => {
			const range = lines.length > 1 && passage ? formatPassage(passage, { style: 'full' }) : null;
			const reference = range ?? first.reference;
			const citation =
				options.copyIncludeSource && first.source ? `${reference} (${first.source})` : reference;
			const text = lines.join('\n');
			return options.copyReferencePosition === 'after'
				? `${text}\n– ${citation}`
				: `${citation}\n${text}`;
		})
		.join('\n\n');
}
