import { describe, expect, it } from 'vitest';
import { formatGermanCalendarDate, parseCalendarDateValue } from './calendar-date';

describe('calendar-only sermon dates', () => {
	it('accepts German and ISO input without a local-time shift', () => {
		expect(parseCalendarDateValue('6.9.2026')).toEqual({
			ok: true,
			value: new Date('2026-09-06T00:00:00.000Z')
		});
		expect(parseCalendarDateValue('2026-09-06')).toEqual({
			ok: true,
			value: new Date('2026-09-06T00:00:00.000Z')
		});
		expect(formatGermanCalendarDate(new Date('2026-09-06T00:00:00.000Z'))).toBe('06.09.2026');
	});

	it('rejects impossible or ambiguous dates', () => {
		expect(parseCalendarDateValue('31.02.2026')).toEqual({ ok: false });
		expect(parseCalendarDateValue('09/06/2026')).toEqual({ ok: false });
		expect(parseCalendarDateValue('')).toEqual({ ok: true, value: null });
	});
});
