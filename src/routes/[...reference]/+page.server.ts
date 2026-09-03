import { error, fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { bookById } from '$lib/bible/books';
import { bookName, bookShortName } from '$lib/bible/book-names';
import {
	formatReference,
	isReferenceInCanon,
	nextChapter,
	parseReference,
	previousChapter,
	referencePath
} from '$lib/bible/reference';
import { normalizeStrongId } from '$lib/bible/strong';
import { getDb } from '$lib/server/db';
import {
	activateReaderTab,
	activeReaderTab,
	activeResourceIds,
	addReaderTab,
	changeReaderLayout,
	closeReaderTab,
	isReaderLayout,
	isReaderLinkSet,
	moveReaderTab,
	replaceReaderTabResource,
	readerLayoutDefinition,
	setReaderLayoutSize,
	setReaderTabLinkSet,
	setReaderTabLookup,
	setReaderTabReference,
	type ReaderWorkspace
} from '$lib/reader/workspace';
import {
	resolveReaderWorkspace,
	workspaceColumns,
	writeWorkspaceCompatibilityCookies
} from '$lib/server/reader-workspace';
import { loadReaderTabChapter } from '$lib/server/reader-chapter';
import { saveVerseComment } from '$lib/server/repositories/verse-comments';
import {
	bookCoverage,
	chapterCount,
	listBibles,
	listReaderResources
} from '$lib/server/repositories/resources';
import { findLexiconEntry } from '$lib/server/repositories/strong';
import { updateReaderFontScale, updateReaderWorkspace } from '$lib/server/repositories/users';
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
	removeVerseFromList
} from '$lib/server/repositories/verse-lists';
import { listHighlightStyles } from '$lib/server/repositories/highlight-styles';
import {
	removeVerseHighlight,
	setVerseHighlight,
	type SectionReference,
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
	let workspace = resolveReaderWorkspace(
		cookies,
		readerResources,
		locals.user?.readerWorkspace,
		locals.user?.readerColumns,
		reference
	);
	const byId = new Map(readerResources.map((resource) => [resource.id, resource]));
	const activeIds = activeResourceIds(workspace);
	const selectedBibles = activeIds.filter((id) => byId.get(id)?.kind === 'bible');

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

	// The canonical URL belongs to the most recently focused tile. A direct link therefore changes
	// that tab (and every active or inactive peer in its link set) while every unrelated set retains
	// its own location.
	const focusedTile =
		workspace.tiles.find((tile) => tile.id === workspace.focusedTileId && activeReaderTab(tile)) ??
		workspace.tiles.find((tile) => activeReaderTab(tile));
	const focusedTab = focusedTile ? activeReaderTab(focusedTile) : null;
	if (focusedTile && focusedTab) {
		workspace = setReaderTabReference(workspace, focusedTile.id, focusedTab.id, reference);
	}

	const coverage = await bookCoverage(db, [...new Set(selectedBibles)]);
	let columnIndex = 0;
	const columnDefinitions = workspace.tiles.flatMap((tile, tileIndex) => {
		const activeTab = activeReaderTab(tile);
		const resource = activeTab ? byId.get(activeTab.resourceId) : undefined;
		if (!activeTab || !resource) return [];
		return [
			{
				index: columnIndex++,
				tileIndex,
				tileId: tile.id,
				activeTab,
				resource,
				bibleCellIndex: resource.kind === 'bible' ? 0 : null,
				/** False when this translation does not contain the current book at all. */
				covers: coverage.get(resource.id)?.has(activeTab.reference.book) ?? false
			}
		];
	});
	const columns = await Promise.all(
		columnDefinitions.map(async (column) => {
			const [initialChapter, lexiconEntry] = await Promise.all([
				loadReaderTabChapter(
					db,
					column.resource,
					{
						book: column.activeTab.reference.book,
						chapter: column.activeTab.reference.chapter
					},
					locals.user?.id ?? null
				),
				column.resource.kind === 'lexicon' && column.activeTab.lookup
					? findLexiconEntry(db, column.resource.id, column.activeTab.lookup)
					: Promise.resolve(undefined)
			]);
			return { ...column, initialChapter, lexiconEntry: lexiconEntry ?? null };
		})
	);

	// Verse lists, so a signed-in reader can add a verse without leaving the chapter. The most recently
	// used list is offered first, which is the one they are working in.
	const lists = locals.user ? await listVerseLists(db, locals.user.id) : [];
	const highlightStyles = locals.user ? await listHighlightStyles(db, locals.user.id) : [];

	// Public scripture text is the same for everyone; a signed-in reader's page is not.
	setHeaders({
		'cache-control': locals.user ? 'private, no-store' : 'public, max-age=0, s-maxage=3600'
	});

	rememberLocation(cookies, reference);

	return {
		reference,
		title: formatReference(reference),
		fullTitle: `${bookName(reference.book)} ${reference.chapter}`,
		workspace,
		columns,
		navigation: {
			previous: previousChapter(reference.book, reference.chapter),
			next: nextChapter(reference.book, reference.chapter),
			maxChapter
		},
		lists: lists.map((list) => ({ id: list.id, title: list.title })),
		highlightStyles
	};
}

