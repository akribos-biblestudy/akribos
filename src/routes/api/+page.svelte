<script lang="ts">
	/**
	 * API documentation.
	 *
	 * English, unlike the rest of the site's UI: this page is for developers, not readers, and the
	 * docs/architecture.md convention keeps English to code and docs, German to content people read
	 * on Akribos. The endpoints themselves live under /api/v1; this page is content, so it sits at
	 * /api directly.
	 */
	import Button from '$lib/components/Button.svelte';
	import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head>
	<meta
		name="description"
		content="Public API for Akribos: bible text, lexicon, search, verse lists and comments."
	/>
</svelte:head>

<main class="prose-like mx-auto w-full max-w-2xl px-4 py-8">
	<h1 class="mb-6 text-2xl font-semibold">Akribos API</h1>

	<section class="mb-8">
		<p class="text-stone-700 dark:text-stone-300">
			Read-only access to the content Akribos itself is built on: bible translations, the Strong's
			lexicon, commentaries and search, plus a signed-in reader's own verse lists and comments.
			Everything lives under <code>/api/v1</code>.
		</p>
		<Button href="/api/docs" variant="primary" class="mt-4">
			View the interactive API reference <Icon name="arrow-right" class="size-4" />
		</Button>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Authentication</h2>
		<p class="mb-3 text-stone-700 dark:text-stone-300">
			A request from Akribos' own frontend needs nothing extra — it's recognised as same-origin.
			Everything else must send an API key:
		</p>
		<pre class="overflow-x-auto rounded-md bg-stone-100 px-3 py-2 text-xs dark:bg-stone-800"><code
				>Authorization: Bearer sk_akribos_…</code
			></pre>
		<p class="mt-3 text-stone-700 dark:text-stone-300">
			Create a key from your <a
				class="text-accent-600 hover:underline dark:text-accent-400"
				href="/account">account page</a
			> once signed in. Each key has a scope, chosen when it's created:
		</p>
		<ul class="mt-2 space-y-1 text-sm">
			<li><code>public</code> — bible text, lexicon, commentaries, search</li>
			<li><code>personal</code> — the above, plus the key owner's own verse lists and comments</li>
		</ul>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Rate limits</h2>
		<p class="text-stone-700 dark:text-stone-300">
			120 requests per minute per API key. Exceeding it returns <code>429</code> with a
			<code>Retry-After</code> header, in seconds.
		</p>
	</section>

	<section class="mb-8">
		<h2 class="mb-2 text-lg font-semibold">Errors</h2>
		<p class="mb-3 text-stone-700 dark:text-stone-300">Every error response has the same shape:</p>
		<pre class="overflow-x-auto rounded-md bg-stone-100 px-3 py-2 text-xs dark:bg-stone-800"><code
				>{`{ "error": { "code": "unknown_bible", "message": "No bible with id 'kjv'." } }`}</code
			></pre>
	</section>

	<section class="mb-8">
		<h2 class="mb-3 text-lg font-semibold">Endpoints</h2>

		<div class="space-y-5">
			<div>
				<p class="font-mono text-sm font-medium">GET /api/v1/books</p>
				<p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
					The 66-book canon: <code>id</code>, <code>name</code>, <code>shortName</code>,
					<code>testament</code>, <code>chapters</code>. <code>id</code> is what every other
					endpoint's <code>book</code> parameter expects.
				</p>
			</div>

			<div>
				<p class="font-mono text-sm font-medium">GET /api/v1/resources</p>
				<p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
					Every available bible, lexicon, commentary and cross-reference set, with its
					<code>id</code>, <code>kind</code>, <code>name</code>, <code>abbrev</code>,
					<code>language</code> and license.
				</p>
			</div>

			<div>
				<p class="font-mono text-sm font-medium">
					GET /api/v1/bibles/{'{bible}'}/{'{book}'}/{'{chapter}'}
				</p>
				<p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
					One translation's text for one chapter — <code>bible</code> is a resource id from
					<code>/resources</code>, <code>book</code> a book id from <code>/books</code>. Returns
					<code>verses</code> (each with its Strong's-tagged segments) and any section
					<code>headings</code>.
				</p>
			</div>

			<div>
				<p class="font-mono text-sm font-medium">GET /api/v1/strong/{'{id}'}</p>
				<p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
					A Strong's number's lexicon entry (e.g. <code>G26</code>, <code>H430</code>), rendering
					statistics and every occurrence. Optional <code>ref</code> (a verse reference) includes
					the exact original-language form and grammar at that spot; <code>resources</code>
					(comma-separated resource ids) selects which translation the statistics are computed from;
					<code>page</code> pages through occurrences.
				</p>
			</div>

			<div>
				<p class="font-mono text-sm font-medium">GET /api/v1/search?q=…</p>
				<p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
					Full-text search. <code>q</code> is required — a word, several words, or a
					<code>"quoted phrase"</code>. Optional <code>bibles</code> (comma-separated resource ids,
					defaults to all), <code>book</code> (restrict to one book id), <code>page</code>.
				</p>
			</div>

			<div>
				<p class="font-mono text-sm font-medium">GET /api/v1/lists</p>
				<p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
					The caller's own verse lists. Requires a signed-in session or a
					<code>personal</code>-scope key.
				</p>
			</div>

			<div>
				<p class="font-mono text-sm font-medium">GET /api/v1/lists/{'{id}'}</p>
				<p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
					A verse list's items and comments — readable by its owner, or by anyone once its owner has
					turned public sharing on. Optional <code>bible</code> picks which translation's text is attached
					to each verse.
				</p>
			</div>

			<div>
				<p class="font-mono text-sm font-medium">GET /api/v1/notes</p>
				<p class="mt-1 text-sm text-stone-600 dark:text-stone-300">
					The caller's own translation-specific and verse-list comments. Requires a signed-in
					session or a
					<code>personal</code>-scope key.
				</p>
			</div>
		</div>
	</section>

	<section>
		<h2 class="mb-2 text-lg font-semibold">What's not here yet</h2>
		<p class="text-stone-700 dark:text-stone-300">
			This first version is read-only: creating or editing a list, adding a verse, or writing a
			comment all still happen through the site itself, not through the API. Akribos' own frontend
			does not yet read through these endpoints either — today it uses the same repository code
			directly, without an HTTP round trip.
		</p>
	</section>
</main>

<style>
	.prose-like code {
		border-radius: 0.25rem;
		background: var(--color-stone-100);
		padding: 0.1rem 0.3rem;
		font-size: 0.875em;
	}

	:global(.dark) .prose-like code {
		background: var(--color-stone-800);
	}

	.prose-like pre code {
		background: none;
		padding: 0;
	}
</style>
