<script lang="ts">
	import { goto, beforeNavigate } from '$app/navigation';
	import { getContext, onMount, tick } from 'svelte';
	import { loadBibleQuotation, type BibleQuotation } from '$lib/actions/verse-hover-popover';
	import { findReferenceContext } from '$lib/reader/reference-context';
	import { READER_LINK_SETS } from '$lib/reader/workspace';
	import {
		REFERENCE_NAVIGATION,
		type ReferenceNavigation,
		type ReferenceLinkSet
	} from '$lib/reader/reference-navigation';
	import Icon from './Icon.svelte';
	import Menu from './Menu.svelte';

	let {
		userId,
		bibleId,
		resources
	}: {
		userId: string | null;
		bibleId: string | null;
		resources: readonly { id: string; kind: string }[];
	} = $props();
	const navigation = getContext<ReferenceNavigation>(REFERENCE_NAVIGATION);
	let menu = $state<Menu>();
	let context = $state<NonNullable<ReturnType<typeof findReferenceContext>> | null>(null);
	let quotation = $state<BibleQuotation | null>(null);
	let loading = $state(false);
	let busy = $state(false);
	let copied = $state(false);
	let message = $state('');
	let generation = 0;

	beforeNavigate(() => menu?.close());
	onMount(() => {
		const open = async (event: MouseEvent) => {
			const next = findReferenceContext(event.target, window.location.origin);
			if (!next) return;
			event.preventDefault();
			event.stopPropagation();
			if (busy) return;
			const current = ++generation;
			context = next;
			quotation = null;
			copied = false;
			message = '';
			const sourceId = resources.some(
				(resource) => resource.id === next.resourceId && resource.kind === 'bible'
			)
				? next.resourceId
				: bibleId;
			loading = Boolean(sourceId);
			await tick();
			menu?.openAt(next.anchor, {
				point: event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : undefined,
				portalToDialog: true
			});
			if (!sourceId) {
				message = 'Keine Bibel zum Kopieren verfügbar.';
				return;
			}
			try {
				const loaded = await loadBibleQuotation(sourceId, next.passage);
				if (generation === current) quotation = loaded;
			} catch {
				if (generation === current) message = 'Der Bibeltext konnte nicht geladen werden.';
			} finally {
				if (generation === current) loading = false;
			}
		};
		document.addEventListener('contextmenu', open, true);
		return () => {
			generation++;
			document.removeEventListener('contextmenu', open, true);
		};
	});

	async function copyVerse(): Promise<void> {
		if (!quotation) return;
		try {
			await navigator.clipboard.writeText(`${quotation.reference}\n${quotation.text}`);
			copied = true;
		} catch {
			message = 'Der Bibeltext konnte nicht kopiert werden.';
		}
	}

	async function openInGroup(linkSet: ReferenceLinkSet): Promise<void> {
		if (!context || busy) return;
		const target = context;
		busy = true;
		menu?.close();
		try {
			if (navigation.open) {
				if (!(await navigation.open(target.reference, linkSet))) throw new Error('open');
			} else {
				navigation.pending = { reference: target.reference, linkSet };
				await goto(navigation.returnTo?.userId === userId ? navigation.returnTo.url : '/');
			}
		} catch {
			navigation.pending = null;
			message = 'Die Bibelstelle konnte nicht geöffnet werden.';
			if (target.anchor.isConnected) menu?.openAt(target.anchor, { portalToDialog: true });
		} finally {
			busy = false;
		}
	}
</script>

<Menu bind:this={menu} label="Bibelstelle öffnen oder kopieren" minWidth="14rem">
	{#if context}
		<p class="reference-label">{context.passage}</p>
		<button
			type="button"
			role="menuitem"
			disabled={loading || !quotation || busy}
			onclick={() => void copyVerse()}
		>
			<Icon name="copy" class="size-4" />
			<span
				>{copied
					? 'Kopiert'
					: loading
						? 'Bibeltext wird geladen …'
						: context.reference.verse === undefined
							? 'Kapitel kopieren'
							: 'Vers kopieren'}</span
			>
		</button>
		<hr />
		{#each READER_LINK_SETS as linkSet (linkSet)}
			<button
				type="button"
				role="menuitem"
				disabled={busy}
				onclick={() => void openInGroup(linkSet)}
			>
				<span class="group-badge">{linkSet}</span><span>In Tabgruppe {linkSet} öffnen</span>
			</button>
		{/each}
		{#if message}<p class="message" role="status">{message}</p>{/if}
	{/if}
</Menu>

<style>
	.reference-label {
		padding: 0.35rem 0.55rem;
		font-weight: 650;
		font-size: 0.75rem;
		color: var(--color-stone-500);
	}
	.group-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.15rem;
		height: 1.15rem;
		border: 1px solid var(--line);
		border-radius: 0.25rem;
		font-size: 0.65rem;
		font-weight: 700;
	}
	.message {
		padding: 0.4rem 0.55rem;
		font-size: 0.75rem;
		color: var(--color-stone-500);
	}
	hr {
		margin: 0.3rem 0;
		border-color: var(--line);
	}
</style>
