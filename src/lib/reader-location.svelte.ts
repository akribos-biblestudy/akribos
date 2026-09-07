import type { VerseRef } from './bible/reference';

/**
 * The reference currently visible in the focused reader tab, shared with contextual actions while
 * scrolling.
 *
 * This has to be its own reactive store rather than reading `page.url` from `$app/state`: SvelteKit's
 * `replaceState` (used by the reader to keep the address bar in step while scrolling) only updates
 * `page.state`, by design — it deliberately does not touch the reactive `page.url`, so nothing outside
 * the component that called it would ever see the change.
 */
export const readerLocation: { reference: VerseRef | null } = $state({ reference: null });
