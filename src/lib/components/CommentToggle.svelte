<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	let {
		hasComment,
		active,
		onclick
	}: { hasComment: boolean; active: boolean; onclick: () => void } = $props();
</script>

<button
	type="button"
	class="comment-toggle"
	class:has-comment={hasComment}
	class:active
	aria-pressed={active}
	aria-label={hasComment ? (active ? t('comments.hide') : t('comments.show')) : t('comments.add')}
	{onclick}
>
	<Icon name="message" class="size-[0.82em]" />
</button>

<style>
	.comment-toggle {
		display: inline-flex;
		width: 1.25em;
		height: 1.25em;
		margin-left: 0.25em;
		vertical-align: -0.12em;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		color: var(--color-stone-400);
		transition:
			color 120ms ease,
			background 120ms ease;
	}

	.comment-toggle:hover,
	.comment-toggle:focus-visible,
	.comment-toggle.has-comment {
		color: var(--color-accent-600);
	}

	.comment-toggle.active {
		background: var(--color-accent-100);
		color: var(--color-accent-800);
	}

	:global(.dark) .comment-toggle.has-comment {
		color: var(--color-accent-400);
	}

	:global(.dark) .comment-toggle.active {
		background: color-mix(in oklab, var(--color-accent-800) 45%, transparent);
		color: var(--color-accent-200);
	}
</style>
