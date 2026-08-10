<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	const sections = [
		{ href: '/admin', label: 'Übersicht', hint: 'Status und Aktivität' },
		{ href: '/admin/resources', label: 'Ressourcen', hint: 'Werke und Darstellung' },
		{ href: '/admin/import', label: 'Importieren', hint: 'Neue Daten einlesen' },
		{ href: '/admin/users', label: 'Nutzer', hint: 'Konten verwalten' },
		{ href: '/admin/backup', label: 'Backup', hint: 'Sichern und wiederherstellen' }
	];

	function isActive(href: string): boolean {
		return href === '/admin'
			? page.url.pathname === href
			: page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<div class="mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-6">
	<div class="mb-4 flex items-center justify-between lg:hidden">
		<div>
			<p
				class="text-[0.68rem] font-bold tracking-[0.14em] text-accent-700 uppercase dark:text-accent-300"
			>
				Akribos
			</p>
			<p class="text-lg font-semibold">Verwaltung</p>
		</div>
	</div>

	<nav
		aria-label="Verwaltungsbereiche"
		class="-mx-3 mb-5 flex gap-1 overflow-x-auto border-y border-stone-200 bg-stone-50/70 px-3 py-2
		       lg:hidden dark:border-stone-800 dark:bg-stone-900/50"
	>
		{#each sections as section (section.href)}
			<a
				href={section.href}
				aria-current={isActive(section.href) ? 'page' : undefined}
				class="shrink-0 rounded-lg px-3 py-2 text-sm text-stone-600 dark:text-stone-300"
				class:bg-white={isActive(section.href)}
				class:shadow-sm={isActive(section.href)}
				class:font-semibold={isActive(section.href)}
				class:text-stone-950={isActive(section.href)}
				class:dark:bg-stone-800={isActive(section.href)}
				class:dark:text-white={isActive(section.href)}
			>
				{section.label}
			</a>
		{/each}
	</nav>

	<div class="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8">
		<aside class="hidden lg:block">
			<div class="sticky top-[calc(var(--header-height)+1.5rem)]">
				<div class="mb-5 px-3">
					<p
						class="text-[0.68rem] font-bold tracking-[0.14em] text-accent-700 uppercase dark:text-accent-300"
					>
						Akribos
					</p>
					<p class="mt-0.5 text-xl font-semibold tracking-tight">Verwaltung</p>
				</div>
				<nav aria-label="Verwaltungsbereiche" class="space-y-1">
					{#each sections as section (section.href)}
						<a
							href={section.href}
							aria-current={isActive(section.href) ? 'page' : undefined}
							class="block rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:bg-stone-100
							       dark:hover:bg-stone-800/70"
							class:border-stone-200={isActive(section.href)}
							class:bg-white={isActive(section.href)}
							class:shadow-sm={isActive(section.href)}
							class:dark:border-stone-700={isActive(section.href)}
							class:dark:bg-stone-900={isActive(section.href)}
						>
							<span class="block text-sm font-semibold">{section.label}</span>
							<span class="mt-0.5 block text-xs text-stone-500 dark:text-stone-400"
								>{section.hint}</span
							>
						</a>
					{/each}
				</nav>
			</div>
		</aside>

		<div class="min-w-0">{@render children()}</div>
	</div>
</div>
