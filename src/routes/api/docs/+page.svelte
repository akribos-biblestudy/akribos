<script lang="ts">
	/**
	 * Interactive API reference.
	 *
	 * Renders the OpenAPI document at `/openapi.json` with Scalar's API reference, mounted from the
	 * npm package rather than its CDN script — self-hosted, like the rest of the stack, so this page
	 * keeps working offline and without trusting a third-party script host.
	 */
	import { onMount, onDestroy } from 'svelte';
	import { createApiReference } from '@scalar/api-reference';
	import '@scalar/api-reference/style.css';

	let container: HTMLDivElement;
	let instance: ReturnType<typeof createApiReference> | undefined;

	onMount(() => {
		instance = createApiReference(container, {
			url: '/openapi.json',
			showSidebar: true,
			hideDownloadButton: false
		});
	});

	onDestroy(() => {
		instance?.destroy();
	});
</script>

<svelte:head>
	<meta
		name="description"
		content="Interactive, try-it-out reference for the Akribos public API, generated from its OpenAPI document."
	/>
</svelte:head>

<div bind:this={container} class="scalar-reference"></div>

<style>
	.scalar-reference {
		min-height: 100vh;
	}
</style>
