import { describe, expect, it } from 'vitest';
import { documentLinkTargetIds, ownedDocumentIdFromHref } from './document-links';

const FIRST = '5eed0000-0000-4000-8000-000000000001';
const SECOND = '5eed0000-0000-4000-8000-000000000002';

describe('document links', () => {
	it('extracts unique owned-document Markdown targets without treating text or code as links', () => {
		expect(
			documentLinkTargetIds(
				`[Erste](/notes/${FIRST}) und [Zweite](/notes/${SECOND}?returnTo=%2Fnotes#abschnitt).\n\n` +
					`[Noch einmal](/notes/${FIRST}) \`/notes/${SECOND}\` https://example.com/notes/${FIRST}`
			)
		).toEqual([FIRST, SECOND]);
	});

	it('recognises only exact private editor paths', () => {
		expect(ownedDocumentIdFromHref(`/notes/${FIRST}`)).toBe(FIRST);
		expect(ownedDocumentIdFromHref(`/notes/published/${FIRST}`)).toBeNull();
		expect(ownedDocumentIdFromHref(`https://akribos.de/notes/${FIRST}`)).toBeNull();
	});
});
