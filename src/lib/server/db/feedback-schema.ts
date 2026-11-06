import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './schema.ts';
import { bytea } from './types.ts';

/** Feedback remains available to administrators after the author's account is deleted. */
export const feedbackReports = pgTable(
	'feedback_reports',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
		category: text('category').notNull(),
		resourceId: text('resource_id'),
		resourceName: text('resource_name'),
		location: text('location'),
		description: text('description').notNull(),
		suggestion: text('suggestion'),
		page: text('page'),
		browser: text('browser'),
		device: text('device'),
		attachmentName: text('attachment_name'),
		attachmentType: text('attachment_type'),
		attachment: bytea('attachment'),
		status: text('status').notNull().default('new'),
		adminNote: text('admin_note'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('feedback_reports_status_created_idx').on(table.status, table.createdAt)]
);
