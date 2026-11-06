import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { feedbackReports } from '$lib/server/db/feedback-schema';
export async function GET({ locals, params }) {
	if (locals.user?.role !== 'admin') error(403);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id))
		error(404);
	const [row] = await getDb()
		.select({
			attachment: feedbackReports.attachment,
			type: feedbackReports.attachmentType,
			name: feedbackReports.attachmentName
		})
		.from(feedbackReports)
		.where(eq(feedbackReports.id, params.id));
	if (!row?.attachment || !row.type) error(404);
	return new Response(row.attachment as Uint8Array<ArrayBuffer>, {
		headers: {
			'Content-Type': row.type,
			'Content-Disposition': `attachment; filename="feedback-anhang"; filename*=UTF-8''${encodeURIComponent(row.name ?? 'feedback-anhang')}`,
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "default-src 'none'; sandbox"
		}
	});
}
