/**
 * Database schema.
 *
 * Migrations are generated from this file with `pnpm db:generate` and are never hand-edited once
 * applied. Objects PostgreSQL cannot express through Drizzle — the `german_unaccent` search
 * configuration and the Strong's statistics views — live in custom migrations under `drizzle/`.
 *
 * Notes on modelling choices:
 *
 * - The canonical book list is code, not data (`src/lib/bible/books.ts`), so `book_id` is a plain
 *   integer between 1 and 66. That keeps one source of truth and avoids a join on every verse read.
 * - Verse text is stored twice on purpose: `segments` carries the structure the reader renders
 *   (words with Strong's numbers, footnotes, emphasis) while `text` is the flattened form that
 *   full-text search and result snippets use.
 * - `verse_words` holds one row per Strong-tagged word. It is what makes interlinear alignment and
 *   the gloss statistics plain SQL instead of a text-parsing exercise at request time.
 */

import { sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import type { VerseSegment } from '../../bible/segments.ts';
import { COMMENT_REACTION_EMOJIS } from '../../notes/reactions.ts';
import type { ReaderWorkspace } from '../../reader/workspace.ts';
import { tsvector } from './types.ts';

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
};

export const RESOURCE_KINDS = ['bible', 'lexicon', 'commentary', 'xrefs', 'morphology'] as const;
export const RESOURCE_STATES = ['draft', 'importing', 'ready', 'failed'] as const;
export const CANONS = ['ot', 'nt', 'both'] as const;

/**
 * Everything importable is a resource: translations, lexicons, commentaries, cross-reference sets and
 * morphology overlays. Ordering, visibility and licence text are per resource, replacing the
 * hardcoded `BIBLES_IN_VIEW` / `BIBLE_HINTS_IN_VIEW` arrays of the previous version.
 */
export const resources = pgTable(
	'resources',
	{
		/** Stable identifier, usually the identifier from the source file, e.g. `ELB1905STR`. */
		id: text('id').primaryKey(),
		kind: text('kind', { enum: RESOURCE_KINDS }).notNull(),
		name: text('name').notNull(),
		/** Short label for column headers, e.g. `Elberfelder 1905`. */
		abbrev: text('abbrev').notNull(),
		/** Optional presentation labels. Null keeps imported resources backwards-compatible. */
		coverTitle: text('cover_title'),
		tabTitle: text('tab_title'),
		selectionTitle: text('selection_title'),
		selectionSubtitle: text('selection_subtitle'),
		/** BCP 47-ish tag: `de` for German, `grc` for Koine Greek, `hbo` for Biblical Hebrew. */
		language: text('language').notNull(),
		canon: text('canon', { enum: CANONS }).notNull().default('both'),
		direction: text('direction', { enum: ['ltr', 'rtl'] })
			.notNull()
			.default('ltr'),
		/** Lower sorts first; controls the default column order in the reader. */
		sortOrder: integer('sort_order').notNull().default(100),
		isPublic: boolean('is_public').notNull().default(true),
		hasStrongs: boolean('has_strongs').notNull().default(false),
		hasMorphology: boolean('has_morphology').notNull().default(false),
		/** Rendered under each column; holds the rights notice a licence requires. */
		licenseHtml: text('license_html'),
		/** A dictionary's own "how to read this" preface, e.g. Kautz' "Hinweise zur Benützung des
		 *  Lexikons" — shown collapsed next to a lexicon entry rather than repeated inline everywhere. */
		usageNotesHtml: text('usage_notes_html'),
		sourceFormat: text('source_format'),
		/** Path of the archived upload inside UPLOAD_DIR, so an import can be repeated. */
		sourceFile: text('source_file'),
		verseCount: integer('verse_count').notNull().default(0),
		wordCount: integer('word_count').notNull().default(0),
		status: text('status', { enum: RESOURCE_STATES }).notNull().default('draft'),
		...timestamps
	},
	(table) => [
		index('resources_kind_public_idx').on(table.kind, table.isPublic, table.sortOrder),
		check('resources_sort_order_check', sql`${table.sortOrder} >= 0`)
	]
);

/**
 * Which books a resource actually contains, with its own chapter and verse counts. Populated during
 * import so navigation can tell that the interlinear has no Old Testament without probing for it.
 */