/**
 * Column changes are form actions rather than links, so they work without JavaScript and the
 * selection is stored where server rendering can see it.
 */
export const actions = {
	setLayout: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const layout = form.get('layout');
		if (!isReaderLayout(layout)) return fail(400, { error: 'layout' });
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			undefined,
			actionReference(params)
		);
		await commitWorkspace(cookies, locals.user, changeReaderLayout(workspace, layout, randomUUID));
		return { success: true };
	},

	addTab: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const tileId = String(form.get('tileId') ?? '');
		const resourceId = String(form.get('resource') ?? '');
		const available = await listReaderResources(getDb());
		if (!available.some((resource) => resource.id === resourceId)) {
			return fail(400, { error: 'resource' });
		}
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			available,
			actionReference(params)
		);
		if (!workspace.tiles.some((tile) => tile.id === tileId)) {
			return fail(400, { error: 'tile' });
		}
		await commitWorkspace(
			cookies,
			locals.user,
			addReaderTab(workspace, tileId, resourceId, randomUUID)
		);
		return { success: true };
	},

	replaceTabResource: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const tileId = String(form.get('tileId') ?? '');
		const tabId = String(form.get('tabId') ?? '');
		const resourceId = String(form.get('resource') ?? '');
		const available = await listReaderResources(getDb());
		if (!available.some((resource) => resource.id === resourceId)) {
			return fail(400, { error: 'resource' });
		}
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			available,
			actionReference(params)
		);
		if (
			!workspace.tiles.some(
				(tile) => tile.id === tileId && tile.tabs.some((tab) => tab.id === tabId)
			)
		) {
			return fail(400, { error: 'tab' });
		}
		await commitWorkspace(
			cookies,
			locals.user,
			replaceReaderTabResource(workspace, tileId, tabId, resourceId)
		);
		return { success: true };
	},

	activateTab: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const tileId = String(form.get('tileId') ?? '');
		const tabId = String(form.get('tabId') ?? '');
		const currentReference = parseReference(String(form.get('currentReference') ?? ''));
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			undefined,
			currentReference && isReferenceInCanon(currentReference)
				? currentReference
				: actionReference(params)
		);
		const next = activateReaderTab(workspace, tileId, tabId);
		await commitWorkspace(cookies, locals.user, next);
		const active = activeReaderTab(next.tiles.find((tile) => tile.id === tileId) ?? next.tiles[0]!);
		return { success: true, ...(active ? { path: referencePath(active.reference) } : {}) };
	},

	closeTab: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const tileId = String(form.get('tileId') ?? '');
		const tabId = String(form.get('tabId') ?? '');
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			undefined,
			actionReference(params)
		);
		await commitWorkspace(cookies, locals.user, closeReaderTab(workspace, tileId, tabId));
		return { success: true };
	},

	moveTab: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const fromTileId = String(form.get('fromTileId') ?? '');
		const tabId = String(form.get('tabId') ?? '');
		const toTileId = String(form.get('toTileId') ?? '');
		const toIndex = Number(form.get('toIndex'));
		if (!Number.isInteger(toIndex)) return fail(400, { error: 'position' });
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			undefined,
			actionReference(params)
		);
		await commitWorkspace(
			cookies,
			locals.user,
			moveReaderTab(workspace, fromTileId, tabId, toTileId, toIndex)
		);
		return { success: true };
	},

	setTabLinkSet: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const tileId = String(form.get('tileId') ?? '');
		const tabId = String(form.get('tabId') ?? '');
		const rawLinkSet = form.get('linkSet');
		const linkSet = rawLinkSet === '' ? null : rawLinkSet;
		if (!isReaderLinkSet(linkSet)) return fail(400, { error: 'linkSet' });
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			undefined,
			actionReference(params)
		);
		await commitWorkspace(
			cookies,
			locals.user,
			setReaderTabLinkSet(workspace, tileId, tabId, linkSet)
		);
		return { success: true };
	},

	setTabReference: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const tileId = String(form.get('tileId') ?? '');
		const tabId = String(form.get('tabId') ?? '');
		const reference = parseReference(String(form.get('reference') ?? ''));
		if (!reference || !isReferenceInCanon(reference)) {
			return fail(400, { error: 'reference' });
		}
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			undefined,
			actionReference(params)
		);
		if (
			!workspace.tiles.some(
				(tile) => tile.id === tileId && tile.tabs.some((tab) => tab.id === tabId)
			)
		) {
			return fail(400, { error: 'tab' });
		}
		await commitWorkspace(
			cookies,
			locals.user,
			setReaderTabReference(workspace, tileId, tabId, reference)
		);
		return { success: true, path: referencePath(reference) };
	},

	setTabLookup: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const tileId = String(form.get('tileId') ?? '');
		const tabId = String(form.get('tabId') ?? '');
		const lookup = String(form.get('lookup') ?? '')
			.trim()
			.slice(0, 200);
		if (!lookup) return fail(400, { error: 'lookup' });
		const available = await listReaderResources(getDb());
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			available,
			actionReference(params)
		);
		const tab = workspace.tiles
			.find((tile) => tile.id === tileId)
			?.tabs.find((candidate) => candidate.id === tabId);
		if (!tab || available.find((resource) => resource.id === tab.resourceId)?.kind !== 'lexicon') {
			return fail(400, { error: 'tab' });
		}
		await commitWorkspace(
			cookies,
			locals.user,
			setReaderTabLookup(workspace, tileId, tabId, lookup)
		);
		return { success: true };
	},

	/** Reuses the lexicon tab belonging to the source tab's A–E group, or opens one. */
	openLexiconTab: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const sourceTileId = String(form.get('tileId') ?? '');
		const sourceTabId = String(form.get('tabId') ?? '');
		const lookup = String(form.get('lookup') ?? '')
			.trim()
			.slice(0, 200);
		const currentReference = parseReference(String(form.get('currentReference') ?? ''));
		if (!lookup) return fail(400, { error: 'lookup' });

		const db = getDb();
		const available = await listReaderResources(db);
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			available,
			currentReference && isReferenceInCanon(currentReference)
				? currentReference
				: actionReference(params)
		);
		const sourceTile = workspace.tiles.find((tile) => tile.id === sourceTileId);
		const sourceTab = sourceTile?.tabs.find((tab) => tab.id === sourceTabId);
		if (!sourceTile || !sourceTab) return fail(400, { error: 'tab' });

		const resourceById = new Map(available.map((resource) => [resource.id, resource]));
		const existing = workspace.tiles.flatMap((tile) =>
			tile.tabs.flatMap((tab) => {
				if (resourceById.get(tab.resourceId)?.kind !== 'lexicon') return [];
				const belongsToGroup = sourceTab.linkSet
					? tab.linkSet === sourceTab.linkSet
					: tile.id === sourceTile.id && tab.linkSet === null;
				return belongsToGroup ? [{ tile, tab }] : [];
			})
		)[0];
		if (existing) {
			await commitWorkspace(
				cookies,
				locals.user,
				setReaderTabLookup(workspace, existing.tile.id, existing.tab.id, lookup)
			);
			return { success: true, tileId: existing.tile.id, tabId: existing.tab.id, reused: true };
		}

		const lexicons = available.filter((resource) => resource.kind === 'lexicon');
		let lexicon = lexicons[0];
		for (const candidate of lexicons) {
			if (await findLexiconEntry(db, candidate.id, lookup)) {
				lexicon = candidate;
				break;
			}
		}
		if (!lexicon) return fail(404, { error: 'lexicon' });

		// A–E define a real cross-tile group, so a visible peer is the most useful home for the
		// dictionary. An unlinked tab has no group beyond its own tab strip: placing its dictionary in
		// another unrelated, likewise unlinked tile would prevent the next Strong click from reusing it.
		const linkedTarget = sourceTab.linkSet
			? workspace.tiles.find(
					(tile) =>
						tile.id !== sourceTile.id && activeReaderTab(tile)?.linkSet === sourceTab.linkSet
				)
			: undefined;
		const targetTile =
			linkedTarget ??
			(sourceTab.linkSet
				? workspace.tiles.find((tile) => tile.id !== sourceTile.id && tile.tabs.length === 0)
				: undefined) ??
			sourceTile;
		let next = addReaderTab(workspace, targetTile.id, lexicon.id, randomUUID);
		const added = activeReaderTab(
			next.tiles.find((tile) => tile.id === targetTile.id) ?? targetTile
		);
		if (!added) return fail(409, { error: 'workspace' });
		next = setReaderTabLinkSet(next, targetTile.id, added.id, sourceTab.linkSet);
		next = setReaderTabLookup(next, targetTile.id, added.id, lookup);
		await commitWorkspace(cookies, locals.user, next);
		return { success: true, tileId: targetTile.id, tabId: added.id, reused: false };
	},

	setLayoutSize: async ({ request, cookies, locals, params }) => {
		const form = await request.formData();
		const layout = form.get('layout');
		if (!isReaderLayout(layout)) return fail(400, { error: 'layout' });
		const columns = parseFractions(form.get('columns'));
		const rows = parseFractions(form.get('rows'));
		const definition = readerLayoutDefinition(layout);
		if (columns.length !== definition.columns || rows.length !== definition.rows) {
			return fail(400, { error: 'sizes' });
		}
		const workspace = await currentWorkspace(
			cookies,
			locals.user,
			undefined,
			actionReference(params)
		);
		await commitWorkspace(
			cookies,
			locals.user,
			setReaderLayoutSize(workspace, layout, columns, rows)
		);
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
	 * No part of the reader currently sends `resourceId`/`startWord`/`endWord` or `endVerse`: marking
	 * happens from a verse number's menu and covers whole verses. The fields are still read, and the
	 * repository still stores what they describe, because the stored shape supports word ranges and
	 * multi-verse sections and highlights written that way have to stay writable and removable. The
	 * repository re-validates every index against the verses' real word counts, so a request that
	 * makes them up can at worst end up a no-op or a whole-verse highlight, never an out-of-bounds one.
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
			sectionReferenceFromForm(reference, reference.verse, form),
			styleId,
			wordRangeFromForm(form, reference.verse)
		);
		return { highlighted: true };
	},

	/** Clicking an already-active swatch again, to clear the verse's (or a stored section's) highlight. */
	removeHighlight: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/login');

		const form = await request.formData();
		const reference = parseReference(String(form.get('reference') ?? ''));
		if (!reference?.verse) return fail(400, { error: 'reference' });

		await removeVerseHighlight(
			getDb(),
			locals.user.id,
			sectionReferenceFromForm(reference, reference.verse, form),
			wordRangeFromForm(form, reference.verse)
		);
		return { highlighted: true };
	}
};

