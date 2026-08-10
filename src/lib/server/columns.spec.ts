import { describe, expect, it } from 'vitest';
import {
	addColumn,
	defaultColumns,
	MAX_COLUMNS,
	moveColumn,
	removeColumn,
	resolveColumns,
	setColumn
} from './columns.ts';
import type { ReadableResource } from './repositories/resources.ts';

/** Just enough of a resource for the column arithmetic, which only ever reads the id. */
function resource(id: string): ReadableResource {
	return {
		id,
		kind: 'bible',
		name: id,
		abbrev: id,
		coverTitle: id,
		tabTitle: id,
		selectionTitle: id,
		selectionSubtitle: id,
		language: 'de',
		canon: 'both',
		direction: 'ltr',
		sortOrder: 100,
		hasStrongs: false,
		hasMorphology: false,
		licenseHtml: null,
		usageNotesHtml: null
	};
}

const available = ['A', 'B', 'C', 'D', 'E', 'F'].map(resource);

describe('reader columns', () => {
	it('offers the first four translations to a first-time visitor', () => {
		expect(defaultColumns(available)).toEqual(['A', 'B', 'C', 'D']);
	});

	it('prefers the device cookie over the account selection', () => {
		const cookies = { get: () => 'A,B,C' } as unknown as Parameters<typeof resolveColumns>[0];
		expect(resolveColumns(cookies, available, ['E', 'C'])).toEqual(['A', 'B', 'C']);
	});

	it('falls back to a valid account selection when this device has no cookie yet', () => {
		const cookies = { get: () => undefined } as unknown as Parameters<typeof resolveColumns>[0];
		expect(resolveColumns(cookies, available, ['missing', 'D', 'D'])).toEqual(['D']);
	});

	it('drops unavailable and duplicate resources from the device cookie too', () => {
		const cookies = { get: () => 'missing,D,D' } as unknown as Parameters<typeof resolveColumns>[0];
		expect(resolveColumns(cookies, available, ['E', 'C'])).toEqual(['D']);
	});

	describe('addColumn', () => {
		it('appends the first translation not on screen', () => {
			expect(addColumn(['A', 'C'], available)).toEqual(['A', 'C', 'B']);
		});

		it('appends the translation the reader picked', () => {
			expect(addColumn(['A', 'C'], available, 'E')).toEqual(['A', 'C', 'E']);
		});

		it('ignores a translation that is already on screen', () => {
			expect(addColumn(['A', 'C'], available, 'C')).toEqual(['A', 'C']);
		});

		it('ignores an unknown translation rather than inventing a column', () => {
			expect(addColumn(['A'], available, 'nonexistent')).toEqual(['A']);
		});

		it('stops at the column limit', () => {
			const full = available.slice(0, MAX_COLUMNS).map((entry) => entry.id);
			expect(addColumn(full, available)).toEqual(full);
			expect(addColumn(full, available, 'F')).toEqual(full);
		});
	});

	describe('setColumn', () => {
		it('swaps when the chosen translation is already in another column', () => {
			expect(setColumn(['A', 'B', 'C'], 0, 'C')).toEqual(['C', 'B', 'A']);
		});

		it('replaces when the chosen translation is not shown yet', () => {
			expect(setColumn(['A', 'B'], 1, 'D')).toEqual(['A', 'D']);
		});
	});

	describe('removeColumn', () => {
		it('drops the column at the given position', () => {
			expect(removeColumn(['A', 'B', 'C'], 1)).toEqual(['A', 'C']);
		});

		it('refuses to leave the reader with nothing to read', () => {
			expect(removeColumn(['A'], 0)).toEqual(['A']);
		});
	});

	describe('moveColumn', () => {
		it('moves a column in either direction', () => {
			expect(moveColumn(['A', 'B', 'C', 'D'], 0, 2)).toEqual(['B', 'C', 'A', 'D']);
			expect(moveColumn(['A', 'B', 'C', 'D'], 3, 1)).toEqual(['A', 'D', 'B', 'C']);
		});

		it('ignores invalid positions', () => {
			expect(moveColumn(['A', 'B'], -1, 1)).toEqual(['A', 'B']);
			expect(moveColumn(['A', 'B'], 0, 3)).toEqual(['A', 'B']);
		});
	});
});
