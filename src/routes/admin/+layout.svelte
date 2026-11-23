<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';

	let { children } = $props();
	let mobileMenu: HTMLDetailsElement | undefined = $state();

	const sections = [
		{ href: '/admin', label: 'Übersicht', icon: 'layout' },
		{ href: '/admin/resources', label: 'Ressourcen', icon: 'library' },
		{ href: '/admin/import', label: 'Importieren', icon: 'upload' },
		{ href: '/admin/feedback', label: 'Feedback', icon: 'message' },
		{ href: '/admin/strong-reviews', label: 'Strong-Prüfung', icon: 'check' },
		{ href: '/admin/bible-downloads', label: 'Bibel-Downloads', icon: 'download' },
		{ href: '/admin/users', label: 'Nutzer', icon: 'user' },
		{ href: '/admin/backup', label: 'Backup', icon: 'lock' }
	] as const;

	function isActive(href: string): boolean {
		return href === '/admin'
			? page.url.pathname === href
			: page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
	const active = $derived(sections.find((section) => isActive(section.href)) ?? sections[0]);
</script>

<div class="w-full px-3 py-4 sm:px-5 sm:py-6 xl:px-7">
	<details
		bind:this={mobileMenu}
		class="group mb-5 rounded-xl border border-stone-200 bg-stone-50 shadow-sm lg:hidden dark:border-stone-700 dark:bg-stone-900"
	>
		<summary
			class="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 [&::-webkit-details-marker]:hidden"
		>
			<span
				class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-700 dark:bg-accent-900/50 dark:text-accent-300"
				><Icon name={active.icon} class="size-5" /></span
			>
			<span class="min-w-0 flex-1">
				<span
					class="block text-[0.65rem] font-bold tracking-[0.12em] text-stone-500 uppercase dark:text-stone-400"
					>Verwaltung</span
				>
				<span class="block text-sm font-semibold text-stone-900 dark:text-stone-100"
					>{active.label}</span
				>
			</span>
			<Icon
				name="chevron-down"
				class="size-5 text-stone-500 transition-transform group-open:rotate-180"
			/>
		</summary>
		<nav
			aria-label="Verwaltungsbereiche"
			class="border-t border-stone-200 p-2 dark:border-stone-700"
		>
			{#each sections as section (section.href)}
				<a
					href={section.href}
					aria-current={isActive(section.href) ? 'page' : undefined}
					onclick={() => {
						if (mobileMenu) mobileMenu.open = false;
					}}
					class="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-accent-600 dark:text-stone-300 dark:hover:bg-stone-800"
					class:bg-white={isActive(section.href)}
					class:text-accent-700={isActive(section.href)}
					class:shadow-sm={isActive(section.href)}
					class:dark:bg-stone-800={isActive(section.href)}
					class:dark:text-accent-300={isActive(section.href)}
				>
					<Icon name={section.icon} class="size-4.5 shrink-0" />{section.label}
				</a>
			{/each}
		</nav>
	</details>

	<div class="lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-6 xl:gap-8">
		<aside class="hidden min-w-0 lg:block">
			<div
				class="sticky top-[calc(var(--header-height)+1.25rem)] max-h-[calc(100vh-var(--header-height)-2.5rem)] overflow-y-auto rounded-2xl border border-stone-200 bg-stone-100/70 p-3 shadow-sm dark:border-stone-700 dark:bg-stone-900/80"
			>
				<div class="px-3 pt-2 pb-4">
					<p
						class="text-[0.65rem] font-bold tracking-[0.14em] text-accent-700 uppercase dark:text-accent-300"
					>
						Akribos
					</p>
					<p class="mt-1 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
						Verwaltung
					</p>
					<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">Bereiche und Einstellungen</p>
				</div>
				<nav
					aria-label="Verwaltungsbereiche"
					class="space-y-1 border-t border-stone-200 pt-3 dark:border-stone-700"
				>
					{#each sections as section (section.href)}
						<a
							href={section.href}
							aria-current={isActive(section.href) ? 'page' : undefined}
							class="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-white/80 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
							class:bg-white={isActive(section.href)}
							class:font-semibold={isActive(section.href)}
							class:text-accent-700={isActive(section.href)}
							class:shadow-sm={isActive(section.href)}
							class:dark:bg-stone-800={isActive(section.href)}
							class:dark:text-accent-300={isActive(section.href)}
						>
							<Icon name={section.icon} class="size-4.5 shrink-0" />
							<span>{section.label}</span>
						</a>
					{/each}
				</nav>
			</div>
		</aside>

		<div class="min-w-0">{@render children()}</div>
	</div>
</div>
