import { describe, expect, it } from 'vitest';
import {
	createTabHistory,
	moveTabHistory,
	visitTabHistory,
	type TabHistoryLocation
} from './tab-history';

const reference = (verse: number): TabHistoryLocation => ({
	kind: 'reference',
	reference: { book: 43, chapter: 3, verse }
});
const search: TabHistoryLocation = { kind: 'search', query: 'Gottes Sohn', page: 2, book: 43 };

describe('tab navigation history', () => {
	it('keeps the explicit destination and only the latest scroll endpoint around a search', () => {
		let history = createTabHistory({ kind: 'reference', reference: { book: 43, chapter: 1 } });
		history = visitTabHistory(history, search);
		history = visitTabHistory(history, reference(16));
		for (const verse of [17, 18, 19, 20])
			history = visitTabHistory(history, reference(verse), true);
		expect(history.entries).toHaveLength(4);
		for (const [direction, expected] of [
			[-1, reference(16)],
			[-1, search],
			[1, reference(16)],
			[1, reference(20)]
		] as const) {
			history = moveTabHistory(history, direction)!;
			expect(history.entries[history.index]!.location).toEqual(expected);
		}
		expect(moveTabHistory(history, 1)).toBeNull();
	});
	it('drops forward visits after a new destination and leaves other histories untouched', () => {
		const original = visitTabHistory(createTabHistory(reference(16)), search);
		const back = moveTabHistory(original, -1)!;
		const branch = visitTabHistory(back, reference(18));
		expect(moveTabHistory(branch, 1)).toBeNull();
		expect(branch.entries.map((entry) => entry.location)).toEqual([reference(16), reference(18)]);
		expect(original.entries[1]!.location).toEqual(search);
	});
	it('does not duplicate destinations or retain a scroll endpoint at its origin', () => {
		const initial = createTabHistory(reference(16));
		expect(visitTabHistory(initial, reference(16))).toBe(initial);
		const scrolled = visitTabHistory(initial, reference(20), true);
		expect(visitTabHistory(scrolled, reference(16), true)).toEqual(initial);
		expect(moveTabHistory(initial, -1)).toBeNull();
	});
	it('preserves search filters and dictionary lookups without recording background scrolling', () => {
		const history = createTabHistory(search);
		expect(visitTabHistory(history, reference(20), true)).toBe(history);
		const lookup = visitTabHistory(createTabHistory({ kind: 'lookup', lookup: 'G25' }), {
			kind: 'lookup',
			lookup: 'G2316'
		});
		expect(moveTabHistory(lookup, -1)!.entries[0]!.location).toEqual({
			kind: 'lookup',
			lookup: 'G25'
		});
	});

	it('retains an explicitly entered scroll position as a destination for subsequent reading', () => {
		let history = visitTabHistory(createTabHistory(reference(16)), reference(20), true);
		history = visitTabHistory(history, reference(20));
		history = visitTabHistory(history, reference(25), true);
		expect(history.entries.map((entry) => entry.location)).toEqual([
			reference(16),
			reference(20),
			reference(25)
		]);
	});
	it('bounds a long running tab without invalidating its cursor', () => {
		let history = createTabHistory(reference(1));
		for (let verse = 2; verse <= 150; verse++) history = visitTabHistory(history, reference(verse));
		expect(history.entries).toHaveLength(100);
		expect(history.entries[history.index]!.location).toEqual(reference(150));
	});
});