export const resourceBooks = pgTable(
	'resource_books',
	{
		resourceId: text('resource_id')
			.notNull()
			.references(() => resources.id, { onDelete: 'cascade' }),
		bookId: integer('book_id').notNull(),
		chapterCount: integer('chapter_count').notNull(),
		verseCount: integer('verse_count').notNull()
	},
	(table) => [
		primaryKey({ columns: [table.resourceId, table.bookId] }),
		check('resource_books_book_id_check', sql`${table.bookId} between 1 and 66`)
	]
);

export const verses = pgTable(
	'verses',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		resourceId: text('resource_id')
			.notNull()
			.references(() => resources.id, { onDelete: 'cascade' }),
		bookId: integer('book_id').notNull(),
		chapter: integer('chapter').notNull(),
		verse: integer('verse').notNull(),
		/**
		 * Last verse of a merged range. Some translations render 16-17 as one unit; the old importer
		 * encoded that as the number `16820917` and JavaScript patched the display afterwards.
		 */
		verseEnd: integer('verse_end'),
		segments: jsonb('segments').$type<VerseSegment[]>().notNull(),
		text: text('text').notNull(),
		/** Section heading that precedes this verse in the source, if any. */
		heading: text('heading'),
		/**
		 * Generated full-text index over `text`. Uses the `german_unaccent` configuration created in
		 * the first migration: German stemming plus accent folding. `to_tsvector` with an explicit
		 * configuration is immutable, which a generated column requires — calling `unaccent()`
		 * directly here would not be.
		 */
		searchVector: tsvector('search_vector').generatedAlwaysAs(
			sql`to_tsvector('german_unaccent', text)`
		)
	},
	(table) => [
		// Doubles as the lookup index for a chapter read, so no separate index is needed.
		uniqueIndex('verses_ref_idx').on(table.resourceId, table.bookId, table.chapter, table.verse),
		index('verses_search_idx').using('gin', table.searchVector),
		check('verses_book_id_check', sql`${table.bookId} between 1 and 66`),
		// Generous upper bounds: they exist to catch a mis-parsed source, not to encode a
		// versification. Psalm 119 has 176 verses, and a Septuagint-based text may carry Psalm 151.
		check('verses_chapter_check', sql`${table.chapter} between 1 and 200`),
		check('verses_verse_check', sql`${table.verse} between 1 and 250`)
	]
);

/**
 * One row per Strong-tagged word, in reading order.
 *
 * `word` is the surface form as the translation renders it, which is what the word study's "translated
 * as" statistics count. For Greek and Hebrew sources it is the original word instead.
 */
export const verseWords = pgTable(
	'verse_words',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		resourceId: text('resource_id')
			.notNull()
			.references(() => resources.id, { onDelete: 'cascade' }),
		verseId: bigint('verse_id', { mode: 'number' })
			.notNull()
			.references(() => verses.id, { onDelete: 'cascade' }),
		/** Denormalised from `verses` so testament filters and joins need no extra hop. */
		bookId: integer('book_id').notNull(),
		/** 0-based index of the word within its verse. */
		position: integer('position').notNull(),
		word: text('word').notNull(),
		/** Canonical Strong's id, `G26` or `H430`. */
		strong: text('strong').notNull(),
		/** Robinson morphology code, where the source provides one. */
		morph: text('morph'),
		/** Dictionary form, filled in by the morphology importer. */
		lemma: text('lemma'),
		translit: text('translit')
	},
	(table) => [
		index('verse_words_strong_idx').on(table.resourceId, table.strong),
		index('verse_words_verse_idx').on(table.verseId, table.position),
		index('verse_words_lookup_idx').on(table.strong, table.bookId)
	]
);

