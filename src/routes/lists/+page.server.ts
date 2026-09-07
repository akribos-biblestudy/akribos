import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { createVerseList, listVerseLists } from '$lib/server/repositories/verse-lists';

export async function load({ locals, setHeaders }) {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user) redirect(303, '/login?redirectTo=%2Flists');
	return { lists: await listVerseLists(getDb(), locals.user.id) };
}

export const actions = {
	createList: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?redirectTo=%2Flists');
		const form = await request.formData();
		const list = await createVerseList(getDb(), locals.user.id, String(form.get('title') ?? ''));
		redirect(303, `/lists/${list.id}`);
	}
};
