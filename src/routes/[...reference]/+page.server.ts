import { error, fail, redirect } from '@sveltejs/kit';
import { bookById } from '$lib/bible/books';
import { bookName, bookShortName } from '$lib/bible/book-names';
import {
	formatReference,
	nextChapter,
	parseReference,
	previousChapter,
	referencePath
} from '$lib/bible/reference';
import { normalizeStrongId } from '$lib/bible/strong';
import { getDb } from '$lib/server/db';
import {
	addColumn,
	moveColumn,
	resolveColumns,
	resolveColumnWidths,
	removeColumn,
	setColumn,
	writeColumns,
	writeColumnWidths
} from '$lib/server/columns';
import { loadChapter } from '$lib/server/repositories/chapter';
import { loadReferenceResources } from '$lib/server/repositories/reference-resources';
import {
	loadChapterVerseComments,
	saveVerseComment
} from '$lib/server/repositories/verse-comments';
import {
	bookCoverage,
	chapterCount,
	listBibles,
	listReaderResources
} from '$lib/server/repositories/resources';
import { updateReaderColumns, updateReaderFontScale } from '$lib/server/repositories/users';
import {
	MAX_FONT_SCALE,
	MIN_FONT_SCALE,
	readFontScale,
	writeFontScale
} from '$lib/server/reader-preferences';
import {
	addVerseToList,
	createVerseList,
	findListAccess,
	listVerseLists,
	markedVersesByList,
	removeVerseFromList
} from '$lib/server/repositories/verse-lists';
import { listHighlightStyles } from '$lib/server/repositories/highlight-styles';
import {
	loadChapterHighlights,
	removeVerseHighlight,
	setVerseHighlight,
	type WordRange
} from '$lib/server/repositories/verse-highlights';

/**
 * The reader, and the resolver for everything that is not a named route.
 *
 * Precedence follows the previous site so old links keep working, but in one place instead of eight
 * competing URL patterns:
 *
 *   1. a Strong's number  → /G26
 *   2. a verse reference  → /Joh3,16
 *   3. anything else      → the search page
 */
