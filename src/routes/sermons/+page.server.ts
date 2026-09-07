import {
	getSermonBoard,
	changeSermonBoard,
	type SermonBoardChange
} from '$lib/server/repositories/sermon-board';
import { fail, redirect } from '@sveltejs/kit';
import { parsePassage, passageToDbEndpoints } from '$lib/bible/passage';
import {
	GERMAN_SERMON_STARTER_TEMPLATE,
	isSermonWorkflowState,
	isSermonFormat
} from '$lib/notes/documents';
import {
	documentEditorUrl,
	isUuid,
	MAX_DOCUMENT_QUERY_LENGTH,
	parseCalendarDate,
	parseRequiredRevision,
	prepareDocumentBody,
	requireDocumentUser,
	setPrivateNoStore
} from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import { listDocumentTagTree } from '$lib/server/repositories/document-tags';
import {
	createDocumentWithPassages,
	InvalidDocumentInputError,
	listDocuments,
	updateDocument
} from '$lib/server/repositories/documents';
import { listBibles } from '$lib/server/repositories/resources';
import { getSermonTemplate, listSermonTemplates } from '$lib/server/repositories/sermon-templates';

const MAX_SERMON_SERIES_LENGTH = 200;

function sermonDateTime(date: Date | null): number {
	return date?.getTime() ?? Number.NEGATIVE_INFINITY;
}

function compareBySermonDate(
	left: { sermonDate: Date | null; updatedAt: Date; id: string },
	right: { sermonDate: Date | null; updatedAt: Date; id: string }
): number {
	return (
		sermonDateTime(right.sermonDate) - sermonDateTime(left.sermonDate) ||
		right.updatedAt.getTime() - left.updatedAt.getTime() ||
		right.id.localeCompare(left.id)
	);
}

export async function load({ locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	const user = requireDocumentUser(locals.user, url);
	const db = getDb();
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_DOCUMENT_QUERY_LENGTH);
	const rawStatus = url.searchParams.get('status');
	const board = await getSermonBoard(db, user.id);
	const status =
		rawStatus && board.columns.some((column) => column.id === rawStatus) ? rawStatus : undefined;
	const rawSeries = (url.searchParams.get('series') ?? '').trim();
	const rawYear = (url.searchParams.get('year') ?? '').trim();
	const allSermonsPromise = listDocuments(db, user.id, { kind: 'sermon' });
	const matchingSermonsPromise = q
		? listDocuments(db, user.id, { kind: 'sermon', query: q })
		: allSermonsPromise;
	const [allSermons, matchingSermons, tagTree, templates] = await Promise.all([
		allSermonsPromise,
		matchingSermonsPromise,
		listDocumentTagTree(db, user.id),
		listSermonTemplates(db, user.id)
	]);
	const seriesOptions = Array.from(
		new Set(allSermons.flatMap((sermon) => (sermon.sermonSeries ? [sermon.sermonSeries] : [])))
	).sort((left, right) => left.localeCompare(right, 'de', { sensitivity: 'base' }));
	const yearOptions = Array.from(
		new Set(
			allSermons.flatMap((sermon) =>
				sermon.sermonDate ? [sermon.sermonDate.getUTCFullYear()] : []
			)
		)
	).sort((left, right) => right - left);
	const series =
		rawSeries &&
		Array.from(rawSeries).length <= MAX_SERMON_SERIES_LENGTH &&
		seriesOptions.includes(rawSeries)
			? rawSeries
			: undefined;
	const parsedYear = /^\d{4}$/u.test(rawYear) ? Number(rawYear) : undefined;
	const year = parsedYear && yearOptions.includes(parsedYear) ? parsedYear : undefined;
	const sermons = matchingSermons
		.filter((sermon) => !status || sermon.sermonStatus === status)
		.filter((sermon) => !series || sermon.sermonSeries === series)
		.filter((sermon) => !year || sermon.sermonDate?.getUTCFullYear() === year)
		.sort(compareBySermonDate);

	return {
		// Board cards receive only their preview/workflow fields, not every private Markdown/HTML body.
		sermons: sermons.map((sermon) => ({
			id: sermon.id,
			title: sermon.title,
			plainText: sermon.plainText,
			sermonStatus: sermon.sermonStatus,
			sermonDate: sermon.sermonDate,
			sermonSeries: sermon.sermonSeries,
			sermonFormat: sermon.sermonFormat,
			revision: sermon.revision
		})),
		tagTree,
		templates,
		board,
		seriesOptions,
		yearOptions,
		filters: { q, status: status ?? null, series: series ?? null, year: year ?? null },
		filterError:
			rawStatus && !status
				? ('status' as const)
				: rawSeries && !series
					? ('series' as const)
					: rawYear && !year
						? ('year' as const)
						: null
	};
}

