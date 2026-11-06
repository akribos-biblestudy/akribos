import { fail } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { bibleDownloadGrants, resources } from '$lib/server/db/schema';
import { parseBibleSnapshot, restoreBibleSnapshot } from '$lib/server/bible-export/restore';

const MAX_SNAPSHOT_SIZE = 128 * 1024 * 1024;
const MAX_RESTORE_BODY = MAX_SNAPSHOT_SIZE + 128 * 1024;

async function readRestoreForm(request: Request): Promise<FormData | null> {
	const length = Number(request.headers.get('content-length'));
	if (Number.isFinite(length) && length > MAX_RESTORE_BODY) return null;
	if (!request.body) throw new Error('Formular ohne Inhalt');
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_RESTORE_BODY) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const headers = new Headers();
	headers.set('content-type', request.headers.get('content-type') ?? '');
	return new Request(request.url, {
		method: 'POST',
		headers,
		body: new Uint8Array(Buffer.concat(chunks))
	}).formData();
}

export async function load() {
	const db = getDb();
	return {
		bibles: await db
			.select({
				id: resources.id,
				name: resources.name,
				isPublic: resources.isPublic,
				status: resources.status,
				version: sql<string>`${resources}.xmin::text`,
				publicDownload: bibleDownloadGrants.resourceId
			})
			.from(resources)
			.leftJoin(bibleDownloadGrants, eq(resources.id, bibleDownloadGrants.resourceId))
			.where(eq(resources.kind, 'bible'))
			.orderBy(asc(resources.name))
	};
}

export const actions = {
	restore: async ({ request }) => {
		let form: FormData | null;
		try {
			form = await readRestoreForm(request);
		} catch {
			return fail(400, { error: 'Die Sicherungsdatei konnte nicht gelesen werden.' });
		}
		if (!form) return fail(413, { error: 'Die Sicherungsdatei darf höchstens 128 MB groß sein.' });
		const file = form.get('file');
		if (!(file instanceof File) || !file.size || file.size > MAX_SNAPSHOT_SIZE)
			return fail(400, { error: 'Bitte eine Sicherungsdatei bis 128 MB auswählen.' });
		try {
			const snapshot = parseBibleSnapshot(await file.text());
			if (String(form.get('confirm') ?? '') !== snapshot.resource.id)
				return fail(400, {
					error: `Zur Bestätigung bitte die Ressourcenkennung ${snapshot.resource.id} eingeben.`
				});
			const result = await restoreBibleSnapshot(getDb(), snapshot);
			return { restored: snapshot.resource.id, statisticsRefreshed: result.statisticsRefreshed };
		} catch (cause) {
			return fail(400, {
				error:
					cause instanceof Error
						? `Sicherung konnte nicht wiederhergestellt werden: ${cause.message.slice(0, 500)}`
						: 'Ungültige Sicherung.'
			});
		}
	},
	visibility: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const enable = form.get('enable') === 'yes';
		const version = String(form.get('resourceVersion') ?? '');
		const db = getDb();
		if (!id) return fail(400, { error: 'Bitte eine Bibel auswählen.' });
		if (enable) {
			if (form.get('publicDomain') !== 'yes')
				return fail(400, {
					error: 'Bitte die gemeinfreie Veröffentlichung ausdrücklich bestätigen.'
				});
			// Serialize the eligibility check with resource visibility changes and Bible reimports.
			// Otherwise an old approval can be inserted after either operation revoked the grant.
			const granted = await db.transaction(async (tx) => {
				const [bible] = await tx
					.select({ id: resources.id, version: sql<string>`${resources}.xmin::text` })
					.from(resources)
					.where(
						and(
							eq(resources.id, id),
							eq(resources.kind, 'bible'),
							eq(resources.status, 'ready'),
							eq(resources.isPublic, true)
						)
					)
					.for('update');
				if (!bible) return 'ineligible';
				// A confirmation made for an earlier edition must never approve its replacement.
				if (bible.version !== version) return 'changed';
				await tx.insert(bibleDownloadGrants).values({ resourceId: id }).onConflictDoNothing();
				return 'granted';
			});
			if (granted === 'ineligible')
				return fail(400, {
					error: 'Nur eine öffentliche, fertig importierte Bibel kann freigegeben werden.'
				});
			if (granted === 'changed')
				return fail(409, {
					error: 'Das Werk wurde geändert. Bitte lade die Seite neu und prüfe die Freigabe erneut.'
				});
		} else {
			await db.delete(bibleDownloadGrants).where(eq(bibleDownloadGrants.resourceId, id));
		}
		return { saved: true };
	}
};
