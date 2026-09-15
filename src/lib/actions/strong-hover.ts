/** Highlight matching words without notifying every rendered verse on each pointer movement. */
export function strongHover(root: HTMLElement) {
	const selector = 'button.strong[data-strong]';
	const byStrong = new Map<string, Set<HTMLElement>>();
	const keysByWord = new Map<HTMLElement, string[]>();
	let hovered: string | null = null;
	function remove(word: HTMLElement) {
		for (const key of keysByWord.get(word) ?? []) {
			const words = byStrong.get(key);
			words?.delete(word);
			if (!words?.size) byStrong.delete(key);
		}
		keysByWord.delete(word);
		word.classList.remove('strong-hover');
	}
	function add(word: HTMLElement) {
		remove(word);
		const keys = [
			...new Set(
				[word.dataset.strong ?? '', ...(word.dataset.strongs?.split(' ') ?? [])].filter(Boolean)
			)
		];
		keysByWord.set(word, keys);
		for (const key of keys) {
			let words = byStrong.get(key);
			if (!words) byStrong.set(key, (words = new Set()));
			words.add(word);
		}
		if (hovered && keys.includes(hovered)) word.classList.add('strong-hover');
	}
	function visit(node: Node, callback: (word: HTMLElement) => void) {
		if (!(node instanceof HTMLElement)) return;
		if (node.matches(selector)) callback(node);
		node.querySelectorAll<HTMLElement>(selector).forEach(callback);
	}
	function highlight(strong: string | null) {
		if (strong === hovered) return;
		if (hovered) byStrong.get(hovered)?.forEach((word) => word.classList.remove('strong-hover'));
		hovered = strong;
		if (hovered) byStrong.get(hovered)?.forEach((word) => word.classList.add('strong-hover'));
	}
	function wordAt(target: EventTarget | null): HTMLElement | null {
		const word = target instanceof Element ? target.closest<HTMLElement>(selector) : null;
		return word && root.contains(word) ? word : null;
	}
	function over(event: PointerEvent) {
		if (event.pointerType === 'mouse' || (event.pointerType === 'pen' && event.buttons === 0))
			highlight(wordAt(event.target)?.dataset.strong ?? null);
	}
	function out(event: PointerEvent) {
		if (event.pointerType === 'mouse' || event.pointerType === 'pen')
			highlight(
				event.pointerType === 'pen' && event.buttons !== 0
					? null
					: (wordAt(event.relatedTarget)?.dataset.strong ?? null)
			);
	}
	function move(event: PointerEvent) {
		// A hovering pen can lift from contact without emitting another pointerover.
		if (event.pointerType === 'pen')
			highlight(event.buttons === 0 ? (wordAt(event.target)?.dataset.strong ?? null) : null);
	}
	function down(event: PointerEvent) {
		if (event.pointerType !== 'mouse') highlight(null);
	}
	visit(root, add);
	const observer = new MutationObserver((records) => {
		for (const record of records) {
			record.removedNodes.forEach((node) => visit(node, remove));
			record.addedNodes.forEach((node) => visit(node, add));
			if (record.type === 'attributes' && record.target instanceof HTMLElement) add(record.target);
		}
	});
	observer.observe(root, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['data-strong', 'data-strongs']
	});
	root.addEventListener('pointerover', over);
	root.addEventListener('pointerout', out);
	root.addEventListener('pointermove', move);
	root.addEventListener('pointerdown', down);
	return {
		destroy() {
			observer.disconnect();
			highlight(null);
			byStrong.clear();
			keysByWord.clear();
			root.removeEventListener('pointerover', over);
			root.removeEventListener('pointerout', out);
			root.removeEventListener('pointermove', move);
			root.removeEventListener('pointerdown', down);
		}
	};
}
