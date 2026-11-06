import { error, fail } from '@sveltejs/kit';
import { asc, count, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { feedbackReports } from '$lib/server/db/feedback-schema';
import { resources, users } from '$lib/server/db/schema';
import { feedbackFilters, feedbackWhere } from '$lib/server/feedback-query';
import { isStatus } from '$lib/feedback/model';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function load({ url, locals }) {
	if (locals.user?.role !== 'admin') error(403);
	const db = getDb();
	const filters = feedbackFilters(url);
	const orderColumns = {
		date: feedbackReports.createdAt,
		category: sql`case ${feedbackReports.category} when 'content' then 'Fehler im Werk' when 'application' then 'Anwendungsfehler' when 'suggestion' then 'Verbesserungsvorschlag' when 'missing' then 'Fehlender Inhalt' else 'Sonstiges Feedback' end`,
		resource: feedbackReports.resourceName,
		location: feedbackReports.location,
		description: feedbackReports.description,
		author: sql`coalesce(nullif(${users.displayName}, ''), ${users.email}, 'Konto gelöscht')`,
		status: sql`case ${feedbackReports.status} when 'new' then 'Neu' when 'in_progress' then 'In Bearbeitung' when 'resolved' then 'Erledigt' else 'Geschlossen' end`
	};
	const sortInput = url.searchParams.get('sort') ?? '';
	const sort = Object.hasOwn(orderColumns, sortInput)
		? (sortInput as keyof typeof orderColumns)
		: 'date';
	const direction = url.searchParams.get('direction') === 'asc' ? 'asc' : 'desc';
	const pageSize = 50;
	const [countResult] = await db
		.select({ total: count() })
		.from(feedbackReports)
		.where(feedbackWhere(filters));
	const total = countResult?.total ?? 0;
	const pages = Math.max(1, Math.ceil(total / pageSize));
	const rawPage = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, pages) : 1;
	const reports = await db
		.select({
			id: feedbackReports.id,
			category: feedbackReports.category,
			resourceId: feedbackReports.resourceId,
			resourceKind: resources.kind,
			resourceLanguage: resources.language,
			resourceName: feedbackReports.resourceName,
			location: feedbackReports.location,
			description: feedbackReports.description,
			suggestion: feedbackReports.suggestion,
			page: feedbackReports.page,
			browser: feedbackReports.browser,
			device: feedbackReports.device,
			attachmentName: feedbackReports.attachmentName,
			status: feedbackReports.status,
			adminNote: feedbackReports.adminNote,
			createdAt: feedbackReports.createdAt,
			email: users.email,
			displayName: users.displayName
		})
		.from(feedbackReports)
		.leftJoin(users, eq(users.id, feedbackReports.userId))
		.leftJoin(resources, eq(resources.id, feedbackReports.resourceId))
		.where(feedbackWhere(filters))
		.orderBy(
			direction === 'asc' ? asc(orderColumns[sort]) : desc(orderColumns[sort]),
			desc(feedbackReports.id)
		)
		.limit(pageSize)
		.offset((page - 1) * pageSize);
	const works = await db
		.selectDistinct({ id: feedbackReports.resourceId, name: feedbackReports.resourceName })
		.from(feedbackReports)
		.orderBy(feedbackReports.resourceName);
	return {
		reports,
		works: works.filter((w) => w.id && w.name),
		filters,
		sort,
		direction,
		page,
		pages,
		total,
		selectedId: UUID.test(url.searchParams.get('detail') ?? '')
			? url.searchParams.get('detail')
			: null,
		query: url.searchParams.toString()
	};
}
export const actions = {
	update: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const status = String(form.get('status') ?? '');
		const adminNote = String(form.get('adminNote') ?? '').trim();
		if (!UUID.test(id) || !isStatus(status) || adminNote.length > 10000)
			return fail(400, { error: 'Ungültige Angaben.' });
		await getDb()
			.update(feedbackReports)
			.set({ status, adminNote: adminNote || null, updatedAt: new Date() })
			.where(eq(feedbackReports.id, id));
		return { saved: true };
	},
	delete: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!UUID.test(id)) return fail(400, { error: 'Ungültige Meldung.' });
		await getDb().delete(feedbackReports).where(eq(feedbackReports.id, id));
		return { deleted: true };
	}
};
