<script lang="ts">
	import { verseHoverPopover } from '$lib/actions/verse-hover-popover';
	import { linkBibleReferences } from '$lib/bible/link-references';

	let {
		html,
		bibleId,
		tooltipId,
		class: className = '',
		testId
	}: {
		/** HTML must already have passed the shared server-side document sanitiser. */
		html: string;
		bibleId: string | null;
		/** Must be unique within the rendered page. */
		tooltipId: string;
		class?: string;
		testId?: string;
	} = $props();

	const linkedHtml = $derived(linkBibleReferences(html, { tooltipId }));
</script>

<div
	class={className}
	data-testid={testId}
	data-bible-reference-prose
	use:verseHoverPopover={{ bibleId, tooltipId }}
>
	<!-- Only already-sanitised HTML may enter this component; linkBibleReferences adds fixed attrs. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html linkedHtml}
</div>
