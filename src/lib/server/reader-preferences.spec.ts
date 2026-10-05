import { describe, expect, it } from 'vitest';
import { MAX_FONT_SCALE, MIN_FONT_SCALE, normalizeFontScale } from './reader-preferences.ts';

describe('reader font scale', () => {
	it('rounds to five-percent steps', () => {
		expect(normalizeFontScale(103)).toBe(105);
		expect(normalizeFontScale(102)).toBe(100);
	});

	it('stays within the supported range', () => {
		expect(normalizeFontScale(20)).toBe(MIN_FONT_SCALE);
		expect(normalizeFontScale(500)).toBe(MAX_FONT_SCALE);
	});

	it('offers 70 to 200 percent', () => {
		expect([MIN_FONT_SCALE, MAX_FONT_SCALE]).toEqual([70, 200]);
		expect(normalizeFontScale(72)).toBe(70);
		expect(normalizeFontScale(198)).toBe(200);
	});

	it('falls back safely for an invalid value', () => {
		expect(normalizeFontScale(Number.NaN)).toBe(100);
	});
});
