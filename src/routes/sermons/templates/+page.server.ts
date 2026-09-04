import { fail } from '@sveltejs/kit';
import { normalizeDocumentMarkdown } from '$lib/notes/documents';
import { isUuid, requireDocumentUser, setPrivateNoStore } from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import {
	createSermonTemplate,
	deleteSermonTemplate,
	InvalidSermonTemplateError,
	listSermonTemplates,
	updateSermonTemplate
} from '$lib/server/repositories/sermon-templates';

export async function load({ locals, url, setHeaders }) {
	setPrivateNoStore(setHeaders);
	const user = requireDocumentUser(locals.user, url);
	return { templates: await listSermonTemplates(getDb(), user.id) };
}

function templateFailure(caught: unknown) {
	if (caught instanceof InvalidSermonTemplateError) {
		return fail(400, { error: caught.code });
	}
	if (caught && typeof caught === 'object' && 'code' in caught && caught.code === '23505') {
		return fail(409, { error: 'duplicate' as const });
	}
	throw caught;
}

export const actions = {
	create: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		try {
			const template = await createSermonTemplate(getDb(), user.id, {
				name: String(form.get('name') ?? ''),
				bodyMarkdown: normalizeDocumentMarkdown(String(form.get('bodyMarkdown') ?? ''))
			});
			return { created: true, templateId: template.id };
		} catch (caught) {
			return templateFailure(caught);
		}
	},

	update: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const id = form.get('id');
		if (!isUuid(id)) return fail(404, { error: 'notFound' as const });
		try {
			const template = await updateSermonTemplate(getDb(), user.id, id, {
				name: String(form.get('name') ?? ''),
				bodyMarkdown: normalizeDocumentMarkdown(String(form.get('bodyMarkdown') ?? ''))
			});
			return template
				? { updated: true, templateId: template.id }
				: fail(404, { error: 'notFound' as const });
		} catch (caught) {
			return templateFailure(caught);
		}
	},

	delete: async ({ request, locals, url }) => {
		const user = requireDocumentUser(locals.user, url);
		const form = await request.formData();
		const id = form.get('id');
		if (!isUuid(id)) return fail(404, { error: 'notFound' as const });
		return (await deleteSermonTemplate(getDb(), user.id, id))
			? { deleted: true, templateId: id }
			: fail(404, { error: 'notFound' as const });
	}
};
