<script lang="ts">
	/** Labelled input with the site's field styling. */
	let {
		name,
		label,
		type = 'text',
		value = '',
		required = false,
		autocomplete,
		hint,
		minlength,
		inputmode,
		pattern,
		maxlength,
		readonly = false,
		error
	}: {
		name: string;
		label: string;
		type?: 'text' | 'email' | 'password';
		value?: string;
		required?: boolean;
		autocomplete?: HTMLInputElement['autocomplete'];
		hint?: string;
		minlength?: number;
		inputmode?: 'text' | 'numeric' | 'email';
		pattern?: string;
		maxlength?: number;
		readonly?: boolean;
		/** Validation message shown under the field and announced. */
		error?: string;
	} = $props();
</script>

<div>
	<label class="mb-1 block text-sm font-medium" for={name}>{label}</label>
	<input
		{name}
		{type}
		{required}
		{minlength}
		{inputmode}
		{pattern}
		{maxlength}
		{autocomplete}
		{readonly}
		id={name}
		{value}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${name}-error` : undefined}
		class="w-full rounded-xl border bg-[color:var(--surface-raised)] px-3.5 py-2.5 text-sm shadow-sm
		       read-only:bg-stone-50 read-only:text-stone-500 focus:ring-3 focus:ring-accent-500/10
		       focus:outline-none dark:bg-white/5
		       dark:read-only:bg-stone-900/60 dark:read-only:text-stone-400
		       {error
			? 'border-red-400 focus:border-red-500 dark:border-red-800'
			: 'border-stone-300 focus:border-accent-500 dark:border-stone-700'}"
	/>
	{#if error}
		<p id="{name}-error" class="mt-1 text-xs text-red-700 dark:text-red-300" role="alert">
			{error}
		</p>
	{:else if hint}
		<p class="mt-1 text-xs text-stone-500 dark:text-stone-400">{hint}</p>
	{/if}
</div>
