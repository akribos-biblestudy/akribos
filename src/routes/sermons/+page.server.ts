import { fail, redirect } from '@sveltejs/kit';
import { parsePassage, passageToDbEndpoints } from '$lib/bible/passage';
import {
	GERMAN_SERMON_STARTER_TEMPLATE,
	isSermonWorkflowState,
	SERMON_WORKFLOW_STATES
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

export async function load({ locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	const user = requireDocumentUser(locals.user, url);
	const db = getDb();
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_DOCUMENT_QUERY_LENGTH);
	const rawStatus = url.searchParams.get('status');
	const status = rawStatus && isSermonWorkflowState(rawStatus) ? rawStatus : undefined;
	const [allSermons, tagTree, templates] = await Promise.all([
		listDocuments(db, user.id, { kind: 'sermon', query: q || undefined }),
		listDocumentTagTree(db, user.id),
		listSermonTemplates(db, user.id)
	]);
	const sermons = status
		? allSermons.filter((sermon) => sermon.sermonStatus === status)
		: allSermons;

	return {
		// Board cards receive only their preview/workflow fields, not every private Markdown/HTML body.
		sermons: sermons.map((sermon) => ({
			id: sermon.id,
			title: sermon.title,
			plainText: sermon.plainText,
			sermonStatus: sermon.sermonStatus,
			sermonDate: sermon.sermonDate,
			sermonSeries: sermon.sermonSeries,
			revision: sermon.revision
		})),
		tagTree,
		templates,
		statuses: SERMON_WORKFLOW_STATES,
		filters: { q, status: status ?? null },
		filterError: rawStatus && !status ? ('status' as const) : null
	};
}

export const actions = {
	create: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim() || 'Neue Predigt';
		const rawStatus = String(form.get('status') ?? 'idea');
		if (!isSermonWorkflowState(rawStatus)) {
			return fail(400, { error: 'sermonStatus' as const });
		}
		const date = parseCalendarDate(form.get('date'));
		if (!date.ok) return fail(400, { error: 'sermonDate' as const });
		const series = String(form.get('series') ?? '').trim() || null;
		if (series && Array.from(series).length > 200) {
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
		const result = await updateDocument(getDb(), user.id, id, revision, { sermonStatus: status });
		if (!result.ok) {
			return fail(result.reason === 'conflict' ? 409 : 404, {
				error: result.reason,
				...(result.reason === 'conflict' ? { currentRevision: result.currentRevision } : {})
			});
		}
		return { moved: true, id, status, revision: result.document.revision };
	}
};
