import analytics from './images/admin-analytics.webp?inline';
import backup from './images/admin-backup.webp?inline';
import imports from './images/admin-import.webp?inline';
import resource from './images/admin-resource.webp?inline';
import restore from './images/admin-restore.webp?inline';
import users from './images/admin-users-search.webp?inline';
import sharing from './images/note-sharing.webp?inline';

// Inline assets stay inside the server build; no public asset URL bypasses the role check.
const images = new Map([
	['admin-analytics.webp', analytics],
	['admin-backup.webp', backup],
	['admin-import.webp', imports],
	['admin-resource.webp', resource],
	['admin-restore.webp', restore],
	['admin-users-search.webp', users],
	['note-sharing.webp', sharing]
]);

export function getAdminHelpImage(name: string): Buffer | undefined {
	const data = images.get(name);
	return data ? Buffer.from(data.slice(data.indexOf(',') + 1), 'base64') : undefined;
}
