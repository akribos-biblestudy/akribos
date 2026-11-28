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

	it('uses one reference and one line per verse for a consecutive selection', () => {
		expect(
			formatCopiedVerses(
				[
					{ ...verse, reference: '1.Petrus 5,1', text: 'Erster Vers.' },
					{ ...verse, reference: '1.Petrus 5,2-3', text: 'Zusammengefasster Vers.' },
					{ ...verse, reference: '1.Petrus 5,4', text: 'Letzter Vers.' }
				],
				{ copyReferencePosition: 'before', copyIncludeSource: false }
			)
		).toBe('1.Petrus 5,1-4\nErster Vers.\nZusammengefasster Vers.\nLetzter Vers.');
	});

	it('keeps the configured position and translation for a range across chapters', () => {
		expect(
			formatCopiedVerses(
				[
					{ ...verse, endsChapter: true },
					{ ...verse, reference: '2.Korinther 4,1', text: 'Darum …' },
					{ ...verse, reference: '2.Korinther 4,2', text: 'Vielmehr …' }
				],
				{ copyReferencePosition: 'after', copyIncludeSource: true }
			)
		).toBe('Wir alle aber …\nDarum …\nVielmehr …\n– 2.Korinther 3,18-4,2 (SCH2000)');
	});

	it('starts a separate citation at a verse gap or a change of translation', () => {
		expect(
			formatCopiedVerses(
				[
					verse,
					{ ...verse, reference: '2.Korinther 3,20', text: 'Vers nach einer Lücke.' },
					{ ...verse, reference: '2.Korinther 3,21', text: 'Andere Übersetzung.', source: 'ELB' }
				],
				{ copyReferencePosition: 'before', copyIncludeSource: true }
			)
		).toBe(
			'2.Korinther 3,18 (SCH2000)\nWir alle aber …\n\n' +
				'2.Korinther 3,20 (SCH2000)\nVers nach einer Lücke.\n\n' +
				'2.Korinther 3,21 (ELB)\nAndere Übersetzung.'
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
