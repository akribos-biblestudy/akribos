/** Calendar-only values shared by server forms and browser UI, without local-time drift. */
export function parseCalendarDateValue(
	value: unknown
): { ok: true; value: Date | null } | { ok: false } {
	if (value === null || value === undefined || value === '') return { ok: true, value: null };
	if (typeof value !== 'string') return { ok: false };
	const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
	const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/u.exec(value.trim());
	if (!iso && !german) return { ok: false };
	const [year, month, day] = iso
		? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
		: [Number(german![3]), Number(german![2]), Number(german![1])];
	const date = new Date(Date.UTC(year!, month! - 1, day!));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month! - 1 ||
		date.getUTCDate() !== day
	) {
		return { ok: false };
	}
	return { ok: true, value: date };
}

export function formatGermanCalendarDate(value: Date | string | null): string {
	if (!value) return '';
	const date = typeof value === 'string' ? new Date(value) : value;
	if (!Number.isFinite(date.getTime())) return '';
	return new Intl.DateTimeFormat('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(date);
}