/** Strong's dictionary entries. Composite key so several lexicons can cover the same number. */
export const lexiconEntries = pgTable(
	'lexicon_entries',
	{
		resourceId: text('resource_id')
			.notNull()
			.references(() => resources.id, { onDelete: 'cascade' }),
		/** Canonical Strong's id, `G26` or `H430`. */
		strong: text('strong').notNull(),
		language: text('language', { enum: ['grc', 'hbo'] }).notNull(),
		/** The word in its own script. */
		lemma: text('lemma').notNull(),
		transliteration: text('transliteration'),
		pronunciation: text('pronunciation'),
		definitionHtml: text('definition_html'),
		derivationHtml: text('derivation_html'),
		/** Strong's list of King James renderings; useful even in a German UI. */
		kjvDefinitionHtml: text('kjv_definition_html'),
		/** Other Strong's ids the entry points to. */
		seeAlso: text('see_also')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`)
	},
	(table) => [
		primaryKey({ columns: [table.resourceId, table.strong] }),
		index('lexicon_entries_strong_idx').on(table.strong)
	]
);

/** Verse-to-verse cross references, e.g. from the Treasury of Scripture Knowledge. */
export const crossReferences = pgTable(
	'cross_references',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		resourceId: text('resource_id')
			.notNull()
			.references(() => resources.id, { onDelete: 'cascade' }),
		fromBook: integer('from_book').notNull(),
		fromChapter: integer('from_chapter').notNull(),
		fromVerse: integer('from_verse').notNull(),
		toBook: integer('to_book').notNull(),
		toChapter: integer('to_chapter').notNull(),
		toVerse: integer('to_verse').notNull(),
		/** Inclusive end of the target range; equal to the start for a single verse. */
		toVerseEnd: integer('to_verse_end').notNull(),
		/** Relevance score from the source, used for ordering. */
		votes: integer('votes').notNull().default(0)
	},
	(table) => [
		index('cross_references_from_idx').on(
			table.resourceId,
			table.fromBook,
			table.fromChapter,
			table.fromVerse
		)
	]
);

/** Commentary text keyed to a verse or verse range. */
export const commentaryEntries = pgTable(
	'commentary_entries',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		resourceId: text('resource_id')
			.notNull()
			.references(() => resources.id, { onDelete: 'cascade' }),
		bookId: integer('book_id').notNull(),
		chapter: integer('chapter').notNull(),
		/** Null covers the whole chapter, which is how many commentaries are structured. */
		verseStart: integer('verse_start'),
		verseEnd: integer('verse_end'),
		title: text('title'),
		bodyHtml: text('body_html').notNull()
	},
	(table) => [
		index('commentary_entries_ref_idx').on(
			table.resourceId,
			table.bookId,
			table.chapter,
			table.verseStart
		)
	]
);

// --- accounts ---------------------------------------------------------------

export const USER_ROLES = ['user', 'admin'] as const;
export const THEMES = ['light', 'dark'] as const;

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		/** Stored lower-cased; uniqueness is enforced on that form. */
		email: text('email').notNull(),
		passwordHash: text('password_hash').notNull(),
		role: text('role', { enum: USER_ROLES }).notNull().default('user'),
		displayName: text('display_name'),
		/** Reader translation ids in the user's preferred order; empty adopts the current device. */
		readerColumns: text('reader_columns')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		/**
		 * Complete Logos-style workspace. `reader_columns` remains as the compact compatibility view used
		 * by search and older clients; it is updated from this structure whenever the workspace changes.
		 */
		readerWorkspace: jsonb('reader_workspace').$type<ReaderWorkspace>(),
		/** Scripture font size as an integer percentage. */
		readerFontScale: integer('reader_font_scale').notNull().default(100),
		/**
		 * Account-level fallback for colour scheme, used only to seed a device that has not set its own
		 * cookie yet — a device's own choice always wins afterwards. Null means "this account has never
		 * set one", distinct from an explicit choice.
		 */
		theme: text('theme', { enum: THEMES }),
		emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
		lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
		/**
		 * Set once the product tour has been finished or actively closed while signed in, so it never
		 * shows again on any device. Null means "not yet" — either never seen, or only seen (and possibly
		 * dismissed) while signed out, which is tracked in the `tour-guest-done` cookie instead, because
		 * that state has no account to attach to yet.
		 */
		tourCompletedAt: timestamp('tour_completed_at', { withTimezone: true }),
		/** Set instead of deleting, so verse lists and notes survive a lockout. */
		disabledAt: timestamp('disabled_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		uniqueIndex('users_email_idx').on(table.email),
		check('users_reader_font_scale_check', sql`${table.readerFontScale} between 85 and 140`)
	]
);

export const sessions = pgTable(
	'sessions',
	{
		/** SHA-256 of the cookie token; the token itself is never stored. */
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
		userAgent: text('user_agent')
	},
	(table) => [index('sessions_user_idx').on(table.userId, table.expiresAt)]
);

export const passwordResets = pgTable(
	'password_resets',
	{
		/** SHA-256 of the token that was mailed out. */
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		usedAt: timestamp('used_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('password_resets_user_idx').on(table.userId)]
);

/**
 * Account-activation tokens, mailed out on registration and again on request.
 *
 * Same shape as `password_resets` — only the hash of the token is stored — but with a 24-hour TTL
 * rather than one hour, since nobody is expected to check their mail within minutes of signing up.
 */
export const emailVerifications = pgTable(
	'email_verifications',
	{
		/** SHA-256 of the token that was mailed out. */
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		usedAt: timestamp('used_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('email_verifications_user_idx').on(table.userId)]
);

/** Failed login attempts, kept just long enough to throttle credential stuffing. */
export const loginAttempts = pgTable(
	'login_attempts',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		/** Lower-cased email or client address, depending on which limit is being applied. */
		subject: text('subject').notNull(),
		attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('login_attempts_subject_idx').on(table.subject, table.attemptedAt)]
);

/**
 * `public` reaches only public content (bibles, lexicon, commentaries, search); `personal` also
 * reaches the key owner's own verse lists and notes.
 */
export const API_KEY_SCOPES = ['public', 'personal'] as const;

export const apiKeys = pgTable(
	'api_keys',
	{
		/** SHA-256 of the key; the key itself is shown once at creation and never stored. */
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** The owner's own label, e.g. "Meine App" — keys are otherwise indistinguishable in a list. */
		name: text('name').notNull(),
		scope: text('scope', { enum: API_KEY_SCOPES }).notNull(),
		/** First characters of the key, shown in the list so a key stays identifiable once created. */
		prefix: text('prefix').notNull(),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
		revokedAt: timestamp('revoked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('api_keys_user_idx').on(table.userId, table.revokedAt)]
);

/** Requests through the public API, kept just long enough to enforce its rate limit. */
export const apiRequests = pgTable(
	'api_requests',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		/** `key:<key id>` for an authenticated request, `ip:<address>` otherwise. */
		subject: text('subject').notNull(),
		requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [index('api_requests_subject_idx').on(table.subject, table.requestedAt)]
);

// --- verse lists ------------------------------------------------------------

export const verseLists = pgTable(
	'verse_lists',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		introHtml: text('intro_html'),
		isPublic: boolean('is_public').notNull().default(false),
		/** Unguessable slug for the public link at /l/{slug}; only set while shared. */
		slug: text('slug'),
		...timestamps
	},
	(table) => [
		index('verse_lists_user_idx').on(table.userId, table.updatedAt),
		uniqueIndex('verse_lists_slug_idx').on(table.slug)
	]
);

export const verseListItems = pgTable(
	'verse_list_items',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		listId: uuid('list_id')
			.notNull()
			.references(() => verseLists.id, { onDelete: 'cascade' }),
		bookId: integer('book_id').notNull(),
		chapter: integer('chapter').notNull(),
		verse: integer('verse').notNull(),
		/** Manual ordering within the list. */
		position: integer('position').notNull().default(0),
		/**
		 * Who added this verse. A member may only remove verses they added themselves; the list's
		 * owner (`verse_lists.user_id`) may always remove any of them. Rows predating collaboration
		 * were backfilled to the list owner (migration 0021, made required in 0022).
		 */
		addedByUserId: uuid('added_by_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		...timestamps
	},
	(table) => [
		index('verse_list_items_list_idx').on(table.listId, table.position),
		uniqueIndex('verse_list_items_verse_idx').on(
			table.listId,
			table.bookId,
			table.chapter,
			table.verse
		)
	]
);

/**
 * Who else can see and add to a shared list, beyond its owner.
 *
 * The owner is not a row here — ownership is `verse_lists.user_id`, checked directly. A row appears
 * only once an invite (`verse_list_invites`) has been accepted.
 */
export const verseListMembers = pgTable(
	'verse_list_members',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		listId: uuid('list_id')
			.notNull()
			.references(() => verseLists.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
			onDelete: 'set null'
		}),
		...timestamps
	},
	(table) => [
		uniqueIndex('verse_list_members_unique_idx').on(table.listId, table.userId),
		index('verse_list_members_user_idx').on(table.userId)
	]
);

export type VerseListMember = typeof verseListMembers.$inferSelect;

/**
 * A pending invitation to collaborate on a shared list, mailed to an address that may or may not
 * already have an account. Same shape as `email_verifications` and `password_resets`: only the
 * token's hash is stored, so the mailed link is the only copy.
 */
export const verseListInvites = pgTable(
	'verse_list_invites',
	{
		/** SHA-256 of the token that was mailed out. */
		id: text('id').primaryKey(),
		listId: uuid('list_id')
			.notNull()
			.references(() => verseLists.id, { onDelete: 'cascade' }),
		/** Stored lower-cased, same normalisation as `users.email`. */
		email: text('email').notNull(),
		invitedByUserId: uuid('invited_by_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		acceptedAt: timestamp('accepted_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('verse_list_invites_list_idx').on(table.listId),
		index('verse_list_invites_email_idx').on(table.email)
	]
);

export type VerseListInvite = typeof verseListInvites.$inferSelect;

/**
 * A comment on a verse-list item, replacing the single `note_html` field a list item used to carry.
 * `parent_comment_id` nests replies one or more levels deep, Reddit-style; a null parent is a
 * top-level comment on the verse itself. Deleting a comment cascades to its replies.
 *
 * Existing `note_html` values were migrated into a root comment per item (migration 0021), authored
 * by the list's owner, so no note was lost.
 */
export const verseListItemComments = pgTable(
	'verse_list_item_comments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		itemId: uuid('item_id')
			.notNull()
			.references(() => verseListItems.id, { onDelete: 'cascade' }),
		parentCommentId: uuid('parent_comment_id'),
		authorUserId: uuid('author_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** Sanitised rich text, same allowlist as private verse comments. */
		bodyHtml: text('body_html').notNull(),
		...timestamps
	},
	(table) => [
		index('verse_list_item_comments_item_idx').on(table.itemId, table.createdAt),
		index('verse_list_item_comments_parent_idx').on(table.parentCommentId),
		foreignKey({
			columns: [table.parentCommentId],
			foreignColumns: [table.id],
			name: 'verse_list_item_comments_parent_fk'
		}).onDelete('cascade')
	]
);

export type VerseListItemComment = typeof verseListItemComments.$inferSelect;

/**
 * One reaction, one emoji, one user, one comment. The composite primary key is what makes "react
 * again with the same emoji" a toggle: the app tries an insert and deletes the row instead when it
 * already exists (see `toggleCommentReaction`).
 */
export const verseListItemCommentReactions = pgTable(
	'verse_list_item_comment_reactions',
	{
		commentId: uuid('comment_id')
			.notNull()
			.references(() => verseListItemComments.id, { onDelete: 'cascade' }),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		emoji: text('emoji', { enum: COMMENT_REACTION_EMOJIS }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.commentId, table.userId, table.emoji] }),
		index('verse_list_item_comment_reactions_comment_idx').on(table.commentId)
	]
);

export type VerseListItemCommentReaction = typeof verseListItemCommentReactions.$inferSelect;

/**
 * One private rich-text comment per user, verse and Bible translation. Resources are only removed
 * through `deleteResource()`, which first transfers these comments to another translation.
 */
export const verseComments = pgTable(
	'verse_comments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		bookId: integer('book_id').notNull(),
		chapter: integer('chapter').notNull(),
		verse: integer('verse').notNull(),
		resourceId: text('resource_id')
			.notNull()
			.references(() => resources.id, { onDelete: 'restrict' }),
		/** Sanitised rich text. */
		commentHtml: text('comment_html').notNull(),
		...timestamps
	},
	(table) => [
		uniqueIndex('verse_comments_reference_idx').on(
			table.userId,
			table.resourceId,
			table.bookId,
			table.chapter,
			table.verse
		),
		index('verse_comments_user_idx').on(table.userId, table.updatedAt),
		index('verse_comments_chapter_idx').on(
			table.userId,
			table.bookId,
			table.chapter,
			table.resourceId
		),
		check('verse_comments_book_id_check', sql`${table.bookId} between 1 and 66`),
		check('verse_comments_chapter_check', sql`${table.chapter} between 1 and 200`),
		check('verse_comments_verse_check', sql`${table.verse} between 1 and 250`)
	]
);

// --- verse highlights ---------------------------------------------------

/**
 * `color` is the only kind rendered today; `underline` and `symbol` are reserved so a style can
 * later carry an underline or an icon instead of (or alongside) a fill colour — the way Logos'
 * highlighting palettes do — without another migration once the reader grows that.
 */
export const HIGHLIGHT_STYLE_KINDS = ['color', 'underline', 'symbol'] as const;

/**
 * One colour (or, later, underline/symbol) in a reader's personal highlighting palette. Ten are
 * seeded for a new account; a reader can rename any of them or add more of their own.
 */
export const highlightStyles = pgTable(
	'highlight_styles',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: HIGHLIGHT_STYLE_KINDS }).notNull().default('color'),
		/** CSS colour, e.g. `#fde68a`. */
		color: text('color').notNull(),
		/** The owner's own label, e.g. "Verheißungen" — null until renamed from its seeded default. */
		name: text('name'),
		sortOrder: integer('sort_order').notNull().default(0),
		...timestamps
	},
	(table) => [index('highlight_styles_user_idx').on(table.userId, table.sortOrder)]
);

