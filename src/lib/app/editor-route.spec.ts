import { describe, expect, it } from 'vitest';
import { isAppEditorPath } from './editor-route';

describe('native editor presentation boundary', () => {
	it('recognizes document pages and SvelteKit data requests only', () => {
		for (const path of [
			'/app/editor/ee8a4afb-c754-430c-ad0b-7d8665386130',
			'/app/editor/ee8a4afb-c754-430c-ad0b-7d8665386130/',
			'/app/editor/ee8a4afb-c754-430c-ad0b-7d8665386130/__data.json'
		])
			expect(isAppEditorPath(path)).toBe(true);
		for (const path of [
			'/notes/id',
			'/app/editor',
			'/app/editor/id/export',
			'/app/editorial/id',
			'/'
		])
			expect(isAppEditorPath(path)).toBe(false);
	});
});
