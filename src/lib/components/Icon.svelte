<script lang="ts">
	let {
		name,
		class: className = 'size-5',
		strokeWidth = 1.8
	}: {
		name:
			| 'arrow-right'
			| 'bold'
			| 'book'
			| 'book-open'
			| 'code'
			| 'check'
			| 'calendar'
			| 'chevron-down'
			| 'chevron-left'
			| 'chevron-right'
			| 'info'
			| 'italic'
			| 'download'
			| 'file-text'
			| 'globe'
			| 'heading'
			| 'underline'
			| 'highlight'
			| 'layout'
			| 'link'
			| 'lock'
			| 'list'
			| 'list-ordered'
			| 'message'
			| 'map-pin'
			| 'maximize'
			| 'minimize'
			| 'moon'
			| 'more-horizontal'
			| 'open-external'
			| 'pencil'
			| 'plus'
			| 'quote'
			| 'redo'
			| 'search'
			| 'star'
			| 'strikethrough'
			| 'sun'
			| 'tag'
			| 'trash'
			| 'undo'
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
	{:else if name === 'bold'}
		<path d="M7 4h6a4 4 0 0 1 0 8H7Zm0 8h7a4 4 0 0 1 0 8H7Z" />
	{:else if name === 'underline'}
		<path d="M6 3v8a6 6 0 0 0 12 0V3M4 21h16" />
	{:else if name === 'highlight'}
		<path d="m9 13 7-10 5 4-8 9-4-3ZM9 13l-4 5 4 1 4-3M3 22h18" />
	{:else if name === 'italic'}
		<path d="M10 4h7M7 20h7M14 4 10 20" />
	{:else if name === 'strikethrough'}
		<path
			d="M5 12h14M17 7.5C16.3 5.8 14.6 5 12.2 5 9.5 5 8 6.2 8 8c0 1.5 1.2 2.5 3.5 3.2M7 16.2c.8 1.9 2.6 2.8 5.2 2.8 2.8 0 4.4-1.3 4.4-3.2 0-1.2-.7-2.1-2-2.8"
		/>
	{:else if name === 'heading'}
		<path d="M4 5v14M12 5v14M4 12h8M16 9h2.5a1.5 1.5 0 0 1 0 3H17v.01h2a1.5 1.5 0 0 1 0 3H16" />
	{:else if name === 'code'}
		<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />
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
	{:else if name === 'list'}
		<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
	{:else if name === 'list-ordered'}
		<path d="M10 6h10M10 12h10M10 18h10M4 5h2v3M4 11h2l-2 3h2M4 17h2v3H4" />
	{:else if name === 'link'}
		<path
			d="M10 13a5 5 0 0 0 7 .3l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.3l-3 3a5 5 0 0 0 7 7l1.7-1.7"
		/>
	{:else if name === 'maximize'}
		<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
	{:else if name === 'minimize'}
		<path d="M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'quote'}
		<path d="M5 10h5v5H5v-4a5 5 0 0 1 5-5M14 10h5v5h-5v-4a5 5 0 0 1 5-5" />
	{:else if name === 'undo'}
		<path d="M9 7 4 12l5 5M5 12h8a7 7 0 0 1 7 7" />
	{:else if name === 'redo'}
		<path d="m15 7 5 5-5 5M19 12h-8a7 7 0 0 0-7 7" />
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
	{:else if name === 'map-pin'}
		<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
		<circle cx="12" cy="10" r="2.5" />
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