export async function load({ params, cookies, url, setHeaders, locals }) {
	const raw = decodeReferenceParam(params.reference ?? '').replace(/\/+$/, '');

	// Legacy paths from the previous site: /async/Joh3 and /Joh3/trans/0_2/ variants.
	const cleaned = raw.replace(/^async\//, '').replace(/\/?trans\/\d+_\d+$/, '');
	if (cleaned !== raw) redirect(301, `/${cleaned}${url.search}`);

	const input = cleaned.trim();
	if (!input) redirect(307, defaultLocation(cookies));

	// Legacy paged search URLs: /Liebe/2/ meant page two of a search for "Liebe".
	const paged = /^(.+)\/(\d{1,4})$/.exec(input);
	if (paged && !parseReference(input)) {
		const [, term, pageNumber] = paged;
		redirect(301, `/search?q=${encodeURIComponent(term!)}&page=${pageNumber}`);
	}

	const strong = normalizeStrongId(input);
	if (strong) redirect(301, `/${strong}`);

	const reference = parseReference(input);
	if (!reference) {
		// Not a reference, so treat it as a search — the behaviour of the old catch-all view.
		redirect(303, `/search?q=${encodeURIComponent(input)}`);
	}

	const book = bookById(reference.book);
	if (!book) error(404, 'Unbekanntes Buch');

	// One URL per passage. "Joh 3,16", "1.Mose 1,1" and "Rev22" all name something that already has a
	// canonical spelling, so they redirect to it instead of rendering under a second address — which
	// keeps bookmarks, search results and the address bar in agreement.
	const canonical = referencePath(reference);
	if (canonical !== `/${input}`) redirect(301, `${canonical}${url.search}`);

	const db = getDb();
	const bibles = await listBibles(db);
	if (bibles.length === 0) {
		error(503, 'Es ist noch keine Bibelübersetzung importiert.');
	}

	const readerResources = await listReaderResources(db);
	const columns = resolveColumns(cookies, readerResources, locals.user?.readerColumns);
	const selectedBibles = columns.filter((id) => bibles.some((bible) => bible.id === id));

	/**
	 * Highest chapter the selected translations have for this book; 0 when none of them contains it.
	 *
	 * A chapter beyond that is clamped to the last one *of the same book* rather than jumped to the
	 * next book: the destination has to be a place that exists, or the redirect can bounce onwards and
	 * loop. When the book is absent entirely there is nothing to clamp to, so the empty state is
	 * rendered instead.
	 */
	const maxChapter = await chapterCount(
		db,
		selectedBibles.length > 0 ? selectedBibles : bibles.map((bible) => bible.id),
		reference.book
	);
	if (maxChapter > 0 && reference.chapter > maxChapter) {
		redirect(302, referencePath({ book: reference.book, chapter: maxChapter }));
	}

	const [chapter, referenceResources] = await Promise.all([
		loadChapter(db, {
			resourceIds: selectedBibles,
			book: reference.book,
			chapter: reference.chapter
		}),
		loadReferenceResources(db, {
			resourceIds: columns,
			book: reference.book,
			chapter: reference.chapter
		})
	]);
	for (const verse of referenceResources.verseNumbers) {
		if (!chapter.rows.some((row) => row.verse === verse)) {
			chapter.rows.push({ verse, cells: selectedBibles.map(() => null) });
		}
	}
	chapter.rows.sort((left, right) => left.verse - right.verse);
	chapter.empty = chapter.rows.length === 0;

	const coverage = await bookCoverage(db, selectedBibles);
	const byId = new Map(readerResources.map((resource) => [resource.id, resource]));
	const bibleCellIndex = new Map(selectedBibles.map((id, index) => [id, index]));

	// Verse lists, so a signed-in reader can add a verse without leaving the chapter. The most recently
	// used list is offered first, which is the one they are working in.
	const lists = locals.user ? await listVerseLists(db, locals.user.id) : [];
	const marked = locals.user
		? await markedVersesByList(db, locals.user.id, reference.book, reference.chapter)
		: [];
	const verseComments = locals.user
		? await loadChapterVerseComments(
				db,
				locals.user.id,
				selectedBibles,
				reference.book,
				reference.chapter
			)
		: [];
	const highlightStyles = locals.user ? await listHighlightStyles(db, locals.user.id) : [];
	const highlights = locals.user
		? await loadChapterHighlights(db, locals.user.id, reference.book, reference.chapter)
		: [];

	// Public scripture text is the same for everyone; a signed-in reader's page is not.
	setHeaders({
		'cache-control': locals.user ? 'private, no-store' : 'public, max-age=0, s-maxage=3600'
	});

	rememberLocation(cookies, reference);

	return {
		reference,
		title: formatReference(reference),
		fullTitle: `${bookName(reference.book)} ${reference.chapter}`,
		shortBookName: bookShortName(reference.book),
		chapter: {
			...chapter,
			// Maps do not survive serialisation to the browser.
			headings: [...chapter.headings.entries()]
		},
		referenceResources,
		columns: columns.map((id, index) => {
			const resource = byId.get(id)!;
			return {
				index,
				resource,
				bibleCellIndex: bibleCellIndex.get(id) ?? null,
				/** False when this translation does not contain the current book at all. */
				covers: coverage.get(id)?.has(reference.book) ?? false
			};
		}),
		/** Custom per-column widths, in the same order as `columns` above, or `null` when the reader has
		 *  not resized anything — the client then falls back to an even split via CSS. */
		columnWidths: resolveColumnWidths(cookies, columns),
		navigation: {
			previous: previousChapter(reference.book, reference.chapter),
			next: nextChapter(reference.book, reference.chapter),
			maxChapter
		},
		lists: lists.map((list) => ({ id: list.id, title: list.title })),
		/** Which of this chapter's verses sit in which list, for the verse menu's check marks. */
		markedVerses: marked,
		highlightStyles,
		highlights,
		verseComments
	};
}

/**
 * Column changes are form actions rather than links, so they work without JavaScript and the
 * selection is stored where server rendering can see it.
 */
export const actions = {
	setColumn: async ({ request, cookies, locals }) => {
		const form = await request.formData();
		const index = Number(form.get('index'));
		const resource = String(form.get('resource') ?? '');

		const available = await listReaderResources(getDb());
		if (!Number.isInteger(index) || !available.some((item) => item.id === resource)) {
			return { success: false };
		}

		await commitColumns(
			cookies,
			locals.user,
			setColumn(resolveColumns(cookies, available, locals.user?.readerColumns), index, resource)
		);
		return { success: true };
	},

	addColumn: async ({ request, cookies, locals }) => {
		const form = await request.formData();
		const resource = form.get('resource');

		const bibles = await listReaderResources(getDb());
		await commitColumns(
			cookies,
			locals.user,
			addColumn(
				resolveColumns(cookies, bibles, locals.user?.readerColumns),
				bibles,
				// Absent when the button was submitted without a choice, which appends the next unused one.
				resource === null ? undefined : String(resource)
			)
		);
		return { success: true };
	},

	removeColumn: async ({ request, cookies, locals }) => {
		const form = await request.formData();
		const index = Number(form.get('index'));
		if (!Number.isInteger(index)) return { success: false };

		const bibles = await listReaderResources(getDb());
		await commitColumns(
			cookies,
			locals.user,
			removeColumn(resolveColumns(cookies, bibles, locals.user?.readerColumns), index)
		);
		return { success: true };
	},

	moveColumn: async ({ request, cookies, locals }) => {
		const form = await request.formData();
		const from = Number(form.get('from'));
		const to = Number(form.get('to'));
		const bibles = await listReaderResources(getDb());
		await commitColumns(
			cookies,
			locals.user,
			moveColumn(resolveColumns(cookies, bibles, locals.user?.readerColumns), from, to)
		);
		return { success: true };
	},

	/** Commits a drag-resize of the column boundaries. Widths are normalized and clamped again here —
	 *  the client already does both live, but a request is never trusted at face value. */
	setColumnWidths: async ({ request, cookies, locals }) => {
		const form = await request.formData();
		const widths = String(form.get('widths') ?? '')
			.split(',')
			.map(Number);

		const bibles = await listReaderResources(getDb());
		const columns = resolveColumns(cookies, bibles, locals.user?.readerColumns);
		if (widths.length !== columns.length || widths.some((width) => !Number.isFinite(width))) {
			return fail(400, { error: 'widths' });
		}

		writeColumnWidths(cookies, columns, widths);
		return { success: true };
	},

	saveVerseComment: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');
		const form = await request.formData();
		const reference = parseReference(String(form.get('reference') ?? ''));
		const resourceId = String(form.get('resourceId') ?? '');
		if (!reference?.verse) return fail(400, { error: 'reference' });
		const bibles = await listBibles(getDb());
		if (!bibles.some((bible) => bible.id === resourceId)) {
			return fail(400, { error: 'resource' });
		}
		const html = await saveVerseComment(
			getDb(),
			locals.user.id,
			{ book: reference.book, chapter: reference.chapter, verse: reference.verse },
			resourceId,
			String(form.get('note') ?? '')
		);
		return { saved: true, html };
	},

	adjustFontSize: async ({ request, cookies, locals }) => {
		const form = await request.formData();
		const delta = Number(form.get('delta'));
		if (delta !== -5 && delta !== 5) return fail(400, { error: 'fontScale' });

		const current = readFontScale(cookies, locals.user?.readerFontScale);
		const next = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, current + delta));
		writeFontScale(cookies, next);
		if (locals.user) await updateReaderFontScale(getDb(), locals.user.id, next);
		return { success: true };
	},

	/**
	 * Adds the verse to a list straight from the reader, which is how notes get started.
	 *
	 * An empty `listId` means "a new list for this verse": the first verse a reader wants to keep is
	 * the moment they need a list, and making them go to the settings page first to create one was the
	 * reason the feature went unused. An existing `listId` may be a list the reader was invited to
	 * rather than one they own — `findListAccess` allows either, matching `markedVersesByList` above.
	 */
	addToList: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');

		const form = await request.formData();
		const listId = String(form.get('listId') ?? '');
		const reference = parseReference(String(form.get('reference') ?? ''));
		if (!reference?.verse) return fail(400, { error: 'reference' });

		const db = getDb();
		const access = listId
			? await findListAccess(db, listId, locals.user.id)
			: { list: await createVerseList(db, locals.user.id, String(form.get('title') ?? '')) };
		if (!access?.list) return fail(404, { error: 'list' });

		await addVerseToList(
			db,
			access.list.id,
			{ book: reference.book, chapter: reference.chapter, verse: reference.verse },
			locals.user.id
		);

		return { added: true, listId: access.list.id };
	},

	/** The other half of the verse menu: a list the verse is already in can be unticked. */
	removeFromList: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');

		const form = await request.formData();
		const listId = String(form.get('listId') ?? '');
		const reference = parseReference(String(form.get('reference') ?? ''));
		if (!reference?.verse) return fail(400, { error: 'reference' });

		const db = getDb();
		const access = await findListAccess(db, listId, locals.user.id);
		if (!access) return fail(404, { error: 'list' });

		await removeVerseFromList(
			db,
			access.list.id,
			{ book: reference.book, chapter: reference.chapter, verse: reference.verse },
			{ userId: locals.user.id, isOwner: access.isOwner }
		);

		return { removed: true, listId: access.list.id };
	},

	/**
	 * Picking a colour from the verse menu's swatches. Silently ignored for a style that is not the
	 * signed-in reader's own — there is nothing a reader could usefully be told there.
	 *
	 * `resourceId`/`startWord`/`endWord` are present only when the swatch was picked for a text
	 * selection rather than the whole verse; `wordRangeFromForm()` also re-validates them, so a
	 * tampered request can at worst end up a no-op or a whole-verse highlight, never an out-of-bounds
	 * one.
	 */
	setHighlight: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');

		const form = await request.formData();
		const reference = parseReference(String(form.get('reference') ?? ''));
		const styleId = String(form.get('styleId') ?? '');
		if (!reference?.verse || !styleId) return fail(400, { error: 'reference' });

		await setVerseHighlight(
			getDb(),
			locals.user.id,
			{ ...reference, verse: reference.verse },
			styleId,
			wordRangeFromForm(form)
		);
		return { highlighted: true };
	},

	/** Clicking an already-active swatch again, to clear the verse's (or the selected section's) highlight. */
	removeHighlight: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');

		const form = await request.formData();
		const reference = parseReference(String(form.get('reference') ?? ''));
		if (!reference?.verse) return fail(400, { error: 'reference' });

		await removeVerseHighlight(
			getDb(),
			locals.user.id,
			{ ...reference, verse: reference.verse },
			wordRangeFromForm(form)
		);
		return { highlighted: true };
	}
};

