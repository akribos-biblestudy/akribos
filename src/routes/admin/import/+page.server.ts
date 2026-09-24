import { fail } from '@sveltejs/kit';
import { detectFormat, DETECTION_PREFIX_BYTES } from '$lib/bible/parse/detect';
import { SOURCE_FORMATS, type SourceFormat } from '$lib/bible/parse/types';
import { getDb } from '$lib/server/db';
import { queueImport, listJobs, hasRunningJob } from '$lib/server/import/jobs';
import { resourceKindForFormat } from '$lib/server/import';
import { morphologyTargets } from '$lib/server/import/ingest-morphology';
import { detectSwordFormat } from '$lib/server/import/sword';
import { detectUsxArchive } from '$lib/server/import/usx-archive';

/**
 * Upload and import.
 *
 * The file is read once here to detect its format and then handed to the background runner. Detection
 * is a suggestion, not a verdict: the form lets it be overridden, because a hand-made verse-per-line
 * file can look like several things.
 */
export async function load() {
	const db = getDb();

	return {
		jobs: await listJobs(db, 10),
		running: await hasRunningJob(db),
		formats: SOURCE_FORMATS.map((format) => ({
			id: format,
			kind: resourceKindForFormat(format)
		})),
		morphologyTargets: await morphologyTargets(db)
	};
}

export const actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const file = form.get('file');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Bitte eine Datei auswählen.' });
		}

		const contents = await file.arrayBuffer();
		const prefix = new TextDecoder('utf-8').decode(contents.slice(0, DETECTION_PREFIX_BYTES));

		const chosen = String(form.get('format') ?? '');
		let format: SourceFormat | undefined;
		try {
			format = SOURCE_FORMATS.includes(chosen as SourceFormat)
				? (chosen as SourceFormat)
				: (detectSwordFormat(new Uint8Array(contents)) ??
					detectUsxArchive(new Uint8Array(contents)) ??
					detectFormat(prefix, file.name)?.format);
		} catch (error) {
			return fail(400, {
				error: error instanceof Error ? error.message : 'Die ZIP-Datei konnte nicht gelesen werden.'
			});
		}

		if (!format) {
			return fail(400, {
				error:
					'Das Format der Datei konnte nicht erkannt werden. Bitte unten ein Format auswählen. ' +
					'Unterstützte Formate stehen in docs/importing.md.'
			});
		}

		const job = await queueImport(getDb(), {
			format,
			fileName: file.name,
			contents,
			createdBy: locals.user!.id,
			overrides: {
				...(form.get('id') ? { id: String(form.get('id')).trim().toUpperCase() } : {}),
				...(form.get('name') ? { name: String(form.get('name')).trim() } : {}),
				...(form.get('abbrev') ? { abbrev: String(form.get('abbrev')).trim() } : {}),
				...(form.get('language') ? { language: String(form.get('language')).trim() } : {})
			},
			...(form.get('target') ? { targetResourceId: String(form.get('target')) } : {})
		});

		return { started: true, jobId: job.id, format };
	}
};