/**
 * The last verse a section covers, when the reader selected past the one its reference names.
 *
 * It travels in its own field rather than as a range inside `reference`, because a reference range
 * already means something else there: a translation printing verses 16-17 as one block sends that
 * range for copying and linking, and highlighting it must keep meaning "this one block".
 */
function endVerseFromForm(form: FormData, verse: number): number | null {
	const raw = form.get('endVerse');
	if (raw === null) return null;

	const endVerse = Number(raw);
	if (!Number.isInteger(endVerse) || endVerse <= verse) return null;
	return endVerse;
}

function sectionReferenceFromForm(
	reference: { book: number; chapter: number },
	verse: number,
	form: FormData
): SectionReference {
	const endVerse = endVerseFromForm(form, verse);
	return {
		book: reference.book,
		chapter: reference.chapter,
		verse,
		...(endVerse === null ? {} : { verseEnd: endVerse })
	};
}

/** Reads the optional word-range fields the verse menu sends for a selected section. */
function wordRangeFromForm(form: FormData, verse: number): WordRange | null {
	const resourceId = form.get('resourceId');
	if (resourceId === null) return null;

	const start = Number(form.get('startWord'));
	const end = Number(form.get('endWord'));
	if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0) return null;

	const endVerse = endVerseFromForm(form, verse);
	// Within a single verse the range must still run forwards; across verses the two indices belong to
	// different verses and cannot be compared at all.
	if (endVerse === null && end < start) return null;

	return { resourceId: String(resourceId), start, end, ...(endVerse === null ? {} : { endVerse }) };
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
async function currentWorkspace(
	cookies: Parameters<typeof writeWorkspaceCompatibilityCookies>[0],
	user: App.Locals['user'],
	available?: Awaited<ReturnType<typeof listReaderResources>>,
	reference?: { book: number; chapter: number; verse?: number }
): Promise<ReaderWorkspace> {
	const resources = available ?? (await listReaderResources(getDb()));
	let workspace = resolveReaderWorkspace(
		cookies,
		resources,
		user?.readerWorkspace,
		user?.readerColumns,
		reference
	);
	if (!reference) return workspace;

	// A GET aligns the focused tab with the canonical route in memory. Reconcile that same state before
	// every workspace mutation too, otherwise an unrelated action (changing a link letter, moving a
	// tab, ...) could write the older cookie/database reference back over what is currently visible.
	const focusedTile =
		workspace.tiles.find((tile) => tile.id === workspace.focusedTileId && activeReaderTab(tile)) ??
		workspace.tiles.find((tile) => activeReaderTab(tile));
	const focusedTab = focusedTile ? activeReaderTab(focusedTile) : null;
	if (focusedTile && focusedTab) {
		workspace = setReaderTabReference(workspace, focusedTile.id, focusedTab.id, reference);
	}
	return workspace;
}

