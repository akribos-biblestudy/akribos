<script lang="ts">
	import HelpArticle from '$lib/components/help/HelpArticle.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<HelpArticle {...data} />
