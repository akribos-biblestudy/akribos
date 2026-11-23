<script lang="ts">
	import HelpTopic from '$lib/components/help/HelpTopic.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

{#key data.topic.id}
	<HelpTopic {...data} />
{/key}
