import { describe, expect, it } from 'vitest';
import { reviewVerseChunks } from './verse-context';
import type { VerseSegment } from '$lib/bible/segments';

describe('review verse context', () => {
	it('highlights the requested tagged occurrence, including inside nested containers', () => {
		const segments: VerseSegment[] = [
			{ kind: 'w', text: 'Wort', strong: 'G1' },
			' und ',
			{ kind: 'wj', children: [{ kind: 'w', text: 'Wort', strong: 'G1', strongs: ['G1', 'G2'] }] },
			{ kind: 'note', marker: '', text: 'Hinweis' },
			{ kind: 'br' },
			{ kind: 'em', text: 'danach' }
		];
		expect(reviewVerseChunks(segments, 1)).toEqual([
			{ text: 'Wort und ', target: false },
			{ text: 'Wort', target: true },
			{ text: '\ndanach', target: false }
		]);
	});
});
