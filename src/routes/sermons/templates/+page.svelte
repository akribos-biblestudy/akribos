<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import DocumentAreaNav from '$lib/components/documents/DocumentAreaNav.svelte';
	import { GERMAN_SERMON_STARTER_TEMPLATE } from '$lib/notes/documents';
	import { t } from '$lib/i18n';

	let { data, form } = $props();
</script>

<main class="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 sm:py-10" data-testid="sermon-templates">
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="text-xs font-bold tracking-[0.16em] text-accent-700 uppercase dark:text-accent-300">
				{t('documents.kind.sermon')}
			</p>
			<h1 class="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
				{t('sermons.templates.title')}
			</h1>
			<p class="mt-2 max-w-2xl text-sm text-stone-500 dark:text-stone-400">
				{t('sermons.templates.subtitle')}
			</p>
		</div>
		<a href="/sermons" class="secondary-link"
			><Icon name="chevron-left" class="size-4" />{t('sermons.back')}</a
		>
	</header>
	<DocumentAreaNav active="sermons" />

	{#if form?.error}
		<p class="notice error" role="alert">{t('sermons.templates.error')}</p>
	{:else if form?.created || form?.updated || form?.deleted}
		<p class="notice" role="status">{t('sermons.templates.saved')}</p>
	{/if}

	<section class="template-card mt-7" data-tour-target="sermon-template-create">
		<h2 class="font-serif text-lg font-semibold">{t('sermons.templates.new')}</h2>
		<form method="POST" action="?/create" class="mt-4 space-y-3">
			<label class="field-label"
				><span>{t('sermons.templates.name')}</span><input
					name="name"
					required
					maxlength="120"
					class="field-control"
				/></label
			>
			<label class="field-label"
				><span>{t('sermons.templates.body')}</span><textarea
					name="bodyMarkdown"
					rows="14"
					required
					class="field-control font-mono text-sm">{GERMAN_SERMON_STARTER_TEMPLATE}</textarea
				></label
			>
			<button type="submit" class="primary-button"
				><Icon name="plus" class="size-4" />{t('sermons.templates.create')}</button
			>
		</form>
	</section>

	<section class="mt-7" data-tour-target="sermon-template-list">
		<h2 class="text-sm font-semibold text-stone-600 dark:text-stone-300">
			{t('sermons.templates.own')}
		</h2>
		{#if data.templates.length === 0}
			<p
				class="mt-3 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700"
			>
				{t('sermons.templates.empty')}
			</p>
		{:else}
			<div class="mt-3 space-y-4">
				{#each data.templates as template (template.id)}
					<details class="template-card">
						<summary class="cursor-pointer font-semibold">{template.name}</summary>
						<form method="POST" action="?/update" class="mt-4 space-y-3">
							<input type="hidden" name="id" value={template.id} />
							<label class="field-label"
								><span>{t('sermons.templates.name')}</span><input
									name="name"
									required
									maxlength="120"
									value={template.name}
									class="field-control"
								/></label
							>
							<label class="field-label"
								><span>{t('sermons.templates.body')}</span><textarea
									name="bodyMarkdown"
									rows="12"
									required
									class="field-control font-mono text-sm">{template.bodyMarkdown}</textarea
								></label
							>
							<div class="flex flex-wrap gap-2">
								<button type="submit" class="primary-button"
									><Icon name="check" class="size-4" />{t('action.save')}</button
								>
								<button
									type="submit"
									formaction="?/delete"
									class="danger-button"
									onclick={(event) => {
										if (!confirm(t('sermons.templates.deleteConfirm'))) event.preventDefault();
									}}><Icon name="trash" class="size-4" />{t('action.delete')}</button
								>
							</div>
						</form>
					</details>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	.template-card {
		border: 1px solid var(--line);
		border-radius: 1rem;
		background: var(--surface);
		padding: 1.25rem;
		box-shadow: var(--shadow-soft);
	}
	.field-label {
		display: grid;
		gap: 0.35rem;
		color: var(--color-stone-600);
		font-size: 0.76rem;
		font-weight: 650;
	}
	.field-control {
		width: 100%;
		border: 1px solid var(--color-stone-300);
		border-radius: 0.65rem;
		background: var(--surface-raised);
		padding: 0.6rem 0.75rem;
		color: inherit;
		font-weight: 400;
	}
	.field-control:focus {
		border-color: var(--color-accent-500);
		outline: 2px solid color-mix(in oklab, var(--color-accent-500) 25%, transparent);
	}
	.primary-button,
	.danger-button,
	.secondary-link {
		display: inline-flex;
		min-height: 2.5rem;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border-radius: 0.65rem;
		padding: 0.5rem 0.85rem;
		font-size: 0.8rem;
		font-weight: 700;
	}
	.primary-button {
		background: var(--color-accent-600);
		color: white;
	}
	.danger-button {
		color: var(--color-red-700);
	}
	.secondary-link {
		border: 1px solid var(--color-stone-300);
		background: var(--surface-raised);
	}
	.notice {
		margin-top: 1rem;
		border: 1px solid var(--color-green-200);
		border-radius: 0.75rem;
		background: var(--color-green-50);
		padding: 0.7rem 1rem;
		color: var(--color-green-800);
		font-size: 0.82rem;
	}
	.notice.error {
		border-color: var(--color-red-200);
		background: var(--color-red-50);
		color: var(--color-red-800);
	}
	:global(.dark) .field-label {
		color: var(--color-stone-300);
	}
	:global(.dark) .field-control,
	:global(.dark) .secondary-link {
		border-color: var(--color-stone-700);
		background: color-mix(in oklab, white 4%, transparent);
	}
</style>
