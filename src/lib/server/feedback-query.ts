import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { feedbackReports } from './db/feedback-schema.ts';
import { isCategory, isStatus } from '$lib/feedback/model';

export function feedbackFilters(url: URL) {
	const status = url.searchParams.get('status') ?? '';
	const category = url.searchParams.get('category') ?? '';
	const resource = (url.searchParams.get('resource') ?? '').slice(0, 200);
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const location = (url.searchParams.get('location') ?? '').trim().slice(0, 200);
	const description = (url.searchParams.get('description') ?? '').trim().slice(0, 200);
	const author = (url.searchParams.get('author') ?? '').trim().slice(0, 200);
	const dateInput = url.searchParams.get('date') ?? '';
	const date =
		/^\d{4}-\d{2}-\d{2}$/.test(dateInput) &&
		!Number.isNaN(Date.parse(`${dateInput}T00:00:00Z`)) &&
		new Date(`${dateInput}T00:00:00Z`).toISOString().slice(0, 10) === dateInput
			? dateInput
			: '';
	return {
		status: isStatus(status) ? status : '',
		category: isCategory(category) ? category : '',
		resource,
		q,
		location,
		description,
		author,
		date
	};
}
export function feedbackWhere(filters: ReturnType<typeof feedbackFilters>, contentOnly = false) {
	const text = filters.q.replace(/[\\%_]/g, '\\$&');
	const escape = (value: string) => value.replace(/[\\%_]/g, '\\$&');
	const author = escape(filters.author);
	return and(
		contentOnly ? eq(feedbackReports.category, 'content') : undefined,
		filters.category ? eq(feedbackReports.category, filters.category) : undefined,
		filters.status ? eq(feedbackReports.status, filters.status) : undefined,
		filters.resource ? eq(feedbackReports.resourceId, filters.resource) : undefined,
		filters.location ? ilike(feedbackReports.location, `%${escape(filters.location)}%`) : undefined,
		filters.description
			? ilike(feedbackReports.description, `%${escape(filters.description)}%`)
			: undefined,
		author
			? sql`exists (select 1 from users where users.id = ${feedbackReports.userId} and (users.email ilike ${`%${author}%`} or users.display_name ilike ${`%${author}%`}))`
			: undefined,
		filters.date
			? sql`date(timezone('Europe/Berlin', ${feedbackReports.createdAt})) = ${filters.date}::date`
			: undefined,
		text
			? or(
					ilike(feedbackReports.description, `%${text}%`),
					ilike(feedbackReports.location, `%${text}%`),
					ilike(feedbackReports.resourceName, `%${text}%`)
				)
			: undefined
	);
}
