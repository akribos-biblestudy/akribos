import { describe, expect, it } from 'vitest';
import { passagePointKey } from '$lib/bible/passage';
import {
	readerDocumentBoundariesAt,
	readerDocumentsAt,
	type ReaderDocumentAnchor
} from './document-notes';

function key(book: number, chapter: number, verse: number): number {
	return passagePointKey({ book, chapter, verse });
}

function anchor(
	documentId: string,
	start: [number, number, number],
	end = start,
	resourceId: string | null = null
): ReaderDocumentAnchor {
	return {
		documentId,
		title: `Document ${documentId}`,
		kind: 'note',
		source: 'native',
		resourceId,
		startKey: key(...start),
		endKey: key(...end)
	};
}

describe('readerDocumentsAt', () => {
	it('matches inclusive cross-chapter ranges and merged verse cells', () => {
		const anchors = [anchor('cross', [43, 3, 18], [43, 4, 2])];
		expect(readerDocumentsAt(anchors, { book: 43, chapter: 4, verse: 1 })).toHaveLength(1);
		expect(readerDocumentsAt(anchors, { book: 43, chapter: 4, verse: 3 })).toHaveLength(0);
		expect(
			readerDocumentsAt([anchor('merged', [43, 3, 17])], {
				book: 43,
				chapter: 3,
				verse: 16,
				verseEnd: 17
			})
		).toHaveLength(1);
	});

	it('de-duplicates anchors and lets a canonical match win the scope label', () => {
		const anchors = [
			anchor('same', [43, 3, 16], [43, 3, 18], 'SEEDDE'),
			anchor('same', [43, 3, 16])
		];
		expect(readerDocumentsAt(anchors, { book: 43, chapter: 3, verse: 16 })).toEqual([
			expect.objectContaining({ id: 'same', translationSpecific: false })
		]);
	});

	it('marks a ranged document only at its first and last covered verse', () => {
		const anchors = [anchor('range', [43, 3, 16], [43, 3, 18])];

		expect(readerDocumentBoundariesAt(anchors, { book: 43, chapter: 3, verse: 16 })).toEqual([
			expect.objectContaining({ id: 'range' })
		]);
		expect(readerDocumentBoundariesAt(anchors, { book: 43, chapter: 3, verse: 17 })).toEqual([]);
		expect(readerDocumentBoundariesAt(anchors, { book: 43, chapter: 3, verse: 18 })).toEqual([
			expect.objectContaining({ id: 'range' })
		]);
	});

	it('emits one boundary marker when a merged cell contains both range endpoints', () => {
		const anchors = [anchor('merged-range', [43, 3, 16], [43, 3, 17])];

		expect(
			readerDocumentBoundariesAt(anchors, {
				book: 43,
				chapter: 3,
				verse: 16,
				verseEnd: 17
			})
		).toEqual([expect.objectContaining({ id: 'merged-range' })]);
	});

	it('keeps painting a cross-chapter range while placing only its real endpoints', () => {
		const anchors = [anchor('cross', [43, 3, 18], [43, 4, 2])];

		expect(readerDocumentsAt(anchors, { book: 43, chapter: 4, verse: 1 })).toHaveLength(1);
		expect(readerDocumentBoundariesAt(anchors, { book: 43, chapter: 4, verse: 1 })).toEqual([]);
		expect(readerDocumentBoundariesAt(anchors, { book: 43, chapter: 4, verse: 2 })).toEqual([
			expect.objectContaining({ id: 'cross' })
		]);
	});
});
