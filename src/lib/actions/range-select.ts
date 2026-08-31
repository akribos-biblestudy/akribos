/**
 * The pointer gesture behind the reader's own text selection.
 *
 * One listener set on the element wrapping all columns, resolving the word under the pointer from
 * `data-w` (see `src/lib/reader/selection.ts`). It uses nothing but pointer events, so a mouse, a
 * finger and a stylus all take the same code path — the reason the previous, `getSelection()`-based
 * implementation needed a different fix for every device class.
 *
 * Gestures:
 *  - mouse/stylus: press and drag. A press that never moves stays a plain click, so tapping a tagged
 *    word still opens its Strong's entry.
 *  - touch: press and hold, then drag. The hold is what tells a selection apart from a scroll, and it
 *    is timed here rather than left to the browser's own long-press, which is exactly the part that
 *    behaves differently on every Android build and e-ink reader.
 *  - once a selection exists, a plain tap moves its nearer end, which is how it is adjusted without
 *    drag handles — the one interaction that stays comfortable on a slow-refreshing e-ink screen.
 */

import {
	wordTargetFromElement,
	type ReaderSelection,
	type WordTarget
} from '../reader/selection.svelte.ts';

/** How long a finger must rest on a word before the gesture becomes a selection rather than a scroll. */
const LONG_PRESS_MS = 350;
/** How far a mouse or stylus must travel before a press turns into a drag selection. */
const DRAG_THRESHOLD_PX = 8;
/** How far a finger may drift during the hold before the gesture is conceded to the scroller. */
const TOUCH_CANCEL_PX = 10;
/** A click that never arrives (drag released outside the text) must not suppress a later, real one. */
const CLICK_SUPPRESSION_MS = 400;

export type RangeSelectParams = {
	selection: ReaderSelection;
	/** A selection worth acting on was finished — the reader opens its palette. */
	onCommit: () => void;
	/** The reader tapped away from the text; whatever was selected is dropped. */
	onDismiss: () => void;
};

type Pending = {
	pointerId: number;
	pointerType: string;
	x: number;
	y: number;
	target: WordTarget;
};

export function rangeSelect(node: HTMLElement, params: RangeSelectParams) {
	let current = params;
	let pending: Pending | null = null;
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	let suppressClick = false;
	let suppressTimer: ReturnType<typeof setTimeout> | undefined;

	function cancelHold() {
		clearTimeout(holdTimer);
		holdTimer = undefined;
	}

	function armClickSuppression() {
		suppressClick = true;
		clearTimeout(suppressTimer);
		suppressTimer = setTimeout(() => (suppressClick = false), CLICK_SUPPRESSION_MS);
	}

	function startDrag(from: Pending) {
		current.selection.begin('word', from.target.chapterKey, from.target.resourceId, {
			verse: from.target.verse,
			word: from.target.word
		});
		current.selection.dragging = true;
		// Capture keeps the drag alive when the pointer leaves the word, the column or the window; the
		// far end is resolved with `elementFromPoint` precisely because events retarget to `node` here.
		try {
			node.setPointerCapture(from.pointerId);
		} catch {
			// A pointer that has already been released cannot be captured; the drag simply ends.
		}
	}

	function finishDrag() {
		current.selection.dragging = false;
		armClickSuppression();
		if (current.selection.meaningful) current.onCommit();
		else current.selection.clear();
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button > 0) return;
		cancelHold();

		const target = wordTargetFromElement(event.target as Element | null);
		if (!target) {
			// Anything that is not verse text — the gutter, a heading, the margin — dismisses. A verse
			// number lands here too, which is what lets it keep opening its own menu.
			if (current.selection.active) current.onDismiss();
			pending = null;
			return;
		}

		pending = {
			pointerId: event.pointerId,
			pointerType: event.pointerType,
			x: event.clientX,
			y: event.clientY,
			target
		};

		if (event.pointerType === 'touch') {
			holdTimer = setTimeout(() => {
				holdTimer = undefined;
				if (pending) startDrag(pending);
			}, LONG_PRESS_MS);
		}
	}

	function onPointerMove(event: PointerEvent) {
		if (!pending || pending.pointerId !== event.pointerId) return;

		if (!current.selection.dragging) {
			const distance = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
			if (pending.pointerType === 'touch') {
				// Moving during the hold means the reader is scrolling, not selecting.
				if (distance > TOUCH_CANCEL_PX) {
					cancelHold();
					pending = null;
				}
				return;
			}
			if (distance < DRAG_THRESHOLD_PX) return;
			startDrag(pending);
		}

		const under = document.elementFromPoint(event.clientX, event.clientY);
		const target = wordTargetFromElement(under);
		if (target) current.selection.extendTo(target);
		event.preventDefault();
	}

	function onPointerUp(event: PointerEvent) {
		cancelHold();
		if (current.selection.dragging) {
			finishDrag();
			pending = null;
			return;
		}

		// A plain tap on a word while a selection stands moves its nearer end. Without an active
		// selection the tap is left alone, so tagged words keep opening their Strong's entry.
		if (pending && pending.pointerId === event.pointerId && current.selection.active) {
			current.selection.adjustTo(pending.target);
			armClickSuppression();
			current.onCommit();
		}
		pending = null;
	}

	function onPointerCancel() {
		cancelHold();
		pending = null;
		if (!current.selection.dragging) return;
		current.selection.dragging = false;
		if (current.selection.meaningful) current.onCommit();
		else current.selection.clear();
	}

	/**
	 * Stops the page from scrolling under an active drag. `touch-action` cannot do this: the browser
	 * fixes a touch gesture's scrolling behaviour when it begins, and the drag only becomes a
	 * selection later. Cancelling the first `touchmove` — which is still cancellable, because the hold
	 * that preceded it did not move — is what actually keeps the page still.
	 */
	function onTouchMove(event: TouchEvent) {
		if (current.selection.dragging && event.cancelable) event.preventDefault();
	}

	/** The long press must not raise the browser's own text-selection or context menu on top of ours. */
	function onContextMenu(event: Event) {
		if (current.selection.dragging || holdTimer !== undefined) event.preventDefault();
	}

	/** The click that follows a gesture would otherwise reach the tagged word underneath it. */
	function onClickCapture(event: MouseEvent) {
		if (!suppressClick) return;
		suppressClick = false;
		clearTimeout(suppressTimer);
		event.preventDefault();
		event.stopPropagation();
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', onPointerUp);
	node.addEventListener('pointercancel', onPointerCancel);
	node.addEventListener('touchmove', onTouchMove, { passive: false });
	node.addEventListener('contextmenu', onContextMenu);
	node.addEventListener('click', onClickCapture, true);

	return {
		update(next: RangeSelectParams) {
			current = next;
		},
		destroy() {
			cancelHold();
			clearTimeout(suppressTimer);
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', onPointerUp);
			node.removeEventListener('pointercancel', onPointerCancel);
			node.removeEventListener('touchmove', onTouchMove);
			node.removeEventListener('contextmenu', onContextMenu);
			node.removeEventListener('click', onClickCapture, true);
		}
	};
}
