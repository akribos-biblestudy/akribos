import { describe, expect, it } from 'vitest';
import { formatCopiedVerses } from './copy-verse';

const verse = { reference: '2.Korinther 3,18', text: 'Wir alle aber …', source: 'SCH2000' };

describe('formatCopiedVerses', () => {
	it.each([
		['before', false, '2.Korinther 3,18\nWir alle aber …'],
		['before', true, '2.Korinther 3,18 (SCH2000)\nWir alle aber …'],
		['after', false, 'Wir alle aber …\n– 2.Korinther 3,18'],
		['after', true, 'Wir alle aber …\n– 2.Korinther 3,18 (SCH2000)']
	] as const)('formats %s, source %s', (copyReferencePosition, copyIncludeSource, expected) => {
		expect(formatCopiedVerses([verse], { copyReferencePosition, copyIncludeSource })).toBe(
			expected
		);
	});

	it('keeps each verse and its reference together', () => {
		expect(
			formatCopiedVerses([verse, { ...verse, reference: '2.Korinther 4,1', text: 'Darum …' }], {
				copyReferencePosition: 'before',
				copyIncludeSource: false
			})
		).toBe('2.Korinther 3,18\nWir alle aber …\n\n2.Korinther 4,1\nDarum …');
	});
});
