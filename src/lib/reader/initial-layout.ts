/** Coarse viewport hint used only before a reader has a saved workspace or legacy selection. */
export const INITIAL_READER_COLUMNS_COOKIE = 'reader-initial-columns';

export function initialReaderColumns(width: number): number {
	if (width < 768) return 1;
	if (width < 1200) return 2;
	if (width < 1920) return 3;
	return 4;
}

export function readInitialReaderColumns(value: string | undefined): number | null {
	return value && /^[1-4]$/.test(value) ? Number(value) : null;
}
