/**
 * Shows a verse's text in a floating popup when the reader hovers a `.verse-ref` span — the markup
 * `src/lib/bible/parse/strongs-xml.ts` emits for a Bible reference quoted inside a lexicon entry.
 *
 * The lexicon HTML is injected via `{@html}`, so there is no live Svelte element per reference to
 * attach behaviour to; this action listens on the containing element instead and works out which
 * reference was hovered from the event target, the same delegation approach the browser itself uses
 * for native tooltips. The popup is a single plain DOM node reused across hovers and positioned with the
 * same viewport-clamping math as `Footnote.svelte`'s click popup.
 */

import { segmentsToText, type VerseSegment } from '../bible/segments.ts';
import { formatReference } from '../bible/reference.ts';

type ChapterVerseRow = { verse: number; verseEnd?: number; segments: VerseSegment[] };

/** One fetch per chapter, shared across every popup on the page for as long as it stays open. */
const chapterCache = new Map<string, Promise<ChapterVerseRow[]>>();

function loadChapterVerses(
	bibleId: string,
	book: number,
	chapter: number
): Promise<ChapterVerseRow[]> {
	const key = `${bibleId}/${book}/${chapter}`;
	const cached = chapterCache.get(key);
	if (cached) return cached;

	const pending = fetch(`/api/v1/bibles/${encodeURIComponent(bibleId)}/${book}/${chapter}`)
		.then((response) => (response.ok ? response.json() : Promise.reject(new Error('not found'))))
		.then((data: { verses: ChapterVerseRow[] }) => data.verses);

	chapterCache.set(key, pending);
	pending.catch(() => chapterCache.delete(key));
	return pending;
}

type ResourceLabel = { id: string; tabTitle: string };

/** Every readable resource's id and abbreviation, fetched once and shared across every popup. */
let resourceLabelsPromise: Promise<ResourceLabel[]> | null = null;

function loadResourceLabels(): Promise<ResourceLabel[]> {
	resourceLabelsPromise ??= fetch('/api/v1/resources')
		.then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
		.then((data: { resources: ResourceLabel[] }) => data.resources);
	return resourceLabelsPromise;
}

/** Verses overlapping `[verse, verseEnd]`, joined — covers both a plain single verse and a translation
 *  that prints a range (e.g. 16-17) as one row the reader asked for by either endpoint. */
function collectVerseText(rows: ChapterVerseRow[], verse: number, verseEnd?: number): string {
	const to = verseEnd ?? verse;
	return rows
		.filter((row) => row.verse <= to && (row.verseEnd ?? row.verse) >= verse)
		.map((row) => segmentsToText(row.segments))
		.join(' ');
}

export type VerseHoverParams = {
	/** Resource id of the reader's primary translation; hovering does nothing without one. */
	bibleId: string | null;
};

export function verseHoverPopover(node: HTMLElement, params: VerseHoverParams) {
	let bibleId = params.bibleId;
	let popup: HTMLDivElement | undefined;
	let showTimer: ReturnType<typeof setTimeout> | undefined;
	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	let requestToken = 0;

	function ensurePopup(): HTMLDivElement {
		if (!popup) {
			popup = document.createElement('div');
			popup.className = 'verse-hover-popup';
			popup.setAttribute('role', 'note');
			popup.style.display = 'none';
			document.body.appendChild(popup);
		}
		return popup;
	}

	function place(anchor: HTMLElement, box: HTMLDivElement): void {
		const anchorRect = anchor.getBoundingClientRect();
		const boxRect = box.getBoundingClientRect();
		const margin = 8;
		const gap = 6;

		let left = anchorRect.left;
		left = Math.max(margin, Math.min(left, window.innerWidth - boxRect.width - margin));

		let top = anchorRect.bottom + gap;
		if (top + boxRect.height > window.innerHeight - margin) {
			top = Math.max(margin, anchorRect.top - boxRect.height - gap);
		}

		box.style.left = `${left}px`;
		box.style.top = `${top}px`;
	}

	function hide(): void {
		clearTimeout(showTimer);
		if (popup) popup.style.display = 'none';
	}

	/** Rebuilds the popup's content: the reference plus the translation name, then the verse text. */
	function renderContent(
		box: HTMLDivElement,
		referenceLabel: string,
		translationLabel: string,
		text: string
	): void {
		box.replaceChildren();
		const heading = document.createElement('div');
		heading.className = 'verse-hover-popup-ref';
		heading.textContent = translationLabel
			? `${referenceLabel} · ${translationLabel}`
			: referenceLabel;
		const body = document.createElement('div');
		body.textContent = text;
		box.append(heading, body);
	}

	async function show(target: HTMLElement): Promise<void> {
		if (!bibleId) return;
		const book = Number(target.dataset.book);
		const chapter = Number(target.dataset.chapter);
		const verse = Number(target.dataset.verse);
		const verseEnd = target.dataset.verseEnd ? Number(target.dataset.verseEnd) : undefined;
		if (!book || !chapter || !verse) return;

		const token = ++requestToken;
		const box = ensurePopup();
		const referenceLabel = formatReference(
			{ book, chapter, verse, ...(verseEnd ? { verseEnd } : {}) },
			{ style: 'full' }
		);
		renderContent(box, referenceLabel, '', '…');
		box.style.display = 'block';
		place(target, box);

		try {
			const [rows, labels] = await Promise.all([
				loadChapterVerses(bibleId, book, chapter),
				loadResourceLabels().catch(() => [] as ResourceLabel[])
			]);
			if (token !== requestToken) return;
			const translationLabel = labels.find((label) => label.id === bibleId)?.tabTitle ?? '';
			renderContent(
				box,
				referenceLabel,
				translationLabel,
				collectVerseText(rows, verse, verseEnd) || '…'
			);
			place(target, box);
		} catch {
			if (token === requestToken) hide();
		}
	}

	function onOver(event: Event): void {
		const target = (event.target as HTMLElement).closest<HTMLElement>('.verse-ref');
		if (!target) return;
		clearTimeout(hideTimer);
		showTimer = setTimeout(() => show(target), 150);
	}

	function onOut(event: Event): void {
		if (!(event.target as HTMLElement).closest('.verse-ref')) return;
		clearTimeout(showTimer);
		hideTimer = setTimeout(hide, 50);
	}

	node.addEventListener('pointerover', onOver);
	node.addEventListener('pointerout', onOut);

	return {
		update(next: VerseHoverParams): void {
			bibleId = next.bibleId;
		},
		destroy(): void {
			node.removeEventListener('pointerover', onOver);
			node.removeEventListener('pointerout', onOut);
			clearTimeout(showTimer);
			clearTimeout(hideTimer);
			popup?.remove();
		}
	};
}
