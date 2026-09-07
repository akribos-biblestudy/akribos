<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	let { data } = $props();
	let form: HTMLFormElement;
	let opening = $state(false);
	onMount(() => form.requestSubmit());
</script>

<main class="mx-auto w-full max-w-xl px-5 py-12">
	<h1 class="text-xl font-semibold">{data.name}</h1>
	<p role="status" class="mt-3 text-sm text-stone-500">
		{opening ? 'Arbeitsbereich wird geöffnet …' : 'Gespeicherten Arbeitsbereich öffnen.'}
	</p>
	<form
		bind:this={form}
		method="POST"
		use:enhance={() => {
			opening = true;
			return async ({ update }) => {
				await update();
				opening = false;
			};
		}}
	>
		<button
			class="mt-5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
			disabled={opening}>Arbeitsbereich öffnen</button
		>
	</form>
</main>
