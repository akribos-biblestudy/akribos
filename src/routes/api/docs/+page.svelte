<script lang="ts">
	/**
	 * Interactive API reference.
	 *
	 * Renders the OpenAPI document at `/openapi.json` with Scalar's API reference, mounted from the
	 * npm package rather than its CDN script — self-hosted, like the rest of the stack, so this page
	 * keeps working offline and without trusting a third-party script host.
	 */
	import { onMount } from 'svelte';
	import { createApiReference } from '@scalar/api-reference';
	import scalarStyles from '@scalar/api-reference/style.css?inline';

	let container: HTMLDivElement;

	onMount(() => {
		// Scalar's CSS includes document-wide rules, and its color-mode hook adds body classes.
		// A regular CSS import survives SvelteKit navigation; own both for this mount instead.
		// Keep the stylesheet in the document so Scalar's teleported dialogs remain styled too.
		const modeClasses = ['light-mode', 'dark-mode'] as const;
		const previousModes = modeClasses.filter((name) => document.body.classList.contains(name));
		const stylesheet = document.createElement('style');
		stylesheet.dataset.apiReferenceStyles = '';
		stylesheet.textContent = scalarStyles;
		document.head.appendChild(stylesheet);

		function restoreHostStyles() {
			stylesheet.remove();
			for (const name of modeClasses) {
				document.body.classList.toggle(name, previousModes.includes(name));
			}
		}

		let instance: ReturnType<typeof createApiReference>;
		try {
			instance = createApiReference(container, {
				url: '/openapi.json',
				showSidebar: true,
				hideDownloadButton: false
			});
		} catch (error) {
			restoreHostStyles();
			throw error;
		}

		return () => {
			try {
				instance.destroy();
			} finally {
				restoreHostStyles();
			}
		};
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
