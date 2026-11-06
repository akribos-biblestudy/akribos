import { error } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import { feedbackReports } from '$lib/server/db/feedback-schema';
import { feedbackFilters, feedbackWhere } from '$lib/server/feedback-query';
import { feedbackXlsx } from '$lib/feedback/xlsx';
import { statuses, type FeedbackStatus } from '$lib/feedback/model';
export async function GET({ locals, url }) {
	if (locals.user?.role !== 'admin') error(403);
	const reports = await getDb()
		.select({
			resource: feedbackReports.resourceName,
			location: feedbackReports.location,
			description: feedbackReports.description,
			suggestion: feedbackReports.suggestion,
			created: feedbackReports.createdAt,
			status: feedbackReports.status
		})
		.from(feedbackReports)
		.where(feedbackWhere(feedbackFilters(url), true))
		.orderBy(desc(feedbackReports.createdAt));
	const bytes = feedbackXlsx([
		['Werk', 'Stelle', 'Beschreibung', 'Korrekturvorschlag', 'Datum', 'Status'],
		...reports.map((r) => [
			r.resource ?? '',
			r.location ?? '',
			r.description,
			r.suggestion ?? '',
			r.created.toISOString(),
			statuses[r.status as FeedbackStatus] ?? r.status
		])
	]);
	return new Response(bytes as Uint8Array<ArrayBuffer>, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="akribos-fehlermeldungen.xlsx"',
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}
