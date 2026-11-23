import { error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { recordWebVisit } from '$lib/server/repositories/users';
import { isWebVisitSignal } from '$lib/server/web-visits';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	if (!isWebVisitSignal(event)) error(403, 'Ungültige Anfrage.');
	if (!event.locals.user) error(401, 'Anmeldung erforderlich.');
	await recordWebVisit(getDb(), event.locals.user.id);
	return new Response(null, { status: 204 });
};
