export const MAX_VERSE_LIST_TITLE_LENGTH = 300;

export function parseVerseListTitle(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string') return null;
	const title = value.trim();
	return title.length > 0 && title.length <= MAX_VERSE_LIST_TITLE_LENGTH ? title : null;
}
