import { getSermonBoard } from '$lib/server/repositories/sermon-board';
import { error } from '@sveltejs/kit';
import { formatPassage, passageFromDbEndpoints } from '$lib/bible/passage';
import {
	createDocumentMarkdownExport,
	DocumentMarkdownError,
	type DocumentMarkdownPassage
} from '$lib/notes/document-markdown';
import {
	formatCalendarDate,
	isUuid,
	requireDocumentUser,
	setPrivateNoStore
} from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import { listDocumentTags } from '$lib/server/repositories/document-tags';
import { getDocument, listDocumentPassages } from '$lib/server/repositories/documents';
import { listSermonDeliveries } from '$lib/server/repositories/sermon-deliveries';

export const prerender = false;

export async function GET({ params, locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	const user = requireDocumentUser(locals.user, url);
	if (!isUuid(params.id)) error(404, 'Dokument nicht gefunden');

	const db = getDb();
	const document = await getDocument(db, user.id, params.id);
	if (!document) error(404, 'Dokument nicht gefunden');

	const [passageRows, tags, deliveries, board] = await Promise.all([
		listDocumentPassages(db, user.id, document.id),
		listDocumentTags(db, user.id, document.id),
		document.kind === 'sermon' ? listSermonDeliveries(db, user.id, document.id) : [],
		getSermonBoard(db, user.id)
	]);
	const passages: DocumentMarkdownPassage[] = passageRows.map((row) => {
		const passage = passageFromDbEndpoints(row);
		const reference = passage && formatPassage(passage);
		if (!reference) error(500, 'Eine gespeicherte Bibelstelle ist ungültig');
		return {
			reference,
			...(row.resourceId ? { resourceId: row.resourceId } : {})
		};
	});

	let exported;
	try {
		exported = createDocumentMarkdownExport({
			title: document.title,
			kind: document.kind,
			tags: tags.map((tag) => tag.path),
			passages,
			...(document.kind === 'sermon'
				? {
						sermon: {
							status: document.sermonStatus ?? board.columns[0]!.id,
							statusName: board.columns.find((column) => column.id === document.sermonStatus)?.name,
							format: document.sermonFormat,
							date: formatCalendarDate(document.sermonDate),
							series: document.sermonSeries ?? undefined,
							deliveries: deliveries.map((delivery) => ({
								date: formatCalendarDate(delivery.date)!,
								location: delivery.location
							}))
						}
					}
				: {}),
			markdown: document.bodyMarkdown,
			createdAt: document.createdAt,
			updatedAt: document.updatedAt
		});
	} catch (caught) {
		if (caught instanceof DocumentMarkdownError) {
			error(
				caught.code === 'file_too_large' ? 413 : 500,
				'Das Dokument konnte nicht exportiert werden'
			);
		}
		throw caught;
	}

	return new Response(exported.content, {
		headers: {
			'content-type': exported.contentType,
			'content-disposition': exported.contentDisposition,
			'content-length': String(new TextEncoder().encode(exported.content).byteLength),
			'x-content-type-options': 'nosniff'
		}
	});
}