export type HighlightStyle = typeof highlightStyles.$inferSelect;

/**
 * One coloured section, from `verse`/`startWord` to `endVerse`/`endWord`.
 *
 * `resourceId`, `startWord` and `endWord` are null together for a section covering whole verses,
 * matching the original design: it applies in every translation, and a verse holds at most one of
 * these (picking another colour replaces it, like a physical highlighter). That shape is also what
 * every row from before this feature already has, so an old highlight keeps working unchanged.
 *
 * When they are set instead, the section covers `startWord` of `verse` through `endWord` of
 * `endVerse` (inclusive, 0-based, counted by `countVerseWords` in `src/lib/bible/segments.ts`) of
 * that one `resourceId`'s rendering — a translation-specific selection can only ever mean something
 * for that translation's own text. Which words each verse in between contributes is worked out at
 * render time by `spanRangeForVerse` (`src/lib/reader/selection.ts`), from that verse's own length;
 * storing the two endpoints rather than one row per verse is what keeps a section a single thing to
 * recolour, remove and list.
 *
 * A verse may take part in several sections at once (possibly different translations or colours), so
 * only the exact same span replaces its own colour; two overlapping-but-different spans are
 * independent rows and simply paint over one another where they overlap.
 *
 * `endVerse` is therefore only ever greater than `verse` for a translation-specific section. A
 * whole-verse section spanning several verses is written as one row per verse instead, so that the
 * "one colour per verse, everywhere" rule the reader has always had keeps holding. `endVerse` equals
 * `verse` for every row written before sections existed, which is what the migration backfills.
 */
