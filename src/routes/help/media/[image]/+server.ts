import { error } from '@sveltejs/kit';
import { getAdminHelpImage } from '$lib/server/help/admin-images';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals, params, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store',
		vary: 'Cookie',
		'x-robots-tag': 'noindex, nofollow'
	});
	if (locals.user?.role !== 'admin') error(404, 'Bild nicht gefunden.');
	const image = getAdminHelpImage(params.image);
	if (!image) error(404, 'Bild nicht gefunden.');
	return new Response(new Uint8Array(image), {
		headers: { 'content-type': 'image/webp', 'x-content-type-options': 'nosniff' }
	});
};