function actionReference(params: {
	reference?: string;
}): { book: number; chapter: number; verse?: number } | undefined {
	const raw = decodeReferenceParam(params.reference ?? '').replace(/\/+$/, '');
	const cleaned = raw.replace(/^async\//, '').replace(/\/?trans\/\d+_\d+$/, '');
	return parseReference(cleaned) ?? undefined;
}

async function commitWorkspace(
	cookies: Parameters<typeof writeWorkspaceCompatibilityCookies>[0],
	user: App.Locals['user'],
	workspace: ReaderWorkspace
): Promise<void> {
	const written = writeWorkspaceCompatibilityCookies(cookies, workspace);
	if (!written && !user) {
		// A browser cookie is the only persistence available to a guest. Do not pretend a mutation was
		// saved once the exceptionally large workspace no longer fits in it.
		error(409, 'Der Arbeitsbereich ist für die lokale Speicherung zu groß.');
	}
	if (user) await updateReaderWorkspace(getDb(), user.id, workspace, workspaceColumns(workspace));
}

function parseFractions(value: FormDataEntryValue | null): number[] {
	return String(value ?? '')
		.split(',')
		.filter(Boolean)
		.map(Number)
		.filter(Number.isFinite);
}

function defaultLocation(
	cookies: Parameters<typeof writeWorkspaceCompatibilityCookies>[0]
): string {
	const stored = cookies.get(LOCATION_COOKIE);
	const reference = stored ? parseReference(stored) : null;
	return referencePath(reference ?? { book: 43, chapter: 1 });
}

function rememberLocation(
	cookies: Parameters<typeof writeWorkspaceCompatibilityCookies>[0],
	reference: { book: number; chapter: number }
): void {
	cookies.set(LOCATION_COOKIE, `${bookShortName(reference.book)}${reference.chapter}`, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365,
		httpOnly: false,
		sameSite: 'lax'
	});
}
