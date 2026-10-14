/**
 * Book families used by csv-bibel.de, as requested in issue #323. In particular, Lamentations
 * belongs to poetry, Hebrews to the general letters, and Revelation has its own family.
 * These are display categories; they never change canonical order or reference parsing.
 */
export const BOOK_GROUPS = {
	law: 'Bücher Mose',
	history: 'Geschichtsbücher',
	poetry: 'Poetische Bücher',
	major: 'Große Propheten',
	minor: 'Kleine Propheten',
	gospels: 'Evangelien',
	acts: 'Apostelgeschichte',
	pauline: 'Paulusbriefe',
	general: 'Allgemeine Briefe',
	revelation: 'Offenbarung'
} as const;

export type BookGroup = keyof typeof BOOK_GROUPS;

export function bookGroup(book: number): BookGroup | undefined {
	if (!Number.isInteger(book) || book < 1 || book > 66) return undefined;
	if (book <= 5) return 'law';
	if (book <= 17) return 'history';
	if (book <= 22 || book === 25) return 'poetry';
	if (book <= 27) return 'major';
	if (book <= 39) return 'minor';
	if (book <= 43) return 'gospels';
	if (book === 44) return 'acts';
	if (book <= 57) return 'pauline';
	if (book <= 65) return 'general';
	return 'revelation';
}
