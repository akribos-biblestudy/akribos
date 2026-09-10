<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import {
		ANALYTICS_CONSENT_COOKIE,
		analyticsChoice,
		analyticsPage,
		type AnalyticsChoice,
		type AnalyticsConfig
	} from '$lib/analytics/privacy';

	let { config }: { config: AnalyticsConfig } = $props();
	type Payload = { website: string; url: string; title: string };
	type Tracker = { track: (payload: Payload) => Promise<unknown> | void };
	type AnalyticsWindow = Window & {
		umami?: Tracker;
		akribosAnalyticsBeforeSend?: (type: string, payload: unknown) => Payload | false;
	};
	let mounted = $state(false);
	let choice = $state<AnalyticsChoice>(null);
	let blocked = $state(false);
	let script: HTMLScriptElement | null = null;
	let tracker: Tracker | null = null;
	let generation = 0;
	let loadedRevision = '';
	let lastVisit = '';
	let visit = 0;
	const privacyPage = $derived(page.route.id === '/datenschutz');
	const eligiblePage = $derived(analyticsPage(page.route.id));

	function readChoice() {
		const value = document.cookie
			.split('; ')
			.find((part) => part.startsWith(`${ANALYTICS_CONSENT_COOKIE}=`))
			?.split('=')[1];
		choice = analyticsChoice(value, config.revision);
	}
	function permitted() {
		return config.enabled && choice === 'yes' && !blocked;
	}
	function payload(): Payload | null {
		const path = analyticsPage(page.route.id);
		return permitted() && path ? { website: config.websiteId, url: path, title: 'Akribos' } : null;
	}
	function sendVisit() {
		const data = payload();
		const key = `${config.revision}:${visit}`;
		if (!tracker || !data || key === lastVisit) return;
		lastVisit = key;
		try {
			void Promise.resolve(tracker.track(data)).catch(() => {});
		} catch {
			/* Optional analytics must not interrupt reading. */
		}
	}
	function stop() {
		generation += 1;
		script?.remove();
		script = null;
		tracker = null;
		loadedRevision = '';
		const target = window as AnalyticsWindow;
		target.akribosAnalyticsBeforeSend = () => false;
		delete target.umami;
	}
	function updateTracker() {
		if (!permitted() || !analyticsPage(page.route.id)) {
			stop();
			return;
		}
		if (loadedRevision === config.revision) {
			sendVisit();
			return;
		}
		stop();
		const currentGeneration = generation;
		loadedRevision = config.revision;
		const target = window as AnalyticsWindow;
		// Rebuild every outgoing payload from the route allowlist. Raw URLs, referrers, click events,
		// account IDs, titles and automatic session properties never enter our tracking calls.
		target.akribosAnalyticsBeforeSend = (type) => (type === 'event' ? (payload() ?? false) : false);
		script = document.createElement('script');
		script.src = config.scriptUrl;
		script.async = true;
		script.referrerPolicy = 'no-referrer';
		script.dataset.websiteId = config.websiteId;
		script.dataset.autoTrack = 'false';
		script.dataset.doNotTrack = 'true';
		script.dataset.excludeSearch = 'true';
		script.dataset.excludeHash = 'true';
		script.dataset.beforeSend = 'akribosAnalyticsBeforeSend';
		script.onload = () => {
			if (currentGeneration !== generation || !permitted()) {
				delete target.umami;
				return;
			}
			tracker = target.umami ?? null;
			sendVisit();
		};
		document.head.append(script);
	}
	function choose(next: 'yes' | 'no') {
		choice = next;
		document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${config.revision}.${next}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
		lastVisit = '';
		updateTracker();
	}
	afterNavigate(() => {
		visit += 1;
		if (mounted) updateTracker();
	});
	onMount(() => {
		blocked =
			['1', 'yes'].includes(navigator.doNotTrack ?? '') ||
			['1', 'yes'].includes(
				String((window as Window & { doNotTrack?: string | number }).doNotTrack ?? '')
			) ||
			(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
		readChoice();
		mounted = true;
		const refresh = () => {
			readChoice();
			updateTracker();
		};
		window.addEventListener('focus', refresh);
		return () => {
			window.removeEventListener('focus', refresh);
			stop();
		};
	});
	$effect(() => {
		if (!mounted || !config.revision) return;
		untrack(() => {
			readChoice();
			updateTracker();
		});
	});
</script>

{#if mounted && config.enabled && (privacyPage || (eligiblePage && choice === null && !blocked))}
	<aside
		id="analyse-einstellung"
		aria-label="Freiwillige Nutzungsanalyse"
		class="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border border-stone-300 bg-white p-4 shadow-lg dark:border-stone-700 dark:bg-stone-900"
	>
		<p class="font-semibold">Freiwillige Nutzungsanalyse</p>
		<p class="mt-1 text-sm">
			Darf Umami bei {config.provider} allgemeine Seitenaufrufe zählen? Die Nutzung von Akribos bleibt
			von deiner Entscheidung unabhängig.
			<a href="/datenschutz#umami" class="text-accent-700 underline dark:text-accent-300"
				>Datenschutzhinweise</a
			>
		</p>
		{#if blocked}<p class="mt-2 text-sm">
				Dein Browser widerspricht der Analyse. Umami wird nicht geladen.
			</p>
		{:else if privacyPage}<p class="mt-2 text-sm">
				Aktuell: {choice === 'yes'
					? 'zugestimmt'
					: choice === 'no'
						? 'abgelehnt'
						: 'noch keine Entscheidung'}.
			</p>{/if}
		<div class="mt-3 flex flex-wrap gap-2">
			<button
				type="button"
				onclick={() => choose('no')}
				class="rounded-lg border border-stone-400 px-3 py-2 text-sm"
				>{choice === 'yes' ? 'Einwilligung widerrufen' : 'Analyse ablehnen'}</button
			>
			<button
				type="button"
				onclick={() => choose('yes')}
				disabled={blocked || choice === 'yes'}
				class="rounded-lg border border-stone-400 px-3 py-2 text-sm disabled:opacity-50"
				>Analyse erlauben</button
			>
		</div>
	</aside>
{/if}
