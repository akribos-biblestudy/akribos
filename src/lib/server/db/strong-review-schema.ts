import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { resources, users } from './schema.ts';

/** Separate capability: does not grant access to administration or private resources. */
export const strongReviewGrants = pgTable(
	'strong_review_grants',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [primaryKey({ columns: [table.userId] })]
);

/** A review applies only to the exact source verse fingerprint, so reimports cannot silently
 * transfer a decision to a different word. User deletion retains the decision, anonymously. */
export const strongAssignmentReviews = pgTable(
	'strong_assignment_reviews',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		resourceId: text('resource_id')
			.notNull()
			.references(() => resources.id, { onDelete: 'cascade' }),
		bookId: integer('book_id').notNull(),
		chapter: integer('chapter').notNull(),
		verse: integer('verse').notNull(),
		wordPosition: integer('word_position').notNull(),
		strong: text('strong').notNull(),
		word: text('word').notNull(),
		verseFingerprint: text('verse_fingerprint').notNull(),
		decision: text('decision', { enum: ['confirmed', 'incorrect'] }).notNull(),
		authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
		approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
		approvedAt: timestamp('approved_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		uniqueIndex('strong_review_occurrence_idx').on(
			table.resourceId,
			table.bookId,
			table.chapter,
			table.verse,
			table.wordPosition,
			table.strong
		),
		index('strong_review_pending_idx').on(table.approvedAt),
		check('strong_review_position_check', sql`${table.wordPosition} >= 0`),
		check('strong_review_decision_check', sql`${table.decision} in ('confirmed', 'incorrect')`)
	]
);
