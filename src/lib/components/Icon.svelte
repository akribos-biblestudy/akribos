<script lang="ts">
	let {
		name,
		class: className = 'size-5',
		strokeWidth = 1.8
	}: {
		name:
			| 'arrow-right'
			| 'book'
			| 'book-open'
			| 'check'
			| 'calendar'
			| 'chevron-down'
			| 'chevron-left'
			| 'chevron-right'
			| 'info'
			| 'download'
			| 'file-text'
			| 'globe'
			| 'layout'
			| 'link'
			| 'lock'
			| 'message'
			| 'moon'
			| 'more-horizontal'
			| 'open-external'
			| 'pencil'
			| 'plus'
			| 'search'
			| 'star'
			| 'sun'
			| 'tag'
			| 'trash'
			| 'upload'
			| 'user'
			| 'x';
		class?: string;
		strokeWidth?: number;
	} = $props();
</script>

<!--
	One outline system for interactive UI icons: a 24 px drawing grid, rounded terminals and the same
	optical stroke weight. Individual controls own only the rendered size and colour.
-->
<svg
	viewBox="0 0 24 24"
	class={className}
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'arrow-right'}
		<path d="M5 12h14M13 6l6 6-6 6" />
	{:else if name === 'layout'}
		<rect x="3" y="3.5" width="7" height="17" rx="1.5" />
		<rect x="14" y="3.5" width="7" height="7" rx="1.5" />
		<rect x="14" y="13.5" width="7" height="7" rx="1.5" />
	{:else if name === 'sun'}
		<circle cx="12" cy="12" r="3.5" />
		<path
			d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"
		/>
	{:else if name === 'moon'}
		<path d="M20.3 15.1A8.7 8.7 0 0 1 8.9 3.7 8.7 8.7 0 1 0 20.3 15.1Z" />
	{:else if name === 'chevron-left'}
		<path d="m15 18-6-6 6-6" />
	{:else if name === 'chevron-right'}
		<path d="m9 18 6-6-6-6" />
	{:else if name === 'chevron-down'}
		<path d="m6 9 6 6 6-6" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="6.5" />
		<path d="m16 16 4.5 4.5" />
	{:else if name === 'x'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'user'}
		<circle cx="12" cy="8.25" r="3.25" />
		<path d="M5.75 19.5c.7-3.5 2.9-5.5 6.25-5.5s5.55 2 6.25 5.5" />
	{:else if name === 'info'}
		<circle cx="12" cy="12" r="9" />
		<path d="M12 11v5" />
		<path d="M12 8h.01" stroke-width={Math.max(strokeWidth, 2.6)} />
	{:else if name === 'link'}
		<path d="m10 13.5 4-4" />
		<path d="m7.5 15.5-1 1a3.54 3.54 0 0 1-5-5l3-3a3.54 3.54 0 0 1 5 0" />
		<path d="m16.5 8.5 1-1a3.54 3.54 0 0 1 5 5l-3 3a3.54 3.54 0 0 1-5 0" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'more-horizontal'}
		<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width={Math.max(strokeWidth, 2.8)} />
	{:else if name === 'open-external'}
		<path d="M14 4h6v6M20 4l-9 9" />
		<path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
	{:else if name === 'pencil'}
		<path d="m14.5 5.5 4 4M4 20l3.5-.75L19 7.75a1.75 1.75 0 0 0-2.75-2.75L4.75 16.5Z" />
	{:else if name === 'star'}
		<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
	{:else if name === 'check'}
		<path d="m5 12.5 4.25 4.25L19.5 6.5" />
	{:else if name === 'calendar'}
		<rect x="3" y="5" width="18" height="16" rx="2" />
		<path d="M8 3v4M16 3v4M3 10h18" />
	{:else if name === 'download'}
		<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" />
	{:else if name === 'file-text'}
		<path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
		<path d="M14 3v5h5M8 12h7M8 16h7" />
	{:else if name === 'globe'}
		<circle cx="12" cy="12" r="9" />
		<path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18" />
	{:else if name === 'lock'}
		<rect x="5" y="10" width="14" height="11" rx="2" />
		<path d="M8 10V7a4 4 0 0 1 8 0v3" />
	{:else if name === 'tag'}
		<path d="M20.5 13.5 13.5 20.5 3.5 10.5V3.5h7Z" />
		<circle cx="8" cy="8" r="1" />
	{:else if name === 'trash'}
		<path d="M4 7h16M9 3h6l1 4M7 7l1 14h8l1-14M10 11v6M14 11v6" />
	{:else if name === 'upload'}
		<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 20h16" />
	{:else if name === 'message'}
		<path
			d="M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5.5 4v-4H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"
		/>
	{:else if name === 'book-open'}
		<path d="M3.5 5.5A2.5 2.5 0 0 1 6 3h2.5A3.5 3.5 0 0 1 12 6.5v14a3.5 3.5 0 0 0-3.5-3.5H3.5Z" />
		<path d="M20.5 5.5A2.5 2.5 0 0 0 18 3h-2.5A3.5 3.5 0 0 0 12 6.5v14a3.5 3.5 0 0 1 3.5-3.5h5Z" />
	{:else if name === 'book'}
		<path d="M5 3h13a2 2 0 0 1 2 2v16H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z" />
		<path d="M6 16h14M7 7h8" />
	{/if}
</svg>