export const verseHighlights = pgTable(
	'verse_highlights',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		styleId: uuid('style_id')
			.notNull()
			.references(() => highlightStyles.id, { onDelete: 'cascade' }),
		bookId: integer('book_id').notNull(),
		chapter: integer('chapter').notNull(),
		verse: integer('verse').notNull(),
		/** Last verse of the section; equal to `verse` unless it spans several. */
		endVerse: integer('end_verse').notNull(),
		/** Null for a whole-verse section; the translation a partial one belongs to otherwise. */
		resourceId: text('resource_id').references(() => resources.id, { onDelete: 'cascade' }),
		/** First covered word of `verse`; null together with `resourceId`. */
		startWord: integer('start_word'),
		/** Last covered word of `endVerse`; null together with `resourceId`. */
		endWord: integer('end_word'),
		...timestamps
	},
	(table) => [
		// At most one whole-verse highlight per verse, exactly as before this feature existed. A
		// whole-verse section covering several verses is stored as one such row per verse, which is what
		// keeps "a verse carries at most one colour that applies everywhere" true — recolouring verse 30
		// on its own has to replace the colour it got as part of 29-31, not stack with it.
		uniqueIndex('verse_highlights_verse_idx')
			.on(table.userId, table.bookId, table.chapter, table.verse)
			.where(sql`${table.resourceId} is null`),
		// Re-picking the same section replaces its colour; a different span is a separate section.
		uniqueIndex('verse_highlights_range_idx')
			.on(
				table.userId,
				table.resourceId,
				table.bookId,
				table.chapter,
				table.verse,
				table.endVerse,
				table.startWord,
				table.endWord
			)
			.where(sql`${table.resourceId} is not null`),
		index('verse_highlights_style_idx').on(table.styleId),
		check(
			'verse_highlights_range_check',
			sql`${table.endVerse} >= ${table.verse}
				and ((${table.resourceId} is null and ${table.startWord} is null and ${table.endWord} is null
						and ${table.endVerse} = ${table.verse})
					or (${table.resourceId} is not null and ${table.startWord} is not null
						and ${table.endWord} is not null and ${table.startWord} >= 0
						and ${table.endWord} >= 0
						and (${table.endVerse} > ${table.verse} or ${table.endWord} >= ${table.startWord})))`
		)
	]
);

