<script lang="ts">
	import { t } from '$lib/i18n';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import DocumentAreaHeader from '$lib/components/documents/DocumentAreaHeader.svelte';
	let { data } = $props();
	const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });
	function verseCount(count: number): string {
		if (count === 0) return t('lists.countNone');
		if (count === 1) return t('lists.countOne');
		return t('lists.count', { count });
	}
</script>

<main class="mx-auto w-full max-w-[96rem] px-4 py-7 sm:px-6 sm:py-10">
	<DocumentAreaHeader active="lists" />
	<div class="mt-7 max-w-5xl">
		<Card>
			<form method="POST" action="?/createList" class="mb-5 flex gap-2">
				<label class="sr-only" for="new-list-title">{t('lists.titleLabel')}</label>
				<input
					id="new-list-title"
					name="title"
					placeholder={t('lists.defaultTitle')}
					class="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm
							       focus:border-accent-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
				/>
				<Button variant="primary">{t('lists.new')}</Button>
			</form>

			{#if data.lists.length === 0}
				<div
					class="rounded-xl border border-dashed border-stone-300 px-6 py-10 text-center dark:border-stone-700"
				>
					<p class="font-medium">{t('lists.overviewEmpty')}</p>
					<p class="mx-auto mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">
						{t('lists.overviewEmptyHint')}
					</p>
				</div>
			{:else}
				<ul class="grid gap-3 sm:grid-cols-2">
					{#each data.lists as list (list.id)}
						<li
							class="rounded-xl border border-stone-200 transition-colors hover:border-stone-300
									       dark:border-stone-800 dark:hover:border-stone-700"
						>
							<!-- The whole card is the link; there is nothing else to do with a list from here. -->
							<a href="/lists/{list.id}" class="block px-4 py-3">
								<span class="flex items-baseline justify-between gap-2">
									<span class="truncate font-medium">{list.title}</span>
									<span class="flex shrink-0 gap-1">
										{#if list.role === 'member'}
											<span
												class="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600
														       dark:bg-stone-800 dark:text-stone-300"
											>
												{t('lists.sharedByOwner', { owner: list.ownerName ?? '' })}
											</span>
										{/if}
										{#if list.isPublic}
											<span
												class="rounded-full bg-accent-50 px-2 py-0.5 text-xs text-accent-700
														       dark:bg-accent-900/40 dark:text-accent-300"
											>
												{t('lists.isPublic')}
											</span>
										{/if}
									</span>
								</span>
								<span class="mt-1 block text-xs text-stone-500 dark:text-stone-400">
									{verseCount(list.itemCount)}
									<span aria-hidden="true"> · </span>
									{t('lists.updated', { date: dateFormat.format(new Date(list.updatedAt)) })}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	</div>
</main>
