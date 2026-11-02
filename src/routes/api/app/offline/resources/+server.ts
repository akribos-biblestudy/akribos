import { json } from '@sveltejs/kit';
import { assertAppRequest } from '$lib/server/app/adapter';
import { getDb } from '$lib/server/db';
import { listResources } from '$lib/server/repositories/resources';
import type { RequestHandler } from './$types';

/** Only currently readable and explicitly offline-licensed supported works are advertised. */
export const GET: RequestHandler = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store', vary: 'Cookie' });
	assertAppRequest(event);
	const resources = await listResources(getDb(), event.locals.user?.id, 'offline');
	return json({
		version: 1,
		owner: event.locals.user?.id ?? null,
		resources: resources.filter((resource) =>
			['bible', 'commentary', 'xrefs'].includes(resource.kind)
		)
	});
};