/** Reads the optional partial-highlight fields the verse menu sends for a text selection. */
function wordRangeFromForm(form: FormData): WordRange | null {
	const resourceId = form.get('resourceId');
	if (resourceId === null) return null;

	const start = Number(form.get('startWord'));
	const end = Number(form.get('endWord'));
	if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) return null;

	return { resourceId: String(resourceId), start, end };
}

/**
 * Some old browsers and bookmarked links percent-encode non-ASCII characters as Latin-1 (e.g. "ö" as
 * `%F6`) instead of UTF-8 (`%C3%B6`), which `decodeURIComponent` rejects as malformed and throws on —
 * crashing the whole page instead of just failing to resolve a reference. Recovering the Latin-1
 * reading handles that case; the codepoints it produces (0–255) already agree with Unicode, so German
 * umlauts and similar characters round-trip correctly.
 */
function decodeReferenceParam(raw: string): string {
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw.replace(/%[0-9A-Fa-f]{2}/g, (hex) =>
			String.fromCharCode(parseInt(hex.slice(1), 16))
		);
	}
}

const LOCATION_COOKIE = 'location';

/** Where `/` sends a returning visitor: the last chapter they read, or John 1. */
async function commitColumns(
	cookies: Parameters<typeof writeColumns>[0],
	user: App.Locals['user'],
	columns: string[]
): Promise<void> {
	writeColumns(cookies, columns);
	if (user) await updateReaderColumns(getDb(), user.id, columns);
}

function defaultLocation(cookies: Parameters<typeof writeColumns>[0]): string {
	const stored = cookies.get(LOCATION_COOKIE);
	const reference = stored ? parseReference(stored) : null;
	return referencePath(reference ?? { book: 43, chapter: 1 });
}

function rememberLocation(
	cookies: Parameters<typeof writeColumns>[0],
	reference: { book: number; chapter: number }
): void {
	cookies.set(LOCATION_COOKIE, `${bookShortName(reference.book)}${reference.chapter}`, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		httpOnly: false,
		sameSite: 'lax'
	});
}
