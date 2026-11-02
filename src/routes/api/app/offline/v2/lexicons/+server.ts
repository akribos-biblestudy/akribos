import { json } from '@sveltejs/kit';
import { assertAppRequest } from '$lib/server/app/adapter';
import { getDb } from '$lib/server/db';
import { listResources } from '$lib/server/repositories/resources';
import type { RequestHandler } from './$types';

/** Version 2 is opt-in; the existing version 1 catalogue remains unchanged. */
export const GET: RequestHandler = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store', vary: 'Cookie' });
	assertAppRequest(event);
	const owner = event.locals.user?.id ?? null;
	const resources = await listResources(getDb(), owner, 'offline');
	return json({
		version: 2,
		owner,
		resources: resources.filter((item) => item.kind === 'lexicon')
	});
};
