import { normalizeDocumentTitle } from './documents.ts';

export type SermonColumn = { id: string; name: string };
export const DEFAULT_SERMON_COLUMNS: SermonColumn[] = [
	{ id: 'idea', name: 'Idee' },
	{ id: 'research', name: 'Recherche' },
	{ id: 'outline', name: 'Gliederung' },
	{ id: 'ready', name: 'Bereit' },
	{ id: 'delivered', name: 'Gehalten' }
];
export const MAX_SERMON_COLUMNS = 30;
export const MAX_SERMON_COLUMN_NAME_LENGTH = 80;

export function cleanSermonColumnName(value: string): string | null {
	const name = normalizeDocumentTitle(value);
	return name && Array.from(name).length <= MAX_SERMON_COLUMN_NAME_LENGTH ? name : null;
}