export type VerseHighlight = typeof verseHighlights.$inferSelect;

// --- operations -------------------------------------------------------------

export const IMPORT_STATES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;

/** One row per import run, so the admin UI can show progress and keep a history of failures. */
export const importJobs = pgTable(
	'import_jobs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		resourceId: text('resource_id'),
		kind: text('kind', { enum: RESOURCE_KINDS }).notNull(),
		state: text('state', { enum: IMPORT_STATES }).notNull().default('queued'),
		sourceFile: text('source_file').notNull(),
		sourceFormat: text('source_format'),
		/** Units processed and expected; both are chapters for bible imports. */
		progress: integer('progress').notNull().default(0),
		total: integer('total').notNull().default(0),
		/** Human-readable status line, e.g. the book currently being read. */
		message: text('message'),
		/** Non-fatal problems found in the source, such as duplicate verses. */
		warnings: jsonb('warnings')
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		error: text('error'),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
		startedAt: timestamp('started_at', { withTimezone: true }),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [index('import_jobs_state_idx').on(table.state, table.createdAt)]
);

/** Small key/value store for site settings that should be editable without a deploy. */
export const settings = pgTable('settings', {
	key: text('key').primaryKey(),
	value: jsonb('value').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const BACKUP_JOB_TYPES = ['download', 'scheduled', 'pre-restore', 'restore'] as const;
export const BACKUP_JOB_STATES = ['queued', 'running', 'done', 'failed'] as const;
export const BACKUP_TRIGGERS = ['manual', 'schedule'] as const;

/**
 * One row per backup or restore run: the admin UI's only source of truth for whether last night's
 * scheduled backup worked. `pre-restore` rows are the automatic safety dumps taken before a restore.
 */
export const backupJobs = pgTable(
	'backup_jobs',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		type: text('type', { enum: BACKUP_JOB_TYPES }).notNull(),
		state: text('state', { enum: BACKUP_JOB_STATES }).notNull().default('queued'),
		trigger: text('trigger', { enum: BACKUP_TRIGGERS }).notNull().default('manual'),
		/** Dump file name, e.g. `akribos-20260804-030000.dump`. */
		fileName: text('file_name'),
		/** Where the result ended up: `s3://bucket/key`, `local:/app/var/backups/…`, or `download`. */
		location: text('location'),
		sizeBytes: bigint('size_bytes', { mode: 'number' }),
		/** Human-readable status line, mirroring `import_jobs.message`. */
		message: text('message'),
		error: text('error'),
		createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
		startedAt: timestamp('started_at', { withTimezone: true }),
		finishedAt: timestamp('finished_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		index('backup_jobs_state_idx').on(table.state, table.createdAt),
		index('backup_jobs_type_idx').on(table.type, table.createdAt)
	]
);

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type Verse = typeof verses.$inferSelect;
export type NewVerse = typeof verses.$inferInsert;
export type VerseWord = typeof verseWords.$inferSelect;
export type NewVerseWord = typeof verseWords.$inferInsert;
export type LexiconEntry = typeof lexiconEntries.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type VerseList = typeof verseLists.$inferSelect;
export type VerseListItem = typeof verseListItems.$inferSelect;
export type VerseComment = typeof verseComments.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type BackupJob = typeof backupJobs.$inferSelect;
