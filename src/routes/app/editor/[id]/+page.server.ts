import { error } from '@sveltejs/kit';
import { isUuid, setPrivateNoStore } from '$lib/server/documents/application';
import { getDb } from '$lib/server/db';
import { getDocument } from '$lib/server/repositories/documents';
import { listBibles } from '$lib/server/repositories/resources';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url, setHeaders }) => {
	setPrivateNoStore(setHeaders);
	setHeaders({
		'x-robots-tag': 'noindex, nofollow',
		'referrer-policy': 'same-origin',
		'content-security-policy':
			"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; img-src 'self' data:; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
	});
	if (!locals.user) error(401, 'Anmeldung erforderlich');
	if (!isUuid(params.id)) error(404, 'Dokument nicht gefunden');
	const instanceId = url.searchParams.get('instanceId');
	if (!instanceId || !isUuid(instanceId)) error(400, 'Ungültige Editorinstanz');
	const db = getDb();
	const document = await getDocument(db, locals.user.id, params.id);
	if (!document) error(404, 'Dokument nicht gefunden');
	const bibles = await listBibles(db, locals.user.id);
	const requestedBible = url.searchParams.get('bible');
	const bibleId =
		bibles.find((bible) => bible.id === requestedBible)?.id ??
		bibles.find((bible) => bible.id === locals.user?.defaultBibleId)?.id ??
		bibles[0]?.id ??
		null;
	const scale = Number(url.searchParams.get('fontScale'));
	return {
		document,
		editorUserId: locals.user.id,
		instanceId,
		bibleId,
		editorAppearance: {
			theme: url.searchParams.get('theme') === 'dark' ? 'dark' : 'light',
			fontScale:
				Number.isInteger(scale) && scale >= 70 && scale <= 200 && scale % 5 === 0 ? scale : 100,
			eInk: url.searchParams.get('eInk') === '1'
		}
	};
};
