import type { VerseRef } from '$lib/bible/reference';
import { normalizeStrongId } from '$lib/bible/strong';

type ReaderContentLinkOptions = {
	onStrong?: (strong: string) => void;
	onReference?: (reference: VerseRef) => void;
	strongHref?: (strong: string) => string;
	referenceHref?: (reference: VerseRef) => string;
};

/** Delegates links inside sanitised imported HTML without turning its prose container interactive. */
export function readerContentLinks(node: HTMLElement, options: ReaderContentLinkOptions) {
	let current = options;

	function strongFrom(anchor: HTMLAnchorElement): string | null {
		return normalizeStrongId(
			anchor.textContent ?? anchor.getAttribute('href')?.replace(/^\//, '') ?? ''
		);
	}

	function referenceFrom(anchor: HTMLAnchorElement): VerseRef | null {
		const book = Number(anchor.dataset.book);
		const chapter = Number(anchor.dataset.chapter);
		const verse = Number(anchor.dataset.verse);
		return book && chapter && verse ? { book, chapter, verse } : null;
	}

	/** Makes copy-link and modified clicks just as contextual as an ordinary in-app click. */
	function refreshHrefs(): void {
		for (const anchor of node.querySelectorAll<HTMLAnchorElement>('a.strong-link')) {
			const strong = strongFrom(anchor);
			if (strong && current.strongHref) anchor.href = current.strongHref(strong);
		}
		for (const anchor of node.querySelectorAll<HTMLAnchorElement>('a.verse-ref')) {
			const reference = referenceFrom(anchor);
			if (reference && current.referenceHref) anchor.href = current.referenceHref(reference);
		}
	}

	function onClick(event: MouseEvent): void {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const anchor = target.closest<HTMLAnchorElement>('a');
		if (!anchor || !node.contains(anchor)) return;

		if (anchor.classList.contains('strong-link') && current.onStrong) {
			const strong = strongFrom(anchor);
			if (strong) {
				event.preventDefault();
				current.onStrong(strong);
				return;
			}
		}

		if (!anchor.classList.contains('verse-ref') || !current.onReference) return;
		const reference = referenceFrom(anchor);
		if (!reference) return;
		event.preventDefault();
		current.onReference(reference);
	}

	node.addEventListener('click', onClick);
	refreshHrefs();
	return {
		update(next: ReaderContentLinkOptions) {
			current = next;
			refreshHrefs();
		},
		destroy() {
			node.removeEventListener('click', onClick);
		}
	};
}
