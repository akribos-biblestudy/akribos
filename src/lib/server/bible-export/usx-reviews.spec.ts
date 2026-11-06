import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { writeFileSync } from 'node:fs';
import { fingerprint } from '../strong-review/repository.ts';
import { usxArchive, usxResponse } from './usx.ts';
import { parseUsxArchive } from '../import/usx-archive.ts';
import {
	STRONG_ASSIGNMENT_NOTE_TEXT,
	strongAssignmentStatus
} from '../../bible/strong-assignment.ts';
import type { VerseSegment } from '../../bible/segments.ts';

const segments: VerseSegment[] = [
	{ kind: 'w', text: 'Liebe', strong: 'G25', strongs: ['G25', 'G26'] },
	{ kind: 'note', marker: '', text: STRONG_ASSIGNMENT_NOTE_TEXT },
	' und ',
	{ kind: 'w', text: 'Herr', strong: 'G2316' },
	{ kind: 'note', marker: '', text: STRONG_ASSIGNMENT_NOTE_TEXT },
	' und ',
	{ kind: 'w', text: 'Wort', strong: 'G3056' },
	{ kind: 'note', marker: '', text: STRONG_ASSIGNMENT_NOTE_TEXT }
];
const hash = fingerprint(segments);
const now = new Date('2026-01-01T00:00:00.000Z');
const snapshot = {
	resource: { id: 'TEST', name: 'Test', language: 'de' },
	books: [{ bookId: 43, chapterCount: 1, verseCount: 1 }],
	verses: [
		{
			book: 43,
			chapter: 1,
			verse: 1,
			verseEnd: null,
			segments,
			text: 'Liebe und Herr und Wort',
			heading: null,
			words: []
		}
	],
	reviews: [
		{
			bookId: 43,
			chapter: 1,
			verse: 1,
			wordPosition: 0,
			strong: 'G25',
			word: 'Liebe',
			verseFingerprint: hash,
			decision: 'confirmed',
			approvedAt: now
		},
		{
			bookId: 43,
			chapter: 1,
			verse: 1,
			wordPosition: 0,
			strong: 'G26',
			word: 'Liebe',
			verseFingerprint: hash,
			decision: 'confirmed',
			approvedAt: null
		},
		{
			bookId: 43,
			chapter: 1,
			verse: 1,
			wordPosition: 1,
			strong: 'G2316',
			word: 'Herr',
			verseFingerprint: hash,
			decision: 'incorrect',
			approvedAt: now
		},
		{
			bookId: 43,
			chapter: 1,
			verse: 1,
			wordPosition: 2,
			strong: 'G3056',
			word: 'Wort',
			verseFingerprint: '0'.repeat(64),
			decision: 'confirmed',
			approvedAt: now
		}
	]
} as unknown as Parameters<typeof usxArchive>[0];

describe('USX approved review exchange', () => {
	it('preserves approved individual Strong IDs without approving pending or stale IDs', async () => {
		const bytes = usxArchive(snapshot);
		const files = unzipSync(bytes);
		const xml = strFromU8(files['43-JHN.usx']!);
		if (process.env.USX_SCHEMA_OUTPUT) writeFileSync(process.env.USX_SCHEMA_OUTPUT, xml);
		expect(xml).toContain('Akribos: Strong-Zuordnung G25 fachlich bestätigt.');
		expect(xml).toContain('Akribos: Strong-Zuordnung G2316 fachlich als fehlerhaft markiert.');
		expect(xml).not.toContain('Strong-Zuordnung G26 fachlich bestätigt');
		expect(xml).not.toContain('Strong-Zuordnung G3056 fachlich bestätigt');
		const events = [];
		for await (const event of parseUsxArchive(bytes, 'test.zip')) events.push(event);
		const verse = events.find((event) => event.type === 'verse');
		if (!verse || verse.type !== 'verse') throw new Error('Missing verse');
		const decisions = events.filter((event) => event.type === 'strongReview');
		expect(decisions).toHaveLength(2);
		expect(decisions.map((event) => event.review.strong)).toEqual(['G25', 'G2316']);
		expect(strongAssignmentStatus(verse.verse.segments, 'G26', 'Liebe', 0)).toBe('unconfirmed');
		expect(strongAssignmentStatus(verse.verse.segments, 'G3056', 'Wort', 2)).toBe('unconfirmed');
	});
	it('rejects modified USX bytes rather than attaching old decisions', async () => {
		const files = unzipSync(usxArchive(snapshot));
		files['43-JHN.usx'] = strToU8(strFromU8(files['43-JHN.usx']!).replace('Liebe', 'Anders'));
		const events = async () => {
			for await (const event of parseUsxArchive(zipSync(files), 'test.zip')) {
				void event;
			}
		};
		await expect(events()).rejects.toThrow(/Prüfsumme/);
	});
	it('rejects a changed Strong ID even when it belongs to the same word', async () => {
		const files = unzipSync(usxArchive(snapshot));
		const manifest = JSON.parse(strFromU8(files['strong-pruefungen.json']!));
		manifest.reviews[0].strong = 'G26';
		files['strong-pruefungen.json'] = strToU8(JSON.stringify(manifest));
		const events = async () => {
			for await (const event of parseUsxArchive(zipSync(files), 'test.zip')) {
				void event;
			}
		};
		await expect(events()).rejects.toThrow(/Prüfungshinweis/);
	});
	it('fails explicitly instead of emitting a manifest the importer cannot read', () => {
		const oversized = structuredClone(snapshot);
		const word = oversized.verses[0]!.segments[0] as { text: string };
		word.text = 'x'.repeat(20001);
		oversized.reviews[0]!.word = word.text;
		oversized.reviews[0]!.verseFingerprint = fingerprint(oversized.verses[0]!.segments);
		const response = usxResponse(oversized);
		expect(response.status).toBe(413);
	});
});
