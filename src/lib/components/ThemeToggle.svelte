<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	/**
	 * Switches between light and dark, remembering the choice.
	 *
	 * The class is applied before first paint by the inline script in `app.html`; this only has to keep
	 * it in step afterwards.
	 */
	// Read straight from the class the inline script in app.html already applied, so no effect and no
	// flash are needed. During server rendering there is no document; hydration corrects the icon.
	let dark = $state(
		typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
	);

	function toggle() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		const theme = dark ? 'dark' : 'light';
		try {
			document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
		} catch {
			// Private browsing can refuse storage; the toggle still works for this session.
		}
		void fetch('/api/theme', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ theme })
		});
	}
</script>

<button
	type="button"
	onclick={toggle}
	title={dark ? t('nav.theme.light') : t('nav.theme.dark')}
	aria-label={dark ? t('nav.theme.light') : t('nav.theme.dark')}
	class="icon-button"
>
	{#if dark}
		<Icon name="sun" />
	{:else}
		<Icon name="moon" />
	{/if}
</button>
