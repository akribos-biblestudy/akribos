import { fail, redirect } from '@sveltejs/kit';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { feedbackReports } from '$lib/server/db/feedback-schema';
import { listReaderResources } from '$lib/server/repositories/resources';
import { isCategory } from '$lib/feedback/model';

const MAX_ATTACHMENT = 3 * 1024 * 1024;
const MAX_BODY = MAX_ATTACHMENT + 128 * 1024;
const MAX_PAGE_URL = 64 * 1024;

/** Bound multipart bodies even when the proxy uses chunked transfer or omits Content-Length. */
async function boundedForm(request: Request): Promise<FormData | null> {
	const length = Number(request.headers.get('content-length'));
	if (Number.isFinite(length) && length > MAX_BODY) return null;
	if (!request.body) throw new Error('Missing form body');
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_BODY) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const headers = new Headers();
	headers.set('content-type', request.headers.get('content-type') ?? '');
	return new Request(request.url, {
		method: 'POST',
		headers,
		body: new Uint8Array(Buffer.concat(chunks))
	}).formData();
}
function clean(value: FormDataEntryValue | null, limit: number): string {
	return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
function sameOriginPage(value: string, origin: string): string | null {
	if (!value || value.length > MAX_PAGE_URL) return null;
	try {
		const parsed = new URL(value);
		return parsed.origin === origin && !parsed.username && !parsed.password ? value : null;
	} catch {
		return null;
	}
}

export async function load({ locals, request, url }) {
	if (!locals.user) redirect(303, '/login?redirectTo=%2Ffeedback');
	const referrer = sameOriginPage(request.headers.get('referer') ?? '', url.origin);
	return {
		resources: await listReaderResources(getDb(), locals.user.id),
		sourcePage: referrer && new URL(referrer).pathname !== '/feedback' ? referrer : null
	};
}
export const actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login?redirectTo=%2Ffeedback');
		const db = getDb();
		let form: FormData | null;
		try {
			form = await boundedForm(request);
		} catch {
			return fail(400, { error: 'Das Formular konnte nicht gelesen werden.', values: undefined });
		}
		if (!form)
			return fail(413, { error: 'Der Anhang darf höchstens 3 MB groß sein.', values: undefined });
		const page = form.get('page');
		const pageValue = typeof page === 'string' ? page : '';
		const values = {
			category: clean(form.get('category'), 30),
			resourceId: clean(form.get('resourceId'), 200),
			location: clean(form.get('location'), 500),
			description: clean(form.get('description'), 10000),
			suggestion: clean(form.get('suggestion'), 5000),
			page: pageValue
		};
		if (pageValue && !sameOriginPage(pageValue, new URL(request.url).origin))
			return fail(400, {
				error: 'Die erfasste Seitenadresse ist ungültig oder zu lang. Bitte öffne Feedback erneut.',
				values
			});
		if (!isCategory(values.category) || !values.description)
			return fail(400, {
				error: 'Bitte wähle eine Kategorie und beschreibe dein Anliegen.',
				values
			});
		const resources = await listReaderResources(db, locals.user.id);
		const resource = resources.find((r) => r.id === values.resourceId);
		if (values.category === 'content' && (!resource || !values.location))
			return fail(400, {
				error: 'Bitte wähle das Werk und gib die Stelle möglichst genau an.',
				values
			});
		if (values.resourceId && !resource)
			return fail(400, { error: 'Das ausgewählte Werk ist nicht verfügbar.', values });
		const file = form.get('attachment');
		let attachment: Buffer | null = null;
		let attachmentType: string | null = null;
		let attachmentName: string | null = null;
		if (file instanceof File && file.size) {
			if (file.size > MAX_ATTACHMENT)
				return fail(400, { error: 'Der Anhang darf höchstens 3 MB groß sein.', values });
			attachment = Buffer.from(await file.arrayBuffer());
			// Always deliver as an attachment, never as executable same-origin content.
			attachmentType = 'application/octet-stream';
			// eslint-disable-next-line no-control-regex
			attachmentName = file.name.replace(/[\u0000-\u001f/\\]/g, '_').slice(0, 200);
		}
		const saved = await db.transaction(async (tx) => {
			// Serialize concurrent submissions per account; otherwise parallel requests bypass the limit.
			await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${locals.user!.id}, 0))`);
			const [recent] = await tx
				.select({ total: count() })
				.from(feedbackReports)
				.where(
					and(
						eq(feedbackReports.userId, locals.user!.id),
						gte(feedbackReports.createdAt, new Date(Date.now() - 60 * 60 * 1000))
					)
				);
			if ((recent?.total ?? 0) >= 10) return false;
			await tx.insert(feedbackReports).values({
				userId: locals.user!.id,
				category: values.category,
				resourceId: resource?.id ?? null,
				resourceName: resource?.name ?? null,
				location: values.location || null,
				description: values.description,
				suggestion: values.suggestion || null,
				page: values.page || null,
				browser: (request.headers.get('user-agent') ?? '').slice(0, 500) || null,
				device: clean(form.get('device'), 200) || null,
				attachment,
				attachmentName,
				attachmentType
			});
			return true;
		});
		if (!saved)
			return fail(429, {
				error: 'Du hast bereits mehrere Meldungen gesendet. Bitte versuche es später erneut.',
				values
			});
		return { sent: true, values: undefined };
	}
};