export const actions = {
	columns: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const revision = parseRequiredRevision(form.get('boardRevision'));
		const action = form.get('columnAction');
		const id = String(form.get('columnId') ?? '');
		let change: SermonBoardChange;
		if (action === 'create') change = { action, name: String(form.get('name') ?? '') };
		else if (action === 'sort') change = { action, ids: form.getAll('columnIds').map(String) };
		else if (action === 'rename') change = { action, id, name: String(form.get('name') ?? '') };
		else if (action === 'delete')
			change = { action, id, targetId: String(form.get('targetId') ?? '') };
		else if (action === 'left' || action === 'right')
			change = { action: 'reorder', id, direction: action };
		else return fail(400, { error: 'columnMissing' as const });
		if (!revision) return fail(400, { error: 'boardConflict' as const });
		const result = await changeSermonBoard(getDb(), user.id, revision, change);
		if (!result.ok)
			return fail(result.reason === 'boardConflict' ? 409 : 400, { error: result.reason });
		return { columnsSaved: true };
	},
	create: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim() || 'Neue Ausarbeitung';
		const rawFormat = String(form.get('format') ?? 'sermon');
		if (!isSermonFormat(rawFormat)) return fail(400, { error: 'sermonFormat' as const });
		const rawStatus = form.get('status') ? String(form.get('status')) : undefined;
		if (rawStatus !== undefined && !isSermonWorkflowState(rawStatus)) {
			return fail(400, { error: 'sermonStatus' as const });
		}
		const date = parseCalendarDate(form.get('date'));
		if (!date.ok) return fail(400, { error: 'sermonDate' as const });
		const series = String(form.get('series') ?? '').trim() || null;
		if (series && Array.from(series).length > MAX_SERMON_SERIES_LENGTH) {
			return fail(400, { error: 'sermonSeries' as const });
		}

		const rawPassage = String(form.get('passage') ?? form.get('reference') ?? '').trim();
		const parsedPassage = rawPassage ? parsePassage(rawPassage) : null;
		const endpoints = parsedPassage ? passageToDbEndpoints(parsedPassage) : null;
		if (rawPassage && !endpoints) return fail(400, { error: 'passage' as const });
		const resourceId = String(form.get('resourceId') ?? form.get('resource') ?? '').trim() || null;
		if (resourceId && !endpoints) return fail(400, { error: 'passage' as const });

		const db = getDb();
		if (resourceId && !(await listBibles(db)).some((bible) => bible.id === resourceId)) {
			return fail(400, { error: 'invalidResource' as const, resourceId });
		}

		const templateId = String(form.get('template') ?? 'default');
		let starter = GERMAN_SERMON_STARTER_TEMPLATE;
		if (templateId === 'empty') starter = '';
		else if (templateId !== 'default') {
			if (!isUuid(templateId)) return fail(400, { error: 'sermonTemplate' as const });
			const template = await getSermonTemplate(db, user.id, templateId);
			if (!template) return fail(404, { error: 'sermonTemplate' as const });
			starter = template.bodyMarkdown;
		}

		try {
			const created = await createDocumentWithPassages(
				db,
				user.id,
				{
					kind: 'sermon',
					title,
					visibility: 'private',
					source: 'native',
					sermonStatus: rawStatus,
					sermonFormat: rawFormat,
					sermonDate: date.value,
					sermonSeries: series,
					...prepareDocumentBody(starter)
				},
				endpoints ? [{ ...endpoints, resourceId, position: 0 }] : []
			);
			if (!created.ok) {
				if (created.reason === 'invalidResource') {
					return fail(400, {
						error: 'invalidResource' as const,
						resourceId: created.resourceId
					});
				}
				return fail(created.reason === 'conflict' ? 409 : 404, {
					error: created.reason
				});
			}
			const sermon = created.document;
			redirect(303, documentEditorUrl(sermon.id, form.get('returnTo')));
		} catch (caught) {
			if (caught instanceof InvalidDocumentInputError) {
				return fail(400, { error: caught.code });
			}
			throw caught;
		}
	},

	move: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const id = form.get('id');
		const revision = parseRequiredRevision(form.get('revision'));
		const status = form.get('status');
		if (!isUuid(id) || revision === null || !isSermonWorkflowState(status)) {
			return fail(400, { error: 'sermonStatus' as const });
		}
		let result;
		try {
			result = await updateDocument(getDb(), user.id, id, revision, { sermonStatus: status });
		} catch (caught) {
			if (caught instanceof InvalidDocumentInputError) return fail(400, { error: caught.code });
			throw caught;
		}
		if (!result.ok) {
			return fail(result.reason === 'conflict' ? 409 : 404, {
				error: result.reason,
				...(result.reason === 'conflict' ? { currentRevision: result.currentRevision } : {})
			});
		}
		return { moved: true, id, status, revision: result.document.revision };
	}
};
