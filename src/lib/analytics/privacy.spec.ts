import { describe, expect, it } from 'vitest';
import { analyticsChoice, analyticsPage } from './privacy.ts';

describe('analytics disclosure boundary', () => {
	it('uses only fixed categories for public reading routes', () => {
		expect(analyticsPage('/[...reference]')).toBe('/reader');
		expect(analyticsPage('/[strong=strong]/[[page]]')).toBe('/word-study');
		expect(analyticsPage('/search')).toBe('/search');
		expect(analyticsPage('/help')).toBe('/help');
	});
	it.each([
		'/admin',
		'/admin/analytics',
		'/account',
		'/notes/[id]',
		'/notes/published/[slug]',
		'/sermons',
		'/login',
		'/reset-password/[token]',
		'/unknown',
		null
	])('excludes %s', (route) => {
		expect(analyticsPage(route)).toBeNull();
	});
	it('accepts a decision only for the current recipient/configuration', () => {
		expect(analyticsChoice('current.yes', 'current')).toBe('yes');
		expect(analyticsChoice('current.no', 'current')).toBe('no');
		expect(analyticsChoice('old.yes', 'current')).toBeNull();
		expect(analyticsChoice(undefined, 'current')).toBeNull();
		expect(analyticsChoice('yes', 'current')).toBeNull();
	});
});
