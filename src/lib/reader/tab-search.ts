import type { VerseSegment } from '$lib/bible/segments';

export type ReaderTabScriptureSearch = {
	kind: 'scripture';
	query: string;
	needles: string[];
	total: number;
	page: number;
	pageCount: number;
	book: number | null;
	bookCounts: { book: number; count: number }[];
	suggestion: string | null;
	hits: {
		book: number;
		chapter: number;
		verse: number;
		segments: VerseSegment[];
	}[];
};

export type ReaderTabStrongSearch = {
	kind: 'strong';
	query: string;
	strong: string;
	total: number;
	page: number;
	pageCount: number;
	book: number | null;
	bookCounts: { book: number; count: number }[];
	glosses: { display: string; occurrences: number }[];
	statistics: { occurrences: number; verseCount: number };
	hits: {
		book: number;
		chapter: number;
		verse: number;
		segments: VerseSegment[];
		morph: string | null;
		lemma: string | null;
	}[];
};

export type ReaderTabCommentarySearch = {
	kind: 'commentary';
	query: string;
	needles: string[];
	total: number;
	page: number;
	pageCount: number;
	book: number | null;
	bookCounts: { book: number; count: number }[];
	suggestion: string | null;
	hits: {
		id: number;
		book: number;
		chapter: number;
		verseStart: number | null;
		verseEnd: number | null;
		title: string | null;
		bodyHtml: string;
	}[];
};

export type ReaderTabUnsupportedSearch = {
	kind: 'unsupported';
	query: string;
	total: 0;
	page: 1;
	pageCount: 1;
	book: null;
};

export type ReaderTabSearchResponse =
	| ReaderTabScriptureSearch
	| ReaderTabStrongSearch
	| ReaderTabCommentarySearch
	| ReaderTabUnsupportedSearch;
